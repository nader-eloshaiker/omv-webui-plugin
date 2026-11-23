// SPDX-License-Identifier: GPL-3.0-or-later
// network/proxyModel.ts: the form's draft without passwords, the stored-password rule (12.3, P9),
// the checks (0.8) and the fifteen fields of setProxy (0.9).
import { describe, expect, it } from "vitest";
import type { ProxySettings } from "./dto.ts";
import {
  checkProxy,
  proxyDraft,
  setProxyRequest,
  type ProxyDraft,
} from "./proxyModel.ts";

const READ: ProxySettings = {
  httpenable: true,
  httphost: "proxy.example.org",
  httpport: 8080,
  httpusername: "proxy-user",
  httppassword: true,
  httpsenable: false,
  httpshost: "",
  httpsport: 4443,
  httpsusername: "",
  httpspassword: false,
  ftpenable: false,
  ftphost: "",
  ftpport: 2121,
  ftpusername: "",
  ftppassword: true,
};

const keep = (draft: ProxyDraft): ProxyDraft => ({
  ...draft,
  http: {
    ...draft.http,
    password: { stored: true, choice: "keep", typed: "EXAMPLE-PASSWORD" },
  },
  ftp: { ...draft.ftp, password: { stored: true, choice: "remove" } },
});

describe("the draft", () => {
  it("a port that is not stored becomes OMV's default for that proxy (D18)", () => {
    const draft = proxyDraft({
      ...READ,
      httpport: 0,
      httpsport: 0,
      ftpport: 0,
    });
    expect([draft.http.port, draft.https.port, draft.ftp.port]).toEqual([
      "8080",
      "4443",
      "2121",
    ]);
    expect(proxyDraft(READ).http.port).toBe("8080");
  });

  it("holds no password; a stored one needs a choice", () => {
    const draft = proxyDraft(READ);
    expect(draft.http.password).toEqual({ stored: true, choice: null });
    expect(draft.https.password).toEqual({ stored: false, typed: "" });
    expect(JSON.stringify(draft)).not.toContain("EXAMPLE-PASSWORD");
  });

  it("a password not reported is not set", () => {
    const { httppassword: _p, ...withoutPresence } = READ;
    expect(proxyDraft(withoutPresence).http.password).toEqual({
      stored: false,
      typed: "",
    });
  });
});

describe("the checks (0.8, 12.3)", () => {
  it("every stored password typed again or removed before saving", () => {
    expect(checkProxy(proxyDraft(READ))).toEqual([
      {
        field: "passwords",
        code: "proxy.needPasswords",
        list: ["http", "ftp"],
      },
    ]);
    expect(checkProxy(keep(proxyDraft(READ)))).toEqual([]);
  });

  it("keep chosen but nothing typed is not enough", () => {
    const draft = proxyDraft(READ);
    const partial: ProxyDraft = {
      ...keep(draft),
      http: {
        ...draft.http,
        password: { stored: true, choice: "keep", typed: "" },
      },
    };
    expect(checkProxy(partial)).toEqual([
      { field: "passwords", code: "proxy.needPasswords", list: ["http"] },
    ]);
  });

  it.each<[string, Partial<ProxyDraft["http"]>, string[]]>([
    ["an address", { host: "192.0.2.8" }, []],
    ["an IPv6 address", { host: "2001:db8::8" }, []],
    ["a name that is not one", { host: "proxy_example" }, ["proxy.err.host"]],
    ["on without an address", { host: "" }, ["proxy.err.host"]],
    ["off without an address", { enable: false, host: "" }, []],
    ["port 0", { port: "0" }, ["proxy.err.port"]],
    ["port 65536", { port: "65536" }, ["proxy.err.port"]],
    ["port not a number", { port: "eighty" }, ["proxy.err.port"]],
  ])("%s", (_what, over, codes) => {
    const draft = keep(proxyDraft(READ));
    expect(
      checkProxy({ ...draft, http: { ...draft.http, ...over } }).map(
        (p) => p.code,
      ),
    ).toEqual(codes);
  });
});

describe("setProxy (0.9)", () => {
  it("sends all fifteen fields, each password typed or empty", () => {
    expect(setProxyRequest(keep(proxyDraft(READ)))).toEqual({
      httpenable: true,
      httphost: "proxy.example.org",
      httpport: 8080,
      httpusername: "proxy-user",
      httppassword: "EXAMPLE-PASSWORD",
      httpsenable: false,
      httpshost: "",
      httpsport: 4443,
      httpsusername: "",
      httpspassword: "",
      ftpenable: false,
      ftphost: "",
      ftpport: 2121,
      ftpusername: "",
      ftppassword: "",
    });
  });

  it("refuses to write before every stored password is decided", () => {
    expect(() => setProxyRequest(proxyDraft(READ))).toThrow(Error);
  });
});
