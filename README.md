# mdbase-cli (retired TypeScript implementation)

This repository is retained as a migration reference only. It no longer
publishes or installs an `mdbase` executable.

The supported CLI is the native Rust `mdbase` executable built by
[`mdbase-connect`](https://github.com/mdbase-dev/mdbase-connect). It combines
the canonical `mdbase-rs` collection engine with direct filesystem access,
Connect-managed collection access, daemon/service management, and built-in
performance profiling.

```sh
mdbase --root ./notes validate
mdbase --root ./notes query --types task
mdbase --collection <uuid> query --types task
mdbase connect status
mdbase profile engine
```

The historical source and tests remain readable so that intentionally
non-core presentation features can be evaluated without preserving a second
collection engine. See [RETIREMENT.md](RETIREMENT.md) for the capability map
and decisions.

Do not publish this package, add a package-manager `bin` entry, or implement
new collection behavior here. TypeScript application SDKs are separate
packages and are not retired by this change.
