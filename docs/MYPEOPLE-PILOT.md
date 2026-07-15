# MyPeople Project-Scoped Memory Pilot

This branch is a synthetic, read-only validation surface for integrating
Cloudflare memory with MyPeople. It does not enable memory for real project
cards and it does not expose the upstream write, import, export, graph, chat,
or background-compression features.

## Live synthetic endpoint

- Health: <https://mypeople-memory-sandbox.labmkt.workers.dev/health>
- MCP: <https://mypeople-memory-sandbox.labmkt.workers.dev/mcp>
- Allowed projects: `pilot-alpha`, `pilot-beta`, and `pilot-gamma`

The MCP endpoint requires a high-entropy bearer secret. Never put the secret
in Git, a project profile, a task, a URL, a comment, or an agent prompt.

## Active contract

- Only the `recall` MCP tool is exposed.
- `projectSlug` is required and authorized before D1, Vectorize, or AI access.
- Direct recall is bounded to `limit <= 3` and `hops = 0`.
- D1 keys and queries are project-scoped.
- Canonical rows require verifier identity and verification time.
- Legacy writes require the exact local break-glass value
  `allow-legacy-writes`; missing or malformed configuration stays read-only.
- Vector recall is disabled by default, so the pilot makes no Workers AI calls.
- OAuth and KV are not part of the pilot runtime.

## Deploy

Create fresh resources. Do not reuse another Second Brain installation.

```bash
npm ci
npm run vectors:create
npm run deploy
npm run db:migrate:remote
npm run pilot:seed:remote
```

The checked-in D1 identifier belongs to the published synthetic sandbox.
Forks must create their own database and replace that binding before deploy.
Set `AUTH_TOKEN` with `wrangler secret put AUTH_TOKEN`; do not place its
value in `wrangler.jsonc`.

## Verify

```bash
export MYPEOPLE_MEMORY_URL="https://YOUR-WORKER.workers.dev/mcp"
export MYPEOPLE_MEMORY_TOKEN="YOUR_SECRET_FROM_A_SECRET_MANAGER"
npm run pilot:smoke
```

The smoke test checks the unauthenticated gate, the tool surface, project
isolation, provenance, precision at three, latency, and zero Workers AI calls.
The published validation observed 15 queries, precision 0.9375, p95 317 ms,
zero cross-project results, and complete provenance.

## MyPeople gateway boundary

MyPeople calls this service through its trusted `memory-gateway.mjs` process.
A ProjectProfile contains only:

```json
{
  "memory": {
    "enabled": false,
    "serverUrl": "https://mypeople-memory-sandbox.labmkt.workers.dev/mcp",
    "credentialRef": "env://MYPEOPLE_MEMORY_TOKEN"
  }
}
```

Keep `enabled` false for real work until backup/restore, credential brokering,
and the remaining release gates are independently verified. The gateway must
receive the secret only in its child environment; workers and task payloads
must never receive it.

## Token impact

Keyword recall itself uses no GPT, Codex, OpenAI API, or Workers AI tokens.
The only model-token effect is the bounded text added to a task prompt. With
one to three short claims, the current planning estimate is roughly 300 to 900
input tokens per recall. This estimate is not a measured billing value.

## Rollback

Disable the ProjectProfile memory flag and remove its credential binding first.
Then delete only resources whose names start with
`mypeople-memory-sandbox`. MyPeople's board, Docker runtime, and source
repositories are independent of this Worker.
