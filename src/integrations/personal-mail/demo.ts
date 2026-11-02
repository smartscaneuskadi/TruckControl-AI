import type { Mailbox, MailMessage } from "./gmail";
import { validateMailDraft } from "./gmail";
export function createDemoMailbox(): Mailbox {
  let messages: MailMessage[] = [
    {
      id: "demo001",
      threadId: "demo001",
      from: "Taller ficticio <taller@example.invalid>",
      to: "demo@example.invalid",
      subject: "Revisión de mantenimiento · ejemplo ficticio",
      date: "Mon, 02 Nov 2026 09:15:00 +0100",
      snippet: "Tu revisión está programada. Este mensaje es de demostración.",
      labels: ["INBOX", "UNREAD"],
      text: "Hola:\n\nLa revisión del camión de demostración está programada. Comprueba la ficha de Mantenimiento.\n\nMensaje ficticio: no se ha leído ningún buzón ni registrado un gasto.",
      htmlConverted: false,
      messageId: "<demo001@example.invalid>",
      attachments: [],
    },
    {
      id: "demo002",
      threadId: "demo002",
      from: "Cliente ficticio <cliente@example.invalid>",
      to: "demo@example.invalid",
      subject: "Confirmación de ruta · demostración",
      date: "Mon, 02 Nov 2026 08:00:00 +0100",
      snippet: "Confirmamos la ruta de ejemplo.",
      labels: ["INBOX", "STARRED"],
      text: "Confirmamos la ruta de ejemplo.\n\nNo contiene posiciones GPS ni datos de clientes reales.",
      htmlConverted: false,
      messageId: "<demo002@example.invalid>",
      attachments: [],
    },
  ];
  return {
    async profile() {
      return "demo@example.invalid";
    },
    async list(folder, query) {
      const label = {
        inbox: "INBOX",
        sent: "SENT",
        drafts: "DRAFT",
        starred: "STARRED",
        all: "",
        trash: "TRASH",
      }[folder];
      return {
        messages: messages.filter(
          (m) =>
            (folder === "trash"
              ? m.labels.includes("TRASH")
              : !m.labels.includes("TRASH")) &&
            (!label || m.labels.includes(label)) &&
            [m.subject, m.from, m.to, m.text]
              .join(" ")
              .toLocaleLowerCase("es")
              .includes(query.toLocaleLowerCase("es")),
        ),
        next: null,
      };
    },
    async read(id) {
      const message = messages.find((m) => m.id === id);
      if (!message) throw new Error("missing_demo");
      return structuredClone(message);
    },
    async change(id, action) {
      const message = messages.find((m) => m.id === id);
      if (!message) return;
      const add = (label: string) => {
          message.labels = [...new Set([...message.labels, label])];
        },
        remove = (label: string) => {
          message.labels = message.labels.filter((x) => x !== label);
        };
      if (action === "read") remove("UNREAD");
      if (action === "unread") add("UNREAD");
      if (action === "star") add("STARRED");
      if (action === "unstar") remove("STARRED");
      if (action === "archive") remove("INBOX");
      if (action === "trash") add("TRASH");
      if (action === "restore") {
        remove("TRASH");
        add("INBOX");
      }
    },
    async attachment() {
      throw new Error("no_demo_attachment");
    },
    async send(from, draft, requestId) {
      validateMailDraft(draft);
      messages = [
        {
          id: requestId,
          threadId: draft.threadId ?? requestId,
          from,
          to: draft.to,
          subject: draft.subject,
          date: new Date().toUTCString(),
          snippet: draft.text.slice(0, 160),
          labels: ["SENT"],
          text: draft.text,
          htmlConverted: false,
          messageId: `<${requestId}@example.invalid>`,
          attachments: [],
        },
        ...messages,
      ];
    },
  };
}
