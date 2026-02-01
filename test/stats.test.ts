import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const VALID = path.resolve(__dirname, "fixtures/valid-collection");

function run(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI, ...args], {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; status: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.status ?? 1 };
  }
}

describe("stats command", () => {
  describe("JSON format", () => {
    it("returns collection statistics", () => {
      const { stdout, exitCode } = run(["stats", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.total_files).toBeGreaterThanOrEqual(5);
      expect(parsed.by_type).toBeDefined();
      expect(parsed.by_type.note).toBeGreaterThanOrEqual(4);
      expect(parsed.untyped).toBeGreaterThanOrEqual(1);
    });

    it("includes field coverage", () => {
      const { stdout, exitCode } = run(["stats", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.field_coverage).toBeDefined();
      expect(parsed.field_coverage.title).toBeDefined();
      expect(parsed.field_coverage.title.count).toBeGreaterThan(0);
      expect(parsed.field_coverage.title.percentage).toBeGreaterThan(0);
    });

    it("includes tag counts", () => {
      const { stdout, exitCode } = run(["stats", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.tags).toBeDefined();
      expect(parsed.tags.project).toBeGreaterThanOrEqual(2);
    });

    it("includes validation health", () => {
      const { stdout, exitCode } = run(["stats", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.validation).toBeDefined();
      expect(typeof parsed.validation.valid).toBe("number");
      expect(typeof parsed.validation.invalid).toBe("number");
      expect(typeof parsed.validation.errors).toBe("number");
      expect(typeof parsed.validation.warnings).toBe("number");
    });
  });

  describe("text format", () => {
    it("shows summary sections", () => {
      const { stdout, exitCode } = run(["stats"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Collection Stats");
      expect(stdout).toContain("Types:");
      expect(stdout).toContain("Field Coverage:");
      expect(stdout).toContain("Validation:");
    });
  });

  describe("error handling", () => {
    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["stats"], "/tmp");
      expect(exitCode).toBe(3);
    });
  });
});
