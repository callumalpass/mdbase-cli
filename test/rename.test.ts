import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, rmdirSync } from "node:fs";
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

// Track files to restore or clean up after each test
const originals = new Map<string, string>();
const createdFiles: string[] = [];
const createdDirs: string[] = [];

function backupFile(name: string): void {
  const fullPath = path.join(VALID, name);
  if (!originals.has(name)) {
    originals.set(name, readFileSync(fullPath, "utf-8"));
  }
}

function createTempFile(name: string, content: string): void {
  const fullPath = path.join(VALID, name);
  const dir = path.dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    createdDirs.push(path.relative(VALID, dir));
  }
  writeFileSync(fullPath, content);
  createdFiles.push(name);
}

afterEach(() => {
  // Restore backed-up files
  for (const [name, content] of originals) {
    writeFileSync(path.join(VALID, name), content);
  }
  originals.clear();

  // Clean up created files (both source and destination of renames)
  for (const name of createdFiles) {
    const fullPath = path.join(VALID, name);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }
  createdFiles.length = 0;

  // Clean up created directories (in reverse order for nested dirs)
  for (const dir of createdDirs.reverse()) {
    const fullPath = path.join(VALID, dir);
    if (existsSync(fullPath)) {
      try { rmdirSync(fullPath); } catch { /* non-empty, skip */ }
    }
  }
  createdDirs.length = 0;
});

describe("rename command", () => {
  describe("JSON format", () => {
    it("renames a file and returns JSON", () => {
      createTempFile("temp-rename.md", "---\ntype: note\ntitle: Rename Me\n---\n");
      createdFiles.push("renamed-result.md"); // track destination too
      const { stdout, exitCode } = run(
        ["rename", "temp-rename.md", "renamed-result.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.from).toBe("temp-rename.md");
      expect(parsed.to).toBe("renamed-result.md");
    });

    it("file is actually moved on disk", () => {
      createTempFile("temp-move-src.md", "---\ntype: note\ntitle: Move\n---\n");
      createdFiles.push("temp-move-dst.md");
      run(["rename", "temp-move-src.md", "temp-move-dst.md", "--format", "json"], VALID);
      expect(existsSync(path.join(VALID, "temp-move-src.md"))).toBe(false);
      expect(existsSync(path.join(VALID, "temp-move-dst.md"))).toBe(true);
    });

    it("preserves file content after rename", () => {
      const content = "---\ntype: note\ntitle: Preserved\ntags:\n  - important\n---\nBody text here.\n";
      createTempFile("temp-preserve-src.md", content);
      createdFiles.push("temp-preserve-dst.md");
      run(["rename", "temp-preserve-src.md", "temp-preserve-dst.md", "--format", "json"], VALID);
      const result = readFileSync(path.join(VALID, "temp-preserve-dst.md"), "utf-8");
      expect(result).toBe(content);
    });

    it("returns error JSON for file not found", () => {
      const { stdout, exitCode } = run(
        ["rename", "nonexistent.md", "foo.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(4);
      const parsed = JSON.parse(stdout);
      expect(parsed.error.code).toBe("file_not_found");
    });

    it("returns error JSON for target conflict", () => {
      const { stdout, exitCode } = run(
        ["rename", "hello.md", "ideas.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.error.code).toBe("path_conflict");
    });

    it("omits references_updated when empty", () => {
      createTempFile("temp-no-refs.md", "---\ntype: note\ntitle: NoRefs\n---\n");
      createdFiles.push("temp-no-refs-new.md");
      const { stdout } = run(
        ["rename", "temp-no-refs.md", "temp-no-refs-new.md", "--format", "json"],
        VALID,
      );
      const parsed = JSON.parse(stdout);
      expect(parsed.references_updated).toBeUndefined();
    });
  });

  describe("text format", () => {
    it("shows renamed message with arrow", () => {
      createTempFile("temp-text.md", "---\ntype: note\ntitle: TextRen\n---\n");
      createdFiles.push("temp-text-new.md");
      const { stdout, exitCode } = run(
        ["rename", "temp-text.md", "temp-text-new.md"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("renamed");
      expect(stdout).toContain("temp-text.md");
      expect(stdout).toContain("temp-text-new.md");
    });
  });

  describe("YAML format", () => {
    it("outputs valid YAML", () => {
      createTempFile("temp-yaml.md", "---\ntype: note\ntitle: YamlRen\n---\n");
      createdFiles.push("temp-yaml-new.md");
      const { stdout, exitCode } = run(
        ["rename", "temp-yaml.md", "temp-yaml-new.md", "--format", "yaml"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("from: temp-yaml.md");
      expect(stdout).toContain("to: temp-yaml-new.md");
    });
  });

  describe("--no-refs", () => {
    it("skips reference updates", () => {
      createTempFile("temp-norefs.md", "---\ntype: note\ntitle: NoRefs\n---\n");
      createdFiles.push("temp-norefs-new.md");
      const { stdout, exitCode } = run(
        ["rename", "temp-norefs.md", "temp-norefs-new.md", "--no-refs", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.from).toBe("temp-norefs.md");
      expect(parsed.to).toBe("temp-norefs-new.md");
      // With --no-refs, references_updated should not be present
      expect(parsed.references_updated).toBeUndefined();
    });
  });

  describe("subdirectory rename", () => {
    it("creates parent directories for target path", () => {
      createTempFile("temp-subdir.md", "---\ntype: note\ntitle: Subdir\n---\n");
      createdFiles.push("subdir/temp-subdir.md");
      createdDirs.push("subdir");
      const { exitCode } = run(
        ["rename", "temp-subdir.md", "subdir/temp-subdir.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(existsSync(path.join(VALID, "subdir/temp-subdir.md"))).toBe(true);
      expect(existsSync(path.join(VALID, "temp-subdir.md"))).toBe(false);
    });
  });

  describe("error handling", () => {
    it("exits 4 for file not found", () => {
      const { exitCode, stderr } = run(
        ["rename", "nonexistent.md", "foo.md"],
        VALID,
      );
      expect(exitCode).toBe(4);
      expect(stderr).toContain("Source not found");
    });

    it("exits 1 for target conflict", () => {
      const { exitCode, stderr } = run(
        ["rename", "hello.md", "ideas.md"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Target exists");
    });

    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["rename", "a.md", "b.md"], "/tmp");
      expect(exitCode).toBe(3);
    });
  });
});
