export const customAuthMail =
  import.meta.env.VITE_AUTH_MAIL_PROVIDER === "resend";
export interface EmailAction {
  type: "invite" | "recovery";
  token_hash: string;
}
export function readEmailAction(hash: string): EmailAction | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const type = params.get("tc-auth"),
    token_hash = params.get("token_hash");
  if (
    (type !== "invite" && type !== "recovery") ||
    !token_hash ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(token_hash) ||
    [...params.keys()].length !== 2 ||
    params.getAll("tc-auth").length !== 1 ||
    params.getAll("token_hash").length !== 1
  )
    return null;
  return { type, token_hash };
}
