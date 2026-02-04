/**
 * Executor for .base files.
 *
 * Takes a parsed BaseFile and a collection, translates Obsidian .base
 * filter syntax to mdbase query parameters, executes the query, and
 * returns results ready for formatting.
 */

import { Collection } from "@callumalpass/mdbase";
import type { BaseFile, BaseView, FilterExpression } from "./parser.js";

export interface BaseResultRow {
  path: string;
  frontmatter: Record<string, unknown>;
  types: string[];
  body?: string;
  formulas?: Record<string, unknown>;
}

export interface BaseResult {
  /** The view being rendered */
  view: BaseView;
  /** Column definitions (property IDs in display order) */
  columns: string[];
  /** Display names for columns (from properties config) */
  displayNames: Record<string, string>;
  /** Result rows */
  rows: BaseResultRow[];
  /** Total matching files before limit */
  totalCount: number;
  /** Whether results were truncated by limit */
  hasMore: boolean;
}

export interface ExecuteOptions {
  /** Override which view to render (by name) */
  viewName?: string;
  /** Override field list */
  fields?: string[];
  /** Override result limit */
  limit?: number;
  /** Include file body in results */
  includeBody?: boolean;
}

/**
 * Execute a .base file against a collection and return results for each view.
 */
export async function executeBase(
  baseFile: BaseFile,
  collection: Collection,
  opts: ExecuteOptions = {},
): Promise<BaseResult[]> {
  // Determine which views to execute
  let views = baseFile.views ?? [{ type: "table" as const }];
  if (opts.viewName) {
    const match = views.find(
      (v) => v.name?.toLowerCase() === opts.viewName!.toLowerCase(),
    );
    if (!match) {
      const available = views
        .map((v) => v.name ?? `(unnamed ${v.type})`)
        .join(", ");
      throw new BaseExecutionError(
        `view not found: "${opts.viewName}" (available: ${available})`,
        "view_not_found",
      );
    }
    views = [match];
  }

  const results: BaseResult[] = [];

  for (const view of views) {
    const result = await executeView(baseFile, view, collection, opts);
    results.push(result);
  }

  return results;
}

/**
 * Execute a single view from a .base file.
 */
async function executeView(
  baseFile: BaseFile,
  view: BaseView,
  collection: Collection,
  opts: ExecuteOptions,
): Promise<BaseResult> {
  // 1. Build the where clause by combining global + view filters
  const where = buildWhere(baseFile.filters, view.filters);

  // 2. Build order_by from view's order property
  //    In .base files, order is just property IDs for column display order,
  //    not sort order. Sorting comes from the view's groupBy direction.
  //    We pass order_by from groupBy if present.
  const orderBy = buildOrderBy(view);

  // 3. Determine limit
  const limit = opts.limit ?? view.limit;

  // 4. Filter out empty formulas and translate Obsidian syntax
  let formulas = baseFile.formulas;
  if (formulas) {
    const filtered: Record<string, string> = {};
    for (const [name, expr] of Object.entries(formulas)) {
      if (name !== "" && typeof expr === "string" && expr !== "") {
        filtered[name] = translateExpression(expr);
      }
    }
    formulas = Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  // 5. Execute query
  const queryResult = await collection.query({
    where,
    order_by: orderBy,
    limit,
    include_body: opts.includeBody ?? false,
    formulas,
  });

  if (queryResult.error) {
    throw new BaseExecutionError(
      queryResult.error.message,
      queryResult.error.code,
    );
  }

  const rows = queryResult.results as BaseResultRow[];

  // 5. Determine columns
  const columns = resolveColumns(baseFile, view, rows, opts.fields);

  // 6. Build display name mapping
  const displayNames: Record<string, string> = {};
  if (baseFile.properties) {
    for (const [propId, config] of Object.entries(baseFile.properties)) {
      if (config.displayName) {
        // Normalize property ID: strip "note." prefix
        const normalized = normalizePropertyId(propId);
        displayNames[normalized] = config.displayName;
      }
    }
  }

  return {
    view,
    columns,
    displayNames,
    rows,
    totalCount: queryResult.meta?.total_count ?? rows.length,
    hasMore: queryResult.meta?.has_more ?? false,
  };
}

/**
 * Combine global and view-level filters into a single where clause.
 *
 * Both are AND'd together. If both are present, wrap in { and: [...] }.
 * If only one is present, use it directly.
 */
function buildWhere(
  globalFilter?: FilterExpression,
  viewFilter?: FilterExpression,
): string | Record<string, unknown> | undefined {
  const parts: FilterExpression[] = [];
  if (globalFilter != null) parts.push(globalFilter);
  if (viewFilter != null) parts.push(viewFilter);

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return translateFilter(parts[0]);

  // AND both together
  return {
    and: parts.map(translateFilter),
  };
}

/**
 * Translate a .base FilterExpression to an mdbase where clause.
 *
 * Key differences between Obsidian and mdbase expression syntax:
 * - Obsidian uses `note.fieldName`, mdbase uses just `fieldName`
 * - Obsidian uses `file.inFolder("x")`, mdbase supports this natively
 * - Obsidian uses `file.hasTag("x")`, mdbase supports this natively
 * - Formula references: `formula.name` works in both
 *
 * Structured filters (and/or/not objects) are translated recursively.
 * Note: Obsidian's `not` takes an array, mdbase's `not` takes a single value,
 * so we wrap arrays in an implicit AND.
 */
function translateFilter(
  filter: FilterExpression,
): string | Record<string, unknown> {
  if (typeof filter === "string") {
    return translateExpression(filter);
  }

  // Structured filter object
  if (filter.and) {
    return {
      and: filter.and.map(translateFilter),
    };
  }
  if (filter.or) {
    return {
      or: filter.or.map(translateFilter),
    };
  }
  if (filter.not) {
    // Obsidian's not takes an array; mdbase's not takes a single condition.
    // Wrap multiple items in an implicit AND.
    const items = filter.not.map(translateFilter);
    if (items.length === 1) {
      return { not: items[0] };
    }
    return { not: { and: items } };
  }

  return "true";
}

/**
 * Translate a single expression string from Obsidian syntax to mdbase syntax.
 *
 * The main transformation is stripping the `note.` prefix from property
 * references, since mdbase accesses frontmatter fields directly.
 */
function translateExpression(expr: string): string {
  // Strip "note." prefix from property references.
  // Match "note." that's:
  // - at the start of the expression
  // - after an operator or opening paren
  // But NOT "file." or "formula." or inside a string literal.
  //
  // Simple approach: replace word-boundary `note.` with nothing,
  // being careful not to replace inside string literals.
  let result = expr.replace(/\bnote\./g, "");

  // Translate Obsidian's file(field) to mdbase's field.asFile()
  // e.g. file(customer) → customer.asFile()
  result = result.replace(/\bfile\(([^)]+)\)/g, "$1.asFile()");

  // Obsidian's icon() is purely decorative — return the argument as a string
  result = result.replace(/\bicon\(([^)]+)\)/g, "$1");

  return result;
}

