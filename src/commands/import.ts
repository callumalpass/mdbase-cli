import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import { parse } from "csv-parse/sync";
import { closeAndExit } from "../utils.js";

function coerceValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

interface ImportResult {
  total: number;
  created: number;
  failed: number;
  dry_run: boolean;
  files: Array<{ path: string; status: "created" | "failed"; error?: string }>;
}

export function registerImport(program: Command): void {
  const imp = program
    .command("import")
    .description("Import data into the collection");

  imp
    .command("csv <file>")
    .description("Import from CSV file")
    .option("-t, --type <type>", "Type for imported files")
    .option("--path-field <field>", "CSV column to use as file path")
    .option("--dry-run", "Show what would be created without writing files")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (file: string, opts) => {
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

      const csvPath = path.resolve(cwd, file);
      if (!fs.existsSync(csvPath)) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { code: "file_not_found", message: `File not found: ${file}` } }, null, 2));
        } else {
          console.error(chalk.red(`error: file not found: ${file}`));
        }
        await closeAndExit(collection, 4);
      }

      const content = fs.readFileSync(csvPath, "utf-8");
      const records = parse(content, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

      const result: ImportResult = {
        total: records.length,
        created: 0,
        failed: 0,
        dry_run: opts.dryRun ?? false,
        files: [],
      };

      const pathField = opts.pathField ?? "path";

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const filePath = record[pathField] ?? `import-${i + 1}.md`;

        // Build frontmatter from remaining columns
        const frontmatter: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
          if (key === pathField) continue;
          frontmatter[key] = coerceValue(value);
        }

        if (opts.dryRun) {
          result.created++;
          result.files.push({ path: filePath, status: "created" });
          continue;
        }

        const createResult = await collection.create({
          path: filePath,
          type: opts.type,
          frontmatter,
        });

        if (createResult.error) {
          result.failed++;
          result.files.push({ path: filePath, status: "failed", error: createResult.error.message });
        } else {
          result.created++;
          result.files.push({ path: filePath, status: "created" });
        }
      }

      outputResult(result, opts.format, collection);
    });

  imp
    .command("json <file>")
    .description("Import from JSON file")
    .option("-t, --type <type>", "Type for imported files")
    .option("--dry-run", "Show what would be created without writing files")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (file: string, opts) => {
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

      const jsonPath = path.resolve(cwd, file);
      if (!fs.existsSync(jsonPath)) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { code: "file_not_found", message: `File not found: ${file}` } }, null, 2));
        } else {
          console.error(chalk.red(`error: file not found: ${file}`));
        }
        await closeAndExit(collection, 4);
      }

      const content = fs.readFileSync(jsonPath, "utf-8");
      let entries: Array<Record<string, unknown>>;
      try {
        entries = JSON.parse(content);
      } catch {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { code: "invalid_json", message: "Failed to parse JSON file" } }, null, 2));
        } else {
          console.error(chalk.red("error: failed to parse JSON file"));
        }
        await closeAndExit(collection, 1);
        return;
      }

      if (!Array.isArray(entries)) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { code: "invalid_format", message: "JSON file must contain an array" } }, null, 2));
        } else {
          console.error(chalk.red("error: JSON file must contain an array"));
        }
        await closeAndExit(collection, 1);
        return;
      }

      const result: ImportResult = {
        total: entries.length,
        created: 0,
        failed: 0,
        dry_run: opts.dryRun ?? false,
        files: [],
      };

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const filePath = (entry.path as string) ?? `import-${i + 1}.md`;

        // Build frontmatter: use "frontmatter" sub-object if present, otherwise all keys except "path"
        let frontmatter: Record<string, unknown>;
        if (entry.frontmatter && typeof entry.frontmatter === "object" && !Array.isArray(entry.frontmatter)) {
          frontmatter = entry.frontmatter as Record<string, unknown>;
        } else {
          frontmatter = {};
          for (const [key, value] of Object.entries(entry)) {
            if (key === "path") continue;
            frontmatter[key] = value;
          }
        }

        if (opts.dryRun) {
          result.created++;
          result.files.push({ path: filePath, status: "created" });
          continue;
        }

        const createResult = await collection.create({
          path: filePath,
          type: opts.type,
          frontmatter,
        });

        if (createResult.error) {
          result.failed++;
          result.files.push({ path: filePath, status: "failed", error: createResult.error.message });
        } else {
          result.created++;
          result.files.push({ path: filePath, status: "created" });
        }
      }

      outputResult(result, opts.format, collection);
    });
}

async function outputResult(result: ImportResult, format: string, collection: { close(): Promise<void> }): Promise<void> {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const dryTag = result.dry_run ? chalk.dim(" (dry run)") : "";
    for (const f of result.files) {
      if (f.status === "created") {
        console.log(`  ${chalk.green("+")} ${f.path}${dryTag}`);
      } else {
        console.log(`  ${chalk.red("x")} ${f.path}: ${f.error}`);
      }
    }
    console.log();
    if (result.dry_run) {
      console.log(`Would create ${result.created} file${result.created !== 1 ? "s" : ""}`);
    } else {
      console.log(`Created ${result.created} file${result.created !== 1 ? "s" : ""}${result.failed > 0 ? `, ${result.failed} failed` : ""}`);
    }
  }

  await closeAndExit(collection, result.failed > 0 ? 1 : 0);
}
