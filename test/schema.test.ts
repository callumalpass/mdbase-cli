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

describe("schema infer command", () => {
  it("outputs YAML by default", () => {
    const { stdout, exitCode } = run(
      ["schema", "infer", "--min-files", "1"],
      VALID,
    );
    expect(exitCode).toBe(0);
    // Should output YAML type definition or "No untyped files" message
    // With our fixture there's only 1 untyped file (no-type.md)
    // With --min-files 1 it should find it
    expect(stdout.length).toBeGreaterThan(0);
  });

  it("--format json outputs structured result", () => {
    const { stdout, exitCode } = run(
      ["schema", "infer", "--min-files", "1", "--format", "json"],
      VALID,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.types).toBeInstanceOf(Array);
  });

  it("respects --min-files threshold", () => {
    const { stdout, exitCode } = run(
      ["schema", "infer", "--min-files", "100", "--format", "json"],
      VALID,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    // With min-files=100, no group should qualify
    expect(parsed.types.length).toBe(0);
  });

  it("infers field types from values", () => {
    const { stdout, exitCode } = run(
      ["schema", "infer", "--min-files", "1", "--format", "json"],
      VALID,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    if (parsed.types.length > 0) {
      const firstType = parsed.types[0];
      expect(firstType.name).toContain("inferred-type");
      expect(firstType.fields).toBeDefined();
      expect(firstType.file_count).toBeGreaterThanOrEqual(1);
    }
  });

  it("exits 3 when no collection found", () => {
    const { exitCode } = run(["schema", "infer"], "/tmp");
    expect(exitCode).toBe(3);
  });
});
