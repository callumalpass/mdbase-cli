import { Command } from "commander";

export function registerValidate(program: Command): void {
  program
    .command("validate [paths...]")
    .description("Validate files or entire collection against type schemas")
    .option("-c, --collection", "Validate the entire collection")
    .option("--level <level>", "Validation level: off, warn, error", "error")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (paths: string[], opts) => {
      // TODO: implement
      console.log("validate", paths, opts);
    });
}
