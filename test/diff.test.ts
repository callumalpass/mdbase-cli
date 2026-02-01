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

describe("diff command", () => {
  describe("JSON format", () => {
    it("shows field-level diff between two files", () => {
      const { stdout, exitCode } = run(
        ["diff", "hello.md", "ideas.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.a).toBe("hello.md");
      expect(parsed.b).toBe("ideas.md");
      expect(parsed.fields).toBeInstanceOf(Array);
      expect(parsed.identical).toBe(false);

      // rating should be changed
      const rating = parsed.fields.find((f: { field: string }) => f.field === "rating");
      expect(rating).toBeDefined();
      expect(rating.status).toBe("changed");
    });

    it("detects identical files", () => {
      const { stdout, exitCode } = run(
        ["diff", "hello.md", "hello.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.identical).toBe(true);
    });

    it("detects body differences", () => {
      const { stdout, exitCode } = run(
        ["diff", "hello.md", "project-alpha.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.body).toBeDefined();
      expect(parsed.body.changed).toBe(true);
    });

    it("--fields-only skips body comparison", () => {
      const { stdout, exitCode } = run(
        ["diff", "hello.md", "project-alpha.md", "--fields-only", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.body).toBeUndefined();
    });
  });

  describe("text format", () => {
    it("shows diff markers for changed fields", () => {
      const { stdout, exitCode } = run(
        ["diff", "hello.md", "ideas.md"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("~");
      expect(stdout).toContain("vs");
    });

    it("shows identical message when files match", () => {
      const { stdout, exitCode } = run(
        ["diff", "hello.md", "hello.md"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("identical");
    });
  });

  describe("error handling", () => {
    it("exits 4 for missing file", () => {
      const { exitCode } = run(["diff", "hello.md", "nonexistent.md"], VALID);
      expect(exitCode).toBe(4);
    });

    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["diff", "a.md", "b.md"], "/tmp");
      expect(exitCode).toBe(3);
    });

    it("shows JSON error for missing file", () => {
      const { stdout, exitCode } = run(
        ["diff", "hello.md", "nonexistent.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(4);
      const parsed = JSON.parse(stdout);
      expect(parsed.error).toBeDefined();
    });
  });
});
