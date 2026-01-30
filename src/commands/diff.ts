import { Command } from "commander";

export function registerDiff(program: Command): void {
  program
    .command("diff <a> <b>")
    .description("Compare two files or collections")
    .option("--format <format>", "Output format: text, json", "text")
    .option("--fields-only", "Compare only frontmatter fields, ignore body")
    .action(async (a: string, b: string, opts) => {
      // TODO: implement — field-level diff showing added, removed, changed
      console.log("diff", a, b, opts);
    });
}
