import { beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../../src/index";
import {
  makeAIMock,
  makeTestEnv,
  makeVectorizeMock,
} from "../helpers/make-env";
import { req } from "../helpers/make-request";

describe("read-only pilot surface", () => {
  let env: Env;
  let dbPrepare: ReturnType<typeof vi.fn>;
  let vectorQuery: ReturnType<typeof vi.fn>;
  let aiRun: ReturnType<typeof vi.fn>;
  let ctx: ExecutionContext;

  beforeEach(() => {
    dbPrepare = vi.fn();
    vectorQuery = vi.fn();
    const ai = makeAIMock();
    aiRun = ai.run as ReturnType<typeof vi.fn>;
    env = makeTestEnv(undefined, {
      DB: { prepare: dbPrepare } as unknown as D1Database,
      AI: ai,
      VECTORIZE: makeVectorizeMock({
        query: vectorQuery as unknown as VectorizeIndex["query"],
      }),
      MYPEOPLE_PILOT_READ_ONLY: "true",
      MYPEOPLE_ALLOWED_PROJECTS: "pilot-alpha,pilot-beta,pilot-gamma",
    });
    ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  });

  it("blocks every legacy REST memory route before storage access", async () => {
    const response = await worker.fetch(
      req("POST", "/capture", {
        token: "test-token",
        body: { content: "must not be stored" },
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(404);
    expect(dbPrepare).not.toHaveBeenCalled();
    expect(vectorQuery).not.toHaveBeenCalled();
    expect(aiRun).not.toHaveBeenCalled();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("serves a storage-free pilot health response", async () => {
    const response = await worker.fetch(
      req("GET", "/health", { token: null }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      mode: "mypeople-read-only-pilot",
    });
    expect(dbPrepare).not.toHaveBeenCalled();
    expect(vectorQuery).not.toHaveBeenCalled();
    expect(aiRun).not.toHaveBeenCalled();
  });

  it("does not schedule background work", async () => {
    await worker.scheduled({} as ScheduledEvent, env, ctx);
    expect(ctx.waitUntil).not.toHaveBeenCalled();
    expect(dbPrepare).not.toHaveBeenCalled();
    expect(vectorQuery).not.toHaveBeenCalled();
    expect(aiRun).not.toHaveBeenCalled();
  });

  it.each([undefined, "tru", "", "false"])(
    "fails closed when the pilot mode setting is %s",
    async (setting) => {
      env.MYPEOPLE_PILOT_READ_ONLY = setting;
      const response = await worker.fetch(
        req("POST", "/capture", {
          token: "test-token",
          body: { content: "must not be stored" },
        }),
        env,
        ctx,
      );

      expect(response.status).toBe(404);
      expect(dbPrepare).not.toHaveBeenCalled();
      expect(vectorQuery).not.toHaveBeenCalled();
      expect(aiRun).not.toHaveBeenCalled();
      expect(ctx.waitUntil).not.toHaveBeenCalled();
    },
  );

  it("rejects unsupported OAuth endpoints without touching KV or storage", async () => {
    const kvPut = env.OAUTH_KV.put as ReturnType<typeof vi.fn>;
    const response = await worker.fetch(
      req("POST", "/oauth/register", {
        token: "test-token",
        body: { client_name: "unsupported" },
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(404);
    expect(kvPut).not.toHaveBeenCalled();
    expect(dbPrepare).not.toHaveBeenCalled();
    expect(aiRun).not.toHaveBeenCalled();
  });

  it.each([null, "wrong-token"])(
    "rejects MCP access with bearer token %s before dependencies",
    async (token) => {
      const response = await worker.fetch(
        req("POST", "/mcp", { token }),
        env,
        ctx,
      );

      expect(response.status).toBe(401);
      expect(dbPrepare).not.toHaveBeenCalled();
      expect(vectorQuery).not.toHaveBeenCalled();
      expect(aiRun).not.toHaveBeenCalled();
    },
  );
});
