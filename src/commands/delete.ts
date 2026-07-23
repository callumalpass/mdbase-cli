import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import type { MdbaseError } from "@callumalpass/mdbase";
import yaml from "js-yaml";
import { finishCommand, formatIssue } from "../utils.js";

export function registerDelete(program: Command): void {
  program
    .command("delete <path>")
    .description("Delete a file from the collection")
    .option("--force", "Skip confirmation and delete even with broken links")
    .option("--no-check-backlinks", "Skip broken link detection")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (filePath: string, opts) => {
      const cwd = process.cwd();

      // Open the collection
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

      const relativePath = path.relative(cwd, path.resolve(cwd, filePath));

      const result = await collection.delete(relativePath, {
        check_backlinks: opts.checkBacklinks !== false,
      });

      if (result.error) {
        const exitCode = result.error.code === "file_not_found" ? 4
          : result.error.code === "permission_denied" ? 5
          : 1;

        const issues = (result as { issues?: MdbaseError[] }).issues;
        if (opts.format === "json") {
          const output: Record<string, unknown> = { error: result.error };
          if (issues) {
            output.issues = issues;
          }
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.error(chalk.red(`error: ${result.error.message}`));
          if (issues) {
            for (const issue of issues) {
              console.error(formatIssue(issue));
            }
          }
        }
        await finishCommand(collection, exitCode);
        return;
      }

      const brokenLinks = result.broken_links ?? [];

      switch (opts.format) {
        case "json": {
          const output: Record<string, unknown> = {
            path: relativePath,
            deleted: true,
          };
          if (brokenLinks.length > 0) {
            output.broken_links = brokenLinks;
          }
          console.log(JSON.stringify(output, null, 2));
          break;
        }

        case "yaml": {
          const output: Record<string, unknown> = {
            path: relativePath,
            deleted: true,
          };
          if (brokenLinks.length > 0) {
            output.broken_links = brokenLinks;
          }
          console.log(yaml.dump(output, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }

        case "text":
        default: {
          console.log(`${chalk.green("deleted")} ${chalk.bold(relativePath)}`);
          if (brokenLinks.length > 0) {
            console.log(chalk.yellow(`\n  ${brokenLinks.length} broken link${brokenLinks.length === 1 ? "" : "s"}:`));
            for (const link of brokenLinks) {
              console.log(`    ${chalk.dim("→")} ${link.path}`);
            }
          }
          break;
        }
      }

      await finishCommand(collection, 0);
    });
}
