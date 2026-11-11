import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { getSessionVerifiedUser } from "../_shared/auth-session.ts";
import {
  productionAppOrigins,
  legacyDemoOrigin,
} from "../_shared/app-origins.ts";
import { createPersonalMailHandler } from "./handler.ts";
import { mailOperation, checkProviderTransport } from "./transport.ts";
import { ConnectionError } from "./contract.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  createPersonalMailHandler(
    {
      async authorize(token, organization) {
        const user = await getSessionVerifiedUser(client, token);
        if (!user) return false;
        const { data, error } = await client.rpc("tc_company_server_access", {
          p_org: organization,
          p_user: user.id,
        });
        return !error && data?.active === true;
      },
      async operate(config, action, data) {
        try {
          return await mailOperation(config, action, data);
        } catch (error) {
          if (error instanceof ConnectionError) throw error;
          // Never return provider text; it can include account details or credentials.
          if (
            error &&
            typeof error === "object" &&
            ("authenticationFailed" in error ||
              ("code" in error && error.code === "EAUTH"))
          )
            throw new ConnectionError("denied");
          throw new ConnectionError("unavailable");
        }
      },
      probe: checkProviderTransport,
    },
    [...productionAppOrigins, legacyDemoOrigin],
  ),
);
