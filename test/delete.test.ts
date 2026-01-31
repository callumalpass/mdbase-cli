import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

// Store original file contents for restoration after delete tests
const originals = new Map<string, string>();
const createdFiles: string[] = [];

function backupFile(name: string): void {
  const fullPath = path.join(VALID, name);
  if (!originals.has(name)) {
    originals.set(name, readFileSync(fullPath, "utf-8"));
  }
}

function createTempFile(name: string, content: string): void {
  const fullPath = path.join(VALID, name);
  writeFileSync(fullPath, content);
  createdFiles.push(name);
}

afterEach(() => {
  const fs = require("node:fs");
  // Restore backed-up files (that were deleted during tests)
  for (const [name, content] of originals) {
    fs.writeFileSync(path.join(VALID, name), content);
  }
  originals.clear();
  // Clean up any temp files that weren't deleted by the test
  for (const name of createdFiles) {
    const fullPath = path.join(VALID, name);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
  createdFiles.length = 0;
});

describe("delete command", () => {
  describe("JSON format", () => {
    it("deletes a file and returns JSON", () => {
      createTempFile("temp-delete.md", "---\ntype: note\ntitle: Temp\n---\n");
      const { stdout, exitCode } = run(
        ["delete", "temp-delete.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.path).toBe("temp-delete.md");
      expect(parsed.deleted).toBe(true);
    });

    it("file is actually removed from disk", () => {
      createTempFile("temp-gone.md", "---\ntype: note\ntitle: Gone\n---\n");
      run(["delete", "temp-gone.md", "--format", "json"], VALID);
      expect(existsSync(path.join(VALID, "temp-gone.md"))).toBe(false);
    });

    it("returns error JSON for file not found", () => {
      const { stdout, exitCode } = run(
        ["delete", "nonexistent.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(4);
      const parsed = JSON.parse(stdout);
      expect(parsed.error.code).toBe("file_not_found");
    });

    it("omits broken_links when empty", () => {
      createTempFile("temp-no-links.md", "---\ntype: note\ntitle: NoLinks\n---\n");
      const { stdout } = run(
        ["delete", "temp-no-links.md", "--format", "json"],
        VALID,
      );
      const parsed = JSON.parse(stdout);
      expect(parsed.broken_links).toBeUndefined();
    });
  });

  describe("text format", () => {
    it("shows deleted message", () => {
      createTempFile("temp-text.md", "---\ntype: note\ntitle: TextDel\n---\n");
      const { stdout, exitCode } = run(
        ["delete", "temp-text.md"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("deleted");
      expect(stdout).toContain("temp-text.md");
    });
  });

  describe("YAML format", () => {
    it("outputs valid YAML", () => {
      createTempFile("temp-yaml.md", "---\ntype: note\ntitle: YamlDel\n---\n");
      const { stdout, exitCode } = run(
        ["delete", "temp-yaml.md", "--format", "yaml"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("path: temp-yaml.md");
      expect(stdout).toContain("deleted: true");
    });
  });

  describe("error handling", () => {
    it("exits 4 for file not found", () => {
      const { exitCode, stderr } = run(
        ["delete", "nonexistent.md"],
        VALID,
      );
      expect(exitCode).toBe(4);
      expect(stderr).toContain("File not found");
    });

    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["delete", "file.md"], "/tmp");
      expect(exitCode).toBe(3);
    });
  });

  describe("--no-check-backlinks", () => {
    it("skips backlink detection", () => {
      createTempFile("temp-nobl.md", "---\ntype: note\ntitle: NoBL\n---\n");
      const { stdout, exitCode } = run(
        ["delete", "temp-nobl.md", "--no-check-backlinks", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.deleted).toBe(true);
      // broken_links should not be present when check is skipped
      expect(parsed.broken_links).toBeUndefined();
    });
  });
});
