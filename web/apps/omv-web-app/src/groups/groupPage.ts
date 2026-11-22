// SPDX-License-Identifier: GPL-3.0-or-later
// A group's page address (phase 5 users design 9, 14.2): a group whose name is "add" has no page here,
// because the static `/usermgmt/groups/add` route ("Add a group") wins over `$group`; its name is
// shown as text without a link. The same rule as a person's (nameRules.hasOwnPage). Pure.
import { hasOwnPage } from "../users/nameRules.ts";

/** Whether a group of this name can be opened at `/usermgmt/groups/$group`. */
export const groupHasPage = (name: string): boolean => hasOwnPage(name);
