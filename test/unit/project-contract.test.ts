import { describe, expect, it } from "vitest";
import { parseProjectSlug } from "../../src/contracts/project";

describe("project identity contract", () => {
  it.each(["mypeople", "pilot-alpha", "p1"])(
    "accepts the project slug %s",
    (value) => {
      expect(parseProjectSlug(value)).toBe(value);
    },
  );

  it.each([
    undefined,
    "",
    "MyPeople",
    "pilot--alpha",
    "../escape",
    "a".repeat(65),
  ])("rejects the invalid project slug %s", (value) => {
    expect(() => parseProjectSlug(value)).toThrow();
  });
});
