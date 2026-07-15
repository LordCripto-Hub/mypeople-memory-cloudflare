import { describe, expect, it, vi } from "vitest";
import {
  projectScopedRecallEntries,
  type Env,
} from "../../src/index";
import { buildStructuredRecall } from "../../src/contracts/recall";
import { makeAIMock, makeTestEnv, makeVectorizeMock } from "../helpers/make-env";

const rows = [
  {
    id: "shared",
    project_slug: "pilot-alpha",
    content: "Alpha uses the Codex provider.",
    tags: '["status:canonical"]',
    source: "git",
    source_uri: "git://alpha/commit/a1",
    source_type: "git-commit",
    created_at: 1000,
    updated_at: 1100,
    status: "canonical",
  },
  {
    id: "shared",
    project_slug: "pilot-beta",
    content: "Beta uses a different provider.",
    tags: '["status:canonical"]',
    source: "git",
    source_uri: "git://beta/commit/b1",
    source_type: "git-commit",
    created_at: 1000,
    updated_at: 1200,
    status: "canonical",
  },
];

function makeScopedDb(
  sqlCalls: Array<{ sql: string; args: unknown[] }>,
  sourceRows: Array<Record<string, unknown>> = rows,
) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          sqlCalls.push({ sql, args });
          return {
            async all() {
              const project = sql.includes("project_slug = ?")
                ? String(args[0])
                : null;
              return {
                results: sourceRows.filter(
                  (row) => project === null || row.project_slug === project,
                ),
              };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("project-scoped pilot recall", () => {
  it("filters both Vectorize and D1 before returning provenance", async () => {
    const sqlCalls: Array<{ sql: string; args: unknown[] }> = [];
    const vectorQuery = vi.fn().mockResolvedValue({
      matches: [
        {
          id: "pilot-alpha:shared",
          namespace: "pilot-alpha",
          score: 0.99,
          metadata: { parentId: "shared", project_slug: "pilot-alpha" },
        },
        {
          id: "pilot-beta:shared",
          namespace: "pilot-beta",
          score: 1,
          metadata: { parentId: "shared", project_slug: "pilot-beta" },
        },
      ],
    });
    const env = makeTestEnv(undefined, {
      DB: makeScopedDb(sqlCalls),
      AI: makeAIMock(),
      VECTORIZE: makeVectorizeMock({ query: vectorQuery }),
      MYPEOPLE_ENABLE_VECTOR_RECALL: "true",
    }) as Env;
    const ctx = {
      waitUntil: vi.fn(() => {
        throw new Error("Read-only recall must not schedule writes");
      }),
    } as unknown as ExecutionContext;

    const result = await projectScopedRecallEntries(
      {
        projectSlug: "pilot-alpha",
        query: "provider",
        topK: 3,
        hops: 0,
      },
      env,
      ctx,
    );

    expect(vectorQuery).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        namespace: "pilot-alpha",
        topK: 3,
        returnMetadata: "all",
      }),
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      id: "shared",
      projectSlug: "pilot-alpha",
      content: "Alpha uses the Codex provider.",
      sourceUri: "git://alpha/commit/a1",
      sourceType: "git-commit",
      updatedAt: 1100,
      status: "canonical",
    });
    expect(result.matches[0].content).not.toContain("Beta");
    expect(sqlCalls.length).toBeGreaterThan(0);
    expect(sqlCalls.every(({ sql }) => sql.includes("project_slug = ?"))).toBe(true);
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("preserves missing provenance as invalid instead of stringifying it", async () => {
    const sqlCalls: Array<{ sql: string; args: unknown[] }> = [];
    const incompleteRows = [{ ...rows[0], source_uri: undefined }];
    const env = makeTestEnv(undefined, {
      DB: makeScopedDb(sqlCalls, incompleteRows),
      MYPEOPLE_ENABLE_VECTOR_RECALL: "false",
    }) as Env;
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;

    const result = await projectScopedRecallEntries(
      {
        projectSlug: "pilot-alpha",
        query: "provider",
        topK: 3,
        hops: 0,
      },
      env,
      ctx,
    );

    expect(result.matches[0]?.sourceUri).toBeUndefined();
    expect(() =>
      buildStructuredRecall("pilot-alpha", result.matches),
    ).toThrow("sourceUri must be a non-empty string");
  });

  it.each([
    ["created_at", null, "createdAt"],
    ["updated_at", "", "updatedAt"],
  ])(
    "preserves malformed %s provenance for strict validation",
    async (field, value, expectedLabel) => {
      const sqlCalls: Array<{ sql: string; args: unknown[] }> = [];
      const malformedRows = [{ ...rows[0], [field]: value }];
      const env = makeTestEnv(undefined, {
        DB: makeScopedDb(sqlCalls, malformedRows),
        MYPEOPLE_ENABLE_VECTOR_RECALL: "false",
      }) as Env;
      const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;

      const result = await projectScopedRecallEntries(
        {
          projectSlug: "pilot-alpha",
          query: "provider",
          topK: 3,
          hops: 0,
        },
        env,
        ctx,
      );

      expect(() =>
        buildStructuredRecall("pilot-alpha", result.matches),
      ).toThrow(`${expectedLabel} must be a numeric timestamp`);
    },
  );
});
