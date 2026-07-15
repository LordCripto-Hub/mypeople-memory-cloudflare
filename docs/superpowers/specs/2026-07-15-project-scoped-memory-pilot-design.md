# Project-Scoped Memory MCP Pilot Design

## Status

Approved by the project owner on 2026-07-15. This repository is a dedicated,
public, English-only derivative of `rahilp/second-brain-cloudflare`. The
reviewed baseline is upstream commit `e33f9e1` and passed 599 tests, TypeScript
type checking, and an npm audit with zero reported vulnerabilities before this
work began.

## Purpose

MyPeople needs optional persistent recall without creating a second planning
system, leaking context between projects, or giving every worker a broad
credential. This service is therefore an external MCP memory component, not a
replacement for Git, the MyPeople board, provider chat history, or project
documentation.

The first live integration is read-only from MyPeople and contains synthetic
data only. Real project data, persistent writes from MyPeople, automatic
capture, paid usage, and cross-project links require separate approval.

## Chosen architecture

One Cloudflare Worker serves several projects while enforcing a mandatory
`project_slug` partition in every storage and authorization path. D1 is the
canonical store. Vectorize is a rebuildable index whose records use the same
project namespace. MyPeople calls this service only through its bounded
`MemoryGateway`; individual engineers do not receive the service credential.

The fork keeps the upstream retrieval engine, dashboard, export surface, and
test suite. It adds a small policy layer and versioned migrations instead of
building a second memory engine or deploying one Worker per project.

## Isolation contract

Every memory entry carries:

```text
project_slug, source_type, source_uri, task_id, repository, repo_commit,
created_by_agent, verified_by, verified_at, updated_at, content_hash,
valid_from, valid_until
```

Every public REST route and MCP memory tool requires an explicit
`projectSlug`. Missing or malformed project identity is rejected before a D1,
Vectorize, Workers AI, KV, or integration call.

- Every D1 read, write, update, delete, aggregate, duplicate check, and
  contradiction check includes `project_slug` in its predicate.
- Entry uniqueness is `(project_slug, id)`.
- Graph edges include `project_slug`; both endpoints must exist in that same
  project. Cross-project edges are not supported by the pilot.
- Vectorize writes use `project_slug` as the namespace and include it in
  metadata. Queries provide the same namespace and reject mismatched metadata.
- Export, import, restore, rebuild, statistics, tags, and list operations are
  project-scoped.
- A project mismatch is a security event. Mismatched content is discarded and
  is never returned in an error body or general log.

Valid project slugs use lowercase ASCII letters, digits, and single hyphens,
with a maximum length of 64 characters.

## Authorization contract

Query-string credentials are removed. Authentication uses an Authorization
header or OAuth exchange only.

A principal has:

```json
{
  "principalId": "service:mypeople-gateway",
  "allowedProjects": ["pilot-alpha", "pilot-beta", "pilot-gamma"],
  "scopes": ["memory:read"]
}
```

Supported scopes are `memory:read`, `memory:propose`, `memory:write`, and
`memory:admin`. Authorization checks both project membership and the minimum
scope before storage access. The MyPeople pilot principal receives only
`memory:read` for the three synthetic projects. Provider authentication and
memory authorization remain independent.

## Provenance and lifecycle

Provenance is mandatory for new and imported memories. `content_hash` is a
stable hash of normalized content plus project identity. Verification fields
are nullable for proposed or unverified memories but must be present before a
claim can be marked canonical. Validity intervals allow superseded claims to
remain auditable without appearing in normal recall.

Audit events contain timestamp, principal, project, operation, outcome,
latency, result count, and metering metadata. They never contain credentials or
memory content.

## Operations and recovery

- D1 changes are ordered, versioned migrations and are tested against a fresh
  database.
- Export produces a versioned, project-scoped document without deployment-
  specific vector identifiers.
- Import validates the complete document before mutation and is idempotent by
  `(project_slug, id, content_hash)`.
- Vectorize rebuild derives all index records deterministically from D1.
- Orphan cleanup removes vector records that have no matching D1 entry in the
  same project.
- Restore is accepted only after export, fresh-database import, vector rebuild,
  and recall-equivalence checks pass.

## Cost and feature controls

Per-principal and per-project request limits protect the service. Workers AI
operations record model, call count, elapsed time, and provider-reported usage
when available. A configurable daily AI budget fails closed when exhausted.

The following features are disabled by default in the pilot:

- automatic insight synthesis;
- automatic pattern derivation;
- background compression;
- Notion and browser integrations;
- automatic capture;
- multi-hop recall;
- cross-project links.

Direct recall is limited to `topK <= 3` and `hops = 0` for MyPeople.

## Synthetic pilot

The Cloudflare deployment uses fresh resources whose names begin with
`mypeople-memory-sandbox`. It never reuses resource identifiers from another
Second Brain installation.

The dataset contains at least 30 synthetic memories divided among three
projects. It deliberately repeats names and technologies and includes
conflicting decisions so leakage and contradiction handling are testable.

## Release gates

The pilot is blocked from real data unless all gates pass:

1. Zero cross-project recall results, duplicate matches, contradictions, graph
   edges, exports, imports, aggregates, or vector matches.
2. Provenance on 100 percent of returned claims.
3. Precision at three of at least 0.80 on the approved synthetic query set.
4. Export/import/vector-rebuild recovery with recall-equivalent results.
5. Direct recall p95 below two seconds.
6. No unrestricted credential delivered to a MyPeople worker.
7. No MyPeople write during the read-only pilot.
8. MCP calls, response characters, elapsed time, and Workers AI usage reported
   per request.
9. Zero Cloudflare spend unless a separate paid-plan gate is approved.

Isolation, provenance, or restore failure blocks the pilot. Quality, latency,
or cost failure returns the design to review; it never silently relaxes a
boundary.

## Rollback

MyPeople memory remains disabled by default. Rollback removes its credential
binding and deletes only the synthetic `mypeople-memory-sandbox` resources.
The MyPeople board, Git repositories, and live Docker runtime remain
independent and operational.
