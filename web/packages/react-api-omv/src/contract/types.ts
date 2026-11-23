// SPDX-License-Identifier: GPL-3.0-or-later
// The shapes of the generated contract tables (src/contract/generated, src/examples/generated).
// These describe the contract's own metadata, not any request or response: those types come from
// @omv-webui/ts-api-omv.

/** The subset of an OpenAPI 3.0 schema the transport reads. `$ref` names a SCHEMAS entry. */
export interface Schema {
  $ref?: string;
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  nullable?: boolean;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Readonly<Record<string, Schema>>;
  additionalProperties?: Schema | boolean;
  items?: Schema;
  oneOf?: readonly Schema[];
  anyOf?: readonly Schema[];
  allOf?: readonly Schema[];
  discriminator?: {
    propertyName: string;
    mapping?: Readonly<Record<string, string>>;
  };
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  "x-omv-int64"?: boolean;
  "x-omv-coerce"?: boolean;
}

export type SchemaTable = Readonly<Record<string, Schema>>;

export type Role = "public" | "user" | "admin";

export interface OperationEntry {
  operationId: string;
  service: string;
  method: string;
  role: Role;
  readonly: boolean;
  dirty: boolean;
  task?: { result?: string };
  download?: { contentType: string };
  destructive?: "data" | "access" | "service";
  /**
   * Reply fields the transport deletes before anything else sees the reply (x-omv-omit): a secret
   * the server sends that the interface must never hold, such as the SMTP password. A path is a
   * top-level field (`password`) or a field of each row of a list (`data[].wpapsk`), at any depth
   * (`data[].users[].password`, `users.user[].password`).
   */
  omit?: readonly string[];
  /**
   * Reply fields the transport replaces, before anything else sees the reply, by whether they are
   * set (x-omv-presence): `true` for a non-empty string, `false` otherwise. For a stored password
   * the page shows as "Set" but must never hold. Paths as for `omit`; the two lists are disjoint.
   */
  presence?: readonly string[];
  /** The 200 response's schema; null when the method returns null. */
  response: Schema | null;
}

export type OperationTable = Readonly<Record<string, OperationEntry>>;

export interface ContractExample {
  status: number;
  value: unknown;
}

export type ContractExampleTable = Readonly<
  Record<string, Readonly<Record<string, ContractExample>>>
>;
