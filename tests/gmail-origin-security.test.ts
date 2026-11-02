import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create schema private;create table private.gmail_oauth_states(state_hash text primary key check(state_hash~'^[a-f0-9]{64}$'),return_origin text constraint gmail_oauth_states_return_origin_check check(return_origin in ('https://truckcontrolai.com','https://www.truckcontrolai.com','https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site')));`,
  );
  await db.query("insert into private.gmail_oauth_states values($1,$2)", [
    "a".repeat(64),
    "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
  ]);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261102085143_gmail_production_return_origin.sql",
      "utf8",
    ),
  );
});
afterAll(async () => db?.close());
describe("retorno Gmail a los orígenes verificados", () => {
  it("conserva los estados previos", async () =>
    expect(
      (
        await db.query(
          "select return_origin from private.gmail_oauth_states where state_hash=$1",
          ["a".repeat(64)],
        )
      ).rows,
    ).toEqual([
      {
        return_origin:
          "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
      },
    ]));
  it("admite los tres orígenes publicados y el retorno heredado", async () => {
    for (const [i, origin] of [
      "https://truckcontrolai.com",
      "https://www.truckcontrolai.com",
      "https://truckcontrol-ai-candidata.earlymug513.chatgpt.site",
      "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
    ].entries()) {
      await db.query("insert into private.gmail_oauth_states values($1,$2)", [
        (i + 1).toString(16).repeat(64),
        origin,
      ]);
    }
  });
  it("sigue rechazando destinos ajenos y hashes inválidos", async () => {
    for (const origin of [
      "http://truckcontrolai.com",
      "https://truckcontrolai.com.evil.invalid",
      "https://evil.invalid",
    ]) {
      await expect(
        db.query("insert into private.gmail_oauth_states values($1,$2)", [
          "f".repeat(64),
          origin,
        ]),
      ).rejects.toThrow(/check constraint/);
    }
    await expect(
      db.query(
        "insert into private.gmail_oauth_states values('invalid','https://truckcontrolai.com')",
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
