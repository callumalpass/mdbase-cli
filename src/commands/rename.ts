import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "mdbase";
import yaml from "js-yaml";

export function registerRename(program: Command): void {
  program
    .command("rename <from> <to>")
    .description("Rename/move a file, updating references across the collection")
    .option("--no-refs", "Skip reference updates")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (from: string, to: string, opts) => {
      const cwd = process.cwd();

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

      const relativeFrom = path.relative(cwd, path.resolve(cwd, from));
      const relativeTo = path.relative(cwd, path.resolve(cwd, to));

      const result = collection.rename({
        from: relativeFrom,
        to: relativeTo,
        update_refs: opts.refs !== false ? undefined : false,
      }) as {
        valid?: boolean;
        from?: string;
        to?: string;
        references_updated?: Array<{ path: string; field?: string; location?: string }>;
        warnings?: Array<{ path: string; message?: string }>;
        partial_updates?: { failed: Array<{ path: string; reason: string }> };
        error?: { code: string; message: string };
      };

      if (result.error) {
        // rename_ref_update_failed is a partial success — the file was renamed
        // but some ref updates failed. Show success output with warnings.
        if (result.error.code === "rename_ref_update_failed") {
          outputSuccess(relativeFrom, relativeTo, result, opts.format);
          process.exit(0);
        }

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

      outputSuccess(relativeFrom, relativeTo, result, opts.format);
      process.exit(0);
    });
}

function outputSuccess(
  from: string,
  to: string,
  result: {
    references_updated?: Array<{ path: string; field?: string; location?: string }>;
    warnings?: Array<{ path: string; message?: string }>;
    partial_updates?: { failed: Array<{ path: string; reason: string }> };
    error?: { code: string; message: string };
  },
  format: string,
): void {
  const refsUpdated = result.references_updated ?? [];
  const warnings = result.warnings ?? [];
  const partialFailures = result.partial_updates?.failed ?? [];

  switch (format) {
    case "json": {
      const output: Record<string, unknown> = { from, to };
      if (refsUpdated.length > 0) {
        output.references_updated = refsUpdated;
      }
      if (warnings.length > 0) {
        output.warnings = warnings;
      }
      if (partialFailures.length > 0) {
        output.partial_updates = { failed: partialFailures };
      }
      console.log(JSON.stringify(output, null, 2));
      break;
    }

    case "yaml": {
      const output: Record<string, unknown> = { from, to };
      if (refsUpdated.length > 0) {
        output.references_updated = refsUpdated;
      }
      if (warnings.length > 0) {
        output.warnings = warnings;
      }
      if (partialFailures.length > 0) {
        output.partial_updates = { failed: partialFailures };
      }
      console.log(yaml.dump(output, { lineWidth: -1, noRefs: true }).trimEnd());
      break;
    }

    case "text":
    default: {
      console.log(`${chalk.green("renamed")} ${chalk.bold(from)} ${chalk.dim("→")} ${chalk.bold(to)}`);

      if (refsUpdated.length > 0) {
        const fileCount = new Set(refsUpdated.map((r) => r.path)).size;
        console.log(chalk.cyan(`\n  ${refsUpdated.length} reference${refsUpdated.length === 1 ? "" : "s"} updated across ${fileCount} file${fileCount === 1 ? "" : "s"}`));
        for (const ref of refsUpdated) {
          const detail = ref.field ?? ref.location ?? "";
          console.log(`    ${chalk.dim("→")} ${ref.path}${detail ? chalk.dim(` (${detail})`) : ""}`);
        }
      }

      if (warnings.length > 0) {
        console.log(chalk.yellow(`\n  ${warnings.length} warning${warnings.length === 1 ? "" : "s"}:`));
        for (const w of warnings) {
          console.log(`    ${chalk.dim("→")} ${w.path}${w.message ? `: ${w.message}` : ""}`);
        }
      }

      if (partialFailures.length > 0) {
        console.log(chalk.red(`\n  ${partialFailures.length} reference update${partialFailures.length === 1 ? "" : "s"} failed:`));
        for (const f of partialFailures) {
          console.log(`    ${chalk.dim("→")} ${f.path}: ${f.reason}`);
        }
      }
      break;
    }
  }
}
