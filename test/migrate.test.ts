import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const TSX_CLI = path.resolve(__dirname, "../node_modules/tsx/dist/cli.mjs");
const tempDirs: string[] = [];

function run(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, [TSX_CLI, CLI, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.status ?? 1 };
  }
}

function makeCollection(record = "---\ntype: note\ntitle: Hello\n---\n"): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdbase-cli-migrate-"));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, "_types"));
  fs.writeFileSync(path.join(root, "mdbase.yaml"), `spec_version: "0.2.1"
settings:
  types_folder: _types
  validation: error
`);
  fs.writeFileSync(path.join(root, "_types", "note.md"), `---
name: note
description: Generated fixture type
match:
  fields_present: [title]
fields:
  title:
    type: string
    required: true
---

# Note type
`);
  fs.writeFileSync(path.join(root, "record.md"), record);
  return root;
}

afterEach(() => {
  for (const root of tempDirs.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("migrate v0.3", () => {
  it("analyzes without changing the collection and prints a readable diff", () => {
    const root = makeCollection();
    const before = fs.readFileSync(path.join(root, "mdbase.yaml"), "utf8");
    const result = run(["migrate", "v0.3", "analyze"], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("mdbase 0.2.1 -> 0.3.0");
    expect(result.stdout).toContain("--- a/_types/note.md");
    expect(result.stdout).toContain("+++ b/mdbase.yaml");
    expect(fs.readFileSync(path.join(root, "mdbase.yaml"), "utf8")).toBe(before);
    expect(fs.existsSync(path.join(root, ".mdbase"))).toBe(false);
  });

  it("writes an explicit JSON report and requires approval before apply", () => {
    const root = makeCollection();
    const analyzed = run(["migrate", "v0.3", "analyze", "--format", "json", "--report", "analysis.json"], root);
    expect(analyzed.exitCode).toBe(0);
    const report = JSON.parse(analyzed.stdout);
    expect(report.analysis_id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(fs.readFileSync(path.join(root, "analysis.json"), "utf8"))).toEqual(report);

    const blocked = run(["migrate", "v0.3", "apply", "--report", "analysis.json"], root);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stderr).toContain("approval_required");
    expect(fs.readFileSync(path.join(root, "mdbase.yaml"), "utf8")).toContain("0.2.1");
  });

  it("applies a reviewed report, creates a backup, and validates the result", () => {
    const root = makeCollection();
    expect(run(["migrate", "v0.3", "analyze", "--format", "json", "--report", "analysis.json"], root).exitCode).toBe(0);

    const applied = run(["migrate", "v0.3", "apply", "--report", "analysis.json", "--yes", "--format", "json"], root);
    expect(applied.exitCode).toBe(0);
    const result = JSON.parse(applied.stdout);
    expect(result.valid).toBe(true);
    expect(result.report.post_apply_validation.status).toBe("passed");
    expect(fs.existsSync(path.join(root, result.report.backup.location, "manifest.json"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "mdbase.yaml"), "utf8")).toContain("0.3.0");
  });

  it("recovers an applied migration from its journaled backup", () => {
    const root = makeCollection();
    expect(run(["migrate", "v0.3", "analyze", "--format", "json", "--report", "analysis.json"], root).exitCode).toBe(0);
    const applied = run(["migrate", "v0.3", "apply", "--report", "analysis.json", "--yes", "--format", "json"], root);
    const backup = JSON.parse(applied.stdout).report.backup.location as string;

    const blocked = run(["migrate", "v0.3", "recover", "--backup", backup], root);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stderr).toContain("approval_required");

    const recovered = run(["migrate", "v0.3", "recover", "--backup", backup, "--yes", "--format", "json"], root);
    expect(recovered.exitCode).toBe(0);
    expect(JSON.parse(recovered.stdout).restored_paths.sort()).toEqual(["_types/note.md", "mdbase.yaml"]);
    expect(fs.readFileSync(path.join(root, "mdbase.yaml"), "utf8")).toContain("0.2.1");
  });

  it("blocks invalid records unless partial mode is explicitly selected", () => {
    const root = makeCollection("---\ntype: note\n---\n");
    const analyzed = run(["migrate", "v0.3", "analyze", "--format", "json", "--report", "analysis.json"], root);
    expect(analyzed.exitCode).toBe(2);
    expect(JSON.parse(analyzed.stdout).invalid_records[0].path).toBe("record.md");

    const blocked = run(["migrate", "v0.3", "apply", "--report", "analysis.json", "--yes", "--format", "json"], root);
    expect(blocked.exitCode).toBe(2);
    expect(JSON.parse(blocked.stdout).error.code).toBe("partial_migration_required");

    const applied = run([
      "migrate", "v0.3", "apply", "--report", "analysis.json", "--yes", "--allow-partial", "--format", "json",
    ], root);
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout).report.post_apply_validation.status).toBe("passed_with_invalid_records");
  });
});
