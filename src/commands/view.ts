import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import * as yaml from "js-yaml";
import { Collection } from "@callumalpass/mdbase";
import type { CanonicalQueryResult } from "@callumalpass/mdbase";

import { finishCommand } from "../utils.js";

type ViewQueryResult = CanonicalQueryResult;

export function registerView(program: Command): void {
  const view = program
    .command("view")
    .description("Validate and execute portable Markdown view records");

  view
    .command("run <file>")
    .description("Execute a named view from a Markdown view record")
    .requiredOption("--view <id>", "Stable named-view ID")
    .option("--context <path>", "Invocation-context record path")
    .option("--limit <n>", "Override result limit", parseInt)
    .option("--offset <n>", "Override result offset", parseInt)
    .option("--format <format>", "Output format: table, json, yaml, paths, jsonl", "table")
    .action(async (file: string, opts) => {
      const opened = await Collection.open(process.cwd());
      if (opened.error || !opened.collection) {
        outputError(opts.format, opened.error ?? { code: "missing_config", message: "No collection found" });
        process.exit(3);
      }
      const collection = opened.collection;
      if (typeof collection.executeView !== "function") {
        outputError(opts.format, {
          code: "unsupported_profile",
          message: "Installed @callumalpass/mdbase does not support v0.3 view records",
        });
        await finishCommand(collection, 1);
        return;
      }

      const result = await collection.executeView({
        path: file,
        view: opts.view,
        ...(opts.context ? { context: { path: opts.context } } : {}),
        ...(typeof opts.limit === "number" ? { limit: opts.limit } : {}),
        ...(typeof opts.offset === "number" ? { offset: opts.offset } : {}),
        render: false,
      });
      if (result.error) {
        outputError(opts.format, result.error, result.diagnostics);
        await finishCommand(collection, 1);
        return;
      }

      printViewResult(result, opts.format);
      await finishCommand(collection, 0);
    });

  view
    .command("validate <file>")
    .description("Validate an ordinary Markdown view record")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (file: string, opts) => {
      const opened = await Collection.open(process.cwd());
      if (opened.error || !opened.collection) {
        outputError(opts.format, opened.error ?? { code: "missing_config", message: "No collection found" });
        process.exit(3);
      }
      const collection = opened.collection;
      const read = await collection.read(file);
      const validateView = await loadViewValidator();
      const diagnostics = read.error
        ? [{ severity: "error" as const, code: read.error.code, message: read.error.message, path: file }]
        : validateView
          ? validateView(read.rawFrontmatter ?? read.frontmatter ?? {}, file)
          : [{
              severity: "error" as const,
              code: "unsupported_profile",
              message: "Installed @callumalpass/mdbase does not support v0.3 view records",
              path: file,
            }];
      const valid = !read.error && diagnostics.every((item) => item.severity !== "error");
      const output = { valid, diagnostics };
      if (opts.format === "json") console.log(JSON.stringify(output, null, 2));
      else if (opts.format === "yaml") console.log(yaml.dump(output, { lineWidth: -1, noRefs: true }).trimEnd());
      else if (valid) console.log(chalk.green(`${file}: valid view record`));
      else {
        for (const diagnostic of diagnostics) {
          console.error(chalk.red(`${diagnostic.code}: ${diagnostic.message}`));
        }
      }
      await finishCommand(collection, valid ? 0 : 2);
    });
}

async function loadViewValidator(): Promise<
  ((value: unknown, path?: string) => Array<{ severity: string; code: string; message: string; path?: string }>) | null
> {
  const core = await import("@callumalpass/mdbase");
  return typeof core.validateCanonicalViewRecord === "function"
    ? core.validateCanonicalViewRecord
    : null;
}

function printViewResult(result: ViewQueryResult, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (format === "yaml") {
    console.log(yaml.dump(result, { lineWidth: -1, noRefs: true }).trimEnd());
    return;
  }
  if (format === "paths") {
    for (const row of result.results) console.log(String(row.file.path ?? row.path ?? ""));
    return;
  }
  if (format === "jsonl") {
    for (const row of result.results) console.log(JSON.stringify(row));
    return;
  }

  const columns = collectColumns(result.results);
  const table = new Table({
    head: [chalk.bold("path"), ...columns.map((column) => chalk.bold(column))],
    style: { head: [], border: [] },
  });
  for (const row of result.results) {
    const values = row.values ?? row.frontmatter ?? {};
    table.push([
      String(row.file.path ?? row.path ?? ""),
      ...columns.map((column) => formatValue(values[column])),
    ]);
  }
  console.log(table.toString());
  if (result.meta.has_more === true) {
    console.log(chalk.dim(`Showing ${result.results.length} of ${String(result.meta.total_count)} results`));
  }
}

function collectColumns(rows: ViewQueryResult["results"]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.values ?? row.frontmatter ?? {})) columns.add(key);
  }
  return [...columns];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function outputError(
  format: string,
  error: { code?: string; message: string },
  diagnostics?: unknown[],
): void {
  const output = { error: { code: error.code ?? "operation_failed", message: error.message }, diagnostics };
  if (format === "json") console.log(JSON.stringify(output, null, 2));
  else if (format === "yaml") console.log(yaml.dump(output, { lineWidth: -1, noRefs: true }).trimEnd());
  else console.error(chalk.red(`error: ${error.message}`));
}
