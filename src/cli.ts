#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
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

const program = new Command();
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version?: string };

program
  .name("mdbase")
  .description("CLI tool for mdbase collections")
  .version(pkg.version ?? "0.0.0");

// Core spec commands
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
registerInit(program);
registerLint(program);
registerFmt(program);
registerExport(program);
registerImport(program);
registerGraph(program);
registerStats(program);
registerWatch(program);
registerDiff(program);
registerSchema(program);

await program.parseAsync();
