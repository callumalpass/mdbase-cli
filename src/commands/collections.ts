import { Command } from "commander";
import chalk from "chalk";
import yaml from "js-yaml";
import path from "node:path";
import { Collection } from "@callumalpass/mdbase";
import {
  addCollection,
  listCollections,
  removeCollection,
  renameCollection,
  showCollection,
  RegistryError,
  resolveRegistryPath,
} from "../collections/registry.js";

type OutputFormat = "text" | "json" | "yaml" | "paths";

interface CollectionFilesGroup {
  alias: string;
  root: string;
  files: string[];
  count: number;
}

function aliasesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function getExitCode(err: RegistryError): number {
  switch (err.code) {
    case "path_not_found":
      return 4;
    case "missing_config":
    case "invalid_config":
      return 3;
    default:
      return 1;
  }
}

function printError(err: unknown, format: OutputFormat): never {
  if (err instanceof RegistryError) {
    if (format === "json") {
      console.log(JSON.stringify({ error: { code: err.code, message: err.message } }, null, 2));
    } else {
      console.error(chalk.red(`error: ${err.message}`));
    }
    process.exit(getExitCode(err));
  }

  const message = err instanceof Error ? err.message : String(err);
  if (format === "json") {
    console.log(JSON.stringify({ error: { code: "unexpected_error", message } }, null, 2));
  } else {
    console.error(chalk.red(`error: ${message}`));
  }
  process.exit(1);
}

