import {
  connectedMailboxCapability,
  ConnectedMailError,
} from "./connected-contract.ts";
import type { ConnectedMailboxScanner } from "./connected-contract.ts";
import { scanConnectedGmail } from "./connected-gmail.ts";
import { importConnectedImap } from "./connected-imap.ts";

export function createConnectedMailboxScanner(
  cursorKey: string,
  fetcher: typeof fetch = fetch,
): ConnectedMailboxScanner {
  return async (input, context) => {
    if (!connectedMailboxCapability(cursorKey))
      throw new ConnectedMailError("connected_mailbox_unavailable", 503);
    return input.provider === "gmail"
      ? scanConnectedGmail(input, context, cursorKey, fetcher)
      : importConnectedImap(input, context, cursorKey);
  };
}
