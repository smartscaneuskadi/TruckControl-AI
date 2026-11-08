import { vi } from "vitest";

/**
 * Scoped by vite.config.ts to database.test.ts and company-security.test.ts.
 * Those original 64-test sources are hash-retained. This models their assumed
 * verified GoTrue logins; it does not replace any production permission code.
 */
vi.mock("@electric-sql/pglite", async (importOriginal) => {
  const original = await importOriginal<typeof import("@electric-sql/pglite")>();
  const { installAuthSessionFixture, bindFixtureActor } = await import(
    "./auth-session-fixture"
  );
  class RetainedAuthPGlite extends original.PGlite {
    constructor(...args: ConstructorParameters<typeof original.PGlite>) {
      super(...args);
      const exec = this.exec.bind(this);
      const query = this.query.bind(this);
      this.exec = async (...execArgs: Parameters<typeof exec>) => {
        const result = await exec(...execArgs);
        // Match only the minimal Auth fixture declaration, never a migration
        // definition, permission function or arbitrary SQL body.
        if (
          /create\s+table\s+auth\.users\s*\(\s*id\s+uuid\s+primary\s+key\s*\)\s*;/i.test(
            execArgs[0],
          )
        ) {
          await installAuthSessionFixture(this, {
            confirmedByDefault: true,
          });
        }
        return result;
      };
      this.query = (async (...queryArgs: Parameters<typeof query>) => {
        const [sql, params, options] = queryArgs;
        const bind = /^\s*select\s+set_config\(\s*'request\.jwt\.claim\.sub'\s*,\s*\$1\s*,\s*(true|false)\s*\)\s*;?\s*$/i.exec(
          sql,
        );
        if (bind) {
          return bindFixtureActor(
            this,
            params?.[0] == null ? null : String(params[0]),
            bind[1].toLowerCase() === "true",
          );
        }
        // company-security's pre-Auth fixture supplied only UUID values.
        // Name that unchanged column after the fixture gains Auth fields.
        const fixtureSql = sql.replace(
          /^\s*insert\s+into\s+auth\.users\s+values(?=\s*\()/i,
          "insert into auth.users(id) values",
        );
        return query(fixtureSql, params, options);
      }) as typeof this.query;
    }
  }
  return { ...original, PGlite: RetainedAuthPGlite };
});
