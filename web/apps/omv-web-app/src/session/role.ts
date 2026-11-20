// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  Role,
  SystemInformation,
} from "@omv-webui/react-api-omv/generated";

/**
 * The role of the session that read `info`. OMV answers System.getInformation in full only to an
 * administrator; anyone else gets the time and the host name alone (A8, and the schema's own
 * description). `version` is always in the administrator's answer. The role only decides what the
 * interface shows; the backend decides what is allowed.
 */
export function roleOf(info: SystemInformation): Role {
  return typeof info.version === "string" ? "admin" : "user";
}
