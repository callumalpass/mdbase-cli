/**
 * Output formatters for base execution results.
 */

import chalk from "chalk";
import Table from "cli-table3";
import * as yaml from "js-yaml";
import type { BaseResult } from "./executor.js";
import { getColumnValue } from "./executor.js";

export type OutputFormat = "table" | "json" | "csv" | "yaml" | "paths" | "jsonl";

/**
 * Format and print base results to stdout.
 */
export function printResults(
  results: BaseResult[],
  format: OutputFormat,
): void {
  switch (format) {
    case "json":
      printJSON(results);
      break;
    case "yaml":
      printYAML(results);
      break;
    case "jsonl":
      printJSONL(results);
      break;
    case "csv":
      printCSV(results);
      break;
    case "paths":
      printPaths(results);
      break;
    case "table":
    default:
      printTable(results);
      break;
  }
}

function printTable(results: BaseResult[]): void {
  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    // Print view header if multiple views
    if (results.length > 1) {
      const viewName = result.view.name ?? `${result.view.type} view`;
      if (i > 0) console.log();
      console.log(chalk.bold(`── ${viewName} ──`));
    }

    if (result.rows.length === 0) {
      console.log(chalk.dim("No results"));
      continue;
    }

    const columns = ["path", ...result.columns];
    const headers = columns.map((col) => {
      const display = result.displayNames[col] ?? col;
      return chalk.bold(display);
    });

    const table = new Table({
      head: headers,
      style: { head: [], border: [] },
    });

    for (const row of result.rows) {
      table.push([
        row.path,
        ...result.columns.map((col) => formatValue(getColumnValue(row, col))),
      ]);
    }

    console.log(table.toString());

    if (result.hasMore) {
      console.log(
        chalk.dim(`Showing ${result.rows.length} of ${result.totalCount} results`),
      );
    }
  }
}

function printJSON(results: BaseResult[]): void {
  const output = results.map((result) => ({
    view: {
      type: result.view.type,
      ...(result.view.name ? { name: result.view.name } : {}),
    },
    columns: result.columns,
    results: result.rows.map((row) => rowToObject(row, result.columns)),
    meta: {
      total_count: result.totalCount,
      ...(result.hasMore ? { has_more: true } : {}),
    },
  }));

  // Unwrap single-view result for cleaner output
  console.log(JSON.stringify(output.length === 1 ? output[0] : output, null, 2));
}

function printYAML(results: BaseResult[]): void {
  const output = results.map((result) => ({
    view: {
      type: result.view.type,
      ...(result.view.name ? { name: result.view.name } : {}),
    },
    columns: result.columns,
    results: result.rows.map((row) => rowToObject(row, result.columns)),
    meta: {
      total_count: result.totalCount,
      ...(result.hasMore ? { has_more: true } : {}),
    },
  }));

  const data = output.length === 1 ? output[0] : output;
  console.log(yaml.dump(data, { lineWidth: -1, noRefs: true }).trimEnd());
}

function printJSONL(results: BaseResult[]): void {
  for (const result of results) {
    for (const row of result.rows) {
      console.log(JSON.stringify(rowToObject(row, result.columns)));
    }
  }
}

function printCSV(results: BaseResult[]): void {
  for (const result of results) {
    const columns = ["path", ...result.columns];
    const headers = columns.map((col) => result.displayNames[col] ?? col);
    console.log(headers.map(csvEscape).join(","));

    for (const row of result.rows) {
      const values = [
        row.path,
        ...result.columns.map((col) => formatValue(getColumnValue(row, col))),
      ];
      console.log(values.map(csvEscape).join(","));
    }
  }
}

function printPaths(results: BaseResult[]): void {
  // Deduplicate paths across views
  const seen = new Set<string>();
  for (const result of results) {
    for (const row of result.rows) {
      if (!seen.has(row.path)) {
        seen.add(row.path);
        console.log(row.path);
      }
    }
  }
}

/**
 * Convert a result row to a flat object with path + column values.
 */
function rowToObject(
  row: { path: string; frontmatter: Record<string, unknown>; types: string[]; formulas?: Record<string, unknown> },
  columns: string[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = { path: row.path };
  for (const col of columns) {
    obj[col] = getColumnValue(row, col);
  }
  return obj;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
