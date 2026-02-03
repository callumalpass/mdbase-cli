import { Command } from "commander";
import chalk from "chalk";
import yaml from "js-yaml";
import { Collection, loadConfig, loadTypes, getType } from "mdbase";
import type { FieldDefinition, TypeDefinition } from "mdbase";

function formatFieldType(field: FieldDefinition): string {
  let desc = field.type;
  if (field.type === "enum" && field.values) {
    desc += ` (${field.values.join(" | ")})`;
  }
  if (field.type === "list" && field.items) {
    desc += `<${field.items.type}>`;
  }
  if (field.type === "link" && field.target_type) {
    desc += `<${field.target_type}>`;
  }
  return desc;
}

function formatFieldConstraints(field: FieldDefinition): string[] {
  const parts: string[] = [];
  if (field.required) parts.push("required");
  if (field.default !== undefined) parts.push(`default: ${JSON.stringify(field.default)}`);
  if (field.unique) parts.push("unique");
  if (field.deprecated) parts.push("deprecated");
  if (field.generated) {
    if (typeof field.generated === "string") {
      parts.push(`generated: ${field.generated}`);
    } else if ("from" in field.generated) {
      parts.push(`generated: ${field.generated.from} → ${field.generated.transform}`);
    } else if ("random" in field.generated) {
      parts.push(`generated: random(${field.generated.random})`);
    } else if ("sequence" in field.generated) {
      parts.push(`generated: sequence`);
    }
  }
  if (field.computed) parts.push(`computed: ${field.computed}`);
  if (field.min !== undefined) parts.push(`min: ${field.min}`);
  if (field.max !== undefined) parts.push(`max: ${field.max}`);
  if (field.min_length !== undefined) parts.push(`min_length: ${field.min_length}`);
  if (field.max_length !== undefined) parts.push(`max_length: ${field.max_length}`);
  if (field.pattern) parts.push(`pattern: ${field.pattern}`);
  if (field.min_items !== undefined) parts.push(`min_items: ${field.min_items}`);
  if (field.max_items !== undefined) parts.push(`max_items: ${field.max_items}`);
  if (field.validate_exists) parts.push("validate_exists");
  return parts;
}

async function loadTypesFromCwd(format: string): Promise<Map<string, TypeDefinition>> {
  const cwd = process.cwd();
  const configResult = await loadConfig(cwd);
  if (!configResult.valid || !configResult.config) {
    if (format === "json") {
      console.log(JSON.stringify({ error: configResult.error }, null, 2));
    } else {
      console.error(chalk.red(`error: ${configResult.error?.message ?? "failed to load config"}`));
    }
    process.exit(3);
  }

  const typesResult = await loadTypes(cwd, configResult.config);
  if (!typesResult.valid || !typesResult.types) {
    if (format === "json") {
      console.log(JSON.stringify({ error: typesResult.error }, null, 2));
    } else {
      console.error(chalk.red(`error: ${typesResult.error?.message ?? "failed to load types"}`));
    }
    process.exit(1);
  }

  return typesResult.types;
}

