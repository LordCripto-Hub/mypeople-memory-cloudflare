import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMcpServer, type Env } from "../../src/index";
import {
  makeTestEnv,
  makeVectorizeMock,
} from "../helpers/make-env";

const memoryRow = {
  id: "memory-1",
  project_slug: "pilot-alpha",
  content: "Use the Codex provider profile.",
  tags: '["status:canonical"]',
  source: "git",
  sourceUri: "git://example/project/commit/abc123",
  source_uri: "git://example/project/commit/abc123",
  sourceType: "git-commit",
  source_type: "git-commit",
  created_at: 1_720_000_000,
  updated_at: 1_720_000_100,
  status: "canonical",
};

function makePilotDb(): D1Database {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        all: vi.fn(async () => ({
          results:
            sql.includes("project_slug = ?") && args[0] === "pilot-alpha"
              ? [memoryRow]
              : [],
        })),
      })),
    })),
  } as unknown as D1Database;
}

describe("MCP recall gateway contract", () => {
  let env: Env;
  let ctx: ExecutionContext & {
    props: {
      principalId: string;
      allowedProjects: string[];
      scopes: string[];
    };
  };

  beforeEach(() => {
    env = makeTestEnv(undefined, {
      DB: makePilotDb(),
      MYPEOPLE_PILOT_READ_ONLY: "true",
      MYPEOPLE_ALLOWED_PROJECTS: "pilot-alpha,pilot-beta,pilot-gamma",
      MYPEOPLE_ENABLE_VECTOR_RECALL: "true",
      VECTORIZE: makeVectorizeMock({
        query: vi.fn().mockResolvedValue({
          matches: [
            {
              id: "pilot-alpha:memory-1",
              namespace: "pilot-alpha",
              score: 1,
              metadata: {
                parentId: "memory-1",
                project_slug: "pilot-alpha",
              },
            },
          ],
        }),
      }),
    });
    ctx = {
      waitUntil: vi.fn(),
      props: {
        principalId: "service:mypeople-gateway",
        allowedProjects: ["pilot-alpha", "pilot-beta", "pilot-gamma"],
        scopes: ["memory:read"],
      },
    } as unknown as typeof ctx;
  });

  async function withClient<T>(operation: (client: Client) => Promise<T>) {
    const server = buildMcpServer(env, ctx);
    const client = new Client({ name: "mypeople-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      return await operation(client);
    } finally {
      await client.close();
      await server.close();
    }
  }

  async function callRecall(arguments_: Record<string, unknown>) {
    return withClient((client) =>
      client.callTool({
        name: "recall",
        arguments: arguments_,
      }),
    );
  }

  it("accepts the bounded MyPeople shape on the production pilot path", async () => {
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
  });

  it("exposes only recall in read-only pilot mode", async () => {
    const tools = await withClient((client) => client.listTools());
    expect(tools.tools.map((tool) => tool.name)).toEqual(["recall"]);
  });

  it("rejects an unauthorized project before any AI call", async () => {
    ctx.props.allowedProjects = ["pilot-beta"];
    const aiRun = env.AI.run as ReturnType<typeof vi.fn>;
    aiRun.mockClear();

    const result = await callRecall({
      projectSlug: "pilot-alpha",
      query: "provider decision",
      limit: 3,
      hops: 0,
    });

    expect(result.isError).toBe(true);
    expect(aiRun).not.toHaveBeenCalled();
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
