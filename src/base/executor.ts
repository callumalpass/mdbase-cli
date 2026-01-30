/**
 * Executor for .base files.
 *
 * Takes a parsed BaseFile and a collection, executes the filters and
 * formulas, and returns results ready for formatting.
 */

import type { BaseFile, BaseView, FilterExpression } from "./parser.js";

export interface BaseResult {
  /** The view being rendered */
  view: BaseView;
  /** Column definitions (property IDs in display order) */
  columns: string[];
  /** Result rows: each is a record of property ID -> value */
  rows: Array<Record<string, unknown>>;
  /** Total matching files before limit */
  totalCount: number;
}

/**
 * Execute a .base file against a collection and return results.
 *
 * TODO: Implement:
 * 1. Parse global filters into mdbase where expressions
 * 2. Execute query against collection
 * 3. Evaluate formula properties for each result
 * 4. Apply view-specific filters, ordering, grouping, limits
 * 5. Compute summaries
 */
export async function executeBase(
  _baseFile: BaseFile,
  _collectionRoot: string,
  _viewName?: string,
): Promise<BaseResult[]> {
  // Stub
  return [];
}

/**
 * Convert a .base filter expression to an mdbase where clause.
 *
 * Obsidian uses:        mdbase equivalent:
 * file.hasTag("x")  ->  file.hasTag("x")     (same)
 * file.hasLink("x") ->  file.hasLink("x")    (same)
 * file.inFolder("x") -> file.folder == "x"   (close)
 * note.status == "x" -> status == "x"         (strip note. prefix)
 *
 * TODO: Handle formula.* property references, nested and/or/not
 */
export function filterToWhere(_filter: FilterExpression): string {
  // Stub
  return "true";
}
