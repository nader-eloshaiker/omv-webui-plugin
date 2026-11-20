// SPDX-License-Identifier: GPL-3.0-or-later
// Every value here is invented for the test; none comes from a real system.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DOC, createScrubber } from "./scrub.mjs";

const known = {
  names: { "webui-tester": "example-user", box17: "nas" },
  literals: ["10.11.12.13", "hunter2-not-real"],
};

test("replaces each class with a documentation value and verifies clean", () => {
  const { scrub, verify } = createScrubber(known);
  const raw = {
    hostname: "box17",
    fqdn: "box17.lan.internal",
    domainname: "lan.internal",
    serialnumber: "12345678901234567890",
    uuid: "3f2b1c4e-9a8d-4e7f-b6c5-1d2e3f4a5b6c",
    ref: "3F2B1C4E-9A8D-4E7F-B6C5-1D2E3F4A5B6C",
    other: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    mac: "52:54:00:12:34:56",
    address: "10.11.12.13",
    lan: "172.16.5.4",
    mask: "255.255.255.0",
    loop: "127.0.0.1",
    v6: "fd12:3456:789a::1",
    linklocal: "fe80::1",
    owner: "webui-tester",
    note: "shared by webui-tester on box17",
    key: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 someone@laptop",
    rfc: "---- BEGIN SSH2 PUBLIC KEY ----\nAAAAB3NzaC1yc2EAAAADAQAB\n---- END SSH2 PUBLIC KEY ----",
    sessionid: "abcdef0123456789",
    trace: "#0 /usr/share/php/…",
    role: "admin",
    time: "Thu Nov 19 22:40:01 2026",
  };
  const out = scrub(raw);
  assert.deepEqual(verify(out), []);
  assert.equal(out.hostname, DOC.hostname);
  assert.equal(out.fqdn, DOC.fqdn);
  assert.equal(out.domainname, DOC.domain);
  assert.equal(out.serialnumber, "EXAMPLE-SERIAL-0001");
  assert.equal(out.uuid, "00000000-0000-4000-8000-000000000001");
  assert.equal(
    out.ref,
    out.uuid,
    "the same UUID maps to the same value, whatever its case",
  );
  assert.equal(out.other, "00000000-0000-4000-8000-000000000002");
  assert.equal(out.mac, "00:00:5e:00:53:01");
  assert.equal(out.address, "NAS_HOST");
  assert.equal(out.lan, "192.0.2.1");
  assert.equal(out.mask, "255.255.255.0");
  assert.equal(out.loop, "127.0.0.1");
  assert.equal(out.v6, "2001:db8::1");
  assert.equal(out.linklocal, "fe80::1");
  assert.equal(out.owner, "example-user");
  assert.equal(out.note, "shared by example-user on nas");
  assert.equal(out.key, DOC.sshKey);
  assert.equal(out.rfc, DOC.rfc4716Key);
  assert.equal(out.sessionid, "EXAMPLE-SESSION-ID");
  assert.equal("trace" in out, false);
  assert.equal(out.role, "admin", "a role value is not a user name");
  assert.equal(out.time, raw.time);
});

test("does not touch its input", () => {
  const { scrub } = createScrubber(known);
  const raw = { owner: "webui-tester" };
  scrub(raw);
  assert.equal(raw.owner, "webui-tester");
});

test("verify reports what scrubbing missed, by rule and place, never the value", () => {
  const { verify } = createScrubber(known);
  const failures = verify({
    a: "52:54:00:12:34:56",
    b: ["172.16.5.4"],
    c: { serialnumber: "XYZ" },
    d: "hello webui-tester",
    e: "hunter2-not-real",
    hostname: "box17",
  });
  const text = failures.join("\n");
  for (const want of [
    "MAC address at $.a",
    "IPv4 address at $.b[0]",
    "serial number at $.c.serialnumber",
    "a known name at $.d",
    "a known secret or host at $.e",
    "host name at $.hostname",
  ]) {
    assert.ok(text.includes(want), `missing "${want}" in:\n${text}`);
  }
  for (const secret of ["52:54", "172.16", "XYZ", "hunter2", "box17"]) {
    assert.ok(
      !text.includes(secret),
      "a failure message must not repeat the value",
    );
  }
});

test("keys are scrubbed too", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({ "webui-tester": 1 });
  assert.deepEqual(Object.keys(out), ["example-user"]);
  assert.deepEqual(verify(out), []);
});

test("e-mail addresses outside the documentation domains are replaced, consistently", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({
    sender: "Box@Mail.Invalid-Corp.test",
    primaryemail: "box@mail.invalid-corp.test",
    secondaryemail: "alerts@example.net",
    owner: "webui-tester@example.com",
    note: "mail webui-tester@corp.test or other@corp.test",
  });
  assert.deepEqual(verify(out), []);
  assert.equal(out.sender, "user1@example.com");
  assert.equal(out.primaryemail, out.sender, "case does not make a new one");
  assert.equal(out.secondaryemail, "alerts@example.net");
  assert.equal(out.owner, "example-user@example.com");
  assert.equal(out.note, "mail user2@example.com or user3@example.com");
});

test("a password field is replaced whatever its value, and empty stays empty", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({ password: "correct horse", nested: { password: "" } });
  assert.deepEqual(out, {
    password: "EXAMPLE-PASSWORD",
    nested: { password: "" },
  });
  assert.deepEqual(verify(out), []);
});

test("a capture may name more fields to replace", () => {
  const { scrub, verify } = createScrubber(known);
  const extra = { username: "example-smtp-user", server: "smtp.example.com" };
  const raw = { username: "mailer-7", server: "relay.corp.test", port: 587 };
  const out = scrub(raw, extra);
  assert.deepEqual(out, {
    username: "example-smtp-user",
    server: "smtp.example.com",
    port: 587,
  });
  assert.deepEqual(verify(out, extra), []);
  assert.deepEqual(verify(scrub(raw), extra).sort(), [
    "server at $.server",
    "username at $.username",
  ]);
});

test("verify reports a password or e-mail address left in place, never the value", () => {
  const { verify } = createScrubber(known);
  const text = verify({
    password: "correct horse",
    email: "someone@corp.test",
  }).join("\n");
  assert.match(text, /password at \$\.password/);
  assert.match(text, /e-mail address at \$\.email/);
  assert.ok(!text.includes("correct horse") && !text.includes("corp.test"));
});
