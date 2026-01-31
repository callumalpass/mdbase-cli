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

describe("read command", () => {
  describe("JSON format", () => {
    it("reads a typed file", () => {
      const { stdout, exitCode } = run(["read", "hello.md", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.path).toBe("hello.md");
      expect(parsed.types).toEqual(["note"]);
      expect(parsed.frontmatter.title).toBe("Hello World");
      expect(parsed.frontmatter.rating).toBe(5);
      expect(parsed.frontmatter.tags).toEqual(["greeting", "test"]);
      expect(parsed.file).toBeDefined();
      expect(parsed.file.name).toBe("hello.md");
      expect(parsed.file.size).toBeGreaterThan(0);
    });

    it("reads an untyped file", () => {
      const { stdout, exitCode } = run(["read", "no-type.md", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.path).toBe("no-type.md");
      expect(parsed.types).toEqual([]);
      expect(parsed.frontmatter.title).toBe("Untyped File");
    });

    it("includes body when requested", () => {
      const { stdout, exitCode } = run(["read", "hello.md", "--format", "json", "--body"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.body).toBeDefined();
      expect(parsed.body).toContain("This is a valid note.");
    });

    it("excludes body by default", () => {
      const { stdout, exitCode } = run(["read", "hello.md", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.body).toBeUndefined();
    });
  });

  describe("text format", () => {
    it("shows path and types", () => {
      const { stdout, exitCode } = run(["read", "hello.md"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("hello.md");
      expect(stdout).toContain("types: note");
    });

    it("shows frontmatter fields", () => {
      const { stdout, exitCode } = run(["read", "hello.md"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("title");
      expect(stdout).toContain("Hello World");
      expect(stdout).toContain("rating");
      expect(stdout).toContain("5");
    });

    it("shows file metadata", () => {
      const { stdout, exitCode } = run(["read", "hello.md"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("file:");
      expect(stdout).toContain("size:");
      expect(stdout).toContain("bytes");
      expect(stdout).toContain("mtime:");
    });

    it("shows body with --body", () => {
      const { stdout, exitCode } = run(["read", "hello.md", "--body"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("---");
      expect(stdout).toContain("This is a valid note.");
    });
  });

  describe("YAML format", () => {
    it("outputs valid YAML", () => {
      const { stdout, exitCode } = run(["read", "hello.md", "--format", "yaml"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("path: hello.md");
      expect(stdout).toContain("title: Hello World");
      expect(stdout).toContain("rating: 5");
    });
  });

  describe("error handling", () => {
    it("exits 4 for missing file", () => {
      const { exitCode } = run(["read", "nonexistent.md"], VALID);
      expect(exitCode).toBe(4);
    });

    it("shows JSON error for missing file", () => {
      const { stdout, exitCode } = run(["read", "nonexistent.md", "--format", "json"], VALID);
      expect(exitCode).toBe(4);
      const parsed = JSON.parse(stdout);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBe("file_not_found");
    });

    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["read", "file.md"], "/tmp");
      expect(exitCode).toBe(3);
    });
  });
});
