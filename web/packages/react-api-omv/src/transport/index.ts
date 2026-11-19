// SPDX-License-Identifier: GPL-3.0-or-later
// What the rest of the workspace may know about the transport: the error type and the two events.
// rpcClient itself is reached only through the generated client.
export {
  onPendingChanges,
  onSessionEnded,
  type RpcRequestOptions,
} from "./rpcClient.ts";
export { RpcError, isRpcError, type RpcErrorKind } from "./RpcError.ts";
