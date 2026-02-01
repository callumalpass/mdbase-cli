import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLI = path.resolve(__dirname, "../src/cli.ts");

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

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdbase-init-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("init command", () => {
  it("creates mdbase.yaml and _types/ folder", () => {
    const dir = makeTempDir();
    const { stdout, exitCode } = run(["init"], dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("initialized");
    expect(fs.existsSync(path.join(dir, "mdbase.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "_types"))).toBe(true);
  });

  it("--name sets collection name", () => {
    const dir = makeTempDir();
    const { stdout, exitCode } = run(["init", "--name", "my-collection"], dir);
    expect(exitCode).toBe(0);
    const config = fs.readFileSync(path.join(dir, "mdbase.yaml"), "utf-8");
    expect(config).toContain("name: my-collection");
    expect(stdout).toContain("initialized");
  });

  it("--example-type creates a type file", () => {
    const dir = makeTempDir();
    const { exitCode } = run(["init", "--example-type", "article"], dir);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, "_types", "article.md"))).toBe(true);
    const content = fs.readFileSync(path.join(dir, "_types", "article.md"), "utf-8");
    expect(content).toContain("name: article");
    expect(content).toContain("title:");
  });

  it("--no-types-folder skips _types directory", () => {
    const dir = makeTempDir();
    const { exitCode } = run(["init", "--no-types-folder"], dir);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, "mdbase.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "_types"))).toBe(false);
  });

  it("--format json outputs structured JSON", () => {
    const dir = makeTempDir();
    const { stdout, exitCode } = run(["init", "--format", "json", "--name", "test"], dir);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.root).toBe(dir);
    expect(parsed.files).toContain("mdbase.yaml");
    expect(parsed.name).toBe("test");
  });

  it("--format yaml outputs YAML", () => {
    const dir = makeTempDir();
    const { stdout, exitCode } = run(["init", "--format", "yaml"], dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("root:");
    expect(stdout).toContain("files:");
  });

  it("exits 1 if already initialized", () => {
    const dir = makeTempDir();
    run(["init"], dir);
    const { exitCode, stderr } = run(["init"], dir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("already exists");
  });

  it("creates subdirectory when given a path", () => {
    const dir = makeTempDir();
    const subdir = path.join(dir, "sub");
    const { exitCode } = run(["init", subdir], dir);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(subdir, "mdbase.yaml"))).toBe(true);
  });
});
