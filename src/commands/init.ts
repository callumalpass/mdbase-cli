import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import yaml from "js-yaml";

interface InitResult {
  root: string;
  files: string[];
  name?: string;
  warnings?: string[];
}

export function registerInit(program: Command): void {
  program
    .command("init [directory]")
    .description("Initialize a new mdbase collection")
    .option("-n, --name <name>", "Collection name")
    .option("-d, --description <description>", "Collection description")
    .option("--spec-version <version>", "Spec version", "0.1.0")
    .option("--types-folder <folder>", "Types folder name", "_types")
    .option("--no-types-folder", "Skip creating types folder")
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

      // Create the target directory if it doesn't exist
      if (!fs.existsSync(targetDir)) {
        try {
          fs.mkdirSync(targetDir, { recursive: true });
        } catch (err) {
          const msg = `cannot create directory: ${targetDir}`;
          if (opts.format === "json") {
            console.log(JSON.stringify({ error: { code: "permission_denied", message: msg } }, null, 2));
          } else {
            console.error(chalk.red(`error: ${msg}`));
          }
          process.exit(5);
        }
      }

      const createdFiles: string[] = [];
      const warnings: string[] = [];

      // Build config
      const config: Record<string, unknown> = {
        spec_version: opts.specVersion,
      };
      if (opts.name) {
        config.name = opts.name;
      }
      if (opts.description) {
        config.description = opts.description;
      }

      // Write mdbase.yaml
      const configContent = yaml.dump(config, { lineWidth: -1, noRefs: true, quotingType: '"' });
      fs.writeFileSync(configPath, configContent);
      createdFiles.push("mdbase.yaml");

      // Create types folder (unless --no-types-folder)
      const typesFolder = opts.typesFolder;
      if (typesFolder !== false) {
        const typesFolderName = typeof typesFolder === "string" ? typesFolder : "_types";
        const typesDirPath = path.join(targetDir, typesFolderName);
        if (!fs.existsSync(typesDirPath)) {
          fs.mkdirSync(typesDirPath, { recursive: true });
          createdFiles.push(typesFolderName + "/");
        } else {
          warnings.push(`${typesFolderName}/ already exists`);
        }

        // Create example type if requested
        if (opts.exampleType) {
          const typeName = opts.exampleType;
          const typeFile = path.join(typesDirPath, `${typeName}.md`);
          if (fs.existsSync(typeFile)) {
            warnings.push(`${typesFolderName}/${typeName}.md already exists, skipping`);
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
            createdFiles.push(`${typesFolderName}/${typeName}.md`);
          }
        }
      }

      // Output result
      const result: InitResult = {
        root: targetDir,
        files: createdFiles,
      };
      if (opts.name) result.name = opts.name;
      if (warnings.length > 0) result.warnings = warnings;

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
          if (warnings.length > 0) {
            for (const w of warnings) {
              console.log(chalk.yellow(`  warn: ${w}`));
            }
          }
          break;
        }
      }

      process.exit(0);
    });
}
