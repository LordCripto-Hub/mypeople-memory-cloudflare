declare const projectSlugBrand: unique symbol;

export type ProjectSlug = string & {
  readonly [projectSlugBrand]: true;
};

const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_SLUG_MAX_LENGTH = 64;

export function parseProjectSlug(value: unknown): ProjectSlug {
  if (
    typeof value !== "string" ||
    value.length > PROJECT_SLUG_MAX_LENGTH ||
    !PROJECT_SLUG_PATTERN.test(value)
  ) {
    throw new Error("Invalid project slug");
  }

  return value as ProjectSlug;
}
