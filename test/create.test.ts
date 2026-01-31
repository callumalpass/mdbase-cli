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

// Track files created during tests for cleanup
const createdFiles: string[] = [];

afterEach(() => {
  for (const f of createdFiles) {
    if (existsSync(f)) {
      unlinkSync(f);
    }
  }
  createdFiles.length = 0;
});

function trackFile(name: string): string {
  const fullPath = path.join(VALID, name);
  createdFiles.push(fullPath);
  return name;
}

describe("create command", () => {
  describe("JSON format", () => {
    it("creates a typed file with fields", () => {
      const file = trackFile("create-test-1.md");
      const { stdout, exitCode } = run(
        ["create", file, "-t", "note", "-f", "title=Test Note", "-f", "rating=4", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.path).toBe(file);
      expect(parsed.frontmatter.title).toBe("Test Note");
      expect(parsed.frontmatter.rating).toBe(4);
      expect(parsed.frontmatter.type).toBe("note");
    });

    it("creates a file with list fields", () => {
      const file = trackFile("create-test-2.md");
      const { stdout, exitCode } = run(
        ["create", file, "-t", "note", "-f", "title=Tagged", "-f", "tags=[a, b, c]", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.tags).toEqual(["a", "b", "c"]);
    });

    it("creates a file with body", () => {
      const file = trackFile("create-test-3.md");
      const { stdout, exitCode } = run(
        ["create", file, "-t", "note", "-f", "title=With Body", "--body", "Hello world", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.body).toBe("Hello world");
    });

    it("creates a file without type", () => {
      const file = trackFile("create-test-4.md");
      const { stdout, exitCode } = run(
        ["create", file, "-f", "title=Untyped", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.path).toBe(file);
      expect(parsed.frontmatter.title).toBe("Untyped");
    });
  });

  describe("text format", () => {
    it("shows created message with fields", () => {
      const file = trackFile("create-test-5.md");
      const { stdout, exitCode } = run(
        ["create", file, "-t", "note", "-f", "title=Text Test"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("created");
      expect(stdout).toContain(file);
      expect(stdout).toContain("title");
      expect(stdout).toContain("Text Test");
    });
  });

  describe("YAML format", () => {
    it("outputs valid YAML", () => {
      const file = trackFile("create-test-6.md");
      const { stdout, exitCode } = run(
        ["create", file, "-t", "note", "-f", "title=YAML Test", "--format", "yaml"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("path: " + file);
      expect(stdout).toContain("title: YAML Test");
    });
  });

  describe("field parsing", () => {
    it("parses boolean values", () => {
      const file = trackFile("create-test-7.md");
      const { stdout, exitCode } = run(
        ["create", file, "-f", "title=Bool Test", "-f", "draft=true", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.draft).toBe(true);
    });

    it("parses integer values", () => {
      const file = trackFile("create-test-8.md");
      const { stdout, exitCode } = run(
        ["create", file, "-t", "note", "-f", "title=Int Test", "-f", "rating=3", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.frontmatter.rating).toBe(3);
    });
  });

  describe("error handling", () => {
    it("exits 1 for path conflict", () => {
      const { exitCode, stderr } = run(
        ["create", "hello.md", "-t", "note", "-f", "title=Dup"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("already exists");
    });

    it("shows JSON error for path conflict", () => {
      const { stdout, exitCode } = run(
        ["create", "hello.md", "-t", "note", "-f", "title=Dup", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.error.code).toBe("path_conflict");
    });

    it("exits 1 for unknown type", () => {
      const { exitCode, stderr } = run(
        ["create", "test.md", "-t", "nonexistent", "-f", "title=Test"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Unknown type");
    });

    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["create", "file.md", "-f", "title=Test"], "/tmp");
      expect(exitCode).toBe(3);
    });

    it("exits 1 for invalid field format", () => {
      const file = trackFile("create-test-err.md");
      const { exitCode, stderr } = run(
        ["create", file, "-f", "no-equals-sign"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("invalid field format");
    });
  });
});
