import {
  googleMailEntryUrl,
  googleMailOriginMessage,
} from "../integrations/personal-mail/google-auth";

/** No tokens, email addresses or company context cross the origin boundary. */
export function GoogleMailOriginNotice() {
  return (
    <div role="status">
      <p>{googleMailOriginMessage}</p>
      <a
        className="button primary"
        href={googleMailEntryUrl}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        Abrir Correo en truckcontrolai.com
      </a>
    </div>
  );
}
