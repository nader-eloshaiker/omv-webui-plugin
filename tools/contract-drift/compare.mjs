// SPDX-License-Identifier: GPL-3.0-or-later
// Is a contract request schema looser than, or diverged from, the OMV datamodel it came from?
// (docs/04, "Keeping it true"). The contract may accept exactly what OMV accepts, or less; never
// more. Pure functions over the bundled contract and parsed datamodels.
import { translate } from "../contract-bootstrap/translate.mjs";

const REF = "#/components/schemas/";

function deref(schema, contract) {
  let s = schema;
  for (let i = 0; s?.$ref && i < 32; i++) {
    s = contract.components.schemas[s.$ref.slice(REF.length)];
  }
  return s;
}

const typesOf = (s) => {
  if (s.oneOf || s.anyOf) {
    return (s.oneOf ?? s.anyOf).flatMap(typesOf);
  }
  return s.type ? [s.type] : [];
};

/**
 * Compare a contract schema (`ours`) with OMV's translated schema (`theirs`).
 * Returns problems: {severity: "looser" | "diverged", at, message}.
 */
export function compareSchemas(ours, theirs, contract, at = "$") {
  const problems = [];
  const looser = (message) =>
    problems.push({ severity: "looser", at, message });
  const diverged = (message) =>
    problems.push({ severity: "diverged", at, message });
  const a = deref(ours, contract);
  const b = theirs;
  if (!a) {
    return [{ severity: "diverged", at, message: "unresolvable reference" }];
  }
  if (b.description?.startsWith("TODO")) {
    // OMV declares "any": nothing to compare against.
    return problems;
  }
  if (b.oneOf) {
    // OMV accepts any of its alternatives: each of ours must be no looser than one of them.
    if (a.nullable && !b.nullable) {
      looser("accepts null, which OMV does not");
    }
    const ours = a.oneOf ?? a.anyOf ?? [a];
    ours.forEach((alt, i) => {
      const { nullable: _nullable, ...plain } = deref(alt, contract) ?? {};
      const fits = b.oneOf.some((theirs) =>
        compareSchemas(plain, theirs, contract, at).every(
          (p) => p.severity !== "looser",
        ),
      );
      if (!fits) {
        looser(
          `${ours.length > 1 ? `alternative ${i + 1} ` : ""}accepts values that none of OMV's alternatives accepts`,
        );
      }
    });
    return problems;
  }
  if (a.oneOf || a.anyOf) {
    // OMV accepts one shape and the contract several narrower ones (a request whose other fields
    // depend on its type): each of ours must be no looser than OMV's.
    if (a.nullable && !b.nullable) {
      looser("accepts null, which OMV does not");
    }
    for (const alt of a.oneOf ?? a.anyOf) {
      problems.push(...compareSchemas(alt, b, contract, at));
    }
    return problems;
  }

  const ourTypes = new Set(
    typesOf(a).map((t) => (t === "integer" ? "integer" : t)),
  );
  const theirTypes = new Set(typesOf(b));
  for (const t of ourTypes) {
    const ok =
      theirTypes.has(t) || (t === "integer" && theirTypes.has("number"));
    if (!ok) {
      looser(`accepts type ${t}, which OMV does not`);
    }
  }
  if (a.nullable && !b.nullable) {
    looser("accepts null, which OMV does not");
  }

  if (b.enum) {
    if (!a.enum) {
      looser(`accepts any value; OMV accepts only ${JSON.stringify(b.enum)}`);
    } else {
      for (const v of a.enum) {
        if (!b.enum.includes(v)) {
          looser(`accepts ${JSON.stringify(v)}, which OMV does not`);
        }
      }
    }
  }
  if (
    b.minimum !== undefined &&
    (a.minimum === undefined || a.minimum < b.minimum)
  ) {
    looser(`minimum ${a.minimum ?? "none"}; OMV's is ${b.minimum}`);
  }
  if (
    b.maximum !== undefined &&
    (a.maximum === undefined || a.maximum > b.maximum)
  ) {
    looser(`maximum ${a.maximum ?? "none"}; OMV's is ${b.maximum}`);
  }
  if (
    b.maxLength !== undefined &&
    (a.maxLength === undefined || a.maxLength > b.maxLength)
  ) {
    looser(`maxLength ${a.maxLength ?? "none"}; OMV's is ${b.maxLength}`);
  }
  if (b["x-omv-format"] && a["x-omv-format"] !== b["x-omv-format"]) {
    looser(
      `OMV checks format "${b["x-omv-format"]}"; the contract does not say so`,
    );
  }
  if (b.pattern && a.pattern !== b.pattern && !a.enum) {
    // A different pattern may be stricter; a person decides.
    (a.pattern ? diverged : looser)(
      a.pattern
        ? "its pattern differs from OMV's"
        : `has no pattern; OMV's is ${b.pattern}`,
    );
  }

  if (theirTypes.has("object") && b.properties) {
    const ourProps = a.properties ?? {};
    const ourRequired = new Set(a.required ?? []);
    for (const name of b.required ?? []) {
      if (!ourRequired.has(name)) {
        looser(`does not require ${name}; OMV does`);
      }
    }
    for (const [name, prop] of Object.entries(ourProps)) {
      if (!b.properties[name]) {
        diverged(`has a field ${name} that OMV's datamodel does not declare`);
        continue;
      }
      problems.push(
        ...compareSchemas(prop, b.properties[name], contract, `${at}.${name}`),
      );
    }
  }
  if (theirTypes.has("array") && a.items && b.items) {
    problems.push(...compareSchemas(a.items, b.items, contract, `${at}[]`));
  }
  return problems;
}

/**
 * Check every operation of a bundled contract against an OMV tree.
 * @param {object} contract the bundled contract
 * @param {Map<string, object>} datamodels by id
 * @param {Map<string, Set<string>>} services service name -> registered methods
 */
export function checkContract(contract, datamodels, services) {
  const findings = [];
  // OMV finds a service by its name in lower case (RpcServiceMgr::getService), so the contract's
  // "Zfs" is the plugin's "zfs". Method names are matched as spelt.
  const byLowerName = new Map(
    [...services].map(([name, methods]) => [name.toLowerCase(), methods]),
  );
  for (const [url, item] of Object.entries(contract.paths)) {
    const op = item.post;
    const { service, method } = op["x-omv-rpc"];
    const where = `${op.operationId} (${service}.${method})`;
    if (!byLowerName.get(service.toLowerCase())?.has(method)) {
      findings.push({
        severity: "missing",
        where,
        message: `${service}.${method} is not registered in this OMV tree`,
      });
      continue;
    }
    const body = op.requestBody?.content?.["application/json"]?.schema;
    const source = op["x-omv-source"];
    if (body && !source) {
      findings.push({
        severity: "unchecked",
        where,
        message: `${url} has a request body but no x-omv-source`,
      });
      continue;
    }
    if (!source) {
      continue;
    }
    const model = datamodels.get(source.datamodel);
    if (!model) {
      findings.push({
        severity: "missing",
        where,
        message: `datamodel ${source.datamodel} is not in this OMV tree`,
      });
      continue;
    }
    if (!body) {
      findings.push({
        severity: "diverged",
        where,
        message: `names ${source.datamodel} but has no request body`,
      });
      continue;
    }
    const { schema: theirs } = translate(model.params ?? {});
    for (const p of compareSchemas(body, theirs, contract)) {
      findings.push({
        severity: p.severity,
        where,
        message: `${p.at}: ${p.message}`,
      });
    }
  }
  return findings;
}
