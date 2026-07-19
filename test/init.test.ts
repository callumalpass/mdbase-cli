import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const TSX_CLI = path.resolve(__dirname, "../node_modules/tsx/dist/cli.mjs");

function run(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, [TSX_CLI, CLI, ...args], {
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
  it("creates a minimal v0.3 collection by default", () => {
    const dir = makeTempDir();
    const { stdout, exitCode } = run(["init"], dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("initialized");
    expect(fs.existsSync(path.join(dir, "mdbase.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "_types"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "_types", "meta.md"))).toBe(false);
    const config = yaml.load(fs.readFileSync(path.join(dir, "mdbase.yaml"), "utf-8")) as Record<string, unknown>;
    expect(config.spec_version).toBe("0.3.0");
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
    expect(content).toContain("kind: mdbase.type");
    expect(content).toContain("name: article");
    expect(content).toContain("dialect: json-schema-2020-12");
    expect(content).toContain("minLength: 1");
  });

  it("--types-folder uses a custom v0.3 types folder", () => {
    const dir = makeTempDir();
    const { exitCode } = run(["init", "--types-folder", "schemas"], dir);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, "schemas"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "schemas", "meta.md"))).toBe(false);
    const config = yaml.load(fs.readFileSync(path.join(dir, "mdbase.yaml"), "utf-8")) as {
      settings?: { types_folder?: string };
    };
    expect(config.settings?.types_folder).toBe("schemas");
  });

  it("--spec-version 0.2.1 retains the legacy meta and type grammar", () => {
    const dir = makeTempDir();
    const { exitCode } = run([
      "init",
      "--spec-version",
      "0.2.1",
      "--example-type",
      "article",
    ], dir);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, "_types", "meta.md"))).toBe(true);
    const content = fs.readFileSync(path.join(dir, "_types", "article.md"), "utf-8");
    expect(content).toContain("fields:");
    expect(content).not.toContain("kind: mdbase.type");
  });

  it("rejects unsafe types folders without writing a config", () => {
    const dir = makeTempDir();
    const { stderr, exitCode } = run(["init", "--types-folder", "../schemas"], dir);
    expect(exitCode).toBe(5);
    expect(stderr).toContain("without traversal segments");
    expect(fs.existsSync(path.join(dir, "mdbase.yaml"))).toBe(false);
  });

  it("--format json outputs structured JSON", () => {
    const dir = makeTempDir();
    const { stdout, exitCode } = run(["init", "--format", "json", "--name", "test"], dir);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.root).toBe(fs.realpathSync(dir));
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
    expect(fs.existsSync(path.join(subdir, "_types"))).toBe(true);
    expect(fs.existsSync(path.join(subdir, "_types", "meta.md"))).toBe(false);
  });

  it("--register with explicit alias registers collection", () => {
    const dir = makeTempDir();
    const registryPath = path.join(dir, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    const { stdout, exitCode } = run(["init", "--register", "work", "--format", "json"], dir, env);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.registered.alias).toBe("work");
    expect(parsed.registered.path).toBe(fs.realpathSync.native(dir));

    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    expect(registry.collections).toHaveLength(1);
    expect(registry.collections[0].alias).toBe("work");
    expect(registry.collections[0].path).toBe(fs.realpathSync.native(dir));
  });

  it("--register without alias uses directory basename", () => {
    const dir = makeTempDir();
    const registryPath = path.join(dir, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };
    const subdir = path.join(dir, "my-vault");

    const { exitCode } = run(["init", subdir, "--register"], dir, env);
    expect(exitCode).toBe(0);

    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    expect(registry.collections).toHaveLength(1);
    expect(registry.collections[0].alias).toBe("my-vault");
    expect(registry.collections[0].path).toBe(fs.realpathSync.native(subdir));
  });
});
