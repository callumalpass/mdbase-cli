import { Command } from "commander";

export function registerLint(program: Command): void {
  program
    .command("lint [paths...]")
    .description("Lint frontmatter: normalize dates, coerce types, check consistency")
    .option("--fix", "Auto-fix issues where possible")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (paths: string[], opts) => {
      // TODO: implement — normalize date formats, trim whitespace,
      // coerce types, sort tags, deduplicate lists
      console.log("lint", paths, opts);
    });
}
