#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Record the network slice's replies on the disposable test VM (design phase-5-network 15, 17 and
// 18.2 #1 to #3): the NAS's name, its interfaces (a port with a fixed address, a bond of two ports
// with a VLAN on it, a bridge, a Wi-Fi interface stored but never applied), blinking a port's light,
// the firewall rules (IPv4 and IPv6) and the proxy, with the modules each write alone leaves pending
// and the server's refusals.
//
//   node tools/contract-capture/network.mjs --ssh <destination> --ports <port>,<port>
//
// Only for the test VM in $OMV_WEBUI_ENV (default ~/.config/omv-webui/test.env), never the owner's
// server. --ports names the two spare Ethernet ports it may use for ports, bonds, VLANs and bridges;
// the port the VM is reached through (the one holding NAS_HOST) is never one of them, and nothing
// this tool sends names it. It refuses to start while configuration changes are pending or a job is
// queued; while any interface other than the reaching port has settings, or any firewall rule
// exists; when a port it is given carries an address, is not offered by Network.getEthernetCandidates
// or is the reaching port; and when a bond, bridge or the Wi-Fi name it stores already exists.
//
// It applies only network settings of the given ports (each followed by a check that the VM still
// answers over HTTP and ssh) and firewall rules that let everything through (an ACCEPT from a
// documentation network to an unrelated port, a LOG of a documentation address). The name, the
// proxy, the Wi-Fi interface and every refusal are stored only and reverted, never applied. The
// fixed addresses it writes have no router, and the reaching port's settings are never sent.
//
// --ssh runs fixed, read-only commands on the VM (ip, cat of OMV's queued jobs, iptables -S, ls,
// test), and at the end puts back what the run's applies left behind: it removes the /tmp/logfile*
// files the tasks leave; sets a given port down again when it was down before and is up without an
// address now (a bridge's member stays up after the bridge is removed); unloads the bonding module
// when the run loaded it; and, when the run's firewall apply created OMV's firewall unit and script
// where there were none, disables and removes them again.
//
// It ends, also after a failure, by reverting what is pending, removing every interface setting and
// firewall rule it made, putting back the proxy and the name it read first if they differ, applying,
// and checking that the VM is as it was. Replies are scrubbed and verified as by capture.mjs and
// written as draft examples the same way, with IPv4 addresses mapped network by network (so a port's
// address and its router stay on one documentation network). A capture whose reply should carry a
// hardware address, a VM address, a UUID or a password and in which that scrub rule replaced nothing
// is not written, nor one that carries a test password outside a password field. Every written
// example is re-read at the end for any hardware address, address or name the VM has. Credentials,
// the host and the test passwords are never printed.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { isIPv4, isIPv6 } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_PATH, Session, loadEnv, openCapture, sleep } from "./capture.mjs";

const EXAMPLES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/packages/spec-api-omv/src/examples",
);
const GET_ALL = { start: 0, limit: null, sortfield: null, sortdir: null };
const GET_ALL_SEARCH = { ...GET_ALL, search: null };
const NEW = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const SSH_DESTINATION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// A port this tool is given: a plain kernel name, so it can go into a fixed command unquoted.
const PORT = /^[a-z][a-z0-9]{1,14}$/;
// The VM's own networks become 192.0.2.0/24 and 198.51.100.0/24 (the scrubber's ipv4Networks); the
// addresses this tool writes come from the third documentation network, so they never collide.
const SCRUB = { ipv4Networks: { ranges: ["192.0.2", "198.51.100"] } };
const PORT_ADDRESS = "203.0.113.10";
const VLAN_ADDRESS = "203.0.113.20";
const NETMASK = "255.255.255.0";
const NAME_SERVERS = "203.0.113.53,203.0.113.54";
const SEARCH_DOMAINS = "example.org,example.net";
const RULE_NETWORK = "203.0.113.0/24";
const RULE_ADDRESS = "203.0.113.7";
const RULE6_NETWORK = "2001:db8::/32";
const RULE6_ADDRESS = "2001:db8::7";
const RULE_PORT = "8443";
const PROXY_HOST = "proxy.example.org";
const PROXY_USER = "example-user";
const VLAN_ID = 10;
// Names the VM does not have (checked before anything is changed).
const MISSING_DEVICE = "enp9s9";
const WIFI_DEVICE = "wlan0";
const WIFI_NETWORK = "EXAMPLE-NETWORK";
const DOC_PASSWORD = "EXAMPLE-PASSWORD";
// The classic form's defaults for a new interface (design 0.9): IPv4 automatic, IPv6 off.
const IFACE_DEFAULTS = {
  uuid: NEW,
  devicename: "",
  method: "dhcp",
  address: "",
  netmask: "",
  gateway: "",
  routemetric: 0,
  method6: "manual",
  address6: "",
  netmask6: 64,
  gateway6: "",
  routemetric6: 1,
  dnsnameservers: "",
  dnssearch: "",
  mtu: 0,
  wol: false,
  comment: "",
};
const IFACE_FIELDS = Object.keys(IFACE_DEFAULTS);
const ETHERNET_FIELDS = [...IFACE_FIELDS, "altmacaddress"];
const BOND_FIELDS = [
  ...IFACE_FIELDS,
  "slaves",
  "bondprimary",
  "bondmode",
  "bondmiimon",
  "bonddowndelay",
  "bondupdelay",
  "bondtransmithashpolicy",
];
const RULE_FIELDS = [
  "uuid",
  "rulenum",
  "chain",
  "action",
  "family",
  "source",
  "sport",
  "destination",
  "dport",
  "protocol",
  "extraoptions",
  "comment",
];
const PROXY_FIELDS = ["http", "https", "ftp"].flatMap((p) =>
  ["enable", "host", "port", "username", "password"].map((f) => `${p}${f}`),
);
// Where a test password may be in a reply: the fields the scrubber replaces.
const PASSWORD_FIELDS = new Set([
  "wpapsk",
  "password",
  "httppassword",
  "httpspassword",
  "ftppassword",
]);
// The fields of getProxy and setProxy whose values the scrubber replaces whatever they are.
const PROXY_KEYS = {
  httphost: PROXY_HOST,
  httpshost: PROXY_HOST,
  ftphost: PROXY_HOST,
  httpusername: PROXY_USER,
  httpsusername: PROXY_USER,
  ftpusername: PROXY_USER,
  httppassword: DOC_PASSWORD,
  httpspassword: DOC_PASSWORD,
  ftppassword: DOC_PASSWORD,
};
const STORED_PROXY_KEYS = { host: PROXY_HOST, username: PROXY_USER };

const pick = (object, fields) =>
  Object.fromEntries(fields.map((f) => [f, object[f]]));

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!["--ssh", "--ports"].includes(flag)) {
      throw new Error(`unknown argument ${flag}`);
    }
    out[flag.slice(2)] = value;
  }
  if (!SSH_DESTINATION.test(String(out.ssh))) {
    throw new Error("--ssh takes an ssh destination such as omv8vm");
  }
  const ports = String(out.ports ?? "").split(",");
  if (
    ports.length !== 2 ||
    !ports.every((p) => PORT.test(p)) ||
    ports[0] === ports[1]
  ) {
    throw new Error("--ports takes two spare Ethernet ports, such as a,b");
  }
  return { ssh: out.ssh, ports };
}

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out }));
  });
}

