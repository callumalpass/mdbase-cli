import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Collection, loadConfig, loadTypes } from "@callumalpass/mdbase";
import type { TypeDefinition } from "@callumalpass/mdbase";
import yaml from "js-yaml";
import matter from "gray-matter";
import { closeAndExit } from "../utils.js";

interface FmtFileResult {
  path: string;
  changed: boolean;
}

interface FmtResult {
  files: number;
  changed: number;
  unchanged: number;
  results: FmtFileResult[];
}

export function registerFmt(program: Command): void {
  program
    .command("fmt [paths...]")
    .description("Format frontmatter: field ordering, consistent serialization")
    .option("--check", "Check formatting without modifying files")
    .option("--sort-fields", "Sort fields alphabetically (default: type schema order)")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (paths: string[], opts) => {
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

      // Load types for field ordering
      const configResult = await loadConfig(cwd);
      const typesResult = configResult.config
        ? await loadTypes(cwd, configResult.config)
        : undefined;
      const typeDefs: Map<string, TypeDefinition> = typesResult?.types ?? new Map();

      // Determine files to format
      let filePaths: string[];
      if (paths.length > 0) {
        filePaths = paths.map((p) => path.relative(cwd, path.resolve(cwd, p)));
      } else {
        const queryResult = await collection.query({});
        if (queryResult.error) {
          if (opts.format === "json") {
            console.log(JSON.stringify({ error: queryResult.error }, null, 2));
          } else {
            console.error(chalk.red(`error: ${queryResult.error.message}`));
          }
          await closeAndExit(collection, 1);
        }
        filePaths = (queryResult.results ?? []).map((r: { path: string }) => r.path);
      }

      const results: FmtFileResult[] = [];
      let changedCount = 0;

      for (const filePath of filePaths) {
        const changed = await formatFile(collection, cwd, filePath, typeDefs, opts);
        results.push({ path: filePath, changed });
        if (changed) changedCount++;
      }

      const result: FmtResult = {
        files: filePaths.length,
        changed: changedCount,
        unchanged: filePaths.length - changedCount,
        results,
      };

      switch (opts.format) {
        case "json": {
          console.log(JSON.stringify(result, null, 2));
          break;
        }

        case "yaml": {
          console.log(yaml.dump(result, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }

        case "text":
        default: {
          if (opts.check) {
            for (const r of results) {
              if (r.changed) {
                console.log(`${chalk.yellow("needs formatting")} ${r.path}`);
              }
            }
            if (changedCount === 0) {
              console.log(chalk.green(`${filePaths.length} file${filePaths.length !== 1 ? "s" : ""} already formatted`));
            } else {
              console.log(`${changedCount} file${changedCount !== 1 ? "s" : ""} need${changedCount === 1 ? "s" : ""} formatting`);
            }
          } else {
            for (const r of results) {
              if (r.changed) {
                console.log(`${chalk.green("formatted")} ${r.path}`);
              }
            }
            if (changedCount === 0) {
              console.log(chalk.green(`${filePaths.length} file${filePaths.length !== 1 ? "s" : ""} already formatted`));
            } else {
              console.log(`formatted ${changedCount} file${changedCount !== 1 ? "s" : ""}`);
            }
          }
          break;
        }
      }

      // In --check mode, exit 1 if any files need formatting
      if (opts.check && changedCount > 0) {
        await closeAndExit(collection, 1);
      }
      await closeAndExit(collection, 0);
    });
}

async function formatFile(
  collection: Collection,
  cwd: string,
  filePath: string,
  typeDefs: Map<string, TypeDefinition>,
  opts: { check?: boolean; sortFields?: boolean },
): Promise<boolean> {
  const fullPath = path.join(cwd, filePath);

  // Read raw file content
  let originalContent: string;
  try {
    originalContent = fs.readFileSync(fullPath, "utf-8");
  } catch {
    return false;
  }

  // Read through collection to get type info and processed frontmatter
  const readResult = await collection.read(filePath);
  if (readResult.error) return false;

  const raw = readResult.rawFrontmatter ?? {};
  const types = readResult.types ?? [];
  const body = readResult.body ?? "";

  // Determine field order
  const ordered = orderFields(raw, types, typeDefs, opts.sortFields ?? false);

  // Serialize with gray-matter (matching the library's approach)
  const formatted = matter.stringify(body, ordered);

  // Compare with original
  if (formatted === originalContent) {
    return false;
  }

  // Write if not in check mode
  if (!opts.check) {
    fs.writeFileSync(fullPath, formatted);
  }

  return true;
}

function orderFields(
  frontmatter: Record<string, unknown>,
  types: string[],
  typeDefs: Map<string, TypeDefinition>,
  sortAlphabetically: boolean,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const remaining = new Set(Object.keys(frontmatter));

  if (sortAlphabetically) {
    // Simple alphabetical sort, but keep type key first
    const typeKeys = ["type", "types"];
    for (const tk of typeKeys) {
      if (remaining.has(tk)) {
        result[tk] = frontmatter[tk];
        remaining.delete(tk);
      }
    }
    const sorted = [...remaining].sort();
    for (const key of sorted) {
      result[key] = frontmatter[key];
    }
    return result;
  }

  // Schema-based ordering:
  // 1. Type declaration keys first (type, types)
  // 2. Fields in type schema order
  // 3. Remaining fields alphabetically

  // Type keys first
  const typeKeys = ["type", "types"];
  for (const tk of typeKeys) {
    if (remaining.has(tk)) {
      result[tk] = frontmatter[tk];
      remaining.delete(tk);
    }
  }

  // Schema-defined fields in schema order
  for (const typeName of types) {
    const typeDef = typeDefs.get(typeName);
    if (!typeDef?.fields) continue;
    for (const fieldName of Object.keys(typeDef.fields)) {
      if (remaining.has(fieldName)) {
        result[fieldName] = frontmatter[fieldName];
        remaining.delete(fieldName);
      }
    }
  }

  // Remaining fields alphabetically
  const sorted = [...remaining].sort();
  for (const key of sorted) {
    result[key] = frontmatter[key];
  }

  return result;
}
