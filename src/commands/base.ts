import * as path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import * as yaml from "js-yaml";
import { Collection } from "mdbase";
import { parseBaseFilePath } from "../base/parser.js";
import { executeBase, BaseExecutionError } from "../base/executor.js";
import { printResults } from "../base/formatter.js";
import type { OutputFormat } from "../base/formatter.js";

export function registerBase(program: Command): void {
  const base = program
    .command("base")
    .description("Execute Obsidian .base files headlessly");

  // ── base run ──────────────────────────────────────────────────

  base
    .command("run <file>")
    .description("Execute a .base file and output results")
    .option("--view <name>", "Run a specific named view")
    .option("--format <format>", "Output format: table, json, csv, yaml, paths, jsonl", "table")
    .option("--fields <fields...>", "Override which fields to display")
    .option("--limit <n>", "Override result limit", parseInt)
    .option("--body", "Include file body in results")
    .action(async (file: string, opts) => {
      const cwd = process.cwd();
      const filePath = path.resolve(cwd, file);

      // Parse .base file
      const parseResult = parseBaseFilePath(filePath);
      if (parseResult.error) {
        const isNotFound = parseResult.error.message.startsWith("file not found");
        const isPermDenied = parseResult.error.message.startsWith("permission denied");
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: parseResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${parseResult.error.message}`));
        }
        process.exit(isNotFound ? 4 : isPermDenied ? 5 : 1);
      }
      const baseFile = parseResult.base!;

      // Open collection
      const openResult = Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }
      const collection = openResult.collection!;

      // Execute
      try {
        const results = executeBase(baseFile, collection, {
          viewName: opts.view,
          fields: opts.fields,
          limit: opts.limit,
          includeBody: opts.body ?? false,
        });

        printResults(results, opts.format as OutputFormat);
        process.exit(0);
      } catch (err) {
        if (err instanceof BaseExecutionError) {
          if (opts.format === "json") {
            console.log(JSON.stringify({ error: { code: err.code, message: err.message } }, null, 2));
          } else {
            console.error(chalk.red(`error: ${err.message}`));
          }
          process.exit(err.code === "view_not_found" ? 1 : 1);
        }
        throw err;
      }
    });

  // ── base validate ─────────────────────────────────────────────

  base
    .command("validate <file>")
    .description("Validate a .base file syntax and references")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (file: string, opts) => {
      const cwd = process.cwd();
      const filePath = path.resolve(cwd, file);

      const parseResult = parseBaseFilePath(filePath);

      if (parseResult.error) {
        const isNotFound = parseResult.error.message.startsWith("file not found");
        const isPermDenied = parseResult.error.message.startsWith("permission denied");
        if (opts.format === "json") {
          console.log(JSON.stringify({
            valid: false,
            errors: [parseResult.error],
          }, null, 2));
        } else {
          console.error(chalk.red(`error: ${parseResult.error.message}`));
        }
        process.exit(isNotFound ? 4 : isPermDenied ? 5 : 2);
      }

      const baseFile = parseResult.base!;
      const issues: Array<{ level: string; message: string }> = [];

      // Structural checks
      if (baseFile.views) {
        for (let i = 0; i < baseFile.views.length; i++) {
          const view = baseFile.views[i];
          const viewLabel = view.name ?? `view[${i}]`;

          if (!["table", "cards", "list", "map"].includes(view.type)) {
            issues.push({
              level: "error",
              message: `${viewLabel}: unknown view type "${view.type}"`,
            });
          }

          if (view.limit != null && (typeof view.limit !== "number" || view.limit < 1)) {
            issues.push({
              level: "error",
              message: `${viewLabel}: limit must be a positive number`,
            });
          }

          if (view.groupBy) {
            if (!view.groupBy.property) {
              issues.push({
                level: "error",
                message: `${viewLabel}: groupBy requires a property`,
              });
            }
            if (view.groupBy.direction && !["ASC", "DESC"].includes(view.groupBy.direction)) {
              issues.push({
                level: "error",
                message: `${viewLabel}: groupBy direction must be ASC or DESC`,
              });
            }
          }
        }
      }

      if (baseFile.formulas) {
        for (const [name, expr] of Object.entries(baseFile.formulas)) {
          if (typeof expr !== "string") {
            issues.push({
              level: "error",
              message: `formula "${name}": expression must be a string`,
            });
          }
        }
      }

      // Check for circular formula references (basic check)
      if (baseFile.formulas) {
        for (const [name, expr] of Object.entries(baseFile.formulas)) {
          if (typeof expr === "string" && expr.includes(`formula.${name}`)) {
            issues.push({
              level: "error",
              message: `formula "${name}": self-referencing formula`,
            });
          }
        }
      }

      const hasErrors = issues.some((i) => i.level === "error");

      if (opts.format === "json") {
        console.log(JSON.stringify({
          valid: !hasErrors,
          issues,
          views: baseFile.views?.length ?? 0,
          formulas: baseFile.formulas ? Object.keys(baseFile.formulas).length : 0,
        }, null, 2));
      } else {
        if (hasErrors) {
          for (const issue of issues) {
            const color = issue.level === "error" ? chalk.red : chalk.yellow;
            console.log(`  ${color(issue.level)}: ${issue.message}`);
          }
          console.log();
          console.log(chalk.red(`${file}: invalid`));
        } else {
          const viewCount = baseFile.views?.length ?? 0;
          const formulaCount = baseFile.formulas ? Object.keys(baseFile.formulas).length : 0;
          const parts: string[] = [];
          if (viewCount > 0) parts.push(`${viewCount} view${viewCount !== 1 ? "s" : ""}`);
          if (formulaCount > 0) parts.push(`${formulaCount} formula${formulaCount !== 1 ? "s" : ""}`);
          const summary = parts.length > 0 ? ` (${parts.join(", ")})` : "";
          console.log(chalk.green(`${file}: valid`) + chalk.dim(summary));

          // Print warnings even on valid
          for (const issue of issues) {
            if (issue.level === "warn") {
              console.log(`  ${chalk.yellow("warn")}: ${issue.message}`);
            }
          }
        }
      }

      process.exit(hasErrors ? 2 : 0);
    });

  // ── base inspect ──────────────────────────────────────────────

  base
    .command("inspect <file>")
    .description("Show parsed structure of a .base file")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (file: string, opts) => {
      const cwd = process.cwd();
      const filePath = path.resolve(cwd, file);

      const parseResult = parseBaseFilePath(filePath);
      if (parseResult.error) {
        const isNotFound = parseResult.error.message.startsWith("file not found");
        const isPermDenied = parseResult.error.message.startsWith("permission denied");
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: parseResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${parseResult.error.message}`));
        }
        process.exit(isNotFound ? 4 : isPermDenied ? 5 : 1);
      }

      const baseFile = parseResult.base!;

      switch (opts.format) {
        case "json": {
          console.log(JSON.stringify(baseFile, null, 2));
          break;
        }
        case "yaml": {
          console.log(yaml.dump(baseFile, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }
        case "text":
        default: {
          printInspectText(baseFile, file);
          break;
        }
      }

      process.exit(0);
    });
}

