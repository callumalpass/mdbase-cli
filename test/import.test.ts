import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const VALID = path.resolve(__dirname, "fixtures/valid-collection");
const CSV_FILE = path.resolve(__dirname, "fixtures/import-data.csv");
const JSON_FILE = path.resolve(__dirname, "fixtures/import-data.json");

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

function trackImported(...names: string[]): void {
  for (const name of names) {
    createdFiles.push(path.join(VALID, name));
  }
}

afterEach(() => {
  for (const f of createdFiles) {
    if (existsSync(f)) {
      unlinkSync(f);
    }
  }
  createdFiles.length = 0;
});

describe("import command", () => {
  describe("import csv", () => {
    it("--dry-run shows what would be created", () => {
      const { stdout, exitCode } = run(
        ["import", "csv", CSV_FILE, "--dry-run", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.dry_run).toBe(true);
      expect(parsed.total).toBe(3);
      expect(parsed.created).toBe(3);
      expect(parsed.failed).toBe(0);
    });

    it("imports CSV files", () => {
      trackImported("import-1.md", "import-2.md", "import-3.md");
      const { stdout, exitCode } = run(
        ["import", "csv", CSV_FILE, "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.created).toBe(3);
      expect(existsSync(path.join(VALID, "import-1.md"))).toBe(true);
    });

    it("uses --path-field for file paths", () => {
      trackImported("import-1.md", "import-2.md", "import-3.md");
      const { stdout, exitCode } = run(
        ["import", "csv", CSV_FILE, "--path-field", "path", "--dry-run", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.files[0].path).toBe("import-1.md");
    });

    it("exits 4 for missing CSV file", () => {
      const { exitCode } = run(
        ["import", "csv", "nonexistent.csv"],
        VALID,
      );
      expect(exitCode).toBe(4);
    });
  });

  describe("import json", () => {
    it("--dry-run shows what would be created", () => {
      const { stdout, exitCode } = run(
        ["import", "json", JSON_FILE, "--dry-run", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.dry_run).toBe(true);
      expect(parsed.total).toBe(3);
      expect(parsed.created).toBe(3);
    });

    it("imports JSON files", () => {
      trackImported("import-1.md", "import-2.md", "import-3.md");
      const { stdout, exitCode } = run(
        ["import", "json", JSON_FILE, "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.created).toBe(3);
    });

    it("exits 4 for missing JSON file", () => {
      const { exitCode } = run(
        ["import", "json", "nonexistent.json"],
        VALID,
      );
      expect(exitCode).toBe(4);
    });
  });

  describe("error handling", () => {
    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["import", "csv", CSV_FILE], "/tmp");
      expect(exitCode).toBe(3);
    });
  });
});
