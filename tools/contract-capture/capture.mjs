#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Record real replies from the disposable test VM as draft examples (docs/04, "Response schemas").
//
//   node tools/contract-capture/capture.mjs              # every capture in captures.json
//   node tools/contract-capture/capture.mjs sshGet ...   # only these operation ids
//
// Signs in with the accounts in $OMV_WEBUI_ENV (default ~/.config/omv-webui/test.env), never the
// owner's server. Every reply is scrubbed and verified before it is written; nothing raw touches the
// disk. A capture drafts an example: it is written to the contract only when that example does not
// exist yet. Otherwise the draft goes to scratch/captures/ for review, and a difference is a finding,
// not a file to overwrite. Credentials and host are never printed.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toYaml } from "../lib/yaml.mjs";
import { createScrubber } from "./scrub.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const EXAMPLES = path.join(ROOT, "web/packages/spec-api-omv/src/examples");
const DRAFTS = path.join(ROOT, "scratch/captures");
const ENV_PATH =
  process.env.OMV_WEBUI_ENV ??
  path.join(os.homedir(), ".config/omv-webui/test.env");

const ACCOUNTS = {
  stock: ["OMV_STOCK_ADMIN_USER", "OMV_STOCK_ADMIN_PASSWORD"],
  admin: ["OMV_ADMIN_USER", "OMV_ADMIN_PASSWORD"],
  user: ["OMV_USER", "OMV_USER_PASSWORD"],
  "2fa": ["OMV_2FA_USER", "OMV_2FA_PASSWORD"],
};
const PLACEHOLDER = {
  stock: "admin",
  admin: "example-admin",
  user: "example-user",
  "2fa": "example-2fa",
};

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) {
      env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return env;
}

export const operationIdOf = (service, method) =>
  (/^[A-Z]+$/.test(service)
    ? service.toLowerCase()
    : service[0].toLowerCase() + service.slice(1)) +
  method[0].toUpperCase() +
  method.slice(1);

