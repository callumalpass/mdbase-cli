import { Command } from "commander";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import { watch as chokidarWatch } from "chokidar";

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

export function registerWatch(program: Command): void {
  program
    .command("watch")
    .description("Watch collection for changes and output events")
    .option("--validate", "Re-validate on changes")
    .option("--query <expression>", "Re-run query on changes")
    .option("--base <file>", "Re-run .base file on changes")
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

      if (opts.format === "json") {
        console.log(JSON.stringify({ event: "start", cwd }));
      } else {
        console.log(`${chalk.dim(timestamp())} ${chalk.green("watching")} ${cwd}`);
      }

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const handleChange = (event: string, filePath: string) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          if (opts.format === "json") {
            console.log(JSON.stringify({ event, path: filePath, time: new Date().toISOString() }));
          } else {
            const tag = event === "add"
              ? chalk.green("+")
              : event === "unlink"
                ? chalk.red("-")
                : chalk.yellow("~");
            console.log(`${chalk.dim(timestamp())} ${tag} ${filePath}`);
          }

          // Run action based on flags
          if (opts.validate) {
            try {
              const result = await collection.validate();
              if (opts.format === "json") {
                console.log(JSON.stringify({
                  event: "validate",
                  valid: result.valid,
                  issues: result.issues.length,
                }));
              } else {
                if (result.valid) {
                  console.log(`${chalk.dim(timestamp())} ${chalk.green("valid")}`);
                } else {
                  const errors = result.issues.filter((i) => (i.severity ?? "error") === "error").length;
                  console.log(`${chalk.dim(timestamp())} ${chalk.red(`${errors} error${errors !== 1 ? "s" : ""}`)}`);
                }
              }
            } catch {
              // Collection may need re-opening after changes
            }
          }

          if (opts.query) {
            try {
              const result = await collection.query({ where: opts.query });
              if (opts.format === "json") {
                console.log(JSON.stringify({
                  event: "query",
                  count: result.results?.length ?? 0,
                }));
              } else {
                console.log(`${chalk.dim(timestamp())} query: ${result.results?.length ?? 0} results`);
              }
            } catch {
              // Query may fail after changes
            }
          }
        }, 300);
      };

      const watcher = chokidarWatch(".", {
        cwd,
        ignored: [/(^|[/\\])\../, "node_modules/**"],
        ignoreInitial: true,
      });

      watcher
        .on("add", (p: string) => handleChange("add", p))
        .on("change", (p: string) => handleChange("change", p))
        .on("unlink", (p: string) => handleChange("unlink", p));

      // Clean shutdown
      const cleanup = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        watcher.close().then(() => {
          if (opts.format === "json") {
            console.log(JSON.stringify({ event: "stop" }));
          } else {
            console.log(`\n${chalk.dim(timestamp())} ${chalk.dim("stopped")}`);
          }
          process.exit(0);
        });
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    });
}
