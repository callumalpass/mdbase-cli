import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import yaml from "js-yaml";
import { Collection } from "@callumalpass/mdbase";

export function registerInit(program: Command): void {
  program
    .command("init [directory]")
    .description("Initialize a new mdbase collection")
    .option("-n, --name <name>", "Collection name")
    .option("-d, --description <description>", "Collection description")
    .option("--spec-version <version>", "Spec version", "0.2.0")
    .option("--types-folder <folder>", "Types folder name", "_types")
    .option("--example-type <name>", "Create an example type definition")
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

      // Build input for Collection.init()
      const config: Record<string, unknown> = {
        spec_version: opts.specVersion,
      };
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

      // The library doesn't serialize name/description — add them if provided
      if (opts.name || opts.description) {
        const configContent = fs.readFileSync(configPath, "utf-8");
        const configData = yaml.load(configContent) as Record<string, unknown>;
        if (opts.name) configData.name = opts.name;
        if (opts.description) configData.description = opts.description;
        fs.writeFileSync(configPath, yaml.dump(configData, { lineWidth: -1, noRefs: true, quotingType: '"' }));
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
          const typeContent = [
            "---",
            `name: ${typeName}`,
            "fields:",
            "  title:",
            "    type: string",
            "    required: true",
            "  tags:",
            "    type: list",
            "    items:",
            "      type: string",
            "---",
            "",
          ].join("\n");
          fs.writeFileSync(typeFile, typeContent);
          createdFiles.push(`${typesFolder}/${typeName}.md`);
        }
      }

      // Output result
      const result: { root: string; files: string[]; name?: string } = {
        root: targetDir,
        files: createdFiles,
      };
      if (opts.name) result.name = opts.name;

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
          break;
        }
      }

      process.exit(0);
    });
}
