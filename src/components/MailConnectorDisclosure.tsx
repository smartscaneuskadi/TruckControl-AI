import { mailConnectorPrivacy } from "../domain/mail-privacy";
import { t } from "../i18n/runtime";

export function MailConnectorDisclosure({ full = false }: { full?: boolean }) {
  return (
    <section
      id={full ? "personal-mail-connectors" : "mail-connector-disclosure"}
      aria-label={t(mailConnectorPrivacy.title)}
      style={{ marginTop: 24 }}
    >
      {full ? (
        <h2>{t(mailConnectorPrivacy.title)}</h2>
      ) : (
        <h3>{t(mailConnectorPrivacy.title)}</h3>
      )}
      <p>
        Información de privacidad de IMAP/SMTP · {mailConnectorPrivacy.version}
      </p>
      <p>{t(mailConnectorPrivacy.summary)}</p>
      <p>{t(mailConnectorPrivacy.retention)}</p>
      {full ? (
        <>
          <p>{t(mailConnectorPrivacy.withdrawal)}</p>
          <p>{t(mailConnectorPrivacy.distinction)}</p>
        </>
      ) : (
        <a
          href="/?legal=privacy#personal-mail-connectors"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacidad de IMAP/SMTP y retirada de la autorización
        </a>
      )}
    </section>
  );
}
