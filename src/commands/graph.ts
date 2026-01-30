import { Command } from "commander";

export function registerGraph(program: Command): void {
  const graph = program
    .command("graph")
    .description("Link graph analysis");

  graph
    .command("orphans")
    .description("Find files with no incoming or outgoing links")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      // TODO: implement
      console.log("graph orphans", opts);
    });

  graph
    .command("broken")
    .description("Find broken links (targets that don't exist)")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      // TODO: implement
      console.log("graph broken", opts);
    });

  graph
    .command("backlinks <path>")
    .description("Show all files linking to the given file")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (filePath: string, opts) => {
      // TODO: implement
      console.log("graph backlinks", filePath, opts);
    });

  graph
    .command("stats")
    .description("Link graph statistics: nodes, edges, clusters, density")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      // TODO: implement
      console.log("graph stats", opts);
    });
}
