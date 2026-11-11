import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { financialDatabase } from "./helpers/subscription-financial-db";

it("validates the new native acceptance contract and its unconditional fixture rollback in an isolated migrated database", async () => {
  const db = await financialDatabase();
  try {
    const sql = readFileSync(
      "docs/verification/new-additions-native-rollback-20261111.sql",
      "utf8",
    );
    const result = await db.exec(sql);
    const acceptance = result
      .flatMap((r) => r.rows)
      .find((r) => "acceptance" in r)?.acceptance as {
      passed: number;
      fixtures_persisted: boolean;
      providers_called: boolean;
      checks: string[];
    };
    expect(acceptance).toMatchObject({
      passed: 20,
      fixtures_persisted: false,
      providers_called: false,
    });
    expect(acceptance.checks).toContain(
      "old_specialist_attestations_unchanged",
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from auth.users where id::text like 'c6111000-%'",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await db.close();
  }
}, 120000);
