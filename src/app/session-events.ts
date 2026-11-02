/** Close private provider capabilities synchronously, before an async identity change. */
export const sessionExitEvent = "truckcontrol:session-exit";
export function endPrivateSessions() {
  window.dispatchEvent(new Event(sessionExitEvent));
}
