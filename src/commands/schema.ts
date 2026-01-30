import { Command } from "commander";

export function registerSchema(program: Command): void {
  const schema = program
    .command("schema")
    .description("Schema inference and management");

  schema
    .command("infer")
    .description("Infer type definitions from existing files")
    .option("-f, --folder <folder>", "Restrict to folder")
    .option("--min-files <n>", "Minimum files to form a type", parseInt)
    .option("--format <format>", "Output format: text, yaml", "yaml")
    .option("--write", "Write inferred types to _types/ folder")
    .action(async (opts) => {
      // TODO: implement — scan files, cluster by common fields,
      // infer types, constraints, enums from observed values
      console.log("schema infer", opts);
    });
}
