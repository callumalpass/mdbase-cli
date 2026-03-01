import { Command } from "commander";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import { closeAndExit } from "../utils.js";

interface StatsResult {
  total_files: number;
  by_type: Record<string, number>;
  untyped: number;
  field_coverage: Record<string, { count: number; percentage: number }>;
  tags: Record<string, number>;
  validation: {
    valid: number;
    invalid: number;
    errors: number;
    warnings: number;
  };
}

export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("Collection overview: file counts, type distribution, validation health")
    .option("--format <format>", "Output format: text, json", "text")
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

      // Query all files
      const queryResult = await collection.query({ include_body: false });
      if (queryResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: queryResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${queryResult.error.message}`));
        }
        await closeAndExit(collection, 1);
      }

      const files = queryResult.results as Array<{
        path: string;
        frontmatter: Record<string, unknown>;
        types: string[];
      }>;

      // Aggregate by type
      const byType: Record<string, number> = {};
      let untyped = 0;
      const fieldCounts: Record<string, number> = {};
      const tagCounts: Record<string, number> = {};

      for (const file of files) {
        // Types
        if (file.types.length === 0) {
          untyped++;
        } else {
          for (const t of file.types) {
            byType[t] = (byType[t] ?? 0) + 1;
          }
        }

        // Field coverage
        for (const key of Object.keys(file.frontmatter)) {
          if (key === "type" || key === "types") continue;
          fieldCounts[key] = (fieldCounts[key] ?? 0) + 1;
        }

        // Tags
        const tags = file.frontmatter.tags;
        if (Array.isArray(tags)) {
          for (const tag of tags) {
            const t = String(tag);
            tagCounts[t] = (tagCounts[t] ?? 0) + 1;
          }
        }
      }

      // Field coverage as percentages
      const fieldCoverage: Record<string, { count: number; percentage: number }> = {};
      for (const [field, count] of Object.entries(fieldCounts)) {
        fieldCoverage[field] = {
          count,
          percentage: Math.round((count / files.length) * 100),
        };
      }

      // Validation health
      const valResult = await collection.validate();
      const errorCount = valResult.issues.filter((i) => (i.severity ?? "error") === "error").length;
      const warningCount = valResult.issues.filter((i) => i.severity === "warning").length;
      const invalidFiles = new Set(
        valResult.issues
          .filter((i) => (i.severity ?? "error") === "error")
          .map((i) => i.path)
          .filter(Boolean),
      ).size;

      const result: StatsResult = {
        total_files: files.length,
        by_type: byType,
        untyped,
        field_coverage: fieldCoverage,
        tags: tagCounts,
        validation: {
          valid: files.length - invalidFiles,
          invalid: invalidFiles,
          errors: errorCount,
          warnings: warningCount,
        },
      };

      if (opts.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.bold("Collection Stats"));
        console.log();

        // File counts
        console.log(`${chalk.dim("Total files:")} ${files.length}`);
        console.log();

        // Type distribution
        console.log(chalk.bold("Types:"));
        for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
          console.log(`  ${type}: ${count}`);
        }
        if (untyped > 0) {
          console.log(`  ${chalk.dim("(untyped)")}: ${untyped}`);
        }
        console.log();

        // Field coverage
        console.log(chalk.bold("Field Coverage:"));
        for (const [field, info] of Object.entries(fieldCoverage).sort((a, b) => b[1].count - a[1].count)) {
          console.log(`  ${field}: ${info.count}/${files.length} (${info.percentage}%)`);
        }
        console.log();

        // Tags
        if (Object.keys(tagCounts).length > 0) {
          console.log(chalk.bold("Tags:"));
          for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${tag}: ${count}`);
          }
          console.log();
        }

        // Validation
        console.log(chalk.bold("Validation:"));
        if (errorCount === 0 && warningCount === 0) {
          console.log(`  ${chalk.green("All files valid")}`);
        } else {
          if (errorCount > 0) console.log(`  ${chalk.red(`${errorCount} error${errorCount !== 1 ? "s" : ""}`)} in ${invalidFiles} file${invalidFiles !== 1 ? "s" : ""}`);
          if (warningCount > 0) console.log(`  ${chalk.yellow(`${warningCount} warning${warningCount !== 1 ? "s" : ""}`)}`);
        }
      }

      await closeAndExit(collection, 0);
    });
}
