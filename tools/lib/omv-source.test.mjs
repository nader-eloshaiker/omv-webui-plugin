// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import { servicesOf } from "./omv-source.mjs";

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
