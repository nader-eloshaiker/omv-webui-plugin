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
    { wpassid: "EXAMPLE-NETWORK", wpapsk: "EXAMPLE-PASSWORD" },
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

test("a FAT volume ID is replaced consistently, and verify reports one left in place", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({
    uuid: "1A2B-3C4D",
    devicefile: "/dev/disk/by-uuid/1A2B-3C4D",
    other: "/dev/disk/by-uuid/5E6F-7A8B",
    date: "2026-11-19-05-53-43-00",
    upper: "3F2B1C4E-9A8D-4E7F-B6C5-1D2E3F4A5B6C",
    path: "/dev/disk/by-path/pci-0000:12:00.0-nvme-1",
  });
  assert.deepEqual(verify(out), []);
  assert.deepEqual(out, {
    uuid: "0000-0001",
    devicefile: "/dev/disk/by-uuid/0000-0001",
    other: "/dev/disk/by-uuid/0000-0002",
    date: "2026-11-19-05-53-43-00",
    upper: "00000000-0000-4000-8000-000000000001",
    path: "/dev/disk/by-path/pci-0000:12:00.0-nvme-1",
  });
  const text = verify({ a: "/dev/disk/by-uuid/1A2B-3C4D" }).join("\n");
  assert.ok(text.includes("FAT volume ID at $.a"), text);
  assert.ok(!text.includes("1A2B"), "a failure must not repeat the value");
});

// ---- Software RAID (mdadm) ----------------------------------------------------------------------

// An mdadm report as MdMgmt.getDetail returns it, from an invented host.
const MD_REPORT = [
  "           Version : 1.2",
  "     Creation Time : Fri Nov 20 09:14:07 2026",
  "        Raid Level : raid1",
  "             State : clean, resyncing ",
  "     Update Time : Fri Nov 20 09:15:31 2026",
  "              Name : box17:0  (local to host box17)",
  "              UUID : 9d85a4f6:afff2cb6:b8a5f4dc:75f3cfd3",
  "            Events : 37",
  "",
  "    Number   Major   Minor   RaidDevice State",
  "       0       8       16        0      active sync   /dev/sdb",
].join("\n");

test("an mdadm report loses its host, UUID and dates, and keeps the rest", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({ report: MD_REPORT }).report;
  assert.deepEqual(verify({ report: out }), []);
  assert.equal(
    out,
    [
      "           Version : 1.2",
      `     Creation Time : ${DOC.mdadmDate}`,
      "        Raid Level : raid1",
      "             State : clean, resyncing ",
      `     Update Time : ${DOC.mdadmDate}`,
      "              Name : nas:0  (local to host nas)",
      "              UUID : 00000000:00000000:00000000:00000001",
      "            Events : 37",
      "",
      "    Number   Major   Minor   RaidDevice State",
      "       0       8       16        0      active sync   /dev/sdb",
    ].join("\n"),
  );
});

const MD_HOST_CASES = [
  {
    name: "a host the scrubber does not know (an array from another computer)",
    raw: "              Name : oldnas:media",
    want: "              Name : nas:media",
  },
  {
    name: "the product's own name, which the general rule keeps",
    raw: "              Name : openmediavault:0  (local to host openmediavault)",
    want: "              Name : nas:0  (local to host nas)",
  },
  {
    name: "the server's description",
    raw: "Software RAID oldnas:0 [/dev/md0, raid1, 7.99 GiB]",
    want: "Software RAID nas:0 [/dev/md0, raid1, 7.99 GiB]",
  },
  {
    name: "mdadm's brief form",
    raw: "ARRAY /dev/md0 metadata=1.2 name=oldnas:0 UUID=9d85a4f6:afff2cb6:b8a5f4dc:75f3cfd3",
    want: "ARRAY /dev/md0 metadata=1.2 name=nas:0 UUID=00000000:00000000:00000000:00000001",
  },
  {
    name: "udev's md-name and md-uuid links",
    raw: "/dev/disk/by-id/md-name-oldnas:0 /dev/disk/by-id/md-uuid-9d85a4f6:afff2cb6:b8a5f4dc:75f3cfd3",
    want: "/dev/disk/by-id/md-name-nas:0 /dev/disk/by-id/md-uuid-00000000:00000000:00000000:00000001",
  },
];
for (const { name, raw, want } of MD_HOST_CASES) {
  test(`an array's host part is replaced: ${name}`, () => {
    const { scrub, verify } = createScrubber(known);
    const out = scrub({ text: raw });
    assert.equal(out.text, want);
    assert.deepEqual(verify(out), []);
  });
}

