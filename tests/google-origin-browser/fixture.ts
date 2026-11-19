import { test as base, expect } from "../billing-attachments-browser/fixture";
import { nativeFixture } from "../mfa-browser/fixture";
import { mailboxFixture } from "../unified-mail-browser/fixture";
import type { MailFixture } from "../unified-mail-browser/fixture";
const backendOrigin = "https://kkkemaycedexymrpaqtp.supabase.co";

/** Same private HTTP doubles, bound to the URL required by the production guard. */
export const test = base.extend<{ mail: MailFixture }>({
  nativeAuth: [
    async ({ context }, use) => {
      const auth = await nativeFixture(context, {
        company: true,
        backendOrigin,
      });
      await use(auth);
      expect(
        auth.blocked,
        "Every unhandled external request must stay denied",
      ).toEqual([]);
    },
    { auto: true },
  ],
  mail: async ({ context, nativeAuth }, use) => {
    const mail = await mailboxFixture(context, nativeAuth, backendOrigin);
    await use(mail);
    mail.releaseImports();
    mail.releaseProfiles();
    mail.releaseStatuses();
  },
});
export { expect };
export {
  connectGmail,
  firstMail,
  noMailStorage,
} from "../unified-mail-browser/fixture";
