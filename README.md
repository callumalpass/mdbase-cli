# mdbase-cli

Command-line tool for working with [mdbase](https://github.com/callumalpass/mdbase) collections. Validates, queries, and performs CRUD operations on markdown document collections. Can also execute Obsidian `.base` files.

## Install

Requires Node.js 22+ and the [mdbase](https://github.com/callumalpass/mdbase) library.

```sh
git clone https://github.com/callumalpass/mdbase.git
git clone https://github.com/callumalpass/mdbase-cli.git
cd mdbase && npm ci && cd ..
cd mdbase-cli && npm ci && npm run build
```

The CLI is available as `mdbase` via the `bin` entry, or run directly with:

```sh
node dist/cli.js
```

## Usage

```
mdbase <command> [options]
```

Global option:

- `-C, --collection <alias>` Run a command against a registered collection alias (from `mdbase collections add`).

### Core commands

| Command    | Description                                      |
|------------|--------------------------------------------------|
| `validate` | Validate documents against their type schemas    |
| `query`    | Query documents with filters and sorting         |
| `read`     | Read a single document by path or ID             |
| `create`   | Create a new document                            |
| `update`   | Update an existing document                      |
| `delete`   | Delete a document                                |
| `rename`   | Rename a document                                |
| `types`    | List or inspect registered types                 |

### Obsidian Bases

| Command    | Description                                      |
|------------|--------------------------------------------------|
| `base run` | Execute an Obsidian `.base` file                 |

### Additional commands

| Command    | Description                                      |
|------------|--------------------------------------------------|
| `init`     | Initialize a new mdbase collection               |
| `lint`     | Lint documents for common issues                 |
| `fmt`      | Format document frontmatter                      |
| `export`   | Export documents to CSV or JSON                  |
| `import`   | Import documents from CSV or JSON                |
| `graph`    | Show link graph between documents                |
| `stats`    | Print collection statistics                      |
| `watch`    | Watch for file changes and re-validate           |
| `diff`     | Show differences between document versions       |
| `schema`   | Generate or inspect type schemas                 |
| `collections` | Manage named collection registry entries      |

### Fuzzy picker

`mdbase-fzf` provides an interactive two-step picker powered by `fzf`:

1. Choose a type (includes `untype` for files without a type).
2. Browse matching files with key fields (display/title-style fields are prioritized), preview, then open in your editor.

Requirements: `fzf` and `jq` on `PATH`.

```sh
mdbase-fzf
```

## Examples

Validate all documents in the current directory:

```sh
mdbase validate .
```

Query documents of a given type:

```sh
mdbase query "status = published" --types note --sort created --limit 10
```

Execute an Obsidian `.base` file:

```sh
mdbase base run my-view.base
```

Export to CSV:

```sh
mdbase export . --type note --format csv -o notes.csv
```

Initialize and register a collection alias:

```sh
mdbase init --register work
```

List markdown files from all registered collections:

```sh
mdbase collections files --format paths
```

## Example applications

| Project | Description |
|---------|-------------|
| [mdbase-workouts](https://github.com/callumalpass/mdbase-workouts) | Workout tracker with chat interface, built on mdbase |

## Spec

mdbase-cli implements the [mdbase specification](https://github.com/callumalpass/mdbase-spec).

## License

MIT
