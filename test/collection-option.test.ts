import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const VALID = path.resolve(__dirname, "fixtures/valid-collection");
const tempDirs: string[] = [];

function run(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI, ...args], {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1", ...extraEnv },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; status: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.status ?? 1 };
  }
}

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdbase-collection-opt-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("--collection global option", () => {
  it("runs query from outside the collection root", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    expect(run(["collections", "add", "valid", VALID], workspace, env).exitCode).toBe(0);

    const result = run(
      ["--collection", "valid", "query", "rating >= 4", "--format", "json"],
      workspace,
      env,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results.length).toBeGreaterThan(0);
  });

  it("runs read from outside the collection root", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    expect(run(["collections", "add", "valid", VALID], workspace, env).exitCode).toBe(0);

    const result = run(
      ["--collection", "valid", "read", "hello.md", "--format", "json"],
      workspace,
      env,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.path).toBe("hello.md");
    expect(parsed.frontmatter.title).toBe("Hello World");
  });

  it("returns JSON errors for unknown aliases", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    const result = run(
      ["--collection", "missing", "query", "--format", "json"],
      workspace,
      env,
    );
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error.code).toBe("collection_not_found");
  });

  it("does not apply alias resolution to collections subcommands", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    const result = run(
      ["--collection", "missing", "collections", "list", "--format", "json"],
      workspace,
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });
});
