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

describe("graph command", () => {
  describe("graph orphans", () => {
    it("finds orphan files (JSON)", () => {
      const { stdout, exitCode } = run(
        ["graph", "orphans", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.orphans).toBeInstanceOf(Array);
      expect(parsed.count).toBe(parsed.orphans.length);
      // Files with no links should be orphans
      expect(parsed.orphans.length).toBeGreaterThan(0);
    });

    it("text format lists orphans", () => {
      const { stdout, exitCode } = run(["graph", "orphans"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("orphan");
    });
  });

  describe("graph broken", () => {
    it("finds broken links (JSON)", () => {
      const { stdout, exitCode } = run(
        ["graph", "broken", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.broken).toBeInstanceOf(Array);
      expect(parsed.count).toBe(parsed.broken.length);
      // broken-link-note.md has links to nonexistent and also-missing
      expect(parsed.broken.length).toBeGreaterThanOrEqual(2);
      const targets = parsed.broken.map((b: { target: string }) => b.target);
      expect(targets).toContain("nonexistent");
      expect(targets).toContain("also-missing");
    });

    it("text format shows broken links", () => {
      const { stdout, exitCode } = run(["graph", "broken"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("broken link");
      expect(stdout).toContain("nonexistent");
    });
  });

  describe("graph backlinks", () => {
    it("finds backlinks to a file (JSON)", () => {
      const { stdout, exitCode } = run(
        ["graph", "backlinks", "hello.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.path).toBe("hello.md");
      expect(parsed.backlinks).toBeInstanceOf(Array);
      // linked-note.md has related: "[[hello]]"
      expect(parsed.backlinks).toContain("linked-note.md");
    });

    it("exits 4 for missing file", () => {
      const { exitCode } = run(["graph", "backlinks", "nonexistent.md"], VALID);
      expect(exitCode).toBe(4);
    });

    it("shows no backlinks for unlinked file", () => {
      const { stdout, exitCode } = run(
        ["graph", "backlinks", "no-type.md", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.backlinks.length).toBe(0);
    });
  });

  describe("graph stats", () => {
    it("returns graph statistics (JSON)", () => {
      const { stdout, exitCode } = run(
        ["graph", "stats", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.nodes).toBeGreaterThanOrEqual(5);
      expect(typeof parsed.edges).toBe("number");
      expect(typeof parsed.broken_edges).toBe("number");
      expect(typeof parsed.orphans).toBe("number");
      expect(typeof parsed.connected_components).toBe("number");
      expect(typeof parsed.density).toBe("number");
      expect(parsed.edges).toBeGreaterThan(0);
    });

    it("text format shows stats", () => {
      const { stdout, exitCode } = run(["graph", "stats"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Graph Stats");
      expect(stdout).toContain("Nodes:");
      expect(stdout).toContain("Edges:");
    });
  });

  describe("error handling", () => {
    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["graph", "stats"], "/tmp");
      expect(exitCode).toBe(3);
    });
  });
});
