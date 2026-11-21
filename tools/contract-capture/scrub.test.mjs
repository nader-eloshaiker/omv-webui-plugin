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

test("a disk's serial number and WWN are replaced in its fields and inside other text", () => {
  const { scrub, verify } = createScrubber(known);
  const raw = {
    data: [
      {
        devicefile: "/dev/disk/by-id/nvme-Acme_Disk_ACME_SN_4711_1",
        devicelinks: [
          "/dev/disk/by-id/nvme-eui.0123456789abcdef0123456789abcdef",
          "/dev/disk/by-id/nvme-Acme_Disk_ACME_SN_4711",
        ],
        serialnumber: "ACME SN_4711",
        wwn: "eui.0123456789abcdef0123456789abcdef",
      },
      {
        devicefile: "/dev/disk/by-id/ata-Acme_HDD_98765432109876543210",
        devicelinks: [
          "/dev/disk/by-id/wwn-0x5000c500a1b2c3d4",
          "/dev/disk/by-id/scsi-35000c500a1b2c3d4",
        ],
        serialnumber: "98765432109876543210",
        wwn: "0x5000c500a1b2c3d4",
      },
    ],
  };
  const out = scrub(raw);
  assert.deepEqual(verify(out), []);
  const [nvme, ata] = out.data;
  assert.equal(nvme.serialnumber, "EXAMPLE-SERIAL-0001");
  assert.equal(nvme.wwn, "EXAMPLE-WWN-0001");
  assert.equal(
    nvme.devicefile,
    "/dev/disk/by-id/nvme-Acme_Disk_EXAMPLE-SERIAL-0001_1",
  );
  assert.deepEqual(nvme.devicelinks, [
    "/dev/disk/by-id/nvme-EXAMPLE-WWN-0001",
    "/dev/disk/by-id/nvme-Acme_Disk_EXAMPLE-SERIAL-0001",
  ]);
  assert.equal(ata.serialnumber, "EXAMPLE-SERIAL-0002");
  assert.equal(ata.wwn, "EXAMPLE-WWN-0002");
  assert.equal(
    ata.devicefile,
    "/dev/disk/by-id/ata-Acme_HDD_EXAMPLE-SERIAL-0002",
  );
  assert.deepEqual(ata.devicelinks, [
    "/dev/disk/by-id/wwn-EXAMPLE-WWN-0002",
    "/dev/disk/by-id/scsi-3EXAMPLE-WWN-0002",
  ]);
});

test("disk identifiers learnt beforehand are replaced in replies that do not carry them", () => {
  const { scrub, verify } = createScrubber({
    ...known,
    serials: ["ACME SN_4711", ""],
    wwns: ["0x5000c500a1b2c3d4"],
  });
  const out = scrub({
    devlinks: ["/dev/disk/by-id/wwn-0x5000c500a1b2c3d4-part1"],
    message: "Device: /dev/nvme0, ACME SN_4711, failed",
  });
  assert.deepEqual(verify(out), []);
  assert.deepEqual(out, {
    devlinks: ["/dev/disk/by-id/wwn-EXAMPLE-WWN-0001-part1"],
    message: "Device: /dev/nvme0, EXAMPLE-SERIAL-0001, failed",
  });
});

test("verify reports a disk identifier left in place, never the value", () => {
  const { verify } = createScrubber({ ...known, serials: ["ACME SN_4711"] });
  const text = verify({
    a: "/dev/disk/by-id/ata-Acme_HDD_98765432109876543210",
    b: "/dev/disk/by-id/wwn-0x5000c500a1b2c3d4-part1",
    c: "seen ACME SN_4711",
    d: { wwn: "0x5000c500a1b2c3d4" },
    ok: "/dev/disk/by-id/ata-Acme_HDD_EXAMPLE-SERIAL-0001",
    path: "/dev/disk/by-path/pci-0000:00:1f.2-ata-1",
  }).join("\n");
  for (const want of [
    "a disk identifier in a by-id name at $.a",
    "a disk identifier in a by-id name at $.b",
    "a disk serial number or WWN at $.c",
    "WWN at $.d.wwn",
  ]) {
    assert.ok(text.includes(want), `missing "${want}" in:\n${text}`);
  }
  assert.ok(!text.includes("$.ok") && !text.includes("$.path"), text);
  for (const secret of ["98765432109876543210", "5000c500", "4711"]) {
    assert.ok(!text.includes(secret), "a failure must not repeat the value");
  }
});

