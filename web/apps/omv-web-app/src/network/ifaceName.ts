// SPDX-License-Identifier: GPL-3.0-or-later
// The one path parameter of an interface's page (phase 5 network design 4, 14.2, D3): a kernel
// network interface name, as the contract's NetworkDeviceName takes it: 1 to 15 printable ASCII
// characters, without "/", ":" or a space, and not "." or "..". Anything else never reaches a call
// (UI-4): the route turns it into null, which the page shows as not found. Pure.

const IFACE_NAME = /^(?!\.{1,2}$)[!-.0-9;-~]{1,15}$/u;

/** Whether a value from the address is a kernel interface name (the contract's NetworkDeviceName). */
export const isInterfaceName = (value: string): boolean =>
  IFACE_NAME.test(value);
