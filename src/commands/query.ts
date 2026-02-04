import { Command } from "commander";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import Table from "cli-table3";
import { splitList } from "../utils.js";

interface ResultRow {
  path: string;
  frontmatter: Record<string, unknown>;
  types: string[];
  body?: string;
  formulas?: Record<string, unknown>;
}

function getField(row: ResultRow, field: string): unknown {
  if (field in (row.frontmatter ?? {})) return row.frontmatter[field];
  if (row.formulas && field in row.formulas) return row.formulas[field];
  return null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

function pickFields(
  row: ResultRow,
  fields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) {
    result[f] = getField(row, f);
  }
  return result;
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerQuery(program: Command): void {
  program
    .command("query [expression]")
    .description("Query files using mdbase expression syntax")
    .option("-t, --types <types>", "Filter by type names (comma-separated)")
    .option("-f, --folder <folder>", "Restrict to folder")
    .option("--order-by <specs>", "Sort specs (comma-separated, - prefix for desc)")
    .option("--sort <specs>", "Alias for --order-by")
    .option("--limit <n>", "Limit results", parseInt)
    .option("--offset <n>", "Skip results", parseInt)
    .option("--body", "Include body in output")
    .option("--format <format>", "Output format: table, json, jsonl, csv, paths", "table")
    .option("--fields <fields>", "Fields to include (comma-separated)")
    .option("--formula <expr>", "Computed formula as name=expr (repeatable)", collect, [])
    .option("--count", "Only show result count")
    .action(async (expression: string | undefined, opts) => {
      const cwd = process.cwd();

      const openResult = await Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }
      const collection = openResult.collection!;

      // Parse comma-separated options
      const types = splitList(opts.types);
      const fields = splitList(opts.fields);

      // Build order_by from --order-by specs like "title" or "-rating"
      let orderBy: Array<{ field: string; direction?: string }> | undefined;
      const orderBySpecs = [
        ...(splitList(opts.orderBy) ?? []),
        ...(splitList(opts.sort) ?? []),
      ];
      if (orderBySpecs.length > 0) {
        orderBy = orderBySpecs.map((spec) => {
          if (spec.startsWith("-")) {
            return { field: spec.slice(1), direction: "desc" };
          }
          return { field: spec, direction: "asc" };
        });
      }

      // Parse --formula name=expr pairs (now always an array from collector)
      let formulas: Record<string, string> | undefined;
      if (opts.formula && opts.formula.length > 0) {
        formulas = {};
        for (const f of opts.formula) {
          const eqIdx = f.indexOf("=");
          if (eqIdx === -1) {
            console.error(chalk.red(`error: invalid formula format: ${f} (expected name=expression)`));
            process.exit(1);
          }
          formulas[f.slice(0, eqIdx)] = f.slice(eqIdx + 1);
        }
      }

      const queryResult = await collection.query({
        types,
        where: expression,
        order_by: orderBy,
        folder: opts.folder,
        limit: opts.limit,
        offset: opts.offset,
        include_body: opts.body ?? false,
        formulas,
      });

      if (queryResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: queryResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${queryResult.error.message}`));
        }
        process.exit(1);
      }

      const results = queryResult.results as Array<{
        path: string;
        frontmatter: Record<string, unknown>;
        types: string[];
        body?: string;
        formulas?: Record<string, unknown>;
      }>;

      // --count: just print the count
      if (opts.count) {
        console.log(String(queryResult.meta?.total_count ?? results.length));
        process.exit(0);
      }

      if (results.length === 0) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ results: [], meta: queryResult.meta }, null, 2));
        } else if (opts.format !== "paths" && opts.format !== "csv" && opts.format !== "jsonl") {
          console.error(chalk.dim("No results"));
        }
        process.exit(0);
      }

      // Collect formula names
      const formulaNames = formulas ? Object.keys(formulas) : [];

      // Determine which fields to show
      const allFields = new Set<string>();
      for (const r of results) {
        for (const key of Object.keys(r.frontmatter)) {
          allFields.add(key);
        }
      }
      const displayFields = fields
        ? fields
        : [...Array.from(allFields).filter((f) => f !== "type"), ...formulaNames];

      switch (opts.format) {
        case "paths": {
          for (const r of results) {
            console.log(r.path);
          }
          break;
        }

        case "json": {
          const output = {
            results: results.map((r) => ({
              path: r.path,
              types: r.types,
              frontmatter: fields ? pickFields(r, displayFields) : { ...r.frontmatter, ...r.formulas },
              ...(opts.body && r.body != null ? { body: r.body } : {}),
            })),
            meta: queryResult.meta,
          };
          console.log(JSON.stringify(output, null, 2));
          break;
        }

        case "jsonl": {
          for (const r of results) {
            const row = {
              path: r.path,
              types: r.types,
              frontmatter: fields ? pickFields(r, displayFields) : { ...r.frontmatter, ...r.formulas },
              ...(opts.body && r.body != null ? { body: r.body } : {}),
            };
            console.log(JSON.stringify(row));
          }
          break;
        }

        case "csv": {
          const header = ["path", ...displayFields];
          console.log(header.map(csvEscape).join(","));
          for (const r of results) {
            const row = [r.path, ...displayFields.map((f) => formatValue(getField(r, f)))];
            console.log(row.map(csvEscape).join(","));
          }
          break;
        }

        case "table":
        default: {
          const table = new Table({
            head: [chalk.bold("path"), ...displayFields.map((f) => chalk.bold(f))],
            style: { head: [], border: [] },
          });

          for (const r of results) {
            table.push([
              r.path,
              ...displayFields.map((f) => formatValue(getField(r, f))),
            ]);
          }

          console.log(table.toString());

          if (queryResult.meta) {
            const { total_count, has_more } = queryResult.meta;
            if (has_more) {
              console.log(chalk.dim(`Showing ${results.length} of ${total_count} results`));
            }
          }
          break;
        }
      }

      process.exit(0);
    });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
