import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
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

const createdFiles: string[] = [];

afterEach(() => {
  for (const f of createdFiles) {
    if (existsSync(f)) {
      unlinkSync(f);
    }
  }
  createdFiles.length = 0;
});

describe("export command", () => {
  describe("JSON format", () => {
    it("exports all files as JSON", () => {
      const { stdout, exitCode } = run(["export", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThanOrEqual(5);
      for (const r of parsed) {
        expect(r).toHaveProperty("path");
        expect(r).toHaveProperty("types");
        expect(r).toHaveProperty("frontmatter");
      }
    });

    it("filters by type", () => {
      const { stdout, exitCode } = run(
        ["export", "--format", "json", "--types", "note"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed) {
        expect(r.types).toContain("note");
      }
    });

    it("filters with --where", () => {
      const { stdout, exitCode } = run(
        ["export", "--format", "json", "--where", "rating >= 4"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed) {
        expect(r.frontmatter.rating).toBeGreaterThanOrEqual(4);
      }
    });

    it("selects specific fields", () => {
      const { stdout, exitCode } = run(
        ["export", "--format", "json", "--fields", "title"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed) {
        const keys = Object.keys(r.frontmatter);
        expect(keys.length).toBeLessThanOrEqual(1);
        if (keys.length > 0) {
          expect(keys[0]).toBe("title");
        }
      }
    });
  });

  describe("CSV format", () => {
    it("exports as CSV with header", () => {
      const { stdout, exitCode } = run(["export", "--format", "csv"], VALID);
      expect(exitCode).toBe(0);
      const lines = stdout.trim().split("\n");
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain("path");
      expect(lines[0]).toContain("types");
    });
  });

  describe("file output", () => {
    it("writes to file with --output", () => {
      const outFile = path.join(VALID, "test-export.json");
      createdFiles.push(outFile);
      const { stdout, exitCode } = run(
        ["export", "--format", "json", "--output", outFile],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Exported");
      expect(existsSync(outFile)).toBe(true);
    });
  });

  describe("error handling", () => {
    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["export"], "/tmp");
      expect(exitCode).toBe(3);
    });

    it("exits 1 for sqlite format", () => {
      const { exitCode, stderr } = run(["export", "--format", "sqlite"], VALID);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("sqlite");
    });
  });
});