export function registerCollections(program: Command): void {
  const collections = program
    .command("collections")
    .alias("collection")
    .description("Manage a registry of named mdbase collections");

  collections
    .command("add <alias> <path>")
    .description("Register a collection path under an alias")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (alias: string, collectionPath: string, opts: { format: OutputFormat }) => {
      try {
        const entry = await addCollection(alias, collectionPath);

        switch (opts.format) {
          case "json":
            console.log(JSON.stringify(entry, null, 2));
            break;
          case "yaml":
            console.log(yaml.dump(entry, { lineWidth: -1, noRefs: true }).trimEnd());
            break;
          case "text":
          default:
            console.log(`${chalk.green("added")} ${chalk.bold(entry.alias)} -> ${entry.path}`);
            if (entry.collection_name) {
              console.log(`  ${chalk.dim("name:")} ${entry.collection_name}`);
            }
            if (entry.collection_description) {
              console.log(`  ${chalk.dim("description:")} ${entry.collection_description}`);
            }
            break;
        }

        process.exit(0);
      } catch (err) {
        printError(err, opts.format);
      }
    });

  collections
    .command("files")
    .description("List markdown files across registered collections")
    .option("--alias <alias>", "Only include one collection alias")
    .option("--absolute", "Show absolute file paths")
    .option("--format <format>", "Output format: text, json, yaml, paths", "text")
    .action(async (opts: { alias?: string; absolute?: boolean; format: OutputFormat }) => {
      try {
        const entries = await listCollections();
        const selected = opts.alias
          ? entries.filter((entry) => aliasesEqual(entry.alias, opts.alias!))
          : entries;

        if (opts.alias && selected.length === 0) {
          throw new RegistryError("collection_not_found", `Unknown collection alias: ${opts.alias}`);
        }

        const groups: CollectionFilesGroup[] = [];
        for (const entry of selected) {
          const openResult = await Collection.open(entry.path);
          if (openResult.error || !openResult.collection) {
            throw new RegistryError(
              "invalid_collection",
              `Failed to open collection "${entry.alias}": ${openResult.error?.message ?? "unknown error"}`,
            );
          }

          const collection = openResult.collection;
          try {
            const queryResult = await collection.query({});
            if (queryResult.error) {
              throw new RegistryError(
                "query_failed",
                `Failed to query collection "${entry.alias}": ${queryResult.error.message}`,
              );
            }

            const files = (queryResult.results ?? [])
              .map((row) => String((row as { path?: string }).path ?? ""))
              .filter((p) => p.length > 0)
              .sort((a, b) => a.localeCompare(b));
            groups.push({
              alias: entry.alias,
              root: entry.path,
              files,
              count: files.length,
            });
          } finally {
            await collection.close();
          }
        }

        const totalFiles = groups.reduce((sum, group) => sum + group.count, 0);

        switch (opts.format) {
          case "json": {
            console.log(JSON.stringify({
              collections: groups,
              meta: {
                collections: groups.length,
                files: totalFiles,
              },
            }, null, 2));
            break;
          }

          case "yaml": {
            console.log(yaml.dump({
              collections: groups,
              meta: {
                collections: groups.length,
                files: totalFiles,
              },
            }, { lineWidth: -1, noRefs: true }).trimEnd());
            break;
          }

          case "paths": {
            for (const group of groups) {
              for (const rel of group.files) {
                if (opts.absolute) {
                  console.log(path.join(group.root, rel));
                } else {
                  console.log(`${group.alias}:${rel}`);
                }
              }
            }
            break;
          }

          case "text":
          default: {
            if (groups.length === 0) {
              console.log(chalk.dim("(no registered collections)"));
              break;
            }
            for (const group of groups) {
              console.log(chalk.bold(`${group.alias} (${group.count})`));
              for (const rel of group.files) {
                if (opts.absolute) {
                  console.log(`  ${path.join(group.root, rel)}`);
                } else {
                  console.log(`  ${rel}`);
                }
              }
            }
            console.log(chalk.dim(`total files: ${totalFiles}`));
            break;
          }
        }

        process.exit(0);
      } catch (err) {
        printError(err, opts.format);
      }
    });

  collections
    .command("list")
    .description("List all registered collections")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (opts: { format: OutputFormat }) => {
      try {
        const entries = await listCollections();

        switch (opts.format) {
          case "json":
            console.log(JSON.stringify(entries, null, 2));
            break;
          case "yaml":
            console.log(yaml.dump(entries, { lineWidth: -1, noRefs: true }).trimEnd());
            break;
          case "text":
          default:
            if (entries.length === 0) {
              console.log(chalk.dim("(no registered collections)"));
              break;
            }
            const aliasWidth = Math.max(...entries.map((entry) => entry.alias.length));
            for (const entry of entries) {
              const label = entry.collection_name ? ` (${entry.collection_name})` : "";
              console.log(`${chalk.bold(entry.alias.padEnd(aliasWidth))}  ${entry.path}${label}`);
            }
            break;
        }

        process.exit(0);
      } catch (err) {
        printError(err, opts.format);
      }
    });

  collections
    .command("show <alias>")
    .description("Show a registered collection")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (alias: string, opts: { format: OutputFormat }) => {
      try {
        const entry = await showCollection(alias);
        const payload = {
          ...entry,
          registry_path: resolveRegistryPath(),
        };

        switch (opts.format) {
          case "json":
            console.log(JSON.stringify(payload, null, 2));
            break;
          case "yaml":
            console.log(yaml.dump(payload, { lineWidth: -1, noRefs: true }).trimEnd());
            break;
          case "text":
          default:
            console.log(chalk.bold(entry.alias));
            console.log(`  ${chalk.dim("path:")} ${entry.path}`);
            if (entry.collection_name) console.log(`  ${chalk.dim("name:")} ${entry.collection_name}`);
            if (entry.collection_description) {
              console.log(`  ${chalk.dim("description:")} ${entry.collection_description}`);
            }
            console.log(`  ${chalk.dim("added_at:")} ${entry.added_at}`);
            console.log(`  ${chalk.dim("updated_at:")} ${entry.updated_at}`);
            console.log(`  ${chalk.dim("registry:")} ${resolveRegistryPath()}`);
            break;
        }

        process.exit(0);
      } catch (err) {
        printError(err, opts.format);
      }
    });

  collections
    .command("remove <alias>")
    .description("Remove a collection alias from the registry")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (alias: string, opts: { format: OutputFormat }) => {
      try {
        const removed = await removeCollection(alias);
        switch (opts.format) {
          case "json":
            console.log(JSON.stringify(removed, null, 2));
            break;
          case "yaml":
            console.log(yaml.dump(removed, { lineWidth: -1, noRefs: true }).trimEnd());
            break;
          case "text":
          default:
            console.log(`${chalk.green("removed")} ${chalk.bold(removed.alias)} (${removed.path})`);
            break;
        }
        process.exit(0);
      } catch (err) {
        printError(err, opts.format);
      }
    });

  collections
    .command("rename <oldAlias> <newAlias>")
    .description("Rename a collection alias")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (oldAlias: string, newAlias: string, opts: { format: OutputFormat }) => {
      try {
        const entry = await renameCollection(oldAlias, newAlias);
        switch (opts.format) {
          case "json":
            console.log(JSON.stringify(entry, null, 2));
            break;
          case "yaml":
            console.log(yaml.dump(entry, { lineWidth: -1, noRefs: true }).trimEnd());
            break;
          case "text":
          default:
            console.log(`${chalk.green("renamed")} ${chalk.bold(oldAlias)} -> ${chalk.bold(entry.alias)}`);
            break;
        }
        process.exit(0);
      } catch (err) {
        printError(err, opts.format);
      }
    });
}
