import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const TSX_CLI = path.resolve(__dirname, "../node_modules/tsx/dist/cli.mjs");
let root: string;

function write(relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, [TSX_CLI, CLI, ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: failure.status ?? 1,
    };
  }
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "mdbase-cli-view-"));
  write("mdbase.yaml", 'spec_version: "0.3.0"\n');
  write("_types/task.md", `---
kind: mdbase.type
name: task
version: 1
match:
  where: { type: task }
schema:
  dialect: json-schema-2020-12
  value:
    type: object
    properties:
      type: { const: task }
      title: { type: string }
      project_id: { type: string }
---
`);
  write("_types/project.md", `---
kind: mdbase.type
name: project
version: 1
match:
  where: { type: project }
schema:
  dialect: json-schema-2020-12
  value: { type: object }
---
`);
  write("_types/view.md", `---
kind: mdbase.type
name: view
version: 1
match:
  where: { type: view }
schema:
  dialect: json-schema-2020-12
  value: { type: object }
---
`);
  write("projects/alpha.md", `---
type: project
id: alpha
title: Alpha
---
`);
  write("tasks/one.md", `---
type: task
title: First
project_id: alpha
---
`);
  write("tasks/two.md", `---
type: task
title: Second
project_id: beta
---
`);
  write("views/tasks.md", `---
type: view
id: tasks.views
version: 1
name: Task views
query:
  types: [task]
views:
  - id: project
    name: Project tasks
    context:
      this:
        on_missing: error
        types: [project]
    where: project_id == this.id
    select: [title]
---
`);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("view command", () => {
  it("executes a named Markdown view with explicit context", () => {
    const result = run([
      "view", "run", "views/tasks.md",
      "--view", "project",
      "--context", "projects/alpha.md",
      "--format", "json",
    ]);
    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].values).toEqual({ title: "First" });
    expect(parsed.meta.view).toEqual({ path: "views/tasks.md", id: "project" });
    expect(parsed.meta.context).toEqual({ path: "projects/alpha.md" });
  });

  it("reports missing required context", () => {
    const result = run([
      "view", "run", "views/tasks.md",
      "--view", "project",
      "--format", "json",
    ]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).error.code).toBe("context_required");
  });

  it("validates view records through ordinary collection validation", () => {
    const result = run(["view", "validate", "views/tasks.md", "--format", "json"]);
    expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ valid: true, diagnostics: [] });
  });
});
