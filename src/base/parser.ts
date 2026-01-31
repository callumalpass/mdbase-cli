/**
 * Parser for Obsidian .base files.
 *
 * .base files are YAML with this structure:
 *
 * ```yaml
 * filters:
 *   and:
 *     - file.hasTag("tag")
 *     - 'status != "done"'
 *
 * formulas:
 *   formatted_price: 'if(price, price.toFixed(2) + " dollars")'
 *
 * properties:
 *   status:
 *     displayName: Status
 *   formula.formatted_price:
 *     displayName: "Price"
 *
 * summaries:
 *   customAverage: 'values.mean().round(3)'
 *
 * views:
 *   - type: table
 *     name: "My table"
 *     limit: 10
 *     groupBy:
 *       property: note.age
 *       direction: DESC
 *     filters:
 *       and:
 *         - 'status != "done"'
 *     order:
 *       - file.name
 *       - note.age
 *     summaries:
 *       formula.ppu: Average
 * ```
 */

import * as fs from "node:fs";
import * as yaml from "js-yaml";

export interface BaseFilter {
  and?: Array<string | BaseFilter>;
  or?: Array<string | BaseFilter>;
  not?: Array<string | BaseFilter>;
}

export type FilterExpression = string | BaseFilter;

export interface BasePropertyConfig {
  displayName?: string;
  [key: string]: unknown;
}

export interface BaseGroupBy {
  property: string;
  direction?: "ASC" | "DESC";
}

export interface BaseViewSummaries {
  [propertyId: string]: string; // property -> summary type or formula
}

export interface BaseView {
  type: "table" | "cards" | "list" | "map";
  name?: string;
  limit?: number;
  filters?: FilterExpression;
  groupBy?: BaseGroupBy;
  order?: string[];
  summaries?: BaseViewSummaries;
  // Table-specific
  rowHeight?: string;
  // Cards-specific
  coverProperty?: string;
  imageFit?: "cover" | "contain";
  aspectRatio?: string;
  cardSize?: string;
  // List-specific
  listStyle?: "bullet" | "numbered";
  separator?: string;
  // Map-specific
  coordinatesProperty?: string;
  tileUrl?: string;
}

export interface BaseFile {
  filters?: FilterExpression;
  formulas?: Record<string, string>;
  properties?: Record<string, BasePropertyConfig>;
  summaries?: Record<string, string>;
  views?: BaseView[];
}

export interface ParseError {
  message: string;
  line?: number;
}

export interface ParseResult {
  base?: BaseFile;
  error?: ParseError;
}

/**
 * Parse a .base file from its YAML content string.
 */
export function parseBaseFile(content: string): ParseResult {
  try {
    const parsed = yaml.load(content);
    if (parsed === null || parsed === undefined) {
      return { base: {} };
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: { message: "expected YAML mapping at top level" } };
    }
    const base = parsed as BaseFile;
    return { base: validateBaseStructure(base) };
  } catch (err: unknown) {
    const yamlErr = err as { mark?: { line?: number }; message?: string };
    return {
      error: {
        message: yamlErr.message ?? "invalid YAML",
        line: yamlErr.mark?.line != null ? yamlErr.mark.line + 1 : undefined,
      },
    };
  }
}

/**
 * Parse a .base file from a file path.
 */
export function parseBaseFilePath(filePath: string): ParseResult {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseBaseFile(content);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { error: { message: `file not found: ${filePath}` } };
    }
    if ((err as NodeJS.ErrnoException).code === "EACCES") {
      return { error: { message: `permission denied: ${filePath}` } };
    }
    throw err;
  }
}

/**
 * Basic structural validation. Returns the parsed base with defaults applied.
 */
function validateBaseStructure(raw: BaseFile): BaseFile {
  const base: BaseFile = {};

  if (raw.filters !== undefined) {
    base.filters = raw.filters;
  }
  if (raw.formulas !== undefined && typeof raw.formulas === "object") {
    base.formulas = raw.formulas;
  }
  if (raw.properties !== undefined && typeof raw.properties === "object") {
    base.properties = raw.properties;
  }
  if (raw.summaries !== undefined && typeof raw.summaries === "object") {
    base.summaries = raw.summaries;
  }
  if (raw.views !== undefined && Array.isArray(raw.views)) {
    base.views = raw.views.map(normalizeView);
  }

  return base;
}

function normalizeView(raw: BaseView): BaseView {
  const view: BaseView = {
    type: raw.type ?? "table",
  };
  if (raw.name != null) view.name = raw.name;
  if (raw.limit != null) view.limit = raw.limit;
  if (raw.filters != null) view.filters = raw.filters;
  if (raw.groupBy != null) view.groupBy = raw.groupBy;
  if (raw.order != null) view.order = raw.order;
  if (raw.summaries != null) view.summaries = raw.summaries;
  // Table
  if (raw.rowHeight != null) view.rowHeight = raw.rowHeight;
  // Cards
  if (raw.coverProperty != null) view.coverProperty = raw.coverProperty;
  if (raw.imageFit != null) view.imageFit = raw.imageFit;
  if (raw.aspectRatio != null) view.aspectRatio = raw.aspectRatio;
  if (raw.cardSize != null) view.cardSize = raw.cardSize;
  // List
  if (raw.listStyle != null) view.listStyle = raw.listStyle;
  if (raw.separator != null) view.separator = raw.separator;
  // Map
  if (raw.coordinatesProperty != null) view.coordinatesProperty = raw.coordinatesProperty;
  if (raw.tileUrl != null) view.tileUrl = raw.tileUrl;
  return view;
}