/** RFC 6238: SHA-1, 6 digits, 30 s steps. */
function totp(secretBase32, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

class Session {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }
  async call(service, method, params = {}) {
    const res = await fetch(`${this.base}/rpc.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: JSON.stringify({ service, method, params }),
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    let body;
    try {
      body = await res.json();
    } catch {
      body = {
        response: null,
        error: { code: null, message: "(reply was not JSON)" },
      };
    }
    return { status: res.status, body };
  }
  async login(env, account) {
    const [u, p] = ACCOUNTS[account];
    return this.call("Session", "login", {
      username: env[u],
      password: env[p],
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const env = loadEnv(ENV_PATH);
  if (!env.NAS_HOST) {
    throw new Error(`NAS_HOST is not set in ${ENV_PATH}`);
  }
  const base = `http://${env.NAS_HOST}`;
  const only = new Set(process.argv.slice(2));
  const plan = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "captures.json"),
      "utf8",
    ),
  );

  // Learn the VM's own names first, so the scrubber knows them.
  const probe = new Session(base);
  await probe.login(env, "admin");
  const info =
    (await probe.call("System", "getInformation")).body.response ?? {};
  const version = /^(\d+\.\d+\.\d+)/.exec(info.version ?? "")?.[1] ?? "unknown";
  await probe.call("Session", "logout");

  const names = {};
  for (const [account, [u]] of Object.entries(ACCOUNTS)) {
    if (env[u] && env[u] !== "admin") {
      names[env[u]] = PLACEHOLDER[account];
    }
  }
  const host = String(info.hostname ?? "");
  if (host) {
    names[host.split(".")[0]] = "nas";
  }
  const literals = [
    env.NAS_HOST,
    host,
    env.OMV_2FA_TOTP_SECRET,
    ...Object.values(ACCOUNTS).map(([, p]) => env[p]),
  ];
  const { scrub, verify } = createScrubber({ names, literals });

  const results = [];
  const record = (operationId, name, status, reply) => {
    const value =
      status === 200
        ? reply.response
        : {
            code: reply.error?.code ?? null,
            message: reply.error?.message ?? "",
          };
    const scrubbed = scrub(value);
    const failures = verify(scrubbed);
    if (failures.length) {
      results.push(
        `FAIL  ${operationId}.${name}: scrubbing left ${failures.join("; ")}. Not written.`,
      );
      return;
    }
    const file = `${operationId}.${name}.yaml`;
    const doc = toYaml({
      summary: `Captured from the test VM (OMV ${version}), scrubbed`,
      "x-omv-status": status,
      value: scrubbed,
    });
    const target = path.join(EXAMPLES, file);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(EXAMPLES, { recursive: true });
      fs.writeFileSync(target, doc);
      results.push(`new   ${file} (HTTP ${status})`);
      return;
    }
    fs.mkdirSync(DRAFTS, { recursive: true });
    fs.writeFileSync(path.join(DRAFTS, file), doc);
    const same = fs.readFileSync(target, "utf8") === doc;
    results.push(
      `${same ? "same " : "DIFF "} ${file}: committed example kept; draft in scratch/captures/`,
    );
  };

  for (const entry of plan) {
    const operationId = operationIdOf(entry.service, entry.method);
    if (only.size && !only.has(operationId)) {
      continue;
    }
    const s = new Session(base);
    if (entry.flow === "login") {
      const r = entry.wrongPassword
        ? await s.call("Session", "login", {
            username: env[ACCOUNTS[entry.account][0]],
            password: "not-the-password",
          })
        : await s.login(env, entry.account);
      record(operationId, entry.name, r.status, r.body);
    } else if (entry.flow === "verify") {
      await s.login(env, entry.account);
      const code = entry.wrongCode
        ? String((Number(totp(env.OMV_2FA_TOTP_SECRET)) + 1) % 1e6).padStart(
            6,
            "0",
          )
        : totp(env.OMV_2FA_TOTP_SECRET);
      const r = await s.call("Session", "verify", { code });
      record(operationId, entry.name, r.status, r.body);
    } else if (entry.flow === "task") {
      // Start a task and follow it to the end with getOutput, recording the handle and the last poll.
      await s.login(env, entry.account);
      const started = await s.call(
        entry.service,
        entry.method,
        entry.params ?? {},
      );
      record(operationId, entry.name, started.status, started.body);
      let pos = 0;
      for (let i = 0; i < 120 && started.status === 200; i++) {
        await sleep(500);
        const r = await s.call("Exec", "getOutput", {
          filename: started.body.response,
          pos,
        });
        if (r.status !== 200) {
          record("execGetOutput", `${entry.name}Failed`, r.status, r.body);
          break;
        }
        pos = r.body.response.pos;
        if (!r.body.response.running && !r.body.response.pendingOutput) {
          record("execGetOutput", `${entry.name}Finished`, r.status, r.body);
          break;
        }
      }
    } else {
      await s.login(env, entry.account);
      let params = entry.params ?? {};
      if (entry.paramsFrom) {
        // Send back what a read returned, unchanged: a write that changes nothing but still marks
        // the configuration dirty, so the pending-changes replies can be captured safely.
        const [service, method] = entry.paramsFrom.split(".");
        params = (await s.call(service, method)).body.response;
      }
      const r = await s.call(entry.service, entry.method, params);
      if (!entry.quiet) {
        record(operationId, entry.name, r.status, r.body);
      }
    }
    if (s.cookies.size && operationId !== "sessionLogout") {
      await s.call("Session", "logout");
    }
  }

  for (const line of results) {
    console.log(line);
  }
  if (results.some((l) => l.startsWith("FAIL"))) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    // The message is ours or the network's; it never carries a credential.
    console.error(`capture failed: ${e.message}`);
    process.exitCode = 1;
  });
}
