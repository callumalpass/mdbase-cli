import { Command } from "commander";

export function registerFmt(program: Command): void {
  program
    .command("fmt [paths...]")
    .description("Format frontmatter: field ordering, consistent quoting, alignment")
    .option("--check", "Check formatting without modifying files")
    .option("--sort-fields", "Sort fields alphabetically (default: type schema order)")
    .action(async (paths: string[], opts) => {
      // TODO: implement — reorder fields per type schema,
      // normalize YAML quoting style, consistent indentation
      console.log("fmt", paths, opts);
    });
}
