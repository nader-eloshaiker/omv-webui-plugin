// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readDatamodels, readServices, servicesOf } from "./omv-source.mjs";

const plain = (services) =>
  Object.fromEntries([...services].map(([k, v]) => [k, [...v].sort()]));

test("reads each service class of a file on its own", () => {
  const text = `<?php
class Notification extends \\OMV\\Rpc\\ServiceAbstract
{
    public function getName()
    {
        return "Notification";
    }
    public function initialize()
    {
        $this->registerMethod("getList");
        $this->registerMethod("get");
    }
}

class OMVRpcServiceEmailNotification extends \\OMV\\Rpc\\ServiceAbstract
{
    public function getName(): string { return 'EmailNotification'; }
    public function initialize()
    {
        $this->registerMethod("get");
        $this->registerMethod( 'sendTestEmail' );
    }
}

// Registers the services.
$rpcServiceMngr->registerService(new Notification());
`;
  assert.deepEqual(plain(servicesOf(text)), {
    Notification: ["get", "getList"],
    EmailNotification: ["get", "sendTestEmail"],
  });
});

test("a file without a service class has none", () => {
  assert.deepEqual(plain(servicesOf("<?php\nfunction helper() {}\n")), {});
});

test("a source tree's plugins count, as they do once installed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omv-source-"));
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  const share = (pkg) => `deb/${pkg}/usr/share/openmediavault`;
  const service = (name, method) =>
    `<?php\nclass X {\n public function getName() { return "${name}"; }\n public function initialize() { $this->registerMethod("${method}"); }\n}\n`;
  try {
    put(
      `${share("openmediavault")}/datamodels/rpc.core.json`,
      '{"type":"rpc","id":"rpc.core.get"}',
    );
    put(
      `${share("openmediavault")}/engined/rpc/core.inc`,
      service("Core", "get"),
    );
    put(
      `${share("openmediavault-md")}/datamodels/rpc.mdmgmt.json`,
      '[{"type":"rpc","id":"rpc.mdmgmt.create"}]',
    );
    put(
      `${share("openmediavault-md")}/engined/rpc/mdmgmt.inc`,
      service("MdMgmt", "enumerateDevices"),
    );
    put(
      "deb/other-package/usr/share/openmediavault/engined/rpc/x.inc",
      service("Other", "get"),
    );
    assert.deepEqual(plain(readServices(root)), {
      Core: ["get"],
      MdMgmt: ["enumerateDevices"],
    });
    assert.deepEqual([...readDatamodels(root).keys()].sort(), [
      "rpc.core.get",
      "rpc.mdmgmt.create",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