test("an array's name field loses its host part; other names with a colon do not", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({
    arrays: [
      {
        name: "oldnas:0",
        devicefile: "/dev/md0",
        uuid: "9d85a4f6:afff2cb6:b8a5f4dc:75f3cfd3",
      },
      { name: "openmediavault:media", devicefile: "/dev/md127" },
      { name: "", devicefile: "/dev/md1" },
      { name: "0", devicefile: "/dev/md2" },
    ],
    other: { name: "12:30", devicefile: "/dev/sdb" },
  });
  assert.deepEqual(verify(out), []);
  assert.deepEqual(
    out.arrays.map((a) => a.name),
    ["nas:0", "nas:media", "", "0"],
  );
  assert.equal(out.arrays[0].uuid, "00000000:00000000:00000000:00000001");
  assert.equal(out.other.name, "12:30", "not an array: left alone");
});

test("the same mdadm UUID gets the same placeholder in a field and in text, whatever its case", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({
    uuid: "9d85a4f6:afff2cb6:b8a5f4dc:75f3cfd3",
    report: "UUID : 9D85A4F6:AFFF2CB6:B8A5F4DC:75F3CFD3",
    other: "1b2c3d4e:5f607182:93a4b5c6:d7e8f90a",
    time: "21:58:20",
    mac: "00:00:5e:00:53:01",
  });
  assert.deepEqual(verify(out), []);
  assert.equal(out.uuid, "00000000:00000000:00000000:00000001");
  assert.equal(out.report, "UUID : 00000000:00000000:00000000:00000001");
  assert.equal(out.other, "00000000:00000000:00000000:00000002");
  assert.equal(out.time, "21:58:20");
  assert.equal(out.mac, "00:00:5e:00:53:01");
});

const MD_LEFT_CASES = [
  {
    name: "an mdadm UUID",
    value: { uuid: "9d85a4f6:afff2cb6:b8a5f4dc:75f3cfd3" },
    want: "mdadm UUID at $.uuid",
    secret: "9d85a4f6",
  },
  {
    name: "a host on the report's Name line",
    value: { r: "              Name : oldnas:0" },
    want: "an array's host name at $.r",
    secret: "oldnas",
  },
  {
    name: "a host in (local to host …)",
    value: { r: "Name : nas:0  (local to host oldnas)" },
    want: "an array's host name at $.r",
    secret: "oldnas",
  },
  {
    name: "a host in the description",
    value: { description: "Software RAID oldnas:0 [/dev/md0, raid1, 1 GiB]" },
    want: "an array's host name at $.description",
    secret: "oldnas",
  },
  {
    name: "a host in an array's name field",
    value: { a: { name: "oldnas:0", devicefile: "/dev/md0" } },
    want: "an array's host name at $.a.name",
    secret: "oldnas",
  },
  {
    name: "a host in an md-name link",
    value: { l: "/dev/disk/by-id/md-name-oldnas:0" },
    want: "an array's host name at $.l",
    secret: "oldnas",
  },
  {
    name: "a date in the report",
    value: { r: "     Creation Time : Fri Nov 20 09:14:07 2026" },
    want: "an mdadm date at $.r",
    secret: "09:14:07",
  },
];
for (const { name, value, want, secret } of MD_LEFT_CASES) {
  test(`verify reports ${name} left in place, never the value`, () => {
    const { verify } = createScrubber(known);
    const text = verify(value).join("\n");
    assert.ok(text.includes(want), `missing "${want}" in:\n${text}`);
    assert.ok(!text.includes(secret), "a failure must not repeat the value");
  });
}

test("a documentation mdadm UUID in a by-id link is not taken for a disk identifier", () => {
  const { verify } = createScrubber(known);
  assert.deepEqual(
    verify({
      l: "/dev/disk/by-id/md-uuid-00000000:00000000:00000000:00000001",
    }),
    [],
  );
});

// ---- ZFS (openmediavault-zfs) -------------------------------------------------------------------

// A pool's report as Zfs.getObjectDetails returns it (lines joined by "\n\r"), with a disk that
// zpool status can only name by its GUID. Invented disks and numbers.
const ZFS_POOL_REPORT = [
  "Pool status (zpool status -v):",
  "",
  "  pool: tank",
  " state: DEGRADED",
  "  scan: resilver in progress since Fri Nov 20 09:14:07 2026",
  "\t1.20G / 3.00G scanned at 300M/s, 600M / 3.00G issued at 150M/s",
  "\t590M resilvered, 20.00% done, 00:00:16 to go",
  "config:",
  "",
  "\tNAME                             STATE     READ WRITE CKSUM",
  "\ttank                             DEGRADED     0     0     0",
  "\t  mirror-0                       DEGRADED     0     0     0",
  "\t    ata-ACME_Disk_ZX81TEST0001   ONLINE       0     0     0",
  "\t    5813342277894411042          UNAVAIL      0     0     0  was /dev/disk/by-id/ata-ACME_Disk_ZX81TEST0002-part1",
  "",
  "errors: No known data errors",
].join("\n\r");