test("a Wi-Fi network name and key are replaced whatever their value", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({
    data: [
      { wpassid: "Home Network 5G", wpapsk: "correct horse battery" },
      { wpassid: "", wpapsk: "" },
    ],
  });
  assert.deepEqual(out.data, [
    { wpassid: "example-ssid", wpapsk: "EXAMPLE-PASSWORD" },
    { wpassid: "", wpapsk: "" },
  ]);
  assert.deepEqual(verify(out), []);
  assert.match(
    verify({ wpapsk: "correct horse battery" }).join("\n"),
    /wpapsk at \$\.wpapsk/,
  );
});

test("addresses that identify nothing are kept", () => {
  const { scrub, verify } = createScrubber(known);
  const raw = {
    loopback: "00:00:00:00:00:00",
    broadcast: "ff:ff:ff:ff:ff:ff",
    netmask6: "ffff:ffff:ffff:ffff:0000:0000:0000:0000",
    shortmask6: "ffff:ffff:ffff:ffff::",
    linklocal: "fe80::1",
    newobject: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
  };
  const out = scrub(raw);
  assert.deepEqual(out, raw);
  assert.deepEqual(verify(out), []);
});

test("a link-local address derived from a MAC address follows that MAC's placeholder", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({
    ether: "52:54:00:12:34:56",
    address6: "fe80::5054:ff:fe12:3456",
    description: "eth0 [52:54:00:12:34:56] fe80::5054:ff:fe12:3456/64",
  });
  assert.deepEqual(verify(out), []);
  assert.equal(out.ether, "00:00:5e:00:53:01");
  assert.equal(out.address6, "fe80::200:5eff:fe00:5301");
  assert.equal(
    out.description,
    "eth0 [00:00:5e:00:53:01] fe80::200:5eff:fe00:5301/64",
  );
  assert.match(
    verify({ address6: "fe80::5054:ff:fe12:3456" }).join("\n"),
    /IPv6 address at \$\.address6/,
  );
});

test("one disk spelt two ways gets one placeholder", () => {
  const { scrub, verify } = createScrubber({
    ...known,
    serials: ["ACME SN 4711"],
    wwns: ["0x5000C500A1B2C3D4"],
  });
  const out = scrub({
    serialnumber: "ACME SN_4711",
    wwn: "0x5000c500a1b2c3d4",
    devicefile: "/dev/disk/by-id/nvme-Acme_ACME_SN_4711",
  });
  assert.deepEqual(verify(out), []);
  assert.deepEqual(out, {
    serialnumber: "EXAMPLE-SERIAL-0001",
    wwn: "EXAMPLE-WWN-0001",
    devicefile: "/dev/disk/by-id/nvme-Acme_EXAMPLE-SERIAL-0001",
  });
});

test("a WWN in smartctl's spaced spelling is the same disk's placeholder, in its field and in text", () => {
  const { scrub, verify } = createScrubber({
    ...known,
    wwns: ["0x5000c500a1b2c3d4"],
  });
  const out = scrub({
    wwn: "0x5000c500a1b2c3d4",
    luwwndeviceid: "5 000c50 0a1b2c3d4",
    text: "LU WWN Device Id: 5 000c50 0a1b2c3d4\nFirmware Version: 1.0",
  });
  assert.deepEqual(verify(out), []);
  assert.deepEqual(out, {
    wwn: "EXAMPLE-WWN-0001",
    luwwndeviceid: "EXAMPLE-WWN-0001",
    text: "LU WWN Device Id: EXAMPLE-WWN-0001\nFirmware Version: 1.0",
  });
});

test("a WWN field smartctl names is replaced even when the disk was not known beforehand", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({ luwwndeviceid: "5 001b44 8b1a2b3c4" });
  assert.deepEqual(verify(out), []);
  assert.equal(out.luwwndeviceid, "EXAMPLE-WWN-0001");
});

test("verify reports a WWN left in smartctl's spelling, never the value", () => {
  const { verify } = createScrubber(known);
  const text = verify({
    a: "LU WWN Device Id: 5 000c50 0a1b2c3d4",
    b: { luwwndeviceid: "5 000c50 0a1b2c3d4" },
    ok: "Sector Sizes: 512 bytes logical, 4096 bytes physical",
  }).join("\n");
  assert.ok(text.includes("a WWN in smartctl's spelling at $.a"), text);
  assert.ok(text.includes("WWN at $.b.luwwndeviceid"), text);
  assert.ok(!text.includes("$.ok"), text);
  assert.ok(!text.includes("0a1b2c3d4"), "a failure must not repeat the value");
});
