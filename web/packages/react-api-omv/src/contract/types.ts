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
   * Top-level reply fields the transport deletes before anything else sees the reply (x-omv-omit):
   * a secret the server sends that the interface must never hold, such as the SMTP password.
   */
  omit?: readonly string[];
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
