import { describe, expect, it } from "vitest";
import {
  buildStructuredRecall,
  parseRecallInput,
} from "../../src/contracts/recall";

describe("MyPeople bounded recall input", () => {
  it("maps the gateway limit alias to the internal topK field", () => {
    expect(
      parseRecallInput({
        projectSlug: "pilot-alpha",
        query: "  provider decision  ",
        limit: 3,
        hops: 0,
      }),
    ).toEqual({
      projectSlug: "pilot-alpha",
      query: "provider decision",
      topK: 3,
      hops: 0,
    });
  });

  it("accepts matching limit and topK without inventing defaults", () => {
    expect(
      parseRecallInput({
        projectSlug: "pilot-alpha",
        query: "provider decision",
        limit: 2,
        topK: 2,
      }),
    ).toEqual({
      projectSlug: "pilot-alpha",
      query: "provider decision",
      topK: 2,
    });

    expect(
      parseRecallInput({
        projectSlug: "pilot-alpha",
        query: "provider decision",
      }),
    ).toEqual({
      projectSlug: "pilot-alpha",
      query: "provider decision",
    });
  });

  it.each([
    { projectSlug: "pilot-alpha", query: "provider", limit: 4 },
    { projectSlug: "pilot-alpha", query: "provider", limit: 0 },
    { projectSlug: "pilot-alpha", query: "provider", hops: 1 },
    {
      projectSlug: "pilot-alpha",
      query: "provider",
      limit: 2,
      topK: 3,
    },
    { projectSlug: "pilot-alpha", query: "   " },
    { query: "provider", limit: 3 },
  ])("rejects invalid bounded input %#", (input) => {
    expect(() => parseRecallInput(input)).toThrow();
  });
});

describe("MyPeople structured recall output", () => {
  const row = {
    id: "memory-1",
    project_slug: "pilot-alpha",
    content: "Use the Codex provider profile.",
    source_uri: "git://example/project/commit/abc123",
    source_type: "git-commit",
    created_at: 1_720_000_000,
    updated_at: 1_720_000_100,
    status: "canonical",
  };

  it("returns human-readable content and provenance-complete claims", () => {
    expect(buildStructuredRecall("pilot-alpha", [row])).toEqual({
      content: [
        {
          type: "text",
          text: "Use the Codex provider profile.",
        },
      ],
      structuredContent: {
        claims: [
          {
            id: "memory-1",
            projectSlug: "pilot-alpha",
            content: "Use the Codex provider profile.",
            sourceUri: "git://example/project/commit/abc123",
            sourceType: "git-commit",
            createdAt: 1_720_000_000,
            updatedAt: 1_720_000_100,
            status: "canonical",
          },
        ],
      },
    });
  });

  it("accepts camel-case storage adapters without changing the output", () => {
    expect(
      buildStructuredRecall("pilot-alpha", [
        {
          id: row.id,
          projectSlug: row.project_slug,
          content: row.content,
          sourceUri: row.source_uri,
          sourceType: row.source_type,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          status: row.status,
        },
      ]).structuredContent.claims[0],
    ).toEqual({
      id: row.id,
      projectSlug: row.project_slug,
      content: row.content,
      sourceUri: row.source_uri,
      sourceType: row.source_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
    });
  });

  it("rejects more than three returned claims", () => {
    expect(() =>
      buildStructuredRecall(
        "pilot-alpha",
        Array.from({ length: 4 }, (_, index) => ({
          ...row,
          id: `memory-${index + 1}`,
        })),
      ),
    ).toThrow();
  });

  it.each([
    { ...row, id: "" },
    { ...row, content: "" },
    { ...row, source_uri: "" },
    { ...row, source_type: "" },
    { ...row, created_at: undefined },
    { ...row, updated_at: undefined },
    { ...row, project_slug: undefined },
    { ...row, project_slug: "pilot-beta" },
  ])("rejects incomplete or cross-project claim %#", (invalidRow) => {
    expect(() => buildStructuredRecall("pilot-alpha", [invalidRow])).toThrow();
  });
});
