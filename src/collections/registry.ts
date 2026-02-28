import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "@callumalpass/mdbase";

export interface CollectionRegistryEntry {
  alias: string;
  path: string;
  added_at: string;
  updated_at: string;
  collection_name?: string;
  collection_description?: string;
}

interface CollectionRegistryFile {
  version: 1;
  collections: CollectionRegistryEntry[];
}

export class RegistryError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function normalizeAlias(alias: string): string {
  const normalized = alias.trim();
  if (!normalized) {
    throw new RegistryError("invalid_alias", "Collection alias cannot be empty");
  }
  return normalized;
}

function aliasesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function resolveRegistryPath(): string {
  const override = process.env.MDBASE_COLLECTIONS_REGISTRY;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const base = xdgConfig
    ? path.join(xdgConfig, "mdbase-cli")
    : path.join(os.homedir(), ".config", "mdbase-cli");
  return path.join(base, "collections.json");
}

function defaultRegistry(): CollectionRegistryFile {
  return {
    version: 1,
    collections: [],
  };
}

export async function readRegistry(registryPath = resolveRegistryPath()): Promise<CollectionRegistryEntry[]> {
  if (!fs.existsSync(registryPath)) return [];

  let raw: string;
  try {
    raw = await fs.promises.readFile(registryPath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RegistryError("registry_read_failed", message);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RegistryError("registry_parse_failed", `Invalid JSON in ${registryPath}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new RegistryError("registry_parse_failed", `Invalid registry format in ${registryPath}`);
  }
  const file = parsed as Partial<CollectionRegistryFile>;
  if (file.version !== 1 || !Array.isArray(file.collections)) {
    throw new RegistryError("registry_parse_failed", `Invalid registry format in ${registryPath}`);
  }

  const entries = file.collections
    .filter((item): item is CollectionRegistryEntry => !!item && typeof item === "object")
    .filter((item) => typeof item.alias === "string" && typeof item.path === "string")
    .map((item) => ({
      alias: item.alias,
      path: item.path,
      added_at: typeof item.added_at === "string" ? item.added_at : new Date(0).toISOString(),
      updated_at: typeof item.updated_at === "string" ? item.updated_at : new Date(0).toISOString(),
      ...(typeof item.collection_name === "string" ? { collection_name: item.collection_name } : {}),
      ...(typeof item.collection_description === "string"
        ? { collection_description: item.collection_description }
        : {}),
    }));

  entries.sort((a, b) => a.alias.localeCompare(b.alias));
  return entries;
}

export async function writeRegistry(
  entries: CollectionRegistryEntry[],
  registryPath = resolveRegistryPath(),
): Promise<void> {
  const file: CollectionRegistryFile = {
    ...defaultRegistry(),
    collections: [...entries].sort((a, b) => a.alias.localeCompare(b.alias)),
  };

  try {
    await fs.promises.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.promises.writeFile(registryPath, JSON.stringify(file, null, 2) + "\n", "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RegistryError("registry_write_failed", message);
  }
}

async function resolveCollectionPath(inputPath: string): Promise<string> {
  if (!inputPath || inputPath.trim().length === 0) {
    throw new RegistryError("invalid_path", "Collection path cannot be empty");
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(resolvedInput);
  } catch {
    throw new RegistryError("path_not_found", `Path not found: ${resolvedInput}`);
  }

  const collectionRoot = stat.isFile() && path.basename(resolvedInput) === "mdbase.yaml"
    ? path.dirname(resolvedInput)
    : resolvedInput;

  let rootStat: fs.Stats;
  try {
    rootStat = await fs.promises.stat(collectionRoot);
  } catch {
    throw new RegistryError("path_not_found", `Path not found: ${collectionRoot}`);
  }

  if (!rootStat.isDirectory()) {
    throw new RegistryError("invalid_path", `Path is not a directory: ${collectionRoot}`);
  }

  const configPath = path.join(collectionRoot, "mdbase.yaml");
  if (!fs.existsSync(configPath)) {
    throw new RegistryError("missing_config", `No mdbase.yaml found in ${collectionRoot}`);
  }

  const configResult = await loadConfig(collectionRoot);
  if (!configResult.valid || !configResult.config) {
    throw new RegistryError(
      "invalid_config",
      configResult.error?.message ?? `Invalid mdbase.yaml in ${collectionRoot}`,
    );
  }

  const canonical = await fs.promises.realpath(collectionRoot);
  return canonical;
}

async function loadCollectionMetadata(collectionRoot: string): Promise<{
  collection_name?: string;
  collection_description?: string;
}> {
  const configResult = await loadConfig(collectionRoot);
  if (!configResult.valid || !configResult.config) {
    return {};
  }
  const metadata: {
    collection_name?: string;
    collection_description?: string;
  } = {};
  if (configResult.config.name) metadata.collection_name = configResult.config.name;
  if (configResult.config.description) metadata.collection_description = configResult.config.description;
  return metadata;
}

function findByAlias(entries: CollectionRegistryEntry[], alias: string): CollectionRegistryEntry | undefined {
  return entries.find((entry) => aliasesEqual(entry.alias, alias));
}

export async function addCollection(
  alias: string,
  collectionPath: string,
  registryPath = resolveRegistryPath(),
): Promise<CollectionRegistryEntry> {
  const normalizedAlias = normalizeAlias(alias);
  const canonicalPath = await resolveCollectionPath(collectionPath);
  const entries = await readRegistry(registryPath);

  const existingAlias = findByAlias(entries, normalizedAlias);
  if (existingAlias) {
    throw new RegistryError("alias_exists", `Collection alias already exists: ${existingAlias.alias}`);
  }

  const existingPath = entries.find((entry) => entry.path === canonicalPath);
  if (existingPath) {
    throw new RegistryError(
      "path_exists",
      `Collection path already registered as alias "${existingPath.alias}"`,
    );
  }

  const now = new Date().toISOString();
  const metadata = await loadCollectionMetadata(canonicalPath);
  const entry: CollectionRegistryEntry = {
    alias: normalizedAlias,
    path: canonicalPath,
    added_at: now,
    updated_at: now,
    ...metadata,
  };
  entries.push(entry);
  await writeRegistry(entries, registryPath);
  return entry;
}

export async function listCollections(
  registryPath = resolveRegistryPath(),
): Promise<CollectionRegistryEntry[]> {
  return readRegistry(registryPath);
}

export async function showCollection(
  alias: string,
  registryPath = resolveRegistryPath(),
): Promise<CollectionRegistryEntry> {
  const normalizedAlias = normalizeAlias(alias);
  const entries = await readRegistry(registryPath);
  const entry = findByAlias(entries, normalizedAlias);
  if (!entry) {
    throw new RegistryError("collection_not_found", `Unknown collection alias: ${normalizedAlias}`);
  }
  return entry;
}

export async function removeCollection(
  alias: string,
  registryPath = resolveRegistryPath(),
): Promise<CollectionRegistryEntry> {
  const normalizedAlias = normalizeAlias(alias);
  const entries = await readRegistry(registryPath);
  const idx = entries.findIndex((entry) => aliasesEqual(entry.alias, normalizedAlias));
  if (idx === -1) {
    throw new RegistryError("collection_not_found", `Unknown collection alias: ${normalizedAlias}`);
  }

  const [removed] = entries.splice(idx, 1);
  await writeRegistry(entries, registryPath);
  return removed;
}

export async function renameCollection(
  oldAlias: string,
  newAlias: string,
  registryPath = resolveRegistryPath(),
): Promise<CollectionRegistryEntry> {
  const oldNormalized = normalizeAlias(oldAlias);
  const newNormalized = normalizeAlias(newAlias);

  if (aliasesEqual(oldNormalized, newNormalized)) {
    throw new RegistryError("invalid_alias", "New alias must be different from current alias");
  }

  const entries = await readRegistry(registryPath);
  const entry = findByAlias(entries, oldNormalized);
  if (!entry) {
    throw new RegistryError("collection_not_found", `Unknown collection alias: ${oldNormalized}`);
  }
  const existing = findByAlias(entries, newNormalized);
  if (existing) {
    throw new RegistryError("alias_exists", `Collection alias already exists: ${existing.alias}`);
  }

  entry.alias = newNormalized;
  entry.updated_at = new Date().toISOString();
  await writeRegistry(entries, registryPath);
  return entry;
}
