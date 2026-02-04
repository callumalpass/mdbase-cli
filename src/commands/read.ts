import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import yaml from "js-yaml";

type ReadResultExtras = {
  warnings?: Array<{ code: string; message: string; field?: string }>;
  file?: {
    name?: string;
    folder?: string;
    path?: string;
    mtime?: string;
    ctime?: string;
    size?: number;
  };
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return chalk.dim("null");
  if (Array.isArray(value)) return `[${value.map(String).join(", ")}]`;
  return String(value);
}

export function registerRead(program: Command): void {
  program
    .command("read <path>")
    .description("Read a file and display its frontmatter and metadata")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .option("--body", "Include body content")
    .option("--raw", "Show raw frontmatter (before defaults/coercion)")
    .action(async (filePath: string, opts) => {
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

      const relativePath = path.relative(cwd, path.resolve(cwd, filePath));
      const result = await collection.read(relativePath) as Awaited<ReturnType<
        Collection["read"]
      >> &
        ReadResultExtras;

      if (result.error) {
        const exitCode = result.error.code === "file_not_found" ? 4
          : result.error.code === "permission_denied" ? 5
          : 1;

        if (opts.format === "json") {
          console.log(JSON.stringify({ error: result.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${result.error.message}`));
        }
        process.exit(exitCode);
      }

      const frontmatter = opts.raw ? result.rawFrontmatter : result.frontmatter;

      switch (opts.format) {
        case "json": {
          const output: Record<string, unknown> = {
            path: relativePath,
            types: result.types,
            frontmatter: frontmatter ?? {},
            file: result.file,
          };
          if (opts.body && result.body != null) {
            output.body = result.body;
          }
          if (result.warnings?.length) {
            output.warnings = result.warnings;
          }
          console.log(JSON.stringify(output, null, 2));
          break;
        }

        case "yaml": {
          const output: Record<string, unknown> = {
            path: relativePath,
            types: result.types,
            frontmatter: frontmatter ?? {},
            file: result.file,
          };
          if (opts.body && result.body != null) {
            output.body = result.body;
          }
          if (result.warnings?.length) {
            output.warnings = result.warnings;
          }
          console.log(yaml.dump(output, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }

        case "text":
        default: {
          // File path and types
          console.log(chalk.bold(relativePath));
          if (result.types && result.types.length > 0) {
            console.log(`${chalk.dim("types:")} ${result.types.join(", ")}`);
          }
          console.log();

          // Frontmatter fields
          const fm = frontmatter ?? {};
          const keys = Object.keys(fm);
          if (keys.length > 0) {
            const maxLen = Math.max(...keys.map((k) => k.length));
            for (const key of keys) {
              console.log(`  ${chalk.cyan(key.padEnd(maxLen))}  ${formatValue(fm[key])}`);
            }
          } else {
            console.log(chalk.dim("  (no frontmatter)"));
          }

          // File metadata
          if (result.file) {
            console.log();
            console.log(chalk.dim("file:"));
            console.log(`  ${chalk.dim("size:")}  ${result.file.size} bytes`);
            console.log(`  ${chalk.dim("mtime:")} ${result.file.mtime}`);
            console.log(`  ${chalk.dim("ctime:")} ${result.file.ctime}`);
          }

          // Warnings
          if (result.warnings?.length) {
            console.log();
            for (const w of result.warnings) {
              console.log(chalk.yellow(`  warn: ${w.message} [${w.code}]`));
            }
          }

          // Body
          if (opts.body && result.body != null) {
            console.log();
            console.log(chalk.dim("---"));
            console.log(result.body);
          }
          break;
        }
      }

      process.exit(0);
    });
}
