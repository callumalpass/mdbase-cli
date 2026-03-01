import { Command } from "commander";
import fs from "node:fs";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import { stringify } from "csv-stringify/sync";
import { splitList, closeAndExit } from "../utils.js";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

export function registerExport(program: Command): void {
  program
    .command("export")
    .description("Export collection data to various formats")
    .option("-t, --types <types>", "Filter by type names (comma-separated)")
    .option("-w, --where <expression>", "Filter expression")
    .option("--format <format>", "Output format: json, csv", "json")
    .option("-o, --output <file>", "Output file (default: stdout)")
    .option("--fields <fields>", "Fields to include (comma-separated)")
    .action(async (opts) => {
      if (opts.format === "sqlite") {
        console.error(chalk.red("error: sqlite format is not supported (better-sqlite3 is not a dependency)"));
        process.exit(1);
      }

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

      // Parse comma-separated options
      const types = splitList(opts.types);
      const fieldsFilter = splitList(opts.fields);

      const queryResult = await collection.query({
        types,
        where: opts.where,
      });

      if (queryResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: queryResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${queryResult.error.message}`));
        }
        await closeAndExit(collection, 1);
      }

      const results = queryResult.results as Array<{
        path: string;
        frontmatter: Record<string, unknown>;
        types: string[];
      }>;

      // Determine fields
      let fields: string[];
      if (fieldsFilter) {
        fields = fieldsFilter;
      } else {
        const allFields = new Set<string>();
        for (const r of results) {
          for (const key of Object.keys(r.frontmatter)) {
            if (key !== "type" && key !== "types") {
              allFields.add(key);
            }
          }
        }
        fields = [...allFields].sort();
      }

      let output: string;

      switch (opts.format) {
        case "csv": {
          const header = ["path", "types", ...fields];
          const rows = results.map((r) => [
            r.path,
            r.types.join(", "),
            ...fields.map((f) => formatValue(r.frontmatter[f])),
          ]);
          output = stringify([header, ...rows]);
          break;
        }

        case "json":
        default: {
          const data = results.map((r) => {
            const fm: Record<string, unknown> = {};
            for (const f of fields) {
              if (f in r.frontmatter) {
                fm[f] = r.frontmatter[f];
              }
            }
            return {
              path: r.path,
              types: r.types,
              frontmatter: fm,
            };
          });
          output = JSON.stringify(data, null, 2);
          break;
        }
      }

      if (opts.output) {
        fs.writeFileSync(opts.output, output);
        console.log(chalk.green(`Exported ${results.length} file${results.length !== 1 ? "s" : ""} to ${opts.output}`));
      } else {
        console.log(output);
      }

      await closeAndExit(collection, 0);
    });
}
