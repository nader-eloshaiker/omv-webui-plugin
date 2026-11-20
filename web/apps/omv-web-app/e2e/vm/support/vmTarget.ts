// SPDX-License-Identifier: GPL-3.0-or-later
// The disposable test VM the VM browser test runs against, and its accounts, read from the env file
// (`$OMV_WEBUI_ENV`, default ~/.config/omv-webui/test.env; docs/07 ground rule 2). Nothing here is
// ever printed: a missing key is reported by its name only. Without the file the whole suite is
// skipped. Never point this at the owner's server.
//
// The administrator with a second factor is optional. When the env file's two-factor account is not
// an administrator, a run can supply a temporary one through the process environment
// (OMV_2FA_ADMIN_USER, OMV_2FA_ADMIN_PASSWORD, OMV_2FA_ADMIN_TOTP_SECRET); without it, that
// journey is skipped.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Account {
  username: string;
  password: string;
}

export interface TwoFactorAccount extends Account {
  totpSecret: string;
}

export interface VmTarget {
  /** `http://NAS_HOST` (or https, with OMV_WEBUI_VM_SCHEME=https). */
  origin: string;
  admin: Account;
  user: Account;
  /** The env file's second-factor account; its role is whatever the VM gives it. */
  twoFactor: TwoFactorAccount;
  twoFactorAdmin: TwoFactorAccount | null;
}

export const ENV_FILE =
  process.env.OMV_WEBUI_ENV ?? join(homedir(), ".config/omv-webui/test.env");

function parseEnvFile(text: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      entries.set(match[1], match[2].replace(/^(['"])(.*)\1$/, "$2"));
    }
  }
  return entries;
}

function required(env: ReadonlyMap<string, string>, key: string): string {
  const value = env.get(key);
  if (!value) {
    throw new Error(`${key} is not set in the VM env file.`);
  }
  return value;
}

function schemeOf(value: string | undefined): "http" | "https" {
  if (value === undefined || value === "" || value === "http") {
    return "http";
  }
  if (value === "https") {
    return "https";
  }
  throw new Error("OMV_WEBUI_VM_SCHEME must be http or https.");
}

function optionalTwoFactorAdmin(
  env: ReadonlyMap<string, string>,
): TwoFactorAccount | null {
  const read = (key: string) => process.env[key] ?? env.get(key);
  const username = read("OMV_2FA_ADMIN_USER");
  const password = read("OMV_2FA_ADMIN_PASSWORD");
  const totpSecret = read("OMV_2FA_ADMIN_TOTP_SECRET");
  if (!username && !password && !totpSecret) {
    return null;
  }
  if (!username || !password || !totpSecret) {
    throw new Error(
      "OMV_2FA_ADMIN_USER, OMV_2FA_ADMIN_PASSWORD and OMV_2FA_ADMIN_TOTP_SECRET go together.",
    );
  }
  return { username, password, totpSecret };
}

/** The VM target, or null when there is no env file (the suite is then skipped). */
export function readVmTarget(file: string = ENV_FILE): VmTarget | null {
  if (!existsSync(file)) {
    return null;
  }
  const env = parseEnvFile(readFileSync(file, "utf8"));
  const host = required(env, "NAS_HOST");
  if (!/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(host)) {
    throw new Error("NAS_HOST must be a bare host name or address.");
  }
  const account = (user: string, password: string): Account => ({
    username: required(env, user),
    password: required(env, password),
  });
  return {
    origin: `${schemeOf(process.env.OMV_WEBUI_VM_SCHEME)}://${host}`,
    admin: account("OMV_ADMIN_USER", "OMV_ADMIN_PASSWORD"),
    user: account("OMV_USER", "OMV_USER_PASSWORD"),
    twoFactor: {
      ...account("OMV_2FA_USER", "OMV_2FA_PASSWORD"),
      totpSecret: required(env, "OMV_2FA_TOTP_SECRET"),
    },
    twoFactorAdmin: optionalTwoFactorAdmin(env),
  };
}
