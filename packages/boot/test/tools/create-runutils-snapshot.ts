import '@endo/init/debug.js';

import {
  availableRunUtilsSnapshotNames,
  computeRunUtilsSnapshotsFingerprint,
  createRunUtilsSnapshot,
  isRunUtilsSnapshotName,
} from './runutils-snapshots.js';

const usage = () => {
  const names = availableRunUtilsSnapshotNames().join(', ');
  console.error(
    `Usage: create-runutils-snapshot <name|--all|--cache-key>\nAvailable names: ${names}`,
  );
};

const main = async () => {
  const [name] = process.argv.slice(2);
  if (!name || name === '--help' || name === '-h') {
    usage();
    process.exitCode = 1;
    return;
  }
  if (name === '--list') {
    for (const snapshotName of availableRunUtilsSnapshotNames()) {
      console.log(snapshotName);
    }
    return;
  }
  if (name === '--cache-key') {
    console.log(await computeRunUtilsSnapshotsFingerprint());
    return;
  }
  if (name === '--all') {
    for (const snapshotName of availableRunUtilsSnapshotNames()) {
      const path = await createRunUtilsSnapshot(snapshotName);
      console.log(`Wrote snapshot ${snapshotName} to ${path}`);
    }
    return;
  }
  if (!isRunUtilsSnapshotName(name)) {
    console.error(`Unknown snapshot name: ${name}`);
    usage();
    process.exitCode = 1;
    return;
  }
  const path = await createRunUtilsSnapshot(name);
  console.log(`Wrote snapshot ${name} to ${path}`);
};

await main();
