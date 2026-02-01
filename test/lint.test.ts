import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const VALID = path.resolve(__dirname, "fixtures/valid-collection");
const INVALID = path.resolve(__dirname, "fixtures/invalid-collection");

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

describe("lint command", () => {
  it("exits 0 for valid collection", () => {
    const { stdout, exitCode } = run(["lint"], VALID);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("clean");
  });

  it("exits 2 for invalid collection", () => {
    const { exitCode } = run(["lint"], INVALID);
    expect(exitCode).toBe(2);
  });

  it("--format json outputs structured summary", () => {
    const { stdout, exitCode } = run(["lint", "--format", "json"], VALID);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.files).toBeGreaterThan(0);
    expect(parsed.summary).toBeDefined();
    expect(typeof parsed.summary.errors).toBe("number");
    expect(typeof parsed.summary.warnings).toBe("number");
  });

  it("lints a single file", () => {
    const { stdout, exitCode } = run(["lint", "hello.md"], VALID);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("clean");
  });

  it("reports errors for invalid file", () => {
    const { stdout, exitCode } = run(["lint", "bad.md", "--format", "json"], INVALID);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout);
    expect(parsed.summary.errors).toBeGreaterThan(0);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("exits 3 when no collection found", () => {
    const { exitCode } = run(["lint"], "/tmp");
    expect(exitCode).toBe(3);
  });
});