export function registerTypes(program: Command): void {
  const types = program
    .command("types")
    .description("Manage type definitions");

  types
    .command("list")
    .description("List all type definitions")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (opts) => {
      const typeDefs = await loadTypesFromCwd(opts.format);

      const typeList = Array.from(typeDefs.values()).map((t) => ({
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        ...(t.extends ? { extends: t.extends } : {}),
        fields: t.fields ? Object.keys(t.fields).length : 0,
        ...(t.strict !== undefined ? { strict: t.strict } : {}),
      }));

      // Sort alphabetically by name
      typeList.sort((a, b) => a.name.localeCompare(b.name));

      switch (opts.format) {
        case "json": {
          console.log(JSON.stringify(typeList, null, 2));
          break;
        }

        case "yaml": {
          console.log(yaml.dump(typeList, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }

        case "text":
        default: {
          if (typeList.length === 0) {
            console.log(chalk.dim("(no types defined)"));
            break;
          }

          const nameWidth = Math.max(...typeList.map((t) => t.name.length));
          for (const t of typeList) {
            let line = chalk.bold(t.name.padEnd(nameWidth));
            const meta: string[] = [];
            meta.push(`${t.fields} field${t.fields === 1 ? "" : "s"}`);
            if (t.extends) meta.push(`extends ${t.extends}`);
            if (t.strict !== undefined) meta.push(`strict: ${t.strict}`);
            line += `  ${chalk.dim(meta.join(", "))}`;
            if (t.description) {
              line += `  ${t.description}`;
            }
            console.log(line);
          }
          break;
        }
      }

      process.exit(0);
    });

  types
    .command("show <name>")
    .description("Show details of a type definition")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (name: string, opts) => {
      const cwd = process.cwd();
      const configResult = await loadConfig(cwd);
      if (!configResult.valid || !configResult.config) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: configResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${configResult.error?.message ?? "failed to load config"}`));
        }
        process.exit(3);
      }

      const result = await getType(cwd, configResult.config, name);

      if (result.error) {
        const exitCode = result.error.code === "unknown_type" ? 1 : 1;
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: result.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${result.error.message}`));
        }
        process.exit(exitCode);
      }

      const typeDef = result.type!;

      switch (opts.format) {
        case "json": {
          const output: Record<string, unknown> = { name: typeDef.name };
          if (typeDef.description) output.description = typeDef.description;
          if (typeDef.extends) output.extends = typeDef.extends;
          if (typeDef.strict !== undefined) output.strict = typeDef.strict;
          if (typeDef.fields) output.fields = typeDef.fields;
          if (typeDef.path_pattern) output.path_pattern = typeDef.path_pattern;
          if (typeDef.match) output.match = typeDef.match;
          if (typeDef.validation) output.validation = typeDef.validation;
          if (result.warnings?.length) output.warnings = result.warnings;
          console.log(JSON.stringify(output, null, 2));
          break;
        }

        case "yaml": {
          const output: Record<string, unknown> = { name: typeDef.name };
          if (typeDef.description) output.description = typeDef.description;
          if (typeDef.extends) output.extends = typeDef.extends;
          if (typeDef.strict !== undefined) output.strict = typeDef.strict;
          if (typeDef.fields) output.fields = typeDef.fields;
          if (typeDef.path_pattern) output.path_pattern = typeDef.path_pattern;
          if (typeDef.match) output.match = typeDef.match;
          if (typeDef.validation) output.validation = typeDef.validation;
          if (result.warnings?.length) output.warnings = result.warnings;
          console.log(yaml.dump(output, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }

        case "text":
        default: {
          // Type header
          console.log(chalk.bold(typeDef.name));
          if (typeDef.description) {
            console.log(typeDef.description);
          }
          console.log();

          // Metadata
          const meta: string[] = [];
          if (typeDef.extends) meta.push(`extends: ${typeDef.extends}`);
          if (typeDef.strict !== undefined) meta.push(`strict: ${typeDef.strict}`);
          if (typeDef.path_pattern) meta.push(`path_pattern: ${typeDef.path_pattern}`);
          if (meta.length > 0) {
            for (const m of meta) {
              console.log(chalk.dim(m));
            }
            console.log();
          }

          // Fields
          const fields = typeDef.fields;
          if (fields && Object.keys(fields).length > 0) {
            console.log(chalk.dim("fields:"));
            const fieldNames = Object.keys(fields);
            const nameWidth = Math.max(...fieldNames.map((n) => n.length));
            const typeWidth = Math.max(...fieldNames.map((n) => formatFieldType(fields[n]).length));
            for (const fieldName of fieldNames) {
              const field = fields[fieldName];
              const typeStr = formatFieldType(field);
              const constraints = formatFieldConstraints(field);
              let line = `  ${chalk.cyan(fieldName.padEnd(nameWidth))}  ${typeStr.padEnd(typeWidth)}`;
              if (constraints.length > 0) {
                line += `  ${chalk.dim(constraints.join(", "))}`;
              }
              console.log(line);
            }
          } else {
            console.log(chalk.dim("(no fields defined)"));
          }

          // Match rules
          if (typeDef.match) {
            console.log();
            console.log(chalk.dim("match:"));
            if (typeDef.match.path_glob) {
              console.log(`  ${chalk.dim("path_glob:")} ${typeDef.match.path_glob}`);
            }
            if (typeDef.match.fields_present) {
              console.log(`  ${chalk.dim("fields_present:")} ${typeDef.match.fields_present.join(", ")}`);
            }
            if (typeDef.match.where) {
              console.log(`  ${chalk.dim("where:")} ${JSON.stringify(typeDef.match.where)}`);
            }
          }

          // Warnings
          if (result.warnings?.length) {
            console.log();
            for (const w of result.warnings) {
              console.log(chalk.yellow(`  warn: ${w}`));
            }
          }
          break;
        }
      }

      process.exit(0);
    });

  types
    .command("create <name>")
    .description("Create a new type definition")
    .option("--extends <parent>", "Parent type to extend")
    .option("--strict [mode]", "Strict mode: true, false, or warn")
    .option("--description <desc>", "Type description")
    .option("-f, --field <fields...>", "Field definitions as name:type or name:type:constraint")
    .option("--path-pattern <pattern>", "Path pattern for the type")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (name: string, opts) => {
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

      // Parse field definitions
      let fields: Record<string, unknown> | undefined;
      if (opts.field) {
        fields = {};
        for (const f of opts.field as string[]) {
          const parsed = parseFieldSpec(f);
          if (!parsed) {
            console.error(chalk.red(`error: invalid field format: ${f} (expected name:type or name:type:required)`));
            process.exit(1);
          }
          fields[parsed.name] = parsed.definition;
        }
      }

      // Parse strict mode
      let strict: boolean | "warn" | undefined;
      if (opts.strict !== undefined) {
        if (opts.strict === true || opts.strict === "true") {
          strict = true;
        } else if (opts.strict === "false") {
          strict = false;
        } else if (opts.strict === "warn") {
          strict = "warn";
        } else {
          strict = true; // --strict with no value
        }
      }

      const input: {
        name: string;
        description?: string;
        extends?: string;
        strict?: boolean | "warn";
        fields?: Record<string, unknown>;
        path_pattern?: string;
      } = { name };

      if (opts.description) input.description = opts.description;
      if (opts.extends) input.extends = opts.extends;
      if (strict !== undefined) input.strict = strict;
      if (fields) input.fields = fields;
      if (opts.pathPattern) input.path_pattern = opts.pathPattern;

      const result = await collection.createType(input);

      if (result.error) {
        const exitCode = result.error.code === "path_conflict" ? 1
          : result.error.code === "missing_parent_type" ? 1
          : result.error.code === "invalid_type_definition" ? 2
          : 1;

        if (opts.format === "json") {
          console.log(JSON.stringify({ error: result.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${result.error.message}`));
        }
        process.exit(exitCode);
      }

      const typeDef = result.type!;

      switch (opts.format) {
        case "json": {
          console.log(JSON.stringify(typeDef, null, 2));
          break;
        }

        case "yaml": {
          console.log(yaml.dump(typeDef, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }

        case "text":
        default: {
          console.log(`${chalk.green("created")} ${chalk.bold(`type ${name}`)}`);
          if (typeDef.description) console.log(`  ${typeDef.description}`);
          if (typeDef.extends) console.log(`  ${chalk.dim("extends:")} ${typeDef.extends}`);
          if (typeDef.strict !== undefined) console.log(`  ${chalk.dim("strict:")} ${typeDef.strict}`);
          if (typeDef.fields) {
            const fieldEntries = Object.entries(typeDef.fields as Record<string, Record<string, unknown>>);
            if (fieldEntries.length > 0) {
              const nameWidth = Math.max(...fieldEntries.map(([n]) => n.length));
              for (const [fieldName, fieldDef] of fieldEntries) {
                const typeStr = String(fieldDef.type ?? "any");
                const attrs: string[] = [];
                if (fieldDef.required) attrs.push("required");
                console.log(`  ${chalk.cyan(fieldName.padEnd(nameWidth))}  ${typeStr}${attrs.length ? "  " + chalk.dim(attrs.join(", ")) : ""}`);
              }
            }
          }
          break;
        }
      }

      process.exit(0);
    });
}

/**
 * Parse a field spec like "title:string", "rating:integer:required",
 * or "status:enum:open,closed,pending".
 */
function parseFieldSpec(spec: string): { name: string; definition: Record<string, unknown> } | null {
  const parts = spec.split(":");
  if (parts.length < 2) return null;

  const name = parts[0];
  const type = parts[1];
  if (!name || !type) return null;

  const definition: Record<string, unknown> = { type };

  // Parse remaining parts as constraints
  for (let i = 2; i < parts.length; i++) {
    const part = parts[i];
    if (part === "required") {
      definition.required = true;
    } else if (part === "unique") {
      definition.unique = true;
    } else if (part === "deprecated") {
      definition.deprecated = true;
    } else if (part.startsWith("default=")) {
      definition.default = part.slice(8);
    } else if (part.startsWith("min=")) {
      definition.min = Number(part.slice(4));
    } else if (part.startsWith("max=")) {
      definition.max = Number(part.slice(4));
    } else if (part.startsWith("pattern=")) {
      definition.pattern = part.slice(8);
    } else if (type === "enum") {
      // For enum, remaining parts are comma-separated values
      definition.values = part.split(",").map((v) => v.trim());
    }
  }

  return { name, definition };
}
