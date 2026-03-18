# Boot Test Tools

## Naming

Use these path conventions under `packages/boot/test`:

- `test/fixtures`: checked-in static test inputs
- `test/cache`: generated reusable test state and cacheable derived artifacts
- tmp dirs elsewhere: ephemeral per-run scratch data

Runutils snapshots are generated, fingerprinted, and rebuilt on demand, so they
belong under `test/cache`, not `test/fixtures`.

## Runutils snapshots

`runutils-snapshots.ts` manages reusable boot snapshots for `packages/boot` tests.

Each snapshot is defined in `RUNUTILS_SNAPSHOT_SPECS` with:

- `configSpecifier`: the base boot config used to create the snapshot
- `setup`: optional extra boot-time work that must run before the snapshot is captured
- `cacheInputs`: optional extra source files that affect the snapshot contents but are not otherwise discoverable from `configSpecifier`

`createRunUtilsSnapshot(name)` creates a fresh swingset, runs `spec.setup` if present, snapshots all vats, commits swingstore state, and writes:

- `kernel-bundle.json`
- `metadata.json`
- the snapshot swingstore directory

These are written under `packages/boot/test/cache/runutils`.

`loadRunUtilsSnapshot(name)` validates those files against the current source
tree and kernel bundle. `loadOrCreateRunUtilsSnapshot(name)` wraps that with
regeneration and a cross-process lock so concurrent test processes do not all
rewrite the same snapshot path at once.

## Fingerprinting

Snapshot freshness is determined by a per-snapshot fingerprint stored in `metadata.json` as `snapshotFingerprint`.

`computeRunUtilsSnapshotFingerprint(name)` hashes:

- `SNAPSHOT_VERSION`
- the snapshot name
- the current kernel bundle SHA-512
- the contents of all input files for that snapshot

The input file set is:

- shared inputs:
  - `packages/boot/test/tools/runutils-snapshots.ts`
  - `packages/boot/tools/supports.ts`
- the snapshot's `configSpecifier`

`computeRunUtilsSnapshotsFingerprint()` combines all per-snapshot fingerprints into one aggregate value. CI uses that aggregate value as the boot snapshot cache key.

For day-to-day CI, the workflow uses the per-snapshot fingerprints directly so
each shard can restore or regenerate only the snapshots it actually needs.

## Local and CI behavior

Local dev and CI use the same fingerprint logic.

- Local `loadRunUtilsSnapshot(name)` rebuilds if:
  - `SNAPSHOT_VERSION` changed
  - the stored `snapshotFingerprint` does not match the current fingerprint
  - the stored kernel bundle hash does not match the saved bundle file
  - the current kernel bundle hash does not match the metadata
- CI computes the cache key by invoking `create-runutils-snapshot.ts --cache-key`, which calls `computeRunUtilsSnapshotsFingerprint()`

This keeps local staleness checks and CI cache invalidation aligned.

### Warm vs cold CI

Warm and cold runs have different tradeoffs:

- warm run: the direct per-shard cache restores are usually a net win because
  shards start immediately after `build` and avoid the full boot cost
- cold run: a snapshot may be regenerated independently in more than one shard
  if those shards both need it before any shared cache exists

Because of that tradeoff, the sharding order tries to keep each snapshot family
inside as few shards as possible. Snapshot locality matters more than perfect
lexicographic or file-count balance.

## Important limits

Snapshot fingerprinting is only as complete as the declared inputs. Right now
those inputs are intentionally narrow:

- shared snapshot-tool inputs
- the selected boot config
- the current kernel bundle hash

If a future snapshot adds more setup work than "boot this config and capture
it", the fingerprint rules must be expanded along with that snapshot.

## CLI

`create-runutils-snapshot.ts` supports:

- `--list`: list known snapshot names
- `--all`: generate all snapshots
- `--cache-key`: print the aggregate fingerprint used by CI
- `<name>`: generate a single snapshot
