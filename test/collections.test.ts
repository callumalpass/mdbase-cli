import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLI = path.resolve(__dirname, "../src/cli.ts");
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdbase-collections-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeCollectionConfig(root: string, name?: string, description?: string): void {
  fs.mkdirSync(root, { recursive: true });
  const lines = ['spec_version: "0.2.1"'];
  if (name) lines.push(`name: ${JSON.stringify(name)}`);
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  fs.writeFileSync(path.join(root, "mdbase.yaml"), lines.join("\n") + "\n", "utf-8");
}

function writeMd(root: string, relPath: string, title: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(
    full,
    ["---", `title: ${JSON.stringify(title)}`, "---", "", title, ""].join("\n"),
    "utf-8",
  );
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("collections command", () => {
  it("adds a collection and shows metadata from mdbase.yaml", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const collectionPath = path.join(workspace, "work-notes");
    writeCollectionConfig(collectionPath, "Work Notes", "Primary vault");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    const added = run(["collections", "add", "work", collectionPath], workspace, env);
    expect(added.exitCode).toBe(0);
    expect(added.stdout).toContain("added work");
    expect(added.stdout).toContain("name: Work Notes");
    expect(added.stdout).toContain("description: Primary vault");

    const listed = run(["collections", "list", "--format", "json"], workspace, env);
    expect(listed.exitCode).toBe(0);
    const parsed = JSON.parse(listed.stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].alias).toBe("work");
    expect(parsed[0].path).toBe(collectionPath);
    expect(parsed[0].collection_name).toBe("Work Notes");
    expect(parsed[0].collection_description).toBe("Primary vault");

    const shown = run(["collections", "show", "work"], workspace, env);
    expect(shown.exitCode).toBe(0);
    expect(shown.stdout).toContain("Work Notes");
    expect(shown.stdout).toContain("Primary vault");
  });

  it("accepts mdbase.yaml file path in add command", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const collectionPath = path.join(workspace, "personal");
    writeCollectionConfig(collectionPath, "Personal");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    const result = run(
      ["collections", "add", "personal", path.join(collectionPath, "mdbase.yaml"), "--format", "json"],
      workspace,
      env,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.alias).toBe("personal");
    expect(parsed.path).toBe(collectionPath);
    expect(parsed.collection_name).toBe("Personal");
  });

  it("rejects duplicate alias and duplicate path", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const one = path.join(workspace, "one");
    const two = path.join(workspace, "two");
    writeCollectionConfig(one);
    writeCollectionConfig(two);
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    expect(run(["collections", "add", "main", one], workspace, env).exitCode).toBe(0);

    const dupAlias = run(["collections", "add", "main", two], workspace, env);
    expect(dupAlias.exitCode).toBe(1);
    expect(dupAlias.stderr).toContain("alias already exists");

    const dupPath = run(["collections", "add", "secondary", one], workspace, env);
    expect(dupPath.exitCode).toBe(1);
    expect(dupPath.stderr).toContain("already registered");
  });

  it("renames and removes aliases", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const collectionPath = path.join(workspace, "vault");
    writeCollectionConfig(collectionPath, "Vault");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    expect(run(["collections", "add", "old", collectionPath], workspace, env).exitCode).toBe(0);

    const renamed = run(["collections", "rename", "old", "new"], workspace, env);
    expect(renamed.exitCode).toBe(0);
    expect(renamed.stdout).toContain("old -> new");

    const shown = run(["collections", "show", "new", "--format", "json"], workspace, env);
    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout).alias).toBe("new");

    const removed = run(["collections", "remove", "new"], workspace, env);
    expect(removed.exitCode).toBe(0);
    expect(removed.stdout).toContain("removed new");

    const list = run(["collection", "list", "--format", "json"], workspace, env);
    expect(list.exitCode).toBe(0);
    expect(JSON.parse(list.stdout)).toEqual([]);
  });

  it("returns expected exit codes for missing path and missing config", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };

    const missingPath = run(["collections", "add", "missing", path.join(workspace, "nope")], workspace, env);
    expect(missingPath.exitCode).toBe(4);
    expect(missingPath.stderr).toContain("Path not found");

    const noConfigDir = path.join(workspace, "empty");
    fs.mkdirSync(noConfigDir);
    const missingConfig = run(["collections", "add", "empty", noConfigDir], workspace, env);
    expect(missingConfig.exitCode).toBe(3);
    expect(missingConfig.stderr).toContain("No mdbase.yaml");
  });

  it("files returns markdown records across all collections", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };
    const one = path.join(workspace, "one");
    const two = path.join(workspace, "two");
    writeCollectionConfig(one, "One");
    writeCollectionConfig(two, "Two");
    writeMd(one, "a.md", "A");
    writeMd(one, "nested/b.md", "B");
    writeMd(two, "c.md", "C");

    expect(run(["collections", "add", "one", one], workspace, env).exitCode).toBe(0);
    expect(run(["collections", "add", "two", two], workspace, env).exitCode).toBe(0);

    const result = run(["collections", "files", "--format", "json"], workspace, env);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.meta.collections).toBe(2);
    expect(parsed.meta.files).toBe(3);

    const byAlias = Object.fromEntries(parsed.collections.map((c: { alias: string; files: string[] }) => [c.alias, c.files]));
    expect(byAlias.one).toEqual(["a.md", "nested/b.md"]);
    expect(byAlias.two).toEqual(["c.md"]);
  });

  it("files supports alias filter and paths format", () => {
    const workspace = makeTempDir();
    const registryPath = path.join(workspace, "state", "collections.json");
    const env = { MDBASE_COLLECTIONS_REGISTRY: registryPath };
    const one = path.join(workspace, "one");
    writeCollectionConfig(one);
    writeMd(one, "a.md", "A");

    expect(run(["collections", "add", "one", one], workspace, env).exitCode).toBe(0);

    const paths = run(["collections", "files", "--alias", "one", "--format", "paths"], workspace, env);
    expect(paths.exitCode).toBe(0);
    expect(paths.stdout.trim()).toBe("one:a.md");
  });
});
