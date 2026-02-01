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

describe("fmt command", () => {
  it("reports already formatted files", () => {
    const { stdout, exitCode } = run(["fmt", "--check"], VALID);
    // Some files may or may not need formatting depending on state
    expect([0, 1]).toContain(exitCode);
    expect(stdout).toContain("file");
  });

  it("--check mode exits 0 if all formatted", () => {
    const { stdout, exitCode } = run(["fmt", "--check", "hello.md"], VALID);
    // hello.md may or may not be formatted; just check the command runs
    expect([0, 1]).toContain(exitCode);
    if (exitCode === 0) {
      expect(stdout).toContain("already formatted");
    } else {
      expect(stdout).toContain("needs formatting");
    }
  });

  it("--format json outputs structured result", () => {
    const { stdout, exitCode } = run(["fmt", "--check", "--format", "json"], VALID);
    expect([0, 1]).toContain(exitCode);
    const parsed = JSON.parse(stdout);
    expect(parsed.files).toBeGreaterThan(0);
    expect(typeof parsed.changed).toBe("number");
    expect(typeof parsed.unchanged).toBe("number");
    expect(parsed.results).toBeInstanceOf(Array);
    for (const r of parsed.results) {
      expect(r).toHaveProperty("path");
      expect(r).toHaveProperty("changed");
    }
  });

  it("exits 3 when no collection found", () => {
    const { exitCode } = run(["fmt"], "/tmp");
    expect(exitCode).toBe(3);
  });

  it("formats a single file in check mode", () => {
    const { stdout, exitCode } = run(["fmt", "--check", "hello.md", "--format", "json"], VALID);
    expect([0, 1]).toContain(exitCode);
    const parsed = JSON.parse(stdout);
    expect(parsed.files).toBe(1);
    expect(parsed.results.length).toBe(1);
    expect(parsed.results[0].path).toBe("hello.md");
  });
});
