import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import yaml from "js-yaml";
import { Collection, SUPPORTED_SPEC_VERSION } from "@callumalpass/mdbase";
import { addCollection, RegistryError } from "../collections/registry.js";

type InitOutput = {
  root: string;
  files: string[];
  name?: string;
  registered?: {
    alias: string;
    path: string;
  };
};

function registryExitCode(code: string): number {
  if (code === "path_not_found") return 4;
  if (code === "missing_config" || code === "invalid_config") return 3;
  return 1;
}

function renderExampleType(typeName: string, specVersion: string): string {
  const definition = /^0\.2(?:\.|$)/.test(specVersion)
    ? {
        name: typeName,
        fields: {
          title: { type: "string", required: true },
          tags: { type: "list", items: { type: "string" } },
        },
      }
    : {
        kind: "mdbase.type",
        name: typeName,
        version: 1,
        schema: {
          dialect: "json-schema-2020-12",
          value: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            additionalProperties: true,
            required: ["title"],
            properties: {
              type: { const: typeName },
              title: { type: "string", minLength: 1 },
              tags: { type: "array", items: { type: "string" } },
            },
          },
        },
        collection: {
          display: { name_field: "title" },
        },
      };
  return `---\n${yaml.dump(definition, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  })}---\n`;
}

function isValidExampleTypeName(value: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(value) &&
    !["file", "formula", "this"].includes(value);
}

export function registerInit(program: Command): void {
  program
    .command("init [directory]")
    .description("Initialize a new mdbase collection")
    .option("-n, --name <name>", "Collection name")
    .option("-d, --description <description>", "Collection description")
    .option("--spec-version <version>", "Spec version", SUPPORTED_SPEC_VERSION)
    .option("--types-folder <folder>", "Types folder name", "_types")
    .option("--example-type <name>", "Create an example type definition")
    .option("--register [alias]", "Register collection in global registry (optional alias)")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (directory: string | undefined, opts) => {
      const targetDir = directory
        ? path.resolve(process.cwd(), directory)
        : process.cwd();

      // Check if mdbase.yaml already exists
      const configPath = path.join(targetDir, "mdbase.yaml");
      if (fs.existsSync(configPath)) {
        const msg = `mdbase.yaml already exists in ${targetDir}`;
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { code: "already_initialized", message: msg } }, null, 2));
        } else {
          console.error(chalk.red(`error: ${msg}`));
        }
        process.exit(1);
      }

      if (opts.exampleType && !isValidExampleTypeName(opts.exampleType)) {
        const msg = `invalid example type name: ${opts.exampleType}`;
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { code: "invalid_type_name", message: msg } }, null, 2));
        } else {
          console.error(chalk.red(`error: ${msg}`));
        }
        process.exit(1);
      }

      // Build input for Collection.init()
      const config: Record<string, unknown> = {
        spec_version: opts.specVersion,
      };
      if (opts.name) config.name = opts.name;
      if (opts.description) config.description = opts.description;
      if (opts.typesFolder !== "_types") {
        config.settings = { types_folder: opts.typesFolder };
      }

      let initResult: Record<string, unknown>;
      try {
        initResult = await Collection.init(targetDir, { config });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { code: "init_failed", message: msg } }, null, 2));
        } else {
          console.error(chalk.red(`error: ${msg}`));
        }
        process.exit(5);
      }

      // Build file list from library result
      const createdFiles: string[] = [];
      if (initResult.config_path) createdFiles.push(String(initResult.config_path));
      const typesFolder = String(initResult.types_folder || "_types");
      createdFiles.push(typesFolder + "/");
      if (initResult.meta_type_path) createdFiles.push(String(initResult.meta_type_path));

      // Create example type if requested (CLI convenience, not part of spec)
      if (opts.exampleType) {
        const typesDirPath = path.join(targetDir, typesFolder);
        const typeName = opts.exampleType;
        const typeFile = path.join(typesDirPath, `${typeName}.md`);
        if (fs.existsSync(typeFile)) {
          // skip silently — meta.md might collide if someone passes --example-type meta
        } else {
          const typeContent = renderExampleType(typeName, String(opts.specVersion));
          fs.writeFileSync(typeFile, typeContent);
          createdFiles.push(`${typesFolder}/${typeName}.md`);
        }
      }

      // Output result
      const result: InitOutput = {
        root: targetDir,
        files: createdFiles,
      };
      if (opts.name) result.name = opts.name;

      // Optional: register initialized collection in global registry.
      if (opts.register !== undefined) {
        const alias = typeof opts.register === "string" && opts.register.trim().length > 0
          ? opts.register
          : (path.basename(targetDir) || "collection");
        try {
          const registered = await addCollection(alias, targetDir);
          result.registered = { alias: registered.alias, path: registered.path };
        } catch (err) {
          const code = err instanceof RegistryError ? err.code : "register_failed";
          const message = err instanceof Error ? err.message : String(err);
          if (opts.format === "json") {
            console.log(JSON.stringify({ error: { code, message }, initialized: result }, null, 2));
          } else if (opts.format === "yaml") {
            console.log(yaml.dump({ error: { code, message }, initialized: result }, { lineWidth: -1, noRefs: true }).trimEnd());
          } else {
            console.error(chalk.red(`error: ${message}`));
            console.error(chalk.yellow("note: collection was initialized but not registered"));
          }
          process.exit(registryExitCode(code));
        }
      }

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
          console.log(`${chalk.green("initialized")} ${chalk.bold(targetDir)}`);
          for (const f of createdFiles) {
            console.log(`  ${chalk.dim("+")} ${f}`);
          }
          if (result.registered) {
            console.log(`${chalk.green("registered")} ${chalk.bold(result.registered.alias)} -> ${result.registered.path}`);
          }
          break;
        }
      }

      process.exit(0);
    });
}
