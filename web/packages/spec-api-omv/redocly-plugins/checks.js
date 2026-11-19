// SPDX-License-Identifier: GPL-3.0-or-later
// The x-omv-* checks of docs/04 ("Extensions"), as pure functions over plain objects so they are
// tested without Redocly. Each returns a list of findings: {message, at: [path segments]}.

export const ROLES = ["user", "admin", "public"];
export const PUBLIC_OPERATIONS = ["Session.login", "Session.verify"];
export const DESTRUCTIVE = ["data", "access", "service"];
export const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

// OMV format names (openmediavault's PHP/json/schema.inc and PHP/datamodel/schema.inc).
export const OMV_FORMATS = [
  "username",
  "no-multi-line",
  "uuidv4",
  "devicefile",
  "fsuuid",
  "dirpath",
  "sshpubkey-openssh",
  "sshpubkey-rfc4716",
  "sharename",
  "domainname",
  "netbiosname",
  "hostname",
  "email",
  "ipv4",
  "ipv6",
  "time",
  "date",
];

const OPERATION_KEYS = new Set([
  "x-omv-rpc",
  "x-omv-role",
  "x-omv-readonly",
  "x-omv-dirty",
  "x-omv-task",
  "x-omv-download",
  "x-omv-destructive",
  "x-omv-source",
]);

const PATH = /^\/rpc\/([A-Z][A-Za-z0-9]*)\/([a-z][A-Za-z0-9]*)$/;

/** `<service><Method>` in lower camel case: ShareMgmt.getList -> shareMgmtGetList, SSH.get -> sshGet. */
export function operationIdOf(service, method) {
  const head = /^[A-Z]+$/.test(service)
    ? service.toLowerCase()
    : service[0].toLowerCase() + service.slice(1);
  return head + method[0].toUpperCase() + method.slice(1);
}

const isBool = (v) => typeof v === "boolean";

/**
 * Check one path item of the contract.
 * @param {string} path the path key, e.g. "/rpc/SSH/get"
 * @param {object} item the resolved path item
 * @param {(name: string) => boolean} hasSchema whether components.schemas has this name
 */
export function checkPathItem(path, item, hasSchema = () => true) {
  const findings = [];
  const report = (message, ...at) => findings.push({ message, at });
  const match = PATH.exec(path);
  if (!match) {
    report(
      `Path "${path}" must be /rpc/{Service}/{method}, spelled as OMV spells them.`,
    );
    return findings;
  }
  const [, service, method] = match;

  for (const verb of HTTP_METHODS) {
    if (verb !== "post" && item[verb]) {
      report(`Every operation is a POST; found ${verb.toUpperCase()}.`, verb);
    }
  }
  const op = item.post;
  if (!op) {
    report("The path has no POST operation.");
    return findings;
  }

  for (const key of Object.keys(op)) {
    if (key.startsWith("x-omv-") && !OPERATION_KEYS.has(key)) {
      report(`Unknown operation extension ${key}.`, "post", key);
    }
  }

  const rpc = op["x-omv-rpc"];
  if (!rpc || typeof rpc !== "object") {
    report("x-omv-rpc {service, method} is required.", "post");
  } else if (rpc.service !== service || rpc.method !== method) {
    report(
      `x-omv-rpc (${rpc.service}.${rpc.method}) must agree with the path (${service}.${method}).`,
      "post",
      "x-omv-rpc",
    );
  }

  const wantId = operationIdOf(service, method);
  if (op.operationId !== wantId) {
    report(`operationId must be "${wantId}".`, "post", "operationId");
  }
  if (
    !Array.isArray(op.tags) ||
    op.tags.length !== 1 ||
    op.tags[0] !== service
  ) {
    report(`tags must be exactly ["${service}"].`, "post", "tags");
  }

  const role = op["x-omv-role"];
  if (!ROLES.includes(role)) {
    report(`x-omv-role is required: one of ${ROLES.join(", ")}.`, "post");
  } else if (
    role === "public" &&
    !PUBLIC_OPERATIONS.includes(`${service}.${method}`)
  ) {
    report(
      `x-omv-role "public" is allowed only on ${PUBLIC_OPERATIONS.join(" and ")}.`,
      "post",
      "x-omv-role",
    );
  }

  for (const flag of ["x-omv-readonly", "x-omv-dirty"]) {
    if (flag in op && !isBool(op[flag])) {
      report(`${flag} must be a boolean.`, "post", flag);
    }
  }
  if (!isBool(op["x-omv-readonly"])) {
    report(
      "x-omv-readonly is required: true for a read (query hook), false otherwise.",
      "post",
    );
  }
  const readonly = op["x-omv-readonly"] === true;
  if (readonly) {
    for (const flag of ["x-omv-dirty", "x-omv-task", "x-omv-destructive"]) {
      if (op[flag] !== undefined && op[flag] !== false) {
        report(`A read-only operation cannot carry ${flag}.`, "post", flag);
      }
    }
  }

  if ("x-omv-task" in op) {
    const task = op["x-omv-task"];
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      report(
        "x-omv-task must be an object: {} or {result: <schema name>}.",
        "post",
        "x-omv-task",
      );
    } else {
      for (const key of Object.keys(task)) {
        if (key !== "result") {
          report(`x-omv-task has no field "${key}".`, "post", "x-omv-task");
        }
      }
      if (
        "result" in task &&
        (typeof task.result !== "string" || !hasSchema(task.result))
      ) {
        report(
          "x-omv-task.result must name a schema in components.schemas.",
          "post",
          "x-omv-task",
        );
      }
    }
  }

  if ("x-omv-download" in op) {
    const dl = op["x-omv-download"];
    if (!dl || typeof dl.contentType !== "string") {
      report("x-omv-download must be {contentType}.", "post", "x-omv-download");
    }
  }

  if (
    "x-omv-destructive" in op &&
    !DESTRUCTIVE.includes(op["x-omv-destructive"])
  ) {
    report(
      `x-omv-destructive must be one of ${DESTRUCTIVE.join(", ")}.`,
      "post",
      "x-omv-destructive",
    );
  }

  if ("x-omv-source" in op) {
    const src = op["x-omv-source"];
    if (
      !src ||
      typeof src.datamodel !== "string" ||
      typeof src.omvVersion !== "string"
    ) {
      report(
        "x-omv-source must be {datamodel, omvVersion}.",
        "post",
        "x-omv-source",
      );
    }
  }

  if (!op.responses || !op.responses["200"]) {
    report(
      "A 200 response is required: the method's response value.",
      "post",
      "responses",
    );
  }

  return findings;
}

