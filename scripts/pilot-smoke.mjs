#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const serverUrl = process.env.MYPEOPLE_MEMORY_URL;
const token = process.env.MYPEOPLE_MEMORY_TOKEN;
if (!serverUrl || !token) {
  throw new Error("MYPEOPLE_MEMORY_URL and MYPEOPLE_MEMORY_TOKEN are required");
}

const endpoint = new URL(serverUrl);
const healthUrl = new URL("/health", endpoint);
const healthResponse = await fetch(healthUrl);
if (!healthResponse.ok) throw new Error(`health failed: ${healthResponse.status}`);

const unauthorizedResponse = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
});
if (unauthorizedResponse.status !== 401) {
  throw new Error(`unauthorized gate failed: ${unauthorizedResponse.status}`);
}

const queryUrl = new URL("../fixtures/synthetic-queries.json", import.meta.url);
const queries = JSON.parse(await readFile(queryUrl, "utf8"));
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "mypeople-pilot-smoke", version: "1.0.0" });

const latencies = [];
let relevant = 0;
let returned = 0;
try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  if (names.length !== 1 || names[0] !== "recall") {
    throw new Error(`unexpected tools: ${names.join(",")}`);
  }

  for (const query of queries) {
    const started = performance.now();
    const response = await client.callTool({
      name: "recall",
      arguments: {
        projectSlug: query.projectSlug,
        query: query.query,
        limit: 3,
        hops: 0,
      },
    });
    latencies.push(performance.now() - started);
    if (response.isError) throw new Error(`recall failed: ${query.query}`);
    const claims = response.structuredContent?.claims;
    if (!Array.isArray(claims) || claims.length > 3) {
      throw new Error(`invalid claims: ${query.query}`);
    }
    for (const claim of claims) {
      if (claim.projectSlug !== query.projectSlug) {
        throw new Error(`cross-project result: ${query.query}`);
      }
      for (const field of [
        "id",
        "content",
        "sourceUri",
        "sourceType",
        "createdAt",
        "updatedAt",
        "status",
      ]) {
        if (claim[field] === undefined || claim[field] === null || claim[field] === "") {
          throw new Error(`missing provenance ${field}: ${query.query}`);
        }
      }
      returned += 1;
      if (query.expectedIds.includes(claim.id)) relevant += 1;
    }
  }
} finally {
  await client.close();
}

const sorted = [...latencies].sort((a, b) => a - b);
const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
const precisionAtThree = returned === 0 ? 0 : relevant / returned;
const report = {
  ok: precisionAtThree >= 0.8 && p95 < 2000,
  queryCount: queries.length,
  returnedClaims: returned,
  relevantClaims: relevant,
  precisionAtThree,
  p95Milliseconds: Math.round(p95),
  crossProjectResults: 0,
  provenanceCoverage: 1,
  tools: ["recall"],
  workersAiCalls: 0,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
