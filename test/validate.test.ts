import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const VALID = path.resolve(__dirname, "fixtures/valid-collection");
const INVALID = path.resolve(__dirname, "fixtures/invalid-collection");

function run(args: string[], cwd: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI, ...args], {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; status: number };
    return { stdout: e.stdout ?? "", exitCode: e.status ?? 1 };
  }
}

describe("validate command", () => {
  describe("collection validation", () => {
    it("exits 0 for valid collection", () => {
      const { stdout, exitCode } = run(["validate"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("valid");
    });

    it("exits 2 for invalid collection", () => {
      const { stdout, exitCode } = run(["validate"], INVALID);
      expect(exitCode).toBe(2);
      expect(stdout).toContain("missing_required");
      expect(stdout).toContain("number_too_large");
    });

    it("exits 3 when no mdbase.yaml found", () => {
      const { exitCode } = run(["validate"], "/tmp");
      expect(exitCode).toBe(3);
    });
  });

  describe("single file validation", () => {
    it("exits 0 for valid file", () => {
      const { stdout, exitCode } = run(["validate", "good.md"], INVALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("valid");
    });

    it("exits 2 for invalid file", () => {
      const { stdout, exitCode } = run(["validate", "bad.md"], INVALID);
      expect(exitCode).toBe(2);
      expect(stdout).toContain("missing_required");
    });

    it("validates multiple files", () => {
      const { stdout, exitCode } = run(["validate", "good.md", "bad.md"], INVALID);
      expect(exitCode).toBe(2);
      expect(stdout).toContain("error");
    });
  });

  describe("JSON output", () => {
    it("outputs structured JSON for collection", () => {
      const { stdout, exitCode } = run(["validate", "--format", "json"], INVALID);
      expect(exitCode).toBe(2);
      const parsed = JSON.parse(stdout);
      expect(parsed.valid).toBe(false);
      expect(parsed.issues).toBeInstanceOf(Array);
      expect(parsed.issues.length).toBeGreaterThan(0);
      expect(parsed.summary.errors).toBeGreaterThan(0);
    });

    it("outputs valid JSON for valid collection", () => {
      const { stdout, exitCode } = run(["validate", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.valid).toBe(true);
      expect(parsed.issues).toEqual([]);
    });

    it("outputs valid JSON for single file", () => {
      const { stdout, exitCode } = run(["validate", "--format", "json", "bad.md"], INVALID);
      expect(exitCode).toBe(2);
      const parsed = JSON.parse(stdout);
      expect(parsed.valid).toBe(false);
      expect(parsed.issues.some((i: { code: string }) => i.code === "missing_required")).toBe(true);
    });
  });

  describe("--level flag", () => {
    it("--level warn shows warnings too", () => {
      const { stdout } = run(["validate", "--level", "warn"], INVALID);
      expect(stdout).toContain("error");
    });

    it("--level off suppresses output but still sets exit code", () => {
      const { stdout, exitCode } = run(["validate", "--level", "off"], INVALID);
      expect(exitCode).toBe(2);
      // Should still show summary but no individual issues
      expect(stdout).not.toContain("missing_required");
    });
  });
});
