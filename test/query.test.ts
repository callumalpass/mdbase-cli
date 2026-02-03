import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const VALID = path.resolve(__dirname, "fixtures/valid-collection");

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

describe("query command", () => {
  describe("basic queries", () => {
    it("lists all files with no expression", () => {
      const { stdout, exitCode } = run(["query", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBeGreaterThanOrEqual(4);
      expect(parsed.meta.total_count).toBe(parsed.results.length);
    });

    it("filters with where expression", () => {
      const { stdout, exitCode } = run(
        ["query", "rating >= 4", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBe(2);
      for (const r of parsed.results) {
        expect(r.frontmatter.rating).toBeGreaterThanOrEqual(4);
      }
    });

    it("filters by type", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed.results) {
        expect(r.types).toContain("note");
      }
      // no-type.md should be excluded
      expect(parsed.results.every((r: { path: string }) => r.path !== "no-type.md")).toBe(true);
    });

    it("filters with method expressions", () => {
      const { stdout, exitCode } = run(
        ["query", "tags.contains('project')", "--format", "paths"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const paths = stdout.trim().split("\n");
      expect(paths).toContain("project-alpha.md");
      expect(paths).toContain("project-beta.md");
      expect(paths).not.toContain("hello.md");
    });
  });

  describe("ordering and pagination", () => {
    it("sorts ascending by default", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--order-by", "rating", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      const ratings = parsed.results.map((r: { frontmatter: { rating: number } }) => r.frontmatter.rating);
      for (let i = 1; i < ratings.length; i++) {
        expect(ratings[i]).toBeGreaterThanOrEqual(ratings[i - 1]);
      }
    });

    it("sorts descending with - prefix", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--order-by", "-rating", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      const ratings = parsed.results.map((r: { frontmatter: { rating: number } }) => r.frontmatter.rating);
      for (let i = 1; i < ratings.length; i++) {
        expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1]);
      }
    });

    it("limits results", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--limit", "2", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBe(2);
      expect(parsed.meta.has_more).toBe(true);
      expect(parsed.meta.total_count).toBeGreaterThan(2);
    });

    it("offsets results", () => {
      const all = JSON.parse(
        run(["query", "--types", "note", "--order-by", "title", "--format", "json"], VALID).stdout,
      );
      const offset = JSON.parse(
        run(["query", "--types", "note", "--order-by", "title", "--offset", "2", "--format", "json"], VALID).stdout,
      );
      expect(offset.results[0].path).toBe(all.results[2].path);
    });
  });

  describe("output formats", () => {
    it("outputs paths", () => {
      const { stdout, exitCode } = run(
        ["query", "rating == 5", "--format", "paths"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe("hello.md");
    });

    it("outputs CSV with header", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--fields", "title,rating", "--format", "csv"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const lines = stdout.trim().split("\n");
      expect(lines[0]).toBe("path,title,rating");
      expect(lines.length).toBeGreaterThan(1);
      // Check a data row has the right number of columns
      expect(lines[1].split(",").length).toBe(3);
    });

    it("outputs JSONL", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--format", "jsonl"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty("path");
        expect(parsed).toHaveProperty("frontmatter");
      }
    });

    it("outputs table format by default", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--fields", "title,rating"],
        VALID,
      );
      expect(exitCode).toBe(0);
      // cli-table3 uses box drawing characters
      expect(stdout).toContain("│");
      expect(stdout).toContain("title");
      expect(stdout).toContain("rating");
    });
  });

  describe("field selection", () => {
    it("shows only specified fields", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--fields", "title", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed.results) {
        expect(Object.keys(r.frontmatter)).toEqual(["title"]);
      }
    });
  });

  describe("formulas", () => {
    it("computes and displays formulas", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--formula", "tagCount=len(tags)", "--fields", "title,tagCount", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed.results) {
        expect(r.frontmatter).toHaveProperty("tagCount");
        expect(typeof r.frontmatter.tagCount).toBe("number");
      }
    });
  });

  describe("--count", () => {
    it("outputs only the result count", () => {
      const { stdout, exitCode } = run(["query", "--count"], VALID);
      expect(exitCode).toBe(0);
      const count = parseInt(stdout.trim(), 10);
      expect(count).toBeGreaterThanOrEqual(4);
    });

    it("counts with filter", () => {
      const { stdout, exitCode } = run(
        ["query", "rating >= 4", "--count"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe("2");
    });
  });

  describe("error handling", () => {
    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["query"], "/tmp");
      expect(exitCode).toBe(3);
    });

    it("exits 1 for invalid expression", () => {
      const { stdout, exitCode } = run(
        ["query", "unknown_func_xyz()", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBe("unknown_function");
    });

    it("exits 0 with empty results for non-matching query", () => {
      const { stdout, exitCode } = run(
        ["query", "rating > 999", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results).toEqual([]);
    });
  });

  describe("variadic option bug fix", () => {
    it("does not absorb expression into --types", () => {
      // Regression test: expression was being consumed by variadic --types
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "rating >= 4", "--count"],
        VALID,
      );
      expect(exitCode).toBe(0);
      // Should be 2 (notes with rating >= 4), not all notes
      expect(stdout.trim()).toBe("2");
    });

    it("combines --types with expression when expression comes first", () => {
      const { stdout, exitCode } = run(
        ["query", "rating >= 4", "--types", "note", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBe(2);
      for (const r of parsed.results) {
        expect(r.types).toContain("note");
        expect(r.frontmatter.rating).toBeGreaterThanOrEqual(4);
      }
    });

    it("combines --types with expression when --types comes first", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "rating >= 4", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBe(2);
      for (const r of parsed.results) {
        expect(r.types).toContain("note");
        expect(r.frontmatter.rating).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe("comma-separated options", () => {
    it("parses comma-separated --types", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note,project", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBeGreaterThan(0);
      for (const r of parsed.results) {
        expect(r.types.some((t: string) => t === "note" || t === "project")).toBe(true);
      }
    });

    it("parses comma-separated --fields", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--fields", "title,rating", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed.results) {
        expect(Object.keys(r.frontmatter).sort()).toEqual(["rating", "title"]);
      }
    });

    it("parses comma-separated --order-by", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--order-by", "-rating,title", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      // Results should be sorted by rating desc first
      const ratings = parsed.results.map((r: { frontmatter: { rating: number } }) => r.frontmatter.rating);
      for (let i = 1; i < ratings.length; i++) {
        expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1]);
      }
    });

    it("trims whitespace in comma-separated values", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", " note , project ", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it("filters empty segments in comma-separated values", () => {
      const { stdout, exitCode } = run(
        ["query", "--types", "note,,", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed.results) {
        expect(r.types).toContain("note");
      }
    });
  });

  describe("repeatable --formula", () => {
    it("accepts multiple --formula flags", () => {
      const { stdout, exitCode } = run(
        [
          "query", "--types", "note",
          "--formula", "tagCount=len(tags)",
          "--formula", "doubled=rating * 2",
          "--fields", "title,tagCount,doubled",
          "--format", "json",
        ],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed.results) {
        expect(r.frontmatter).toHaveProperty("tagCount");
        expect(r.frontmatter).toHaveProperty("doubled");
      }
    });

    it("handles formula expressions containing commas", () => {
      // This verifies --formula uses repeatable flag, not comma-separation
      const { stdout, exitCode } = run(
        ["query", "--types", "note", "--formula", "highRating=if(rating > 3, 'high', 'low')", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      for (const r of parsed.results) {
        expect(r.frontmatter).toHaveProperty("highRating");
      }
    });
  });
});
