/**
 * Output formatters for base execution results.
 */

import type { BaseResult } from "./executor.js";

export type OutputFormat = "table" | "json" | "csv" | "markdown" | "paths";

/**
 * Format base results for output.
 *
 * TODO: Implement each format:
 * - table: cli-table3 formatted ASCII table
 * - json: JSON array of objects
 * - csv: CSV with headers
 * - markdown: Markdown table
 * - paths: Just file paths, one per line (for piping)
 */
export function formatResults(
  _results: BaseResult[],
  _format: OutputFormat,
): string {
  // Stub
  return "";
}
