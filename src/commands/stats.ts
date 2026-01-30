import { Command } from "commander";

export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("Collection overview: file counts, type distribution, validation health")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      // TODO: implement — count files by type, field coverage,
      // validation pass rate, link health, tag frequency
      console.log("stats", opts);
    });
}
