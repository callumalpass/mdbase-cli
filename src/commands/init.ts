import { Command } from "commander";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize a new mdbase collection in the current directory")
    .option("--spec-version <version>", "Spec version", "0.1.0")
    .action(async (opts) => {
      // TODO: implement — create mdbase.yaml, _types/, example type
      console.log("init", opts);
    });
}