// The VM's own identifiers in some text: hardware addresses, addresses that are not documentation,
// loopback, link-local or netmasks. Used only to re-read written examples; never printed.
const MAC_IN = /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/gi;
const IPV4_IN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const IPV6_IN = /(?<![\w:])[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?![\w:])/gi;
function identifiersIn(text) {
  const found = new Set();
  for (const m of text.match(MAC_IN) ?? []) {
    const mac = m.toLowerCase();
    if (
      !/^00:00:5e:00:53:/.test(mac) &&
      mac !== "00:00:00:00:00:00" &&
      mac !== "ff:ff:ff:ff:ff:ff"
    ) {
      found.add(mac);
    }
  }
  for (const m of text.match(IPV4_IN) ?? []) {
    if (
      isIPv4(m) &&
      !/^(127\.|0\.|255\.|169\.254\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(
        m,
      )
    ) {
      found.add(m);
    }
  }
  for (const m of text.match(IPV6_IN) ?? []) {
    if (
      isIPv6(m) &&
      !/^(::1?|2001:db8:.*|ff0[0-9a-f]:.*|fe80::(200:5eff:fe00:53[0-9a-f]{2})?)$/i.test(
        m,
      ) &&
      !/^f{1,4}(:|$)/i.test(m)
    ) {
      found.add(m.toLowerCase());
    }
  }
  return found;
}

async function main() {
  const opts = args(process.argv.slice(2));
  const env = loadEnv(ENV_PATH);
  const { base, record, results, scrub, counts } = await openCapture(env, {
    scrub: SCRUB,
  });

  // ---- The session: a call answered 401 signs in again; a read that meets no answer (the network
  // is being set up again) is tried again for a while. A write is never repeated. ----
  const s = new Session(base);
  const rawCall = s.call.bind(s);
  const call = async (service, method, params, { read = false } = {}) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await rawCall(service, method, params);
        if (r.status === 401 && service !== "Session") {
          await s.login(env, "admin");
          return rawCall(service, method, params);
        }
        return r;
      } catch (e) {
        if (!read || attempt >= 45) {
          throw new Error(
            `${service}.${method} met no answer (${e.cause?.code ?? e.message})`,
          );
        }
        await sleep(2000);
      }
    }
  };
  const signedIn = await s.login(env, "admin");
  if (signedIn.status !== 200) {
    throw new Error(`sign-in failed (HTTP ${signedIn.status})`);
  }

  // ---- Secrets of this run, and what is printed and written ----
  const secret = () => randomBytes(18).toString("base64url");
  const wifiPassword = secret();
  const proxyPasswords = [secret(), secret()];
  const secrets = [wifiPassword, ...proxyPasswords];
  const hideSecrets = (text) =>
    secrets.reduce((t, p) => t.split(p).join("(a test password)"), text);
  const facts = [];
  const fact = (line) => facts.push(line);
  const written = [];
  const secretOutsidePasswordField = (value, key) => {
    if (Array.isArray(value)) {
      return value.some((v) => secretOutsidePasswordField(v, key));
    }
    if (value && typeof value === "object") {
      return Object.entries(value).some(([k, v]) =>
        secretOutsidePasswordField(v, k),
      );
    }
    return (
      typeof value === "string" &&
      !PASSWORD_FIELDS.has(key) &&
      secrets.some((p) => value.includes(p))
    );
  };
  /**
   * Record a reply as record() does, after two checks: no test password outside a password field,
   * and every scrub rule in `expect` replaced something in it (a reply that should carry a hardware
   * address, an address, a UUID or a password and does not is a scrub rule that missed, or a reply
   * not as expected; either way it is not written).
   */
  const rec = (operationId, name, r, { keys = {}, expect = [], note } = {}) => {
    if (secretOutsidePasswordField(r.body, undefined)) {
      results.push(
        `FAIL  ${operationId}.${name}: a test password outside a password field. Not written.`,
      );
      return;
    }
    const value =
      r.status === 200
        ? r.body.response
        : {
            code: r.body.error?.code ?? null,
            message: r.body.error?.message ?? "",
          };
    const before = counts();
    try {
      scrub(value, keys);
    } catch (e) {
      results.push(`FAIL  ${operationId}.${name}: ${e.message}. Not written.`);
      return;
    }
    const after = counts();
    const missed = expect.filter(
      (rule) => (after[rule] ?? 0) === (before[rule] ?? 0),
    );
    if (missed.length) {
      results.push(
        `FAIL  ${operationId}.${name}: the scrub rule(s) ${missed.join(", ")} replaced nothing, though the reply should carry such a value. Not written.`,
      );
      return;
    }
    const at = results.length;
    record(operationId, name, r.status, r.body, keys, { note });
    if (results.slice(at).some((l) => l.startsWith("new "))) {
      written.push(`${operationId}.${name}.yaml`);
    }
  };
  const said = (r) =>
    r.status === 200
      ? "accepted"
      : `HTTP ${r.status}: ${scrub(r.body.error?.message ?? "").slice(0, 300)}`;
  const ok = async (service, method, params, { read = false } = {}) => {
    const r = await call(service, method, params, { read });
    if (r.status !== 200) {
      throw new Error(`${service}.${method} failed (${said(r)})`);
    }
    return r.body.response;
  };
  const read = (service, method, params) =>
    ok(service, method, params, { read: true });
  const capture = async (operationId, name, service, method, params, o) => {
    const r = await call(service, method, params, {
      read: o?.write !== true,
    });
    rec(operationId, name, r, o);
    return r;
  };
  const dirtyModules = async () => {
    const m = (await read("System", "getInformation")).dirtyModules;
    return m && !Array.isArray(m) ? Object.keys(m).sort() : [];
  };
  const pending = async () => (await dirtyModules()).join(" ") || "(none)";
  const isDirty = async () => (await read("Config", "isDirty")) !== false;
  const revert = async () => {
    await ok("Config", "revertChanges", { filename: "" });
    if (await isDirty()) {
      throw new Error("the pending changes could not be reverted");
    }
  };
  const revertIfDirty = async () => {
    if (await isDirty()) {
      await revert();
    }
  };
  /** Follow a task to its end, asking for the whole output each time; the last reply. */
  const follow = async (handle, tries = 1200) => {
    for (let i = 0; i < tries; i++) {
      await sleep(500);
      const r = await call(
        "Exec",
        "getOutput",
        { filename: handle, pos: 0 },
        { read: true },
      );
      if (r.status !== 200) {
        return r;
      }
      if (!r.body.response.running && !r.body.response.pendingOutput) {
        return r;
      }
    }
    throw new Error("a task did not finish in time");
  };
  const outputOf = (r) =>
    r.status === 200 ? r.body.response.output : (r.body.error?.message ?? "");

  /** Run one fixed command on the VM over ssh; its output. Throws on a non-zero exit. */
  const vm = async (command) => {
    const r = await run("ssh", [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=15",
      opts.ssh,
      command,
    ]);
    if (r.code !== 0) {
      throw new Error(
        `a command on the VM failed (${r.code}): ${hideSecrets(scrub(r.out)).slice(0, 300)}`,
      );
    }
    return r.out;
  };
  const vmLine = async (command) =>
    (await vm(command)).trim().replace(/\s*\n\s*/g, " | ");
  // Everything the VM identifies itself by, for the re-read of written examples. Never printed.
  const vmIdentifiers = new Set();
  const learnIdentifiers = async () => {
    const text = await vm(
      "ip -o link; ip -o addr; ip route; ip -6 route; ip neigh; ip -6 neigh; cat /etc/resolv.conf; true",
    );
    for (const id of identifiersIn(text)) {
      vmIdentifiers.add(id);
    }
  };
  const queuedJobs = async () =>
    (await vm("sudo cat /srv/pillar/omv/tasks.sls"))
      .split("\n")
      .filter((l) => /^\s*-?\s*sls:/.test(l)).length;
  const portState = async (port) =>
    vmLine(
      `ip -br link show dev ${port} | awk '{print $2}'; ip -o addr show dev ${port} | wc -l`,
    );

  /** Apply what is pending; for a network change, then check the VM still answers both ways. */
  const apply = async (label) => {
    const t = Date.now();
    const started = await call("Config", "applyChangesBg", {
      modules: [],
      force: false,
    });
    if (started.status !== 200) {
      throw new Error(`applying (${label}) did not start (${said(started)})`);
    }
    const last = await follow(started.body.response);
    if (last.status !== 200) {
      throw new Error(
        `applying (${label}) failed: ${scrub(outputOf(last)).slice(-400)}`,
      );
    }
    await read("System", "getInformation");
    await vm("true");
    if (await isDirty()) {
      throw new Error(`applying (${label}) left changes pending`);
    }
    await learnIdentifiers();
    fact(`apply (${label}): ${Math.round((Date.now() - t) / 100) / 10} s`);
  };
  /** What a write alone left pending. */
  const measure = async (label, r) => {
    fact(`item 1: ${label}: ${said(r)}; pending ${await pending()}`);
    return r;
  };
  /**
   * A refusal expected of the server: recorded as an example when it has a name (only the fact
   * otherwise), and anything it left pending reverted.
   */
  const refusal = async (operationId, name, label, service, method, params) => {
    const r = await call(service, method, params);
    if (r.status === 200) {
      fact(
        `item 3/8: ${label}: ACCEPTED (not refused); pending ${await pending()}; reverted`,
      );
    } else {
      if (name) {
        rec(operationId, name, r);
      }
      fact(`item 3/8: ${label}: ${said(r)}`);
    }
    await revertIfDirty();
    return r;
  };
  /** Text for a fact or a message, scrubbed; never one the scrubber cannot map. */
  const printable = (text) => {
    try {
      return hideSecrets(scrub(String(text)));
    } catch {
      return "(not printed: it holds an address the scrubber could not map)";
    }
  };
  let stopped = false;
  /**
   * A sub-test: its failure is a fact. After a failure in a step that changes the VM (`changes`),
   * or when the VM no longer answers, no later step runs; the cleanup still does.
   */
  const step = async (name, fn, { changes = false } = {}) => {
    if (stopped) {
      fact(`STEP SKIPPED ${name}: an earlier step failed`);
      return;
    }
    try {
      await fn();
    } catch (e) {
      fact(`STEP FAILED ${name}: ${printable(e.message).slice(0, 500)}`);
      stopped = changes;
      try {
        await read("System", "getInformation");
        await vm("true");
        await revertIfDirty();
      } catch (e2) {
        stopped = true;
        fact(
          `STEP ${name}: the VM no longer answers or could not revert (${printable(e2.message).slice(0, 200)}); stopping`,
        );
      }
    }
  };
  /** Wait until a device reports an IPv4 address (DHCP), at most about 40 s; its information. */
  const settled = async (devicename) => {
    let info;
    for (let i = 0; i < 20; i++) {
      info = await read("Network", "getInformation", { devicename });
      if (info.address !== "") {
        return info;
      }
      await sleep(2000);
    }
    return info;
  };
  const interfaces = async () =>
    (await read("Network", "getInterfaceList", GET_ALL_SEARCH)).data;
  const interfaceOf = async (devicename) =>
    (await interfaces()).find((i) => i.devicename === devicename);
  const kind = (s) =>
    s === ""
      ? "empty"
      : s.includes(",")
        ? "commas"
        : s.includes(" ")
          ? "spaces"
          : "one value";

  // ---- Preconditions, and what is put back at the end ----
  const [portA, portB] = opts.ports;
  if (await isDirty()) {
    throw new Error(
      "the VM has pending configuration changes; apply or revert them first",
    );
  }
  if ((await queuedJobs()) !== 0) {
    throw new Error(
      "the VM has a queued job (/srv/pillar/omv/tasks.sls); apply it first",
    );
  }
  const before = {
    general: await read("Network", "getGeneralSettings"),
    interfaces: await interfaces(),
    rules: await read("Iptables", "getRules"),
    rules6: await read("Iptables", "getRules6"),
    proxy: await read("Network", "getProxy"),
  };
  const addresses = await vm("ip -o -4 addr");
  const reaching = [
    ...addresses.matchAll(/^\d+:\s+(\S+)\s+inet\s+([\d.]+)\//gm),
  ].find(([, , ip]) => ip === env.NAS_HOST)?.[1];
  if (!reaching) {
    throw new Error(
      "no interface of the VM holds NAS_HOST; nothing was changed",
    );
  }
  if (opts.ports.includes(reaching)) {
    throw new Error(
      "a port given is the one the VM is reached through; nothing was changed",
    );
  }
  if (before.interfaces.some((i) => i.devicename !== reaching)) {
    throw new Error(
      "an interface other than the reaching port has settings; this tool runs only on a VM without any",
    );
  }
  if (before.rules.length || before.rules6.length) {
    throw new Error(
      "the VM has firewall rules; this tool runs only without any",
    );
  }
  const candidates = (await read("Network", "getEthernetCandidates")).map(
    (c) => c.devicename,
  );
  for (const port of opts.ports) {
    if (!candidates.includes(port)) {
      throw new Error(
        `${port} is not among the server's Ethernet candidates; nothing was changed`,
      );
    }
    if ((await vmLine(`ip -o addr show dev ${port} | wc -l`)) !== "0") {
      throw new Error(`${port} carries an address; nothing was changed`);
    }
  }
  const links = await vm("ls /sys/class/net");
  for (const name of links.split(/\s+/)) {
    if (
      /^(bond|br)\d+$/.test(name) ||
      name === WIFI_DEVICE ||
      name === MISSING_DEVICE
    ) {
      throw new Error(`the VM already has ${name}; nothing was changed`);
    }
  }
  const vmBefore = {
    firewallUnit: (
      await vmLine(
        "test -e /etc/systemd/system/openmediavault-firewall.service && echo present || echo absent",
      )
    ).trim(),
    firewallScript: (
      await vmLine(
        "test -e /etc/iptables/openmediavault-firewall.sh && echo present || echo absent",
      )
    ).trim(),
    iptablesDir: (
      await vmLine("test -d /etc/iptables && echo present || echo absent")
    ).trim(),
    iptables: await vmLine("sudo iptables -S; sudo ip6tables -S"),
    netplan: await vmLine("ls /etc/netplan"),
    ports: [await portState(portA), await portState(portB)],
    bonding: links.split(/\s+/).includes("bonding_masters"),
  };
  await learnIdentifiers();
  const accessUuid = before.interfaces[0]?.uuid;
  fact(
    `before: ${before.interfaces.length} interface(s) with settings (the reaching port); rules ${before.rules.length}/${before.rules6.length}; proxy on ${before.proxy.httpenable}/${before.proxy.httpsenable}/${before.proxy.ftpenable}; firewall unit ${vmBefore.firewallUnit}, script ${vmBefore.firewallScript}; netplan ${vmBefore.netplan}; ports ${vmBefore.ports.join(" / ")}`,
  );

  const made = { interfaces: new Set(), rules: new Set() };
  const remember = (r, set) => {
    if (r.status === 200 && r.body.response?.uuid) {
      set.add(r.body.response.uuid);
    }
    return r;
  };
  const setIface = async (method, params) =>
    remember(await call("Network", method, params), made.interfaces);
  const setRule = async (params) =>
    remember(await call("Iptables", "setRule", params), made.rules);

  try {
    // ---- Reads, before anything is changed ----
    await step("reads", async () => {
      await capture(
        "networkEnumerateDevicesList",
        "portsNotSetUp",
        "Network",
        "enumerateDevicesList",
        GET_ALL,
        { expect: ["mac", "ipv4", "uuid"] },
      );
      await capture(
        "networkGetInterfaceList",
        "onePort",
        "Network",
        "getInterfaceList",
        GET_ALL_SEARCH,
        { expect: ["uuid"] },
      );
      const one = await capture(
        "networkGetInterface",
        "dhcp",
        "Network",
        "getInterface",
        { uuid: accessUuid },
        { expect: ["uuid"] },
      );
      fact(
        `item 2: getInterface of the reaching port: slaves ${JSON.stringify(one.body.response?.slaves)}, netmask6 ${typeof one.body.response?.netmask6}, mtu ${typeof one.body.response?.mtu}, wpapsk ${JSON.stringify(one.body.response?.wpapsk)}`,
      );
      const info = await capture(
        "networkGetInformation",
        "port",
        "Network",
        "getInformation",
        { devicename: reaching },
        { expect: ["mac", "ipv4"] },
      );
      const a6 = String(info.body.response?.address6 ?? "");
      const all6 = await vmLine(
        `ip -o -6 addr show dev ${reaching} | awk '{print $4}'`,
      );
      fact(
        `item 2: getInformation's address6 for the reaching port is ${a6 === "" ? "empty" : /^fe80:/i.test(a6) ? "link-local" : "global"}; the port has ${
          all6
            .split(" | ")
            .filter(Boolean)
            .map((x) => (/^fe80:/i.test(x) ? "link-local" : "global"))
            .join(", ") || "none"
        } IPv6 address(es); gateway6 ${info.body.response?.gateway6 ? (/^fe80:/i.test(info.body.response.gateway6) ? "link-local" : "global") : "empty"}; mtu ${typeof info.body.response?.mtu}; type ${info.body.response?.type}`,
      );
      const missing = await capture(
        "networkGetInformation",
        "missing",
        "Network",
        "getInformation",
        { devicename: MISSING_DEVICE },
      );
      fact(
        `item 2: getInformation for a name the VM does not have: ${said(missing)}; keys ${Object.keys(missing.body.response ?? {}).join(",")}; state ${missing.body.response?.state}; type ${"type" in (missing.body.response ?? {}) ? "present" : "absent"}; stats ${JSON.stringify(missing.body.response?.stats)}`,
      );
      const c = await capture(
        "networkGetEthernetCandidates",
        "twoPorts",
        "Network",
        "getEthernetCandidates",
        {},
        { expect: ["mac"] },
      );
      fact(
        `item 2: getEthernetCandidates rows carry wpapsk: ${JSON.stringify(c.body.response).includes("wpapsk")}; keys ${Object.keys(c.body.response?.[0] ?? {}).join(",")}`,
      );
      await capture(
        "networkGetVlanCandidates",
        "onePort",
        "Network",
        "getVlanCandidates",
        {},
        { expect: ["mac"] },
      );
      const w = await capture(
        "networkGetWirelessCandidates",
        "none",
        "Network",
        "getWirelessCandidates",
        {},
      );
      fact(
        `item 2: getWirelessCandidates on the VM: ${JSON.stringify(w.body.response)}`,
      );
      const bs = await capture(
        "networkEnumerateBondSlaves",
        "newBond",
        "Network",
        "enumerateBondSlaves",
        { uuid: NEW, unused: true },
        { expect: ["mac"] },
      );
      fact(
        `item 2: enumerateBondSlaves (new) lists ${(bs.body.response ?? []).map((d) => d.devicename).join(",")}; wpapsk ${JSON.stringify(bs.body.response).includes("wpapsk")}`,
      );
      const br = await capture(
        "networkEnumerateBridgeSlaves",
        "newBridge",
        "Network",
        "enumerateBridgeSlaves",
        { uuid: NEW, unused: true },
        { expect: ["mac"] },
      );
      fact(
        `item 2: enumerateBridgeSlaves (new) lists ${(br.body.response ?? []).map((d) => d.devicename).join(",")}; wpapsk ${JSON.stringify(br.body.response).includes("wpapsk")}`,
      );
      const proxy = await capture(
        "networkGetProxy",
        "none",
        "Network",
        "getProxy",
        {},
        { keys: PROXY_KEYS },
      );
      fact(
        `item 2: getProxy unset: http ${JSON.stringify(proxy.body.response?.http)}, https ${JSON.stringify(proxy.body.response?.https)}, ftp ${JSON.stringify(proxy.body.response?.ftp)}`,
      );
      await capture("iptablesGetRules", "none", "Iptables", "getRules", {});
      await capture("iptablesGetRules6", "none", "Iptables", "getRules6", {});
    });

    // ---- Blink a spare port's light (item 9) ----
    await step("identify", async () => {
      const started = await call("Network", "identify", {
        devicename: portA,
        seconds: 5,
      });
      rec("networkIdentify", "started", started);
      fact(`item 9: identify ${portA} 5 s: ${said(started)}`);
      if (started.status === 200) {
        const t = Date.now();
        const last = await follow(started.body.response);
        rec(
          "execGetOutput",
          `identify${last.status === 200 ? "Finished" : "Failed"}`,
          last,
        );
        fact(
          `item 9: identify ended after ${Math.round((Date.now() - t) / 100) / 10} s: ${said(last)}; output ${JSON.stringify(scrub(outputOf(last)).slice(0, 300))}; pending ${await pending()}`,
        );
      }
    });

    // ---- The name (stored only, reverted; item 1 and 3) ----
    await step("name", async () => {
      const same = await call(
        "Network",
        "setGeneralSettings",
        pick(before.general, ["hostname", "domainname"]),
      );
      await measure("the name sent back unchanged (setGeneralSettings)", same);
      rec("networkSetGeneralSettings", "saved", same, { expect: ["host"] });
      await revert();
      const capitals = "Nas-Example";
      const c = await call("Network", "setGeneralSettings", {
        hostname: capitals,
        domainname: "",
      });
      const stored = await read("Network", "getGeneralSettings");
      fact(
        `item 3: capitals sent (${capitals}): ${said(c)}; reply ${c.body.response?.hostname === capitals ? "as sent" : c.body.response?.hostname === capitals.toLowerCase() ? "in lower case" : "other"}; stored ${stored.hostname === capitals ? "as sent" : stored.hostname === capitals.toLowerCase() ? "in lower case" : "other"}; pending ${await pending()}; reverted`,
      );
      await revertIfDirty();
      await refusal(
        "networkSetGeneralSettings",
        "domainLocal",
        "domain local",
        "Network",
        "setGeneralSettings",
        { hostname: "nas", domainname: "local" },
      );
      await refusal(
        "networkSetGeneralSettings",
        "domainExample",
        "domain example",
        "Network",
        "setGeneralSettings",
        { hostname: "nas", domainname: "example" },
      );
      for (const domain of ["invalid", "test", "LOCAL", "home.arpa"]) {
        await refusal(
          "networkSetGeneralSettings",
          null,
          `domain ${domain}`,
          "Network",
          "setGeneralSettings",
          { hostname: "nas", domainname: domain },
        );
      }
      await refusal(
        "networkSetGeneralSettings",
        "hyphenAtEnd",
        "a hyphen at the end",
        "Network",
        "setGeneralSettings",
        { hostname: "nas-", domainname: "" },
      );
      await refusal(
        "networkSetGeneralSettings",
        "tooLong",
        "64 characters",
        "Network",
        "setGeneralSettings",
        { hostname: "a".repeat(64), domainname: "" },
      );
      await refusal(
        "networkSetGeneralSettings",
        "longDomain",
        "a domain of 254 characters",
        "Network",
        "setGeneralSettings",
        {
          hostname: "nas",
          domainname: `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`,
        },
      );
      if (
        JSON.stringify(await read("Network", "getGeneralSettings")) !==
        JSON.stringify(before.general)
      ) {
        throw new Error("the name is not as it was after the name tests");
      }
    });

    // ---- A port with a fixed address (applied; items 1, 2, 6) ----
    let portUuid;
    await step(
      "port",
      async () => {
        const created = await setIface("setEthernetIface", {
          ...IFACE_DEFAULTS,
          devicename: portA,
          method: "static",
          address: PORT_ADDRESS,
          netmask: NETMASK,
          comment: "Example port",
          altmacaddress: "",
        });
        await measure("a port set up (setEthernetIface, new)", created);
        rec("networkSetEthernetIface", "created", created, {
          expect: ["uuid"],
        });
        if (created.status !== 200) {
          throw new Error(`the port was not set up (${said(created)})`);
        }
        portUuid = created.body.response.uuid;
        fact(
          `item 2: setEthernetIface reply: slaves ${JSON.stringify(created.body.response.slaves)}, wpapsk ${JSON.stringify(created.body.response.wpapsk)}, keys ${Object.keys(created.body.response).length}`,
        );
        await apply("a port with a fixed address");
        await settled(portA);
        await capture(
          "networkEnumerateDevicesList",
          "fixedAndNotSetUp",
          "Network",
          "enumerateDevicesList",
          GET_ALL,
          { expect: ["mac", "ipv4", "uuid"] },
        );
        await capture(
          "networkGetInterfaceList",
          "twoPorts",
          "Network",
          "getInterfaceList",
          GET_ALL_SEARCH,
          { expect: ["uuid"] },
        );
        await capture(
          "networkGetInformation",
          "fixed",
          "Network",
          "getInformation",
          { devicename: portA },
          { expect: ["mac"] },
        );
        await capture(
          "networkGetEthernetCandidates",
          "onePort",
          "Network",
          "getEthernetCandidates",
          {},
          { expect: ["mac"] },
        );
        await capture(
          "networkGetVlanCandidates",
          "twoPorts",
          "Network",
          "getVlanCandidates",
          {},
          { expect: ["mac"] },
        );
        await refusal(
          "networkSetEthernetIface",
          "sameName",
          "a second interface of the same name",
          "Network",
          "setEthernetIface",
          { ...IFACE_DEFAULTS, devicename: portA, altmacaddress: "" },
        );

        // Changed: name servers and search domains sent with commas.
        const read1 = await read("Network", "getInterface", { uuid: portUuid });
        const changed = await call("Network", "setEthernetIface", {
          ...pick(read1, ETHERNET_FIELDS),
          dnsnameservers: NAME_SERVERS,
          dnssearch: SEARCH_DOMAINS,
        });
        await measure("a port changed (setEthernetIface, existing)", changed);
        rec("networkSetEthernetIface", "changed", changed, {
          expect: ["uuid"],
        });
        const withDns = await capture(
          "networkGetInterface",
          "fixed",
          "Network",
          "getInterface",
          { uuid: portUuid },
          { expect: ["uuid"] },
        );
        const list = await capture(
          "networkGetInterfaceList",
          "twoPortsNameServers",
          "Network",
          "getInterfaceList",
          GET_ALL_SEARCH,
          { expect: ["uuid"] },
        );
        const row = list.body.response?.data?.find((i) => i.uuid === portUuid);
        fact(
          `item 2: separators sent as commas: setEthernetIface reply ${kind(changed.body.response?.dnsnameservers ?? "")}/${kind(changed.body.response?.dnssearch ?? "")}; getInterface ${kind(withDns.body.response?.dnsnameservers ?? "")}/${kind(withDns.body.response?.dnssearch ?? "")}; getInterfaceList ${kind(row?.dnsnameservers ?? "")}/${kind(row?.dnssearch ?? "")}`,
        );
        await revert();
        const semi = await call("Network", "setEthernetIface", {
          ...pick(read1, ETHERNET_FIELDS),
          dnsnameservers: "203.0.113.53; 203.0.113.54",
          dnssearch: "example.org;example.net",
        });
        fact(
          `item 2: separators sent as semicolons: ${said(semi)}; stored ${kind(semi.body.response?.dnsnameservers ?? "")}/${kind(semi.body.response?.dnssearch ?? "")}`,
        );
        await revertIfDirty();

        // Removed, then undone: the queued job (item 6).
        const removed = await call("Network", "deleteInterface", {
          uuid: portUuid,
        });
        await measure("a port's settings removed (deleteInterface)", removed);
        rec("networkDeleteInterface", "removed", removed, { expect: ["uuid"] });
        fact(
          `item 2: deleteInterface reply: slaves ${JSON.stringify(removed.body.response?.slaves)}, wpapsk ${JSON.stringify(removed.body.response?.wpapsk)}; queued jobs ${await queuedJobs()}`,
        );
        await revert();
        fact(
          `item 6: after Undo of the removal: settings back ${Boolean(await interfaceOf(portA))}; queued jobs still ${await queuedJobs()}; pending ${await pending()}`,
        );
      },
      { changes: true },
    );

    // ---- The port removed for real (applied; item 6) ----
    await step(
      "port removed",
      async () => {
        if (!portUuid) {
          return;
        }
        const r = await call("Network", "deleteInterface", { uuid: portUuid });
        if (r.status !== 200) {
          throw new Error(`the port's settings were not removed (${said(r)})`);
        }
        made.interfaces.delete(portUuid);
        const jobs = await queuedJobs();
        await apply("the port's settings removed");
        fact(
          `item 6: removal applied (${jobs} queued job(s) before): ${portA} now ${await portState(portA)} (state, addresses); queued jobs ${await queuedJobs()}`,
        );
      },
      { changes: true },
    );

    // ---- Wi-Fi, stored for a device the VM does not have, never applied (items 1, 2, 14) ----
    await step("wifi", async () => {
      const wifi = {
        ...IFACE_DEFAULTS,
        devicename: WIFI_DEVICE,
        altmacaddress: "",
        band: "auto",
        wpassid: WIFI_NETWORK,
        wpapsk: wifiPassword,
        keymanagement: "psk",
        hidden: false,
      };
      const { wpapsk: _none, ...withoutPassword } = wifi;
      await refusal(
        "networkSetWirelessIface",
        "noPassword",
        "a Wi-Fi interface without wpapsk",
        "Network",
        "setWirelessIface",
        withoutPassword,
      );
      const empty = await call("Network", "setWirelessIface", {
        ...wifi,
        wpapsk: "",
      });
      fact(
        `item 14: a Wi-Fi interface with an empty wpapsk: ${said(empty)}; stored empty ${empty.body.response?.wpapsk === ""}; pending ${await pending()}; reverted`,
      );
      await revertIfDirty();
      const short = await call("Network", "setWirelessIface", {
        ...wifi,
        wpapsk: "short",
      });
      fact(
        `item 14: a Wi-Fi password of 5 characters: ${said(short)}; reverted`,
      );
      await revertIfDirty();
      const created = await call("Network", "setWirelessIface", wifi);
      await measure(
        "a Wi-Fi interface set up (setWirelessIface, new)",
        created,
      );
      rec("networkSetWirelessIface", "created", created, {
        expect: ["uuid", "key:wpapsk"],
        note: "a Wi-Fi interface stored for a device the VM does not have, then reverted (never applied)",
      });
      if (created.status === 200) {
        const uuid = created.body.response.uuid;
        await capture(
          "networkGetInterface",
          "wifi",
          "Network",
          "getInterface",
          { uuid },
          {
            expect: ["uuid", "key:wpapsk"],
            note: "a Wi-Fi interface stored for a device the VM does not have, then reverted (never applied)",
          },
        );
        await capture(
          "networkGetInterfaceList",
          "portAndWifi",
          "Network",
          "getInterfaceList",
          GET_ALL_SEARCH,
          {
            expect: ["uuid", "key:wpapsk"],
            note: "with a Wi-Fi interface stored for a device the VM does not have, then reverted (never applied)",
          },
        );
        const devices = await read("Network", "enumerateDevicesList", GET_ALL);
        fact(
          `item 2: enumerateDevicesList with a stored Wi-Fi interface for a missing device lists it: ${devices.data.some((d) => d.devicename === WIFI_DEVICE)}`,
        );
      }
      await revert();
    });

    // ---- A bond of the two ports, a VLAN on it (applied; items 1, 2, 8) ----
    let bondUuid;
    let bondName;
    let vlanUuid;
    await step(
      "bond",
      async () => {
        const bond = {
          ...IFACE_DEFAULTS,
          slaves: [portA, portB],
          bondprimary: portA,
          bondmode: 1,
          bondmiimon: 100,
          bonddowndelay: 0,
          bondupdelay: 0,
          bondtransmithashpolicy: "layer2",
          comment: "Example bond",
        };
        const { bondtransmithashpolicy: _p, ...noPolicy } = bond;
        const np = await call("Network", "setBondIface", noPolicy);
        if (np.status === 200) {
          rec("networkSetBondIface", "noTransmitHashPolicy", np, {
            expect: ["uuid"],
          });
          fact(
            `item 8: a bond without bondtransmithashpolicy: accepted; stored ${JSON.stringify(np.body.response?.bondtransmithashpolicy)}; pending ${await pending()}; reverted`,
          );
        } else {
          rec("networkSetBondIface", "noTransmitHashPolicy", np);
          fact(`item 8: a bond without bondtransmithashpolicy: ${said(np)}`);
        }
        await revertIfDirty();
        await refusal(
          "networkSetBondIface",
          "noPrimary",
          "an active-backup bond without a primary port",
          "Network",
          "setBondIface",
          { ...bond, bondprimary: "" },
        );
        const created = await setIface("setBondIface", bond);
        await measure("a bond set up (setBondIface, new)", created);
        rec("networkSetBondIface", "created", created, { expect: ["uuid"] });
        if (created.status !== 200) {
          throw new Error(`the bond was not set up (${said(created)})`);
        }
        bondUuid = created.body.response.uuid;
        bondName = created.body.response.devicename;
        fact(
          `item 2: setBondIface reply: devicename chosen ${bondName}; slaves ${typeof created.body.response.slaves} (${kind(created.body.response.slaves)}); bondtransmithashpolicy ${created.body.response.bondtransmithashpolicy}`,
        );
        await apply("a bond of two ports");
        await settled(bondName);
        const bridgeSlaves = await capture(
          "networkEnumerateBridgeSlaves",
          "withBond",
          "Network",
          "enumerateBridgeSlaves",
          { uuid: NEW, unused: true },
        );
        fact(
          `item 8: enumerateBridgeSlaves (new) with a bond that has settings lists ${(bridgeSlaves.body.response ?? []).map((d) => d.devicename).join(",") || "nothing"}`,
        );
        await capture(
          "networkEnumerateBondSlaves",
          "existingBond",
          "Network",
          "enumerateBondSlaves",
          { uuid: bondUuid, unused: true },
          { expect: ["mac"] },
        );
        const none = await capture(
          "networkGetEthernetCandidates",
          "none",
          "Network",
          "getEthernetCandidates",
          {},
        );
        fact(
          `item 2: getEthernetCandidates with both ports in a bond: ${(none.body.response ?? []).map((d) => d.devicename).join(",") || "none"}`,
        );
        await refusal(
          "networkSetBondIface",
          "portInBond",
          "a new bond with a port already in a bond",
          "Network",
          "setBondIface",
          { ...bond, slaves: [portA], bondprimary: portA },
        );
        const vlan = await setIface("setVlanIface", {
          ...IFACE_DEFAULTS,
          devicename: "",
          method: "static",
          address: VLAN_ADDRESS,
          netmask: NETMASK,
          altmacaddress: "",
          vlanid: VLAN_ID,
          vlanrawdevice: bondName,
          comment: "Example VLAN",
        });
        await measure("a VLAN set up (setVlanIface, new)", vlan);
        rec("networkSetVlanIface", "created", vlan, { expect: ["uuid"] });
        if (vlan.status !== 200) {
          throw new Error(`the VLAN was not set up (${said(vlan)})`);
        }
        vlanUuid = vlan.body.response.uuid;
        fact(
          `item 2: setVlanIface reply devicename ${vlan.body.response.devicename}`,
        );
        await apply("a VLAN on the bond");
        await sleep(3000);
        const layers = await capture(
          "networkEnumerateDevicesList",
          "layers",
          "Network",
          "enumerateDevicesList",
          GET_ALL,
          { expect: ["mac", "ipv4", "uuid"] },
        );
        for (const d of layers.body.response?.data ?? []) {
          if (d.devicename !== "lo" && d.devicename !== reaching) {
            fact(
              `item 2: enumerateDevicesList row ${d.devicename}: type ${d.type}, _used ${d._used}, _readonly ${d._readonly}, method ${JSON.stringify(d.method)}, slaves ${JSON.stringify(d.slaves)}, vlan ${d.vlan}, vlanid ${d.vlanid}, state ${d.state}`,
            );
          }
        }
        const list = await capture(
          "networkGetInterfaceList",
          "layers",
          "Network",
          "getInterfaceList",
          GET_ALL_SEARCH,
          { expect: ["uuid"] },
        );
        for (const d of list.body.response?.data ?? []) {
          fact(
            `item 2: getInterfaceList row ${d.type}: _used ${d._used}, _readonly ${d._readonly}, slaves ${JSON.stringify(d.slaves)}`,
          );
        }
        await capture(
          "networkGetInterface",
          "bond",
          "Network",
          "getInterface",
          { uuid: bondUuid },
          { expect: ["uuid"] },
        );
        await capture(
          "networkGetInterface",
          "vlan",
          "Network",
          "getInterface",
          { uuid: vlanUuid },
          { expect: ["uuid"] },
        );
        await capture(
          "networkGetVlanCandidates",
          "layers",
          "Network",
          "getVlanCandidates",
          {},
          { expect: ["mac"] },
        );
        await capture(
          "networkGetInformation",
          "bond",
          "Network",
          "getInformation",
          { devicename: bondName },
          { expect: ["mac"] },
        );
        const vi = await capture(
          "networkGetInformation",
          "vlan",
          "Network",
          "getInformation",
          { devicename: `${bondName}.${VLAN_ID}` },
          { expect: ["mac"] },
        );
        fact(
          `item 2: getInformation of the VLAN: type ${vi.body.response?.type}, vlan ${vi.body.response?.vlan}, vlanid ${vi.body.response?.vlanid}`,
        );
        const withVlan = await read("Network", "enumerateBridgeSlaves", {
          uuid: NEW,
          unused: true,
        });
        fact(
          `item 8: enumerateBridgeSlaves (new) with a VLAN on the bond lists ${withVlan.map((d) => d.devicename).join(",") || "nothing"}`,
        );
        const removeVlan = await call("Network", "deleteInterface", {
          uuid: vlanUuid,
        });
        await measure(
          "a VLAN's settings removed (deleteInterface)",
          removeVlan,
        );
        rec("networkDeleteInterface", "removedVlan", removeVlan, {
          expect: ["uuid"],
        });
        made.interfaces.delete(vlanUuid);
        const removeBond = await call("Network", "deleteInterface", {
          uuid: bondUuid,
        });
        if (removeBond.status !== 200) {
          throw new Error(`the bond was not removed (${said(removeBond)})`);
        }
        made.interfaces.delete(bondUuid);
        await apply("the VLAN and the bond removed");
        fact(
          `item 8: after removing the VLAN and the bond: links ${await vmLine(`ls /sys/class/net | tr '\\n' ' '`)}; ${portA} ${await portState(portA)}; ${portB} ${await portState(portB)}; queued jobs ${await queuedJobs()}`,
        );
      },
      { changes: true },
    );

    // ---- A bridge with one port (applied; items 1, 2) ----
    await step(
      "bridge",
      async () => {
        const created = await setIface("setBridgeIface", {
          ...IFACE_DEFAULTS,
          devicename: "",
          slaves: [portA],
          comment: "Example bridge",
        });
        await measure("a bridge set up (setBridgeIface, new)", created);
        rec("networkSetBridgeIface", "created", created, { expect: ["uuid"] });
        if (created.status !== 200) {
          throw new Error(`the bridge was not set up (${said(created)})`);
        }
        const uuid = created.body.response.uuid;
        const name = created.body.response.devicename;
        await apply("a bridge with one port");
        await settled(name);
        await capture(
          "networkEnumerateDevicesList",
          "bridge",
          "Network",
          "enumerateDevicesList",
          GET_ALL,
          { expect: ["mac", "ipv4", "uuid"] },
        );
        await capture(
          "networkGetInterfaceList",
          "bridge",
          "Network",
          "getInterfaceList",
          GET_ALL_SEARCH,
          { expect: ["uuid"] },
        );
        await capture(
          "networkGetInterface",
          "bridge",
          "Network",
          "getInterface",
          { uuid },
          { expect: ["uuid"] },
        );
        await capture(
          "networkEnumerateBridgeSlaves",
          "existingBridge",
          "Network",
          "enumerateBridgeSlaves",
          { uuid, unused: true },
          { expect: ["mac"] },
        );
        await capture(
          "networkGetInformation",
          "bridge",
          "Network",
          "getInformation",
          { devicename: name },
          { expect: ["mac"] },
        );
        const r = await call("Network", "deleteInterface", { uuid });
        if (r.status !== 200) {
          throw new Error(`the bridge was not removed (${said(r)})`);
        }
        made.interfaces.delete(uuid);
        await apply("the bridge removed");
      },
      { changes: true },
    );

    // ---- Firewall rules: added and applied (they let everything through), then changed, reordered
    // and deleted alone, each reverted (items 1, 2) ----
    await step(
      "firewall",
      async () => {
        const allow = {
          uuid: NEW,
          rulenum: -1,
          chain: "INPUT",
          action: "ACCEPT",
          family: "inet",
          source: RULE_NETWORK,
          sport: "",
          destination: "",
          dport: RULE_PORT,
          protocol: "tcp",
          extraoptions: "",
          comment: "Example: a documentation network may reach port 8443",
        };
        const a = await setRule(allow);
        await measure("a rule added (setRule, new)", a);
        rec("iptablesSetRule", "created", a, { expect: ["uuid"] });
        if (a.status !== 200) {
          throw new Error(`the rule was not added (${said(a)})`);
        }
        fact(
          `item 2: setRule with rulenum -1 stored rulenum ${a.body.response.rulenum}`,
        );
        await apply("an ACCEPT rule");
        const log = await setRule({
          ...allow,
          action: "LOG",
          source: RULE_ADDRESS,
          dport: "",
          protocol: "all",
          comment: "Example: log what one documentation address sends",
        });
        if (log.status !== 200) {
          throw new Error(`the second rule was not added (${said(log)})`);
        }
        fact(
          `item 2: the second rule with rulenum -1 stored rulenum ${log.body.response.rulenum}`,
        );
        await apply("a LOG rule");
        fact(
          `item 10: iptables after the apply: ${await vmLine("sudo iptables -S INPUT | sed 's/[0-9.]*\\/[0-9]*//g' | tr '\\n' ';'")}`,
        );
        const rules = await capture(
          "iptablesGetRules",
          "two",
          "Iptables",
          "getRules",
          {},
          { expect: ["uuid"] },
        );
        await capture(
          "iptablesGetRule",
          "one",
          "Iptables",
          "getRule",
          { uuid: a.body.response.uuid },
          { expect: ["uuid"] },
        );
        const asRead = (rules.body.response ?? []).sort(
          (x, y) => x.rulenum - y.rulenum,
        );
        const changed = await call("Iptables", "setRule", {
          ...pick(asRead[0], RULE_FIELDS),
          comment: "Example: changed",
        });
        await measure("a rule changed (setRule, existing)", changed);
        rec("iptablesSetRule", "changed", changed, { expect: ["uuid"] });
        await revert();
        const reordered = await call(
          "Iptables",
          "setRules",
          [asRead[1], asRead[0]].map((rule, i) => ({
            ...pick(rule, RULE_FIELDS),
            rulenum: i,
          })),
        );
        await measure("rules reordered (setRules)", reordered);
        rec("iptablesSetRules", "reordered", reordered, { expect: ["uuid"] });
        const after = await capture(
          "iptablesGetRules",
          "reordered",
          "Iptables",
          "getRules",
          {},
          { expect: ["uuid"] },
        );
        const oldIds = new Set(asRead.map((r) => r.uuid));
        fact(
          `item 2: after setRules every rule has a new identifier: ${(after.body.response ?? []).every((r) => !oldIds.has(r.uuid))}; reply carries the new ones: ${JSON.stringify((reordered.body.response ?? []).map((r) => r.uuid).sort()) === JSON.stringify((after.body.response ?? []).map((r) => r.uuid).sort())}`,
        );
        await revert();
        const deleted = await call("Iptables", "deleteRule", {
          uuid: asRead[0].uuid,
        });
        await measure("a rule deleted (deleteRule)", deleted);
        rec("iptablesDeleteRule", "removed", deleted, { expect: ["uuid"] });
        await revert();
        const emptyList = await call("Iptables", "setRules", []);
        fact(
          `item 2: setRules with an empty list: ${said(emptyList)}; rules then ${(await read("Iptables", "getRules")).length}; reverted`,
        );
        await revertIfDirty();
        await refusal(
          "iptablesSetRules",
          null,
          "setRules with an IPv6 rule",
          "Iptables",
          "setRules",
          [{ ...pick(asRead[0], RULE_FIELDS), family: "inet6", rulenum: 0 }],
        );

        // IPv6, stored only.
        const allow6 = {
          ...allow,
          family: "inet6",
          source: RULE6_NETWORK,
          comment: "Example: a documentation network may reach port 8443",
        };
        const c6 = await setRule(allow6);
        await measure("an IPv6 rule added (setRule, new, inet6)", c6);
        rec("iptablesSetRule", "created6", c6, { expect: ["uuid"] });
        await capture(
          "iptablesGetRules6",
          "one",
          "Iptables",
          "getRules6",
          {},
          { expect: ["uuid"] },
        );
        const read6 = await read("Iptables", "getRules6");
        await revert();
        made.rules.clear();
        for (const r of await read("Iptables", "getRules")) {
          made.rules.add(r.uuid);
        }
        const set6 = await call("Iptables", "setRules6", [
          { ...pick(read6[0], RULE_FIELDS), rulenum: 0 },
          {
            ...pick(read6[0], RULE_FIELDS),
            uuid: NEW,
            rulenum: 1,
            action: "LOG",
            source: RULE6_ADDRESS,
            dport: "",
            protocol: "icmpv6",
            comment: "Example: log what one documentation address sends",
          },
        ]);
        await measure("IPv6 rules replaced (setRules6)", set6);
        rec("iptablesSetRules6", "replaced", set6, { expect: ["uuid"] });
        await capture(
          "iptablesGetRules6",
          "two",
          "Iptables",
          "getRules6",
          {},
          { expect: ["uuid"] },
        );
        await revert();
        // The two applied rules removed again.
        for (const uuid of made.rules) {
          const r = await call("Iptables", "deleteRule", { uuid });
          if (r.status !== 200) {
            throw new Error(`a rule was not deleted (${said(r)})`);
          }
        }
        made.rules.clear();
        await apply("the rules deleted");
        fact(
          `item 10: iptables after deleting every rule: ${await vmLine("sudo iptables -S | tr '\\n' ';'; sudo ip6tables -S | tr '\\n' ';'")}`,
        );
      },
      { changes: true },
    );

    // ---- The proxy, stored only and reverted (items 1, 2) ----
    await step("proxy", async () => {
      const proxy = {
        httpenable: true,
        httphost: PROXY_HOST,
        httpport: 3128,
        httpusername: PROXY_USER,
        httppassword: proxyPasswords[0],
        httpsenable: true,
        httpshost: PROXY_HOST,
        httpsport: 3129,
        httpsusername: PROXY_USER,
        httpspassword: proxyPasswords[1],
        ftpenable: true,
        ftphost: PROXY_HOST,
        ftpport: 2121,
        ftpusername: "",
        ftppassword: "",
      };
      const saved = await call("Network", "setProxy", proxy);
      await measure("the proxy (setProxy)", saved);
      rec("networkSetProxy", "saved", saved, {
        keys: STORED_PROXY_KEYS,
        expect: ["key:password"],
      });
      fact(
        `item 2: setProxy reply keys ${Object.keys(saved.body.response ?? {}).join(",")}; http keys ${Object.keys(saved.body.response?.http ?? {}).join(",")}`,
      );
      const got = await capture(
        "networkGetProxy",
        "set",
        "Network",
        "getProxy",
        {},
        { keys: PROXY_KEYS, expect: ["key:httppassword", "key:httpspassword"] },
      );
      fact(
        `item 2: getProxy with proxies set: http ${JSON.stringify(got.body.response?.http)}, https ${JSON.stringify(got.body.response?.https)}, ftp ${JSON.stringify(got.body.response?.ftp)}; keys ${Object.keys(got.body.response ?? {}).length}`,
      );
      const multi = await call("Network", "setProxy", {
        ...proxy,
        httppassword: "two\nlines",
      });
      fact(`item 2: setProxy with a two-line password: ${said(multi)}`);
      await revert();
    });
  } finally {
    // ---- Leave the VM as it was ----
    try {
      await revertIfDirty();
      const order = { vlan: 0, bridge: 1, bond: 2, wifi: 3, ethernet: 4 };
      const keep = new Set(before.interfaces.map((i) => i.uuid));
      const left = (await interfaces())
        .filter((i) => !keep.has(i.uuid))
        .sort((x, y) => (order[x.type] ?? 9) - (order[y.type] ?? 9));
      for (const i of left) {
        const r = await call("Network", "deleteInterface", { uuid: i.uuid });
        fact(
          `cleanup: interface settings of this run removed (${i.type}): ${said(r)}`,
        );
      }
      for (const r of [
        ...(await read("Iptables", "getRules")),
        ...(await read("Iptables", "getRules6")),
      ]) {
        const d = await call("Iptables", "deleteRule", { uuid: r.uuid });
        fact(`cleanup: a rule of this run removed: ${said(d)}`);
      }
      const proxyNow = await read("Network", "getProxy");
      if (
        JSON.stringify(pick(proxyNow, PROXY_FIELDS)) !==
        JSON.stringify(pick(before.proxy, PROXY_FIELDS))
      ) {
        await ok("Network", "setProxy", pick(before.proxy, PROXY_FIELDS));
        fact("cleanup: the proxy put back");
      }
      const generalNow = await read("Network", "getGeneralSettings");
      if (JSON.stringify(generalNow) !== JSON.stringify(before.general)) {
        await ok(
          "Network",
          "setGeneralSettings",
          pick(before.general, ["hostname", "domainname"]),
        );
        fact("cleanup: the name put back");
      }
      if (await isDirty()) {
        await apply("cleanup");
      }
      await vm("sudo rm -f /tmp/logfile*");
      // A port that was down and is up without an address now (a bridge's member stays up after
      // the bridge is removed), and the bonding module a bond loaded, put back as they were.
      for (const [i, port] of opts.ports.entries()) {
        if (
          vmBefore.ports[i].startsWith("DOWN") &&
          (await portState(port)) === "UP | 0"
        ) {
          await vm(`sudo ip link set dev ${port} down`);
          fact(`cleanup: ${port} set down again, as it was`);
        }
      }
      if (
        !vmBefore.bonding &&
        (await vmLine(
          "test -e /sys/class/net/bonding_masters && echo present || echo absent",
        )) === "present"
      ) {
        await vm("sudo modprobe -r bonding");
        fact("cleanup: the bonding module this run loaded unloaded");
      }
      if (
        vmBefore.firewallUnit === "absent" &&
        (await vmLine(
          "test -e /etc/systemd/system/openmediavault-firewall.service && echo present || echo absent",
        )) === "present"
      ) {
        await vm(
          "sudo systemctl disable openmediavault-firewall.service && sudo rm -f /etc/systemd/system/openmediavault-firewall.service && sudo systemctl daemon-reload",
        );
        fact(
          "cleanup: the firewall unit this run's apply created disabled and removed",
        );
      }
      if (
        vmBefore.firewallScript === "absent" &&
        (await vmLine(
          "test -e /etc/iptables/openmediavault-firewall.sh && echo present || echo absent",
        )) === "present"
      ) {
        await vm("sudo rm -f /etc/iptables/openmediavault-firewall.sh");
        if (vmBefore.iptablesDir === "absent") {
          await vm("sudo rmdir /etc/iptables 2>/dev/null; true");
        }
        fact("cleanup: the firewall script this run's apply created removed");
      }

      // ---- The VM as it was? ----
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const ifacesNow = await interfaces();
      fact(
        `after cleanup: dirtyModules ${JSON.stringify(await dirtyModules())}; isDirty ${await isDirty()}; queued jobs ${await queuedJobs()}; interfaces with settings ${ifacesNow.map((i) => (i.devicename === reaching ? "the reaching port" : i.type)).join(",")} (same ${same(
          ifacesNow.map((i) => i.uuid),
          before.interfaces.map((i) => i.uuid),
        )}, reaching port's settings unchanged ${same(ifacesNow, before.interfaces)})`,
      );
      fact(
        `after cleanup: rules ${(await read("Iptables", "getRules")).length}/${(await read("Iptables", "getRules6")).length}; proxy as before ${same(await read("Network", "getProxy"), before.proxy)}; name as before ${same(await read("Network", "getGeneralSettings"), before.general)}`,
      );
      fact(
        `after cleanup: iptables as before ${(await vmLine("sudo iptables -S; sudo ip6tables -S")) === vmBefore.iptables}; ports ${[await portState(portA), await portState(portB)].join(" / ")} (before ${vmBefore.ports.join(" / ")}); links ${await vmLine("ls /sys/class/net | tr '\\n' ' '")}; netplan ${await vmLine("ls /etc/netplan")} (before ${vmBefore.netplan}); firewall unit ${await vmLine("test -e /etc/systemd/system/openmediavault-firewall.service && echo present || echo absent")}; /tmp/logfile* ${await vmLine("ls /tmp/logfile* 2>/dev/null | wc -l")}`,
      );
    } catch (e) {
      fact(
        `CLEANUP FAILED: ${printable(e.message).slice(0, 400)}; the VM may need its snapshot`,
      );
    } finally {
      await s.call("Session", "logout").catch(() => {});
      // Re-read every example this run wrote: nothing of the VM, no test password.
      await learnIdentifiers().catch(() => {});
      for (const file of written) {
        const text = fs.readFileSync(path.join(EXAMPLES, file), "utf8");
        const lower = text.toLowerCase();
        const leaks = [
          [env.NAS_HOST && text.includes(env.NAS_HOST), "the host"],
          [secrets.some((p) => text.includes(p)), "a test password"],
          [
            [...vmIdentifiers].some((id) => lower.includes(id)),
            "a hardware address or address of the VM",
          ],
          [
            String(before.general.hostname).length > 3 &&
              before.general.hostname !== "openmediavault" &&
              lower.includes(String(before.general.hostname).toLowerCase()),
            "the VM's name",
          ],
        ].filter(([leak]) => leak);
        if (leaks.length) {
          results.push(
            `FAIL  ${file}: re-read found ${leaks.map(([, w]) => w).join(", ")}`,
          );
        }
      }
      for (const line of [...results, ...facts.map(printable)]) {
        console.log(line);
      }
      if (results.some((l) => l.startsWith("FAIL"))) {
        process.exitCode = 1;
      }
    }
  }
}

main().catch((err) => {
  // The message is ours, the network's or the server's; it never carries a credential.
  console.error(`capture failed: ${err.message}`);
  process.exitCode = 1;
});