/**
 * Print a human-readable inspection of a .base file.
 */
function printInspectText(
  baseFile: {
    filters?: unknown;
    formulas?: Record<string, string>;
    properties?: Record<string, { displayName?: string; [k: string]: unknown }>;
    summaries?: Record<string, string>;
    views?: Array<{
      type: string;
      name?: string;
      limit?: number;
      filters?: unknown;
      groupBy?: { property: string; direction?: string };
      order?: string[];
      summaries?: Record<string, string>;
      [k: string]: unknown;
    }>;
  },
  file: string,
): void {
  console.log(chalk.bold(file));
  console.log();

  // Filters
  if (baseFile.filters) {
    console.log(chalk.cyan("Filters:"));
    printFilterTree(baseFile.filters, "  ");
    console.log();
  }

  // Formulas
  if (baseFile.formulas && Object.keys(baseFile.formulas).length > 0) {
    console.log(chalk.cyan("Formulas:"));
    for (const [name, expr] of Object.entries(baseFile.formulas)) {
      console.log(`  ${chalk.bold(name)}: ${chalk.dim(expr)}`);
    }
    console.log();
  }

  // Properties
  if (baseFile.properties && Object.keys(baseFile.properties).length > 0) {
    console.log(chalk.cyan("Properties:"));
    for (const [prop, config] of Object.entries(baseFile.properties)) {
      const attrs = Object.entries(config)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      console.log(`  ${chalk.bold(prop)}: ${chalk.dim(attrs)}`);
    }
    console.log();
  }

  // Summaries
  if (baseFile.summaries && Object.keys(baseFile.summaries).length > 0) {
    console.log(chalk.cyan("Summaries:"));
    for (const [name, expr] of Object.entries(baseFile.summaries)) {
      console.log(`  ${chalk.bold(name)}: ${chalk.dim(expr)}`);
    }
    console.log();
  }

  // Views
  if (baseFile.views && baseFile.views.length > 0) {
    console.log(chalk.cyan(`Views (${baseFile.views.length}):`));
    for (const view of baseFile.views) {
      const name = view.name ?? "(unnamed)";
      console.log(`  ${chalk.bold(name)} [${view.type}]`);

      if (view.limit) console.log(`    limit: ${view.limit}`);
      if (view.order) console.log(`    columns: ${view.order.join(", ")}`);
      if (view.groupBy) {
        console.log(`    group by: ${view.groupBy.property} ${view.groupBy.direction ?? "ASC"}`);
      }
      if (view.filters) {
        console.log("    filters:");
        printFilterTree(view.filters, "      ");
      }
      if (view.summaries) {
        console.log("    summaries:");
        for (const [prop, summary] of Object.entries(view.summaries)) {
          console.log(`      ${prop}: ${summary}`);
        }
      }
    }
  }
}

function printFilterTree(filter: unknown, indent: string): void {
  if (typeof filter === "string") {
    console.log(`${indent}${chalk.dim(filter)}`);
    return;
  }

  const obj = filter as Record<string, unknown>;
  if (obj.and) {
    console.log(`${indent}AND:`);
    for (const item of obj.and as unknown[]) {
      printFilterTree(item, indent + "  ");
    }
  } else if (obj.or) {
    console.log(`${indent}OR:`);
    for (const item of obj.or as unknown[]) {
      printFilterTree(item, indent + "  ");
    }
  } else if (obj.not) {
    console.log(`${indent}NOT:`);
    for (const item of obj.not as unknown[]) {
      printFilterTree(item, indent + "  ");
    }
  }
}
