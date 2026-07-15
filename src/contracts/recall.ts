import { parseProjectSlug, type ProjectSlug } from "./project";

export interface ParsedRecallInput {
  projectSlug: ProjectSlug;
  query: string;
  topK?: number;
  hops?: 0;
}

export interface StructuredRecallClaim {
  id: string;
  projectSlug: ProjectSlug;
  content: string;
  sourceUri: string;
  sourceType: string;
  createdAt: number;
  updatedAt: number;
  status: string;
}

export interface StructuredRecallResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: { claims: StructuredRecallClaim[] };
}

type UnknownRecord = Record<string, unknown>;

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as UnknownRecord;
}

function readOptionalTopK(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 3) {
    throw new Error(`${label} must be an integer between 1 and 3`);
  }

  return value as number;
}

export function parseRecallInput(value: unknown): ParsedRecallInput {
  const input = requireRecord(value, "Recall input");
  const projectSlug = parseProjectSlug(input.projectSlug);

  if (typeof input.query !== "string" || input.query.trim().length === 0) {
    throw new Error("Recall query must be a non-empty string");
  }

  const limit = readOptionalTopK(input.limit, "limit");
  const topK = readOptionalTopK(input.topK, "topK");
  if (limit !== undefined && topK !== undefined && limit !== topK) {
    throw new Error("limit and topK must match when both are provided");
  }

  if (input.hops !== undefined && input.hops !== 0) {
    throw new Error("hops must be zero for bounded recall");
  }

  const parsed: ParsedRecallInput = {
    projectSlug,
    query: input.query.trim(),
  };
  const resolvedTopK = limit ?? topK;
  if (resolvedTopK !== undefined) parsed.topK = resolvedTopK;
  if (input.hops === 0) parsed.hops = 0;
  return parsed;
}

function readAlias(
  row: UnknownRecord,
  camelName: string,
  snakeName: string,
): unknown {
  const camelValue = row[camelName];
  const snakeValue = row[snakeName];
  if (
    camelValue !== undefined &&
    snakeValue !== undefined &&
    camelValue !== snakeValue
  ) {
    throw new Error(`${camelName} and ${snakeName} must match`);
  }

  return camelValue ?? snakeValue;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function requireTimestamp(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a numeric timestamp`);
  }

  return value;
}

export function buildStructuredRecall(
  expectedProjectSlug: string,
  rows: unknown[],
): StructuredRecallResult {
  const projectSlug = parseProjectSlug(expectedProjectSlug);
  if (!Array.isArray(rows)) throw new Error("Recall rows must be an array");
  if (rows.length > 3) {
    throw new Error("Bounded recall cannot return more than three claims");
  }

  const claims = rows.map((value, index): StructuredRecallClaim => {
    const row = requireRecord(value, `Recall row ${index}`);
    const rowProjectSlug = parseProjectSlug(
      readAlias(row, "projectSlug", "project_slug"),
    );
    if (rowProjectSlug !== projectSlug) {
      throw new Error("Recall row project does not match the requested project");
    }

    return {
      id: requireNonEmptyString(row.id, "id"),
      projectSlug: rowProjectSlug,
      content: requireNonEmptyString(row.content, "content"),
      sourceUri: requireNonEmptyString(
        readAlias(row, "sourceUri", "source_uri"),
        "sourceUri",
      ),
      sourceType: requireNonEmptyString(
        readAlias(row, "sourceType", "source_type"),
        "sourceType",
      ),
      createdAt: requireTimestamp(
        readAlias(row, "createdAt", "created_at"),
        "createdAt",
      ),
      updatedAt: requireTimestamp(
        readAlias(row, "updatedAt", "updated_at"),
        "updatedAt",
      ),
      status: requireNonEmptyString(row.status, "status"),
    };
  });

  return {
    content: [
      {
        type: "text",
        text:
          claims.length === 0
            ? "No memories found."
            : claims.map((claim) => claim.content).join("\n\n"),
      },
    ],
    structuredContent: { claims },
  };
}