test("a ZFS pool report loses its dates, GUIDs and disk serial numbers, and keeps the rest", () => {
  const { scrub, verify } = createScrubber({
    ...known,
    serials: ["ZX81TEST0001", "ZX81TEST0002"],
  });
  const out = scrub({ report: ZFS_POOL_REPORT });
  assert.deepEqual(verify(out), []);
  const lines = out.report.split("\n\r");
  assert.equal(lines[4], `  scan: resilver in progress since ${DOC.zfsDate}`);
  assert.equal(lines[6], "\t590M resilvered, 20.00% done, 00:00:16 to go");
  assert.equal(
    lines[12],
    "\t    ata-ACME_Disk_EXAMPLE-SERIAL-0001   ONLINE       0     0     0",
  );
  assert.equal(
    lines[13],
    "\t    1000000000000000001          UNAVAIL      0     0     0  was /dev/disk/by-id/ata-ACME_Disk_EXAMPLE-SERIAL-0002-part1",
  );
  assert.equal(lines.at(-1), "errors: No known data errors");
});

test("a ZFS file system report loses its creation date and GUID, the same GUID one placeholder", () => {
  const { scrub, verify } = createScrubber(known);
  const report = [
    "Filesystem status (zfs list):",
    "",
    "NAME        TYPE         USED  AVAIL  REFER  MOUNTPOINT",
    "tank/media  filesystem    96K  7.27G    96K  /tank/media",
    "",
    "Filesystem details (zfs get all):",
    "",
    "tank/media  creation                Fri Nov 20 09:14 2026                 -",
    "tank/media  createtxg               15                                    -",
    "tank/media  guid                    15777511494256409461                  -",
    "tank/media  objsetid                138                                   -",
    "tank/media  omvzfsplugin:uuid       3f2b1c4e-9a8d-4e7f-b6c5-1d2e3f4a5b6c  local",
  ].join("\n\r");
  const out = scrub({ a: report, b: report });
  assert.deepEqual(verify(out), []);
  assert.equal(out.a, out.b);
  const lines = out.a.split("\n\r");
  assert.equal(
    lines[7],
    "tank/media  creation                Sat Nov 21 12:00 2026                 -",
  );
  assert.equal(lines[8], report.split("\n\r")[8]);
  assert.equal(
    lines[9],
    "tank/media  guid                    1000000000000000001                  -",
  );
  assert.equal(lines[10], report.split("\n\r")[10]);
  assert.match(lines[11], /00000000-0000-4000-8000-000000000001/);
});

test("dates and long numbers outside a ZFS report are left alone", () => {
  const { scrub } = createScrubber(known);
  const raw = {
    log: "Fri Nov 20 09:14:07 2026 something happened",
    size: "15777511494256409461",
  };
  assert.deepEqual(scrub(raw), raw);
});

const LASTSCRUB_CASES = [
  ["Fri Nov 20 09:14:07 CET 2026", `Sat Nov 21 12:00:00 UTC 2026`],
  [
    "in progress since Fri Nov 20 09:14:07 2026",
    `in progress since ${DOC.zfsDate}`,
  ],
  ["canceled on Fri Nov 20 09:14:07 2026", `canceled on ${DOC.zfsDate}`],
  ["Never", "Never"],
  ["n/a", "n/a"],
];
for (const [raw, want] of LASTSCRUB_CASES) {
  test(`the plugin's last-check date is a documentation one: ${raw}`, () => {
    const { scrub, verify } = createScrubber(known);
    const out = scrub({ lastscrub: raw });
    assert.equal(out.lastscrub, want);
    assert.deepEqual(verify(out), []);
  });
}

test("a snapshot's name by date and time becomes documentation times, in order, and is no e-mail address", () => {
  const { scrub, verify } = createScrubber(known);
  const out = scrub({
    data: [
      { name: "2026-11-20_21-20-40", path: "tank/media@2026-11-20_21-20-40" },
      { name: "2026-11-20_21-20-41", path: "tank/media@2026-11-20_21-20-41" },
      { name: "2026-11-20_22-05-00", path: "tank@2026-11-20_22-05-00" },
    ],
    message:
      "cannot open 'tank/media@2026-11-20_21-20-41': dataset does not exist",
    mail: "owner@corp.test",
  });
  assert.deepEqual(verify(out), []);
  assert.deepEqual(out.data, [
    { name: "2026-11-21_12-00-00", path: "tank/media@2026-11-21_12-00-00" },
    { name: "2026-11-21_12-00-01", path: "tank/media@2026-11-21_12-00-01" },
    { name: "2026-11-21_12-00-02", path: "tank@2026-11-21_12-00-02" },
  ]);
  assert.equal(
    out.message,
    "cannot open 'tank/media@2026-11-21_12-00-01': dataset does not exist",
  );
  assert.equal(out.mail, "user1@example.com");
});

