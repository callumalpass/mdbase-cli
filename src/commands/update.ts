import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "mdbase";
import yaml from "js-yaml";

function parseFieldValue(raw: string): unknown {
  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Null
  if (raw === "null") return null;

  // Number (integer or float)
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);

  // List (comma-separated in brackets)
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw.slice(1, -1).split(",").map((s) => s.trim());
  }

  // String (default)
  return raw;
}

function parseFields(fieldArgs: string[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const f of fieldArgs) {
    const eqIdx = f.indexOf("=");
    if (eqIdx === -1) {
      console.error(chalk.red(`error: invalid field format: ${f} (expected key=value)`));
      process.exit(1);
    }
    const key = f.slice(0, eqIdx);
    const rawValue = f.slice(eqIdx + 1);
    fields[key] = parseFieldValue(rawValue);
  }
  return fields;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return chalk.dim("null");
  if (Array.isArray(value)) return `[${value.map(String).join(", ")}]`;
  return String(value);
}

export function registerUpdate(program: Command): void {
  program
    .command("update <path>")
    .description("Update fields in an existing file")
    .option("-f, --field <fields...>", "Field values as key=value pairs")
    .option("--body <body>", "Replace body content")
    .option("--body-stdin", "Read body from stdin")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (filePath: string, opts) => {
      const cwd = process.cwd();

      // Open the collection
      const openResult = Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }
      const collection = openResult.collection!;

      // Need at least one thing to update
      if (!opts.field && opts.body === undefined && !opts.bodyStdin) {
        console.error(chalk.red("error: nothing to update (provide --field or --body)"));
        process.exit(1);
      }

      // Parse field values
      const fields = opts.field ? parseFields(opts.field as string[]) : undefined;

      // Read body from stdin if requested
      let body: string | undefined = opts.body;
      if (opts.bodyStdin) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString("utf-8");
      }

      const relativePath = path.relative(cwd, path.resolve(cwd, filePath));

      // Build update input
      const input: {
        path: string;
        fields?: Record<string, unknown>;
        body?: string;
      } = { path: relativePath };

      if (fields) {
        input.fields = fields;
      }
      if (body !== undefined) {
        input.body = body;
      }

      const result = collection.update(input);

      if (result.error) {
        const exitCode = result.error.code === "file_not_found" ? 4
          : result.error.code === "validation_failed" ? 2
          : result.error.code === "permission_denied" ? 5
          : 1;

        if (opts.format === "json") {
          console.log(JSON.stringify({ error: result.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${result.error.message}`));
        }
        process.exit(exitCode);
      }

      switch (opts.format) {
        case "json": {
          const output: Record<string, unknown> = {
            path: relativePath,
            frontmatter: result.frontmatter ?? {},
          };
          if (result.body != null && result.body !== "") {
            output.body = result.body;
          }
          console.log(JSON.stringify(output, null, 2));
          break;
        }

        case "yaml": {
          const output: Record<string, unknown> = {
            path: relativePath,
            frontmatter: result.frontmatter ?? {},
          };
          if (result.body != null && result.body !== "") {
            output.body = result.body;
          }
          console.log(yaml.dump(output, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }

        case "text":
        default: {
          console.log(`${chalk.green("updated")} ${chalk.bold(relativePath)}`);

          const fm = result.frontmatter ?? {};
          const keys = Object.keys(fm);
          if (keys.length > 0) {
            const maxLen = Math.max(...keys.map((k) => k.length));
            for (const key of keys) {
              console.log(`  ${chalk.cyan(key.padEnd(maxLen))}  ${formatValue(fm[key])}`);
            }
          }
          break;
        }
      }

      process.exit(0);
    });
}
