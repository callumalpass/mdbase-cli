import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

// Store original file contents for restoration
const originals = new Map<string, string>();

function backupFile(name: string): void {
  const fullPath = path.join(VALID, name);
  if (!originals.has(name)) {
    originals.set(name, readFileSync(fullPath, "utf-8"));
  }
}

afterEach(() => {
  const { writeFileSync } = require("node:fs");
  for (const [name, content] of originals) {
    writeFileSync(path.join(VALID, name), content);
  }
  originals.clear();
});

describe("update command", () => {
  describe("JSON format", () => {
    it("updates a single field", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "-f", "rating=3", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.path).toBe("hello.md");
      expect(parsed.frontmatter.rating).toBe(3);
      // Other fields preserved
      expect(parsed.frontmatter.title).toBe("Hello World");
      expect(parsed.frontmatter.tags).toEqual(["greeting", "test"]);
    });

    it("updates multiple fields", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "-f", "rating=1", "-f", "title=Updated Title", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.rating).toBe(1);
      expect(parsed.frontmatter.title).toBe("Updated Title");
    });

    it("updates body content", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "--body", "New body content", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.body).toBe("New body content");
    });

    it("updates both fields and body", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "-f", "rating=2", "--body", "New body", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.rating).toBe(2);
      expect(parsed.body).toBe("New body");
    });

    it("sets a field to null", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "-f", "title=null", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.title).toBeNull();
    });

    it("sets a boolean field", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "-f", "draft=true", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.draft).toBe(true);
    });

    it("sets a list field", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "-f", "tags=[x, y, z]", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.tags).toEqual(["x", "y", "z"]);
    });
  });

  describe("text format", () => {
    it("shows updated message with fields", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "-f", "rating=4"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("updated");
      expect(stdout).toContain("hello.md");
      expect(stdout).toContain("rating");
    });
  });

  describe("YAML format", () => {
    it("outputs valid YAML", () => {
      backupFile("hello.md");
      const { stdout, exitCode } = run(
        ["update", "hello.md", "-f", "rating=2", "--format", "yaml"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("path: hello.md");
      expect(stdout).toContain("rating: 2");
    });
  });

  describe("error handling", () => {
    it("exits 4 for file not found", () => {
      const { exitCode, stderr } = run(
        ["update", "nonexistent.md", "-f", "title=test"],
        VALID,
      );
      expect(exitCode).toBe(4);
      expect(stderr).toContain("File not found");
    });

    it("shows JSON error for file not found", () => {
      const { stdout, exitCode } = run(
        ["update", "nonexistent.md", "-f", "title=test", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(4);
      const parsed = JSON.parse(stdout);
      expect(parsed.error.code).toBe("file_not_found");
    });

    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["update", "file.md", "-f", "title=Test"], "/tmp");
      expect(exitCode).toBe(3);
    });

    it("exits 1 when no fields or body provided", () => {
      const { exitCode, stderr } = run(
        ["update", "hello.md"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("nothing to update");
    });

    it("exits 1 for invalid field format", () => {
      const { exitCode, stderr } = run(
        ["update", "hello.md", "-f", "no-equals-sign"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("invalid field format");
    });
  });

  describe("file persistence", () => {
    it("actually writes changes to disk", () => {
      backupFile("hello.md");
      // Update rating
      run(["update", "hello.md", "-f", "rating=1"], VALID);
      // Read back and verify
      const { stdout } = run(["read", "hello.md", "--format", "json"], VALID);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.rating).toBe(1);
    });
  });
});
