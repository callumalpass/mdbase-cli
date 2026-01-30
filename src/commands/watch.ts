import { Command } from "commander";

export function registerWatch(program: Command): void {
  program
    .command("watch")
    .description("Watch collection for changes and output events")
    .option("--validate", "Re-validate on changes")
    .option("--query <expression>", "Re-run query on changes")
    .option("--base <file>", "Re-run .base file on changes")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      // TODO: implement — use chokidar to watch, re-run on change,
      // output events or updated results
      console.log("watch", opts);
    });
}
