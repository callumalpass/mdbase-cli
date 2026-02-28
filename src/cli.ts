#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@callumalpass/mdbase";
import { registerValidate } from "./commands/validate.js";
import { registerQuery } from "./commands/query.js";
import { registerRead } from "./commands/read.js";
import { registerCreate } from "./commands/create.js";
import { registerUpdate } from "./commands/update.js";
import { registerDelete } from "./commands/delete.js";
import { registerRename } from "./commands/rename.js";
import { registerTypes } from "./commands/types.js";
import { registerBase } from "./commands/base.js";
import { registerInit } from "./commands/init.js";
import { registerLint } from "./commands/lint.js";
import { registerFmt } from "./commands/fmt.js";
import { registerExport } from "./commands/export.js";
import { registerImport } from "./commands/import.js";
import { registerGraph } from "./commands/graph.js";
import { registerStats } from "./commands/stats.js";
import { registerWatch } from "./commands/watch.js";
import { registerDiff } from "./commands/diff.js";
import { registerSchema } from "./commands/schema.js";
import { registerCollections } from "./commands/collections.js";
import { RegistryError, showCollection } from "./collections/registry.js";

class CollectionOptionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function commandPathNames(command: Command): string[] {
  const names: string[] = [];
  let current: Command | null = command;
  while (current) {
    names.unshift(current.name());
    current = current.parent ?? null;
  }
  return names;
}

function shouldSkipCollectionResolution(command: Command): boolean {
  const names = commandPathNames(command);
  if (names.includes("collections") || names.includes("collection")) return true;
  return command.name() === "init";
}

function outputCollectionOptionError(command: Command, code: string, message: string): never {
  const format = command.opts()?.format;
  if (format === "json") {
    console.log(JSON.stringify({ error: { code, message } }, null, 2));
  } else {
    console.error(`error: ${message}`);
  }
  const exitCode = code === "path_not_found" ? 4
    : code === "missing_config" || code === "invalid_config" ? 3
    : 1;
  process.exit(exitCode);
}

async function resolveCollectionRoot(alias: string): Promise<string> {
  let entry: Awaited<ReturnType<typeof showCollection>>;
  try {
    entry = await showCollection(alias);
  } catch (err) {
    if (err instanceof RegistryError) {
      throw new CollectionOptionError(err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new CollectionOptionError("collection_resolution_failed", message);
  }

  const root = entry.path;
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(root);
  } catch {
    throw new CollectionOptionError("path_not_found", `Registered collection path not found: ${root}`);
  }
  if (!stat.isDirectory()) {
    throw new CollectionOptionError("invalid_path", `Registered collection path is not a directory: ${root}`);
  }

  const configPath = path.join(root, "mdbase.yaml");
  if (!fs.existsSync(configPath)) {
    throw new CollectionOptionError("missing_config", `No mdbase.yaml found in ${root}`);
  }

  const configResult = await loadConfig(root);
  if (!configResult.valid || !configResult.config) {
    throw new CollectionOptionError(
      "invalid_config",
      configResult.error?.message ?? `Invalid mdbase.yaml in ${root}`,
    );
  }

  return root;
}

const program = new Command();
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version?: string };

program
  .name("mdbase")
  .description("CLI tool for mdbase collections")
  .version(pkg.version ?? "0.0.0")
  .option("-C, --collection <alias>", "Run command against a registered collection alias");

// Core spec commands
registerInit(program);
registerValidate(program);
registerQuery(program);
registerRead(program);
registerCreate(program);
registerUpdate(program);
registerDelete(program);
registerRename(program);
registerTypes(program);

// Obsidian Bases integration
registerBase(program);

// Beyond-spec commands
registerLint(program);
registerFmt(program);
registerExport(program);
registerImport(program);
registerGraph(program);
registerStats(program);
registerWatch(program);
registerDiff(program);
registerSchema(program);
registerCollections(program);

program.hook("preAction", async (_thisCommand, actionCommand) => {
  const globalOpts = actionCommand.optsWithGlobals() as { collection?: string };
  const alias = globalOpts.collection;
  if (!alias) return;
  if (shouldSkipCollectionResolution(actionCommand)) return;

  try {
    const root = await resolveCollectionRoot(alias);
    process.chdir(root);
  } catch (err) {
    if (err instanceof CollectionOptionError) {
      outputCollectionOptionError(actionCommand, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    outputCollectionOptionError(actionCommand, "collection_resolution_failed", message);
  }
});

await program.parseAsync();