const ZFS_LEFT_CASES = [
  {
    name: "a date in a pool report",
    value: {
      r: "Pool status (zpool status -v):\n\r  scan: scrub repaired 0B in 00:00:01 with 0 errors on Fri Nov 20 09:14:07 2026",
    },
    want: "a ZFS date at $.r",
    secret: "09:14:07",
  },
  {
    name: "a GUID in a file system report",
    value: {
      r: "Filesystem status (zfs list):\n\rtank/media  guid  15777511494256409461  -",
    },
    want: "a ZFS GUID at $.r",
    secret: "15777511494256409461",
  },
  {
    name: "a disk's serial number in a ZFS device name",
    value: {
      r: "Pool status (zpool status -v):\n\r\t    ata-ACME_Disk_9912345678  ONLINE  0 0 0",
    },
    want: "a disk identifier in a ZFS device name at $.r",
    secret: "9912345678",
  },
  {
    name: "the last-check date",
    value: { rows: [{ lastscrub: "Fri Nov 20 09:14:07 CET 2026" }] },
    want: "a ZFS date at $.rows[0].lastscrub",
    secret: "09:14:07",
  },
  {
    name: "a snapshot's date and time",
    value: { name: "2026-11-20_21-20-40" },
    want: "a snapshot's date and time at $.name",
    secret: "21-20-40",
  },
];
for (const { name, value, want, secret } of ZFS_LEFT_CASES) {
  test(`verify reports ${name} left in place, never the value`, () => {
    const { verify } = createScrubber(known);
    const text = verify(value).join("\n");
    assert.ok(text.includes(want), `missing "${want}" in:\n${text}`);
    assert.ok(!text.includes(secret), "a failure must not repeat the value");
  });
}

test("ipv4Networks keeps each address's network and its place in it", () => {
  const { scrub, verify } = createScrubber({
    ipv4Networks: { ranges: ["192.0.2", "198.51.100"] },
  });
  const out = scrub({
    address: "172.16.5.130",
    gateway: "172.16.5.2",
    dns: "172.16.5.2",
    other: "10.20.30.40",
    sameOther: "10.20.30.1",
    network: "10.20.30.0/24",
    documentation: "203.0.113.10",
    mask: "255.255.255.0",
    loop: "127.0.0.1",
  });
  assert.deepEqual(out, {
    address: "192.0.2.130",
    gateway: "192.0.2.2",
    dns: "192.0.2.2",
    other: "198.51.100.40",
    sameOther: "198.51.100.1",
    network: "198.51.100.0/24",
    documentation: "203.0.113.10",
    mask: "255.255.255.0",
    loop: "127.0.0.1",
  });
  assert.deepEqual(verify(out), []);
});

test("ipv4Networks refuses a network more than it has documentation ranges for", () => {
  const { scrub } = createScrubber({ ipv4Networks: { ranges: ["192.0.2"] } });
  scrub({ a: "172.16.5.130", b: "172.16.5.2" });
  assert.throws(
    () => scrub({ c: "10.20.30.40" }),
    /more IPv4 networks than the 1 documentation networks/,
  );
});

test("without ipv4Networks every address is numbered in 192.0.2.0/24", () => {
  const { scrub } = createScrubber();
  assert.deepEqual(scrub({ a: "172.16.5.130", b: "10.20.30.40" }), {
    a: "192.0.2.1",
    b: "192.0.2.2",
  });
});

test("counts() says which rules replaced something, so a missed rule is seen", () => {
  const { scrub, counts } = createScrubber({
    names: { box17: "nas" },
    literals: ["hunter2-not-real"],
  });
  assert.deepEqual(counts(), {});
  scrub(
    {
      hostname: "box17",
      domainname: "lan.internal",
      note: "box17 at 172.16.5.4 and fd12:3456:789a::1, key hunter2-not-real",
      ether: "52:54:00:12:34:56",
      ref: "3f2b1c4e-9a8d-4e7f-b6c5-1d2e3f4a5b6c",
      httppassword: "correct horse",
      wpapsk: "",
      kept: "192.0.2.1 00:00:5e:00:53:01 fe80::1",
    },
    { httppassword: "EXAMPLE-PASSWORD" },
  );
  assert.deepEqual(counts(), {
    host: 1,
    domain: 1,
    literal: 1,
    ipv4: 1,
    ipv6: 1,
    name: 1,
    mac: 1,
    uuid: 1,
    "key:httppassword": 1,
  });
  // A value that is already a documentation value, or empty, counts for nothing.
  scrub({ wpapsk: "", kept: "192.0.2.1 00:00:5e:00:53:01" });
  assert.equal(counts().mac, 1);
  assert.equal(counts().ipv4, 1);
  assert.equal(counts()["key:wpapsk"], undefined);
});
