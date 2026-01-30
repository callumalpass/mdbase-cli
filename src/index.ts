/**
 * mdbase-cli — programmatic API for the CLI tool.
 *
 * Most users will use the CLI directly, but this module exports
 * key functions for programmatic use.
 */

export { parseBaseFile, parseBaseFilePath } from "./base/parser.js";
export type { BaseFile, BaseView, BaseFilter, FilterExpression } from "./base/parser.js";
export { executeBase, filterToWhere } from "./base/executor.js";
export type { BaseResult } from "./base/executor.js";
export { formatResults } from "./base/formatter.js";
export type { OutputFormat } from "./base/formatter.js";
