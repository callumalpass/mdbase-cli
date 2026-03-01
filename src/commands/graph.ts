import { Command } from "commander";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import { closeAndExit } from "../utils.js";

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

interface LinkEdge {
  source: string;
  target: string;
  resolved: boolean;
}

function extractWikilinks(text: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(text)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

function resolveLink(linkTarget: string, allPaths: Set<string>): string | null {
  // Try exact match
  if (allPaths.has(linkTarget)) return linkTarget;
  // Try with .md extension
  if (allPaths.has(linkTarget + ".md")) return linkTarget + ".md";
  // Try basename matching (wikilinks often don't include path)
  for (const p of allPaths) {
    const base = p.replace(/\.md$/, "");
    if (base === linkTarget || base.endsWith("/" + linkTarget)) return p;
  }
  return null;
}

async function buildGraph(collection: Collection): Promise<{
  allPaths: Set<string>;
  edges: LinkEdge[];
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, Set<string>>;
}> {
  const queryResult = await collection.query({ include_body: true });
  if (queryResult.error) {
    throw new Error(queryResult.error.message);
  }

  const files = queryResult.results as Array<{
    path: string;
    frontmatter: Record<string, unknown>;
    types: string[];
    body?: string;
  }>;

  const allPaths = new Set(files.map((f) => f.path));
  const edges: LinkEdge[] = [];
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  // Initialize maps
  for (const p of allPaths) {
    outgoing.set(p, new Set());
    incoming.set(p, new Set());
  }

  for (const file of files) {
    const links = new Set<string>();

    // Scan frontmatter values for wikilinks
    for (const value of Object.values(file.frontmatter)) {
      if (typeof value === "string") {
        for (const link of extractWikilinks(value)) {
          links.add(link);
        }
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") {
            for (const link of extractWikilinks(item)) {
              links.add(link);
            }
          }
        }
      }
    }

    // Scan body for wikilinks
    if (file.body) {
      for (const link of extractWikilinks(file.body)) {
        links.add(link);
      }
    }

    // Resolve links
    for (const linkTarget of links) {
      const resolved = resolveLink(linkTarget, allPaths);
      if (resolved && resolved !== file.path) {
        edges.push({ source: file.path, target: resolved, resolved: true });
        outgoing.get(file.path)!.add(resolved);
        incoming.get(resolved)!.add(file.path);
      } else if (!resolved) {
        edges.push({ source: file.path, target: linkTarget, resolved: false });
      }
    }
  }

  return { allPaths, edges, outgoing, incoming };
}

function countConnectedComponents(
  allPaths: Set<string>,
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>,
): number {
  const visited = new Set<string>();
  let components = 0;

  for (const node of allPaths) {
    if (visited.has(node)) continue;
    components++;
    // BFS on undirected graph
    const queue = [node];
    visited.add(node);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of outgoing.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
      for (const neighbor of incoming.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  return components;
}

export function registerGraph(program: Command): void {
  const graph = program
    .command("graph")
    .description("Link graph analysis");

  graph
    .command("orphans")
    .description("Find files with no incoming or outgoing links")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      const cwd = process.cwd();

      const openResult = await Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }

      const { allPaths, outgoing, incoming } = await buildGraph(openResult.collection!);

      const orphans = [...allPaths].filter((p) => {
        return (outgoing.get(p)?.size ?? 0) === 0 && (incoming.get(p)?.size ?? 0) === 0;
      }).sort();

      if (opts.format === "json") {
        console.log(JSON.stringify({ orphans, count: orphans.length }, null, 2));
      } else {
        if (orphans.length === 0) {
          console.log(chalk.green("No orphan files"));
        } else {
          console.log(chalk.bold(`${orphans.length} orphan${orphans.length !== 1 ? "s" : ""}:`));
          for (const p of orphans) {
            console.log(`  ${p}`);
          }
        }
      }
      await closeAndExit(openResult.collection!, 0);
    });

  graph
    .command("broken")
    .description("Find broken links (targets that don't exist)")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      const cwd = process.cwd();

      const openResult = await Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }

      const { edges } = await buildGraph(openResult.collection!);
      const broken = edges.filter((e) => !e.resolved);

      if (opts.format === "json") {
        console.log(JSON.stringify({
          broken: broken.map((e) => ({ source: e.source, target: e.target })),
          count: broken.length,
        }, null, 2));
      } else {
        if (broken.length === 0) {
          console.log(chalk.green("No broken links"));
        } else {
          console.log(chalk.bold(`${broken.length} broken link${broken.length !== 1 ? "s" : ""}:`));
          for (const e of broken) {
            console.log(`  ${e.source} → ${chalk.red(e.target)}`);
          }
        }
      }
      await closeAndExit(openResult.collection!, 0);
    });

  graph
    .command("backlinks <path>")
    .description("Show all files linking to the given file")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (filePath: string, opts) => {
      const cwd = process.cwd();

      const openResult = await Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }

      const collection = openResult.collection!;

      // Check if the file exists
      const readResult = await collection.read(filePath);
      if (readResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: readResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${readResult.error.message}`));
        }
        await closeAndExit(collection, 4);
      }

      const { incoming } = await buildGraph(collection);
      const backlinks = [...(incoming.get(filePath) ?? [])].sort();

      if (opts.format === "json") {
        console.log(JSON.stringify({ path: filePath, backlinks, count: backlinks.length }, null, 2));
      } else {
        if (backlinks.length === 0) {
          console.log(chalk.dim(`No backlinks to ${filePath}`));
        } else {
          console.log(chalk.bold(`${backlinks.length} backlink${backlinks.length !== 1 ? "s" : ""} to ${filePath}:`));
          for (const p of backlinks) {
            console.log(`  ${p}`);
          }
        }
      }
      await closeAndExit(collection, 0);
    });

  graph
    .command("stats")
    .description("Link graph statistics: nodes, edges, clusters, density")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      const cwd = process.cwd();

      const openResult = await Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }

      const { allPaths, edges, outgoing, incoming } = await buildGraph(openResult.collection!);

      const nodes = allPaths.size;
      const resolvedEdges = edges.filter((e) => e.resolved).length;
      const brokenEdges = edges.filter((e) => !e.resolved).length;
      const orphanCount = [...allPaths].filter((p) =>
        (outgoing.get(p)?.size ?? 0) === 0 && (incoming.get(p)?.size ?? 0) === 0,
      ).length;
      const components = countConnectedComponents(allPaths, outgoing, incoming);
      const maxPossibleEdges = nodes * (nodes - 1);
      const density = maxPossibleEdges > 0 ? resolvedEdges / maxPossibleEdges : 0;

      const result = {
        nodes,
        edges: resolvedEdges,
        broken_edges: brokenEdges,
        orphans: orphanCount,
        connected_components: components,
        density: Math.round(density * 10000) / 10000,
      };

      if (opts.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.bold("Graph Stats"));
        console.log();
        console.log(`  ${chalk.dim("Nodes:")}       ${result.nodes}`);
        console.log(`  ${chalk.dim("Edges:")}       ${result.edges}`);
        console.log(`  ${chalk.dim("Broken:")}      ${result.broken_edges}`);
        console.log(`  ${chalk.dim("Orphans:")}     ${result.orphans}`);
        console.log(`  ${chalk.dim("Components:")}  ${result.connected_components}`);
        console.log(`  ${chalk.dim("Density:")}     ${result.density}`);
      }
      await closeAndExit(openResult.collection!, 0);
    });
}
