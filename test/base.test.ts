import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const VALID = path.resolve(__dirname, "fixtures/valid-collection");

function run(
  args: string[],
  cwd: string,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI, ...args], {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; status: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.status ?? 1,
    };
  }
}

// Track temp files created during tests for cleanup
const createdFiles: string[] = [];

function createTempBase(name: string, content: string): void {
  const filePath = path.join(VALID, name);
  fs.writeFileSync(filePath, content, "utf-8");
  createdFiles.push(filePath);
}

afterEach(() => {
  for (const f of createdFiles) {
    try {
      fs.unlinkSync(f);
    } catch {}
  }
  createdFiles.length = 0;
});

// ── base run ──────────────────────────────────────────────────

describe("base run", () => {
  describe("basic execution", () => {
    it("runs a .base file with table output", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("path");
      expect(stdout).toContain("Hello World");
      expect(stdout).toContain("Project Alpha");
    });

    it("runs a .base file with JSON output", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.view.type).toBe("table");
      expect(parsed.view.name).toBe("All Notes");
      expect(parsed.results.length).toBe(5);
      expect(parsed.columns).toContain("file.name");
      expect(parsed.columns).toContain("title");
    });

    it("runs a .base file with YAML output", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--format", "yaml"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("view:");
      expect(stdout).toContain("type: table");
      expect(stdout).toContain("Hello World");
    });

    it("runs a .base file with CSV output", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--format", "csv"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const lines = stdout.trim().split("\n");
      expect(lines[0]).toContain("path");
      expect(lines[0]).toContain("title");
      expect(lines.length).toBe(6); // header + 5 rows
    });

    it("runs a .base file with paths output", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--format", "paths"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const paths = stdout.trim().split("\n");
      expect(paths).toContain("hello.md");
      expect(paths).toContain("project-alpha.md");
      expect(paths.length).toBe(5);
    });

    it("runs a .base file with JSONL output", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--format", "jsonl"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const lines = stdout.trim().split("\n");
      expect(lines.length).toBe(5);
      const first = JSON.parse(lines[0]);
      expect(first).toHaveProperty("path");
      expect(first).toHaveProperty("title");
    });
  });

  describe("filters", () => {
    it("applies global filter expression", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "filtered.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      // rating >= 4 → only hello.md (5) and project-alpha.md (4)
      expect(parsed.results.length).toBe(2);
      const paths = parsed.results.map((r: { path: string }) => r.path);
      expect(paths).toContain("hello.md");
      expect(paths).toContain("project-alpha.md");
    });

    it("applies structured AND filter", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "complex-filter.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      // rating >= 2 AND title != null AND rating <= 4 (view filter)
      const ratings = parsed.results.map(
        (r: { rating: number }) => r.rating,
      );
      for (const r of ratings) {
        expect(r).toBeGreaterThanOrEqual(2);
        expect(r).toBeLessThanOrEqual(4);
      }
    });

    it("combines global and view filters with AND", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "complex-filter.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      // hello.md (rating=5) should be excluded by view filter (rating <= 4)
      const paths = parsed.results.map((r: { path: string }) => r.path);
      expect(paths).not.toContain("hello.md");
      // no-type.md (rating=null) should be excluded by global filter (rating >= 2)
      expect(paths).not.toContain("no-type.md");
    });
  });

  describe("formulas", () => {
    it("evaluates formula columns", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "filtered.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.columns).toContain("formula.stars");
      // All results have rating >= 4, so stars should be "***"
      for (const row of parsed.results) {
        expect(row["formula.stars"]).toBe("***");
      }
    });

    it("includes formula columns in auto-detected fields", () => {
      createTempBase(
        "_test-formula.base",
        `formulas:\n  doubled: 'rating * 2'\nviews:\n  - type: table\n`,
      );
      const { stdout, exitCode } = run(
        ["base", "run", "_test-formula.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.columns).toContain("formula.doubled");
    });
  });

  describe("views", () => {
    it("renders multiple views", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "multi-view.base"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Table View");
      expect(stdout).toContain("Sorted View");
    });

    it("selects a specific view with --view", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "multi-view.base", "--view", "Sorted View", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.view.name).toBe("Sorted View");
    });

    it("applies groupBy sorting", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "multi-view.base", "--view", "Sorted View", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      // DESC sort by rating: 5, 4, 3, 2, null
      const ratings = parsed.results.map((r: { rating: number | null }) => r.rating);
      const nonNull = ratings.filter((r: number | null) => r != null);
      for (let i = 1; i < nonNull.length; i++) {
        expect(nonNull[i]).toBeLessThanOrEqual(nonNull[i - 1]);
      }
    });

    it("returns multi-view JSON as array", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "multi-view.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });
  });

  describe("overrides", () => {
    it("overrides limit with --limit", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--limit", "2", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBe(2);
      expect(parsed.meta.has_more).toBe(true);
      expect(parsed.meta.total_count).toBe(5);
    });

    it("overrides fields with --fields", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--fields", "title", "rating", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.columns).toEqual(["title", "rating"]);
      // Results should only have path + the specified columns
      for (const row of parsed.results) {
        expect(Object.keys(row).sort()).toEqual(["path", "rating", "title"]);
      }
    });
  });

  describe("column ordering", () => {
    it("respects view order for columns", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      // all-notes.base orders: file.name, note.title, note.rating, note.tags
      expect(parsed.columns).toEqual(["file.name", "title", "rating", "tags"]);
    });

    it("resolves file.name from path", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "all-notes.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      const hello = parsed.results.find(
        (r: { path: string }) => r.path === "hello.md",
      );
      expect(hello["file.name"]).toBe("hello.md");
    });
  });

  describe("display names", () => {
    it("uses display names in table headers", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "filtered.base"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Title");
      expect(stdout).toContain("Stars");
    });

    it("uses display names in CSV headers", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "filtered.base", "--format", "csv"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const header = stdout.split("\n")[0];
      expect(header).toContain("Title");
      expect(header).toContain("Stars");
    });
  });

  describe("error handling", () => {
    it("exits 4 for missing .base file", () => {
      const { exitCode, stderr } = run(
        ["base", "run", "nonexistent.base"],
        VALID,
      );
      expect(exitCode).toBe(4);
      expect(stderr).toContain("file not found");
    });

    it("exits 4 for missing file with JSON output", () => {
      const { stdout, exitCode } = run(
        ["base", "run", "nonexistent.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(4);
      const parsed = JSON.parse(stdout);
      expect(parsed.error.message).toContain("file not found");
    });

    it("exits 3 when no collection found", () => {
      createTempBase("_test-no-coll.base", "views:\n  - type: table\n");
      // Copy to /tmp so there's no mdbase.yaml
      const tmpFile = path.join("/tmp", "_test-no-coll.base");
      fs.copyFileSync(
        path.join(VALID, "_test-no-coll.base"),
        tmpFile,
      );
      try {
        const { exitCode, stderr } = run(
          ["base", "run", "_test-no-coll.base"],
          "/tmp",
        );
        expect(exitCode).toBe(3);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it("exits 1 for view not found", () => {
      const { exitCode, stderr } = run(
        ["base", "run", "multi-view.base", "--view", "Nonexistent"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("view not found");
    });

    it("shows available views on view not found error", () => {
      const { stderr } = run(
        ["base", "run", "multi-view.base", "--view", "Nonexistent"],
        VALID,
      );
      expect(stderr).toContain("Table View");
      expect(stderr).toContain("Sorted View");
    });
  });

  describe("empty .base file", () => {
    it("runs an empty .base file (shows all files)", () => {
      createTempBase("_test-empty.base", "");
      const { stdout, exitCode } = run(
        ["base", "run", "_test-empty.base", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBeGreaterThan(0);
    });
  });
});

// ── base validate ─────────────────────────────────────────────

describe("base validate", () => {
  it("validates a correct .base file", () => {
    const { stdout, exitCode } = run(
      ["base", "validate", "filtered.base"],
      VALID,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("valid");
    expect(stdout).toContain("1 view");
    expect(stdout).toContain("1 formula");
  });

  it("validates a correct .base file with JSON output", () => {
    const { stdout, exitCode } = run(
      ["base", "validate", "filtered.base", "--format", "json"],
      VALID,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.views).toBe(1);
    expect(parsed.formulas).toBe(1);
  });

  it("detects unknown view type", () => {
    const { stdout, exitCode } = run(
      ["base", "validate", "invalid.base"],
      VALID,
    );
    expect(exitCode).toBe(2);
    expect(stdout).toContain("unknown view type");
  });

  it("detects invalid limit", () => {
    const { stdout, exitCode } = run(
      ["base", "validate", "invalid.base"],
      VALID,
    );
    expect(exitCode).toBe(2);
    expect(stdout).toContain("limit must be a positive number");
  });

  it("detects missing groupBy property", () => {
    const { stdout, exitCode } = run(
      ["base", "validate", "invalid.base"],
      VALID,
    );
    expect(exitCode).toBe(2);
    expect(stdout).toContain("groupBy requires a property");
  });

  it("detects invalid groupBy direction", () => {
    const { stdout, exitCode } = run(
      ["base", "validate", "invalid.base"],
      VALID,
    );
    expect(exitCode).toBe(2);
    expect(stdout).toContain("groupBy direction must be ASC or DESC");
  });

  it("detects self-referencing formula", () => {
    const { stdout, exitCode } = run(
      ["base", "validate", "invalid.base"],
      VALID,
    );
    expect(exitCode).toBe(2);
    expect(stdout).toContain("self-referencing formula");
  });

  it("returns all issues in JSON format", () => {
    const { stdout, exitCode } = run(
      ["base", "validate", "invalid.base", "--format", "json"],
      VALID,
    );
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.length).toBeGreaterThanOrEqual(5);
  });

  it("exits 4 for missing file", () => {
    const { exitCode, stderr } = run(
      ["base", "validate", "nonexistent.base"],
      VALID,
    );
    expect(exitCode).toBe(4);
    expect(stderr).toContain("file not found");
  });

  it("exits 2 for YAML syntax error", () => {
    createTempBase("_test-bad-yaml.base", ":\n  : [\ninvalid yaml {{{}}}");
    const { exitCode } = run(
      ["base", "validate", "_test-bad-yaml.base"],
      VALID,
    );
    expect(exitCode).toBe(2);
  });

  it("validates an empty file as valid", () => {
    createTempBase("_test-empty-v.base", "");
    const { stdout, exitCode } = run(
      ["base", "validate", "_test-empty-v.base"],
      VALID,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("valid");
  });
});

// ── base inspect ──────────────────────────────────────────────

describe("base inspect", () => {
  it("shows text overview of a .base file", () => {
    const { stdout, exitCode } = run(
      ["base", "inspect", "filtered.base"],
      VALID,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("filtered.base");
    expect(stdout).toContain("Filters:");
    expect(stdout).toContain("rating >= 4");
    expect(stdout).toContain("Formulas:");
    expect(stdout).toContain("stars");
    expect(stdout).toContain("Properties:");
    expect(stdout).toContain("Views (1):");
    expect(stdout).toContain("High Rated");
  });

  it("shows JSON structure of a .base file", () => {
    const { stdout, exitCode } = run(
      ["base", "inspect", "filtered.base", "--format", "json"],
      VALID,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.filters).toBe("rating >= 4");
    expect(parsed.formulas.stars).toContain("if(rating >= 4");
    expect(parsed.views).toHaveLength(1);
    expect(parsed.views[0].type).toBe("table");
    expect(parsed.views[0].name).toBe("High Rated");
  });

  it("shows YAML structure of a .base file", () => {
    const { stdout, exitCode } = run(
      ["base", "inspect", "filtered.base", "--format", "yaml"],
      VALID,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("filters: rating >= 4");
    expect(stdout).toContain("type: table");
    expect(stdout).toContain("name: High Rated");
  });

  it("shows structured filters in text format", () => {
    const { stdout, exitCode } = run(
      ["base", "inspect", "complex-filter.base"],
      VALID,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("AND:");
    expect(stdout).toContain("rating >= 2");
  });

  it("shows view details in text format", () => {
    const { stdout, exitCode } = run(
      ["base", "inspect", "multi-view.base"],
      VALID,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Views (2):");
    expect(stdout).toContain("Table View");
    expect(stdout).toContain("Sorted View");
    expect(stdout).toContain("group by:");
    expect(stdout).toContain("note.rating");
  });

  it("exits 4 for missing file", () => {
    const { exitCode, stderr } = run(
      ["base", "inspect", "nonexistent.base"],
      VALID,
    );
    expect(exitCode).toBe(4);
    expect(stderr).toContain("file not found");
  });

  it("shows empty file as empty structure", () => {
    createTempBase("_test-empty-i.base", "");
    const { stdout, exitCode } = run(
      ["base", "inspect", "_test-empty-i.base", "--format", "json"],
      VALID,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({});
  });
});
