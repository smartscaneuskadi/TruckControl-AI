import { describe, expect, it } from "vitest";
// This operational helper is JavaScript and intentionally outside app compilation.
// @ts-expect-error No TypeScript declaration is supplied for the operational helper.
import { listMonitorItems } from "../scripts/lib/monitor-incident-pagination.mjs";

describe("monitor incident pagination", () => {
  it("finds existing incidents beyond the first 100 open issues", async () => {
    const paths: string[] = [];
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ number: i + 1 }));
    const items = await listMonitorItems(async (path: string) => {
      paths.push(path);
      return path.endsWith("page=1") ? firstPage : [{ number: 101 }];
    }, "issues?state=open");
    expect(items).toHaveLength(101);
    expect(items.at(-1)).toEqual({ number: 101 });
    expect(paths).toEqual([
      "issues?state=open&per_page=100&page=1",
      "issues?state=open&per_page=100&page=2",
    ]);
  });

  it("reads later incident comments before comparing the newest fingerprint", async () => {
    const items = await listMonitorItems(async (path: string) =>
      path.endsWith("page=1")
        ? Array.from({ length: 100 }, () => ({ body: "older fingerprint" }))
        : [{ body: "fingerprint:latest" }],
    "issues/123/comments");
    expect(items.at(-1).body).toBe("fingerprint:latest");
  });

  it("rejects malformed listings instead of creating a duplicate incident", async () => {
    await expect(listMonitorItems(async () => ({ error: "private-data" }), "issues?state=open"))
      .rejects.toThrow("invalid_monitor_listing");
  });

  it("fails closed when the bounded listing cannot be exhausted", async () => {
    const paths: string[] = [];
    await expect(listMonitorItems(async (path: string) => {
      paths.push(path);
      return Array.from({ length: 100 }, () => ({}));
    }, "issues?state=open", 2)).rejects.toThrow("monitor_listing_page_limit");
    expect(paths).toHaveLength(2);
  });
});