/**
 * Every 200 response with a JSON body has at least one example; the first is the one the mock
 * serves by default.
 * @param {object} op the resolved operation
 * @param {(node: object) => object} resolve resolves a $ref'd node, returns others unchanged
 */
export function checkExampleCoverage(op, resolve = (n) => n) {
  const findings = [];
  const response = op.responses?.["200"] && resolve(op.responses["200"]);
  if (!response) {
    return findings;
  }
  // No body: the method returns null (Session.logout, Exec.stop). The mock answers null.
  if (!response.content) {
    return findings;
  }
  const content = response.content;
  const types = Object.keys(content);
  if (types.length !== 1 || types[0] !== "application/json") {
    findings.push({
      message:
        "The 200 response must have exactly one body, application/json (the method's response value).",
      at: ["responses", "200"],
    });
    return findings;
  }
  const examples = content["application/json"].examples;
  if (!examples || Object.keys(examples).length === 0) {
    findings.push({
      message:
        "The 200 response needs at least one example: a scrubbed capture. The first is the mock's default.",
      at: ["responses", "200", "content", "application/json"],
    });
  }
  return findings;
}

/** The x-omv-* extensions on one schema. */
export function checkSchema(schema) {
  const findings = [];
  const report = (message, ...at) => findings.push({ message, at });
  if (!schema || typeof schema !== "object") {
    return findings;
  }
  for (const flag of ["x-omv-secret", "x-omv-int64", "x-omv-coerce"]) {
    if (flag in schema && !isBool(schema[flag])) {
      report(`${flag} must be a boolean.`, flag);
    }
  }
  if (schema["x-omv-int64"] === true && schema.type !== "string") {
    report(
      "x-omv-int64 marks a 64-bit integer carried as a decimal string: the type must be string.",
      "x-omv-int64",
    );
  }
  if ("x-omv-format" in schema) {
    if (!OMV_FORMATS.includes(schema["x-omv-format"])) {
      report(
        `x-omv-format "${schema["x-omv-format"]}" is not a known OMV format.`,
        "x-omv-format",
      );
    }
    if (schema.type !== "string") {
      report("x-omv-format applies to strings only.", "x-omv-format");
    }
  }
  for (const key of Object.keys(schema)) {
    if (
      key.startsWith("x-omv-") &&
      ![
        "x-omv-secret",
        "x-omv-int64",
        "x-omv-coerce",
        "x-omv-format",
        "x-omv-lint-restated",
      ].includes(key)
    ) {
      report(`Unknown schema extension ${key}.`, key);
    }
  }
  return findings;
}

/**
 * Lint only: restate an object schema so it also accepts `[]`. PHP encodes an empty map as `[]`,
 * the transport turns it back into `{}` wherever the schema says object (docs/03), and the examples
 * are raw captures, so lint validates them as the transport will see them. The bundle skips this.
 * Mutates the schema in place; returns true if it changed.
 */
export function acceptEmptyArrayForObject(schema) {
  if (
    !schema ||
    typeof schema !== "object" ||
    schema.type !== "object" ||
    schema["x-omv-lint-restated"]
  ) {
    return false;
  }
  const original = { ...schema };
  for (const key of Object.keys(schema)) {
    delete schema[key];
  }
  schema.anyOf = [original, { type: "array", maxItems: 0 }];
  schema["x-omv-lint-restated"] = true;
  return true;
}
