import { Command } from "commander";

export function registerRead(program: Command): void {
  program
    .command("read <path>")
    .description("Read a file and display its frontmatter and metadata")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .option("--body", "Include body content")
    .action(async (filePath: string, opts) => {
      // TODO: implement
      console.log("read", filePath, opts);
    });
}
