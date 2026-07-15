import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildMcpServer,
  type Env,
  type RecallSearchResult,
} from "../../src/index";
import { makeTestEnv } from "../helpers/make-env";

const ctx = { waitUntil: (_: Promise<unknown>) => {} } as ExecutionContext;

describe("MCP recall gateway contract", () => {
  let env: Env;

  beforeEach(() => {
    env = makeTestEnv();
  });

  async function callRecall(arguments_: Record<string, unknown>) {
    const syntheticRecall = async (): Promise<RecallSearchResult> => ({
      matches: [
        {
          id: "memory-1",
          projectSlug: "pilot-alpha",
          content: "Use the Codex provider profile.",
          sourceUri: "git://example/project/commit/abc123",
          sourceType: "git-commit",
          createdAt: 1_720_000_000,
          updatedAt: 1_720_000_100,
          status: "canonical",
          score: 1,
          tags: ["status:canonical"],
          source: "git",
          isUpdate: false,
          hop: 0,
        },
      ],
      insight: "",
      semanticUnavailable: false,
    });
    const server = buildMcpServer(env, ctx, syntheticRecall);
    const client = new Client({ name: "mypeople-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      return await client.callTool({
        name: "recall",
        arguments: arguments_,
      });
    } finally {
      await client.close();
      await server.close();
    }
  }

  it("accepts the bounded MyPeople shape and returns structured claims", async () => {
    const result = await callRecall({
      projectSlug: "pilot-alpha",
      query: "provider decision",
      limit: 3,
      hops: 0,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
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
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Use the Codex provider profile."),
    });
  });

  it.each([
    { query: "provider decision", limit: 3, hops: 0 },
    { projectSlug: "pilot-alpha", query: "provider decision", limit: 4, hops: 0 },
    { projectSlug: "pilot-alpha", query: "provider decision", limit: 3, hops: 1 },
  ])("rejects out-of-contract arguments %#", async (arguments_) => {
    const result = await callRecall(arguments_);
    expect(result.isError).toBe(true);
  });
});
