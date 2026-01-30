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

/**
 * Parse a .base file from its YAML content string.
 */
export function parseBaseFile(content: string): BaseFile {
  const parsed = yaml.load(content) as BaseFile;
  return parsed ?? {};
}

/**
 * Parse a .base file from a file path.
 */
export function parseBaseFilePath(filePath: string): BaseFile {
  const fs = require("node:fs");
  const content = fs.readFileSync(filePath, "utf-8");
  return parseBaseFile(content);
}
