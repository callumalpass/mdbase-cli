# TypeScript CLI retirement and capability map

## Decision

There is one supported executable: native Rust `mdbase`.

The final executable lives in `mdbase-connect`, imports the transport-neutral
`mdbase-command` crate from `mdbase-rs`, and selects either a direct filesystem
target (`--root PATH`) or a Connect daemon target (`--collection UUID`). The
engine does not import Connect. This repository is private, exports no package
binary, and remains only as readable migration history.

## Capabilities consolidated into Rust

| TypeScript surface | Unified native surface | Canonical implementation |
| --- | --- | --- |
| `init` | `mdbase init` | `mdbase-rs` |
| `read`, `create`, `update`, `delete`, `rename` | same top-level commands | typed CRUD operations |
| `query` | `mdbase query` | canonical query operation and SQLite accelerator |
| `validate` | `mdbase validate` | collection validation |
| `types list/show/create` | `mdbase types list/show/create/update` | canonical type-resource operations |
| `view run`, `view validate`, `base run` | `mdbase views execute`, `mdbase validate` | canonical saved-view engine |
| `watch` | `mdbase watch` | normalized portable Watch-profile events |
| `migrate v0.3` | `mdbase migrate-v02` | verified crash-recoverable migration |
| collection aliases | `--root` or Connect collection UUIDs | explicit target selection and daemon registry |
| mutation composition | `mdbase batch` | typed, journalled batch operation |
| maintenance | `mdbase backfill`, `migrate`, and `cache` | canonical engine maintenance |

All portable record commands can use the same syntax through the daemon by
supplying `--collection UUID`. Direct-only filesystem maintenance fails before
daemon contact rather than changing meaning.

## Historical utilities intentionally not promoted into the core

The following commands were presentation, interchange, or exploratory tools
rather than collection semantics:

- `fmt`
- `diff`
- `export` and `import`
- `graph`
- `stats`
- `lint`
- `schema infer`
- the `mdbase-fzf` shell helper

They are not reasons to keep a second CLI or engine. A utility may return later
only when it has a clear product use case, consumes canonical Rust operation
results, and lives behind a small adapter boundary. It must not parse,
validate, mutate, or index collections independently. Import must use typed
batch operations; export and reports must use paginated queries; formatting
must use a canonical engine-owned rewrite operation if one is specified.

## Release gate

Before the first public native release:

1. pin immutable `mdbase-rs` and Connect dependency revisions;
2. publish/install only the native `mdbase` executable;
3. mark the old npm package deprecated if it has ever been published;
4. verify direct-versus-daemon result parity for every portable command;
5. run deterministic performance budgets and packaged desktop smoke tests;
6. ensure documentation and automation contain no dependency on the former
   TypeScript executable.