/**
 * Build order_by from the view's groupBy config.
 * In .base files, sorting is controlled by groupBy.
 */
function buildOrderBy(
  view: BaseView,
): Array<{ field: string; direction?: string }> | undefined {
  if (!view.groupBy) return undefined;

  const prop = normalizePropertyId(view.groupBy.property);
  const dir = view.groupBy.direction?.toLowerCase() ?? "asc";
  return [{ field: prop, direction: dir }];
}

/**
 * Determine which columns to display.
 *
 * Priority:
 * 1. CLI --fields override
 * 2. View's order array (property IDs)
 * 3. Auto-detect from result frontmatter + formulas
 */
function resolveColumns(
  baseFile: BaseFile,
  view: BaseView,
  rows: BaseResultRow[],
  fieldOverrides?: string[],
): string[] {
  if (fieldOverrides && fieldOverrides.length > 0) {
    return fieldOverrides;
  }

  if (view.order && view.order.length > 0) {
    // Normalize property IDs from .base format
    return view.order.map(normalizePropertyId);
  }

  // Auto-detect: collect all field names from results
  const fields = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.frontmatter)) {
      if (key !== "type") fields.add(key);
    }
    if (row.formulas) {
      for (const key of Object.keys(row.formulas)) {
        fields.add(`formula.${key}`);
      }
    }
  }

  // Add formula columns from base file definition
  if (baseFile.formulas) {
    for (const name of Object.keys(baseFile.formulas)) {
      fields.add(`formula.${name}`);
    }
  }

  return Array.from(fields);
}

/**
 * Normalize an Obsidian property ID to mdbase field name.
 *
 * - "note.fieldName" -> "fieldName" (frontmatter fields)
 * - "file.name" -> "file.name" (keep file prefix)
 * - "formula.name" -> "formula.name" (keep formula prefix)
 * - "fieldName" -> "fieldName" (already bare)
 */
export function normalizePropertyId(propId: string): string {
  if (propId.startsWith("note.")) {
    return propId.slice(5);
  }
  return propId;
}

/**
 * Get the value of a column from a result row.
 */
export function getColumnValue(
  row: BaseResultRow,
  column: string,
): unknown {
  // File properties
  if (column === "file.name" || column === "file.path") {
    return column === "file.path" ? row.path : row.path.split("/").pop();
  }
  if (column === "file.folder") {
    const parts = row.path.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  }

  // Formula properties
  if (column.startsWith("formula.")) {
    const formulaName = column.slice(8);
    return row.formulas?.[formulaName] ?? null;
  }

  // Frontmatter fields
  return row.frontmatter?.[column] ?? null;
}

export class BaseExecutionError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "BaseExecutionError";
    this.code = code;
  }
}
