import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Collection, loadConfig } from "@callumalpass/mdbase";
import yaml from "js-yaml";

interface InferredField {
  type: string;
  required?: boolean;
  enum?: unknown[];
  min?: number;
  max?: number;
  items?: { type: string };
}

interface InferredType {
  name: string;
  file_count: number;
  fields: Record<string, InferredField>;
  example_files: string[];
}

function inferFieldType(values: unknown[]): string {
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  if (nonNull.length === 0) return "string";

  const allBool = nonNull.every((v) => typeof v === "boolean");
  if (allBool) return "boolean";

  const allInt = nonNull.every((v) => typeof v === "number" && Number.isInteger(v));
  if (allInt) return "integer";

  const allNum = nonNull.every((v) => typeof v === "number");
  if (allNum) return "number";

  const allArray = nonNull.every((v) => Array.isArray(v));
  if (allArray) return "list";

  return "string";
}

function inferConstraints(
  values: unknown[],
  fieldType: string,
  totalFiles: number,
): Partial<InferredField> {
  const constraints: Partial<InferredField> = {};

  // Required if present in all files
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  if (nonNull.length === totalFiles) {
    constraints.required = true;
  }

  // Enum if few distinct values (max 10, and less than half of total)
  if (fieldType === "string" && nonNull.length > 0) {
    const distinct = new Set(nonNull.map(String));
    if (distinct.size <= 10 && distinct.size < nonNull.length / 2) {
      constraints.enum = [...distinct].sort();
    }
  }

  // Min/max for numbers
  if (fieldType === "integer" || fieldType === "number") {
    const nums = nonNull.filter((v) => typeof v === "number") as number[];
    if (nums.length > 0) {
      constraints.min = Math.min(...nums);
      constraints.max = Math.max(...nums);
    }
  }

  // List item type
  if (fieldType === "list") {
    const allItems = nonNull.flatMap((v) => (Array.isArray(v) ? v : []));
    const itemType = inferFieldType(allItems);
    constraints.items = { type: itemType };
  }

  return constraints;
}

export function registerSchema(program: Command): void {
  const schema = program
    .command("schema")
    .description("Schema inference and management");

  schema
    .command("infer")
    .description("Infer type definitions from existing files")
    .option("-f, --folder <folder>", "Restrict to folder")
    .option("--min-files <n>", "Minimum files to form a type", parseInt)
    .option("--format <format>", "Output format: text, yaml", "yaml")
    .option("--write", "Write inferred types to _types/ folder")
    .action(async (opts) => {
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

      const queryResult = await collection.query({
        folder: opts.folder,
      });
      if (queryResult.error) {
        console.error(chalk.red(`error: ${queryResult.error.message}`));
        process.exit(1);
      }

      const files = queryResult.results as Array<{
        path: string;
        frontmatter: Record<string, unknown>;
        types: string[];
      }>;

      // Filter to untyped files
      const untypedFiles = files.filter((f) => f.types.length === 0);

      if (untypedFiles.length === 0) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ types: [], message: "No untyped files found" }, null, 2));
        } else {
          console.log(chalk.dim("No untyped files found"));
        }
        process.exit(0);
      }

      // Group by field signature
      const groups = new Map<string, typeof untypedFiles>();
      for (const file of untypedFiles) {
        const keys = Object.keys(file.frontmatter)
          .filter((k) => k !== "type" && k !== "types")
          .sort();
        const sig = keys.join(",");
        if (!groups.has(sig)) {
          groups.set(sig, []);
        }
        groups.get(sig)!.push(file);
      }

      const minFiles = opts.minFiles ?? 3;

      // Filter groups with enough files
      const validGroups = [...groups.entries()].filter(([, files]) => files.length >= minFiles);

      if (validGroups.length === 0) {
        if (opts.format === "json") {
          console.log(JSON.stringify({
            types: [],
            message: `No field groups with >= ${minFiles} files found`,
          }, null, 2));
        } else {
          console.log(chalk.dim(`No field groups with >= ${minFiles} files found`));
        }
        process.exit(0);
      }

      const inferredTypes: InferredType[] = [];

      for (let i = 0; i < validGroups.length; i++) {
        const [, groupFiles] = validGroups[i];
        const typeName = `inferred-type-${i + 1}`;

        const fieldNames = Object.keys(groupFiles[0].frontmatter)
          .filter((k) => k !== "type" && k !== "types");

        const fields: Record<string, InferredField> = {};

        for (const fieldName of fieldNames) {
          const values = groupFiles.map((f) => f.frontmatter[fieldName]);
          const fieldType = inferFieldType(values);
          const constraints = inferConstraints(values, fieldType, groupFiles.length);

          fields[fieldName] = {
            type: fieldType,
            ...constraints,
          };
        }

        inferredTypes.push({
          name: typeName,
          file_count: groupFiles.length,
          fields,
          example_files: groupFiles.slice(0, 3).map((f) => f.path),
        });
      }

      // Output
      if (opts.format === "json") {
        console.log(JSON.stringify({ types: inferredTypes }, null, 2));
      } else {
        // YAML output as type definitions
        for (const t of inferredTypes) {
          console.log(`# ${t.name} (${t.file_count} files)`);
          console.log(`# Examples: ${t.example_files.join(", ")}`);

          const typeDef: Record<string, unknown> = {
            name: t.name,
            fields: {} as Record<string, unknown>,
          };

          for (const [fieldName, fieldInfo] of Object.entries(t.fields)) {
            const fieldDef: Record<string, unknown> = { type: fieldInfo.type };
            if (fieldInfo.required) fieldDef.required = true;
            if (fieldInfo.enum) fieldDef.enum = fieldInfo.enum;
            if (fieldInfo.min !== undefined) fieldDef.min = fieldInfo.min;
            if (fieldInfo.max !== undefined) fieldDef.max = fieldInfo.max;
            if (fieldInfo.items) fieldDef.items = fieldInfo.items;
            (typeDef.fields as Record<string, unknown>)[fieldName] = fieldDef;
          }

          console.log(yaml.dump(typeDef, { lineWidth: -1, noRefs: true }).trimEnd());
          console.log();
        }
      }

      // Write type files if requested
      if (opts.write) {
        const configResult = await loadConfig(cwd);
        const typesFolder = configResult.config?.settings?.types_folder ?? "_types";
        const typesDirPath = path.join(cwd, typesFolder);

        if (!fs.existsSync(typesDirPath)) {
          fs.mkdirSync(typesDirPath, { recursive: true });
        }

        for (const t of inferredTypes) {
          const typeDef: Record<string, unknown> = {
            name: t.name,
            fields: {} as Record<string, unknown>,
          };
          for (const [fieldName, fieldInfo] of Object.entries(t.fields)) {
            const fieldDef: Record<string, unknown> = { type: fieldInfo.type };
            if (fieldInfo.required) fieldDef.required = true;
            if (fieldInfo.enum) fieldDef.enum = fieldInfo.enum;
            if (fieldInfo.min !== undefined) fieldDef.min = fieldInfo.min;
            if (fieldInfo.max !== undefined) fieldDef.max = fieldInfo.max;
            if (fieldInfo.items) fieldDef.items = fieldInfo.items;
            (typeDef.fields as Record<string, unknown>)[fieldName] = fieldDef;
          }

          const content = `---\n${yaml.dump(typeDef, { lineWidth: -1, noRefs: true })}---\n`;
          const filePath = path.join(typesDirPath, `${t.name}.md`);
          fs.writeFileSync(filePath, content);
          console.log(chalk.green(`  + ${typesFolder}/${t.name}.md`));
        }
      }

      process.exit(0);
    });
}
