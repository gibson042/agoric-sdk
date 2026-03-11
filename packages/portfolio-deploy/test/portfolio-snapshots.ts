import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { type SwingsetTestKitSnapshot } from '@aglocal/boot/tools/supports.js';
import { loadOrCreateRunUtilsSnapshot } from '../../boot/test/tools/runutils-snapshots.js';
import { preparePortfolioReadyContext } from './portfolio-snapshot-setup.ts';
import { makeWalletFactoryContext } from './walletFactory.ts';

const SNAPSHOT_VERSION = 1;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const repoKey = createHash('sha256')
  .update(repoRoot)
  .digest('hex')
  .slice(0, 12);
const snapshotDir = resolve(
  tmpdir(),
  `agoric-sdk-test-snapshots-${repoKey}`,
  'portfolio-deploy',
  'runutils',
);

export const PORTFOLIO_SNAPSHOT_SPECS = {
  'portfolio-ready': {
    configSpecifier:
      '@agoric/vm-config/decentral-itest-orchestration-config.json',
    description: 'Boot snapshot with portfolio proposals applied',
  },
} as const;

export type PortfolioSnapshotName = keyof typeof PORTFOLIO_SNAPSHOT_SPECS;

type SnapshotBody = {
  version: typeof SNAPSHOT_VERSION;
  snapshot: SwingsetTestKitSnapshot;
};

const listNames = () => Object.keys(PORTFOLIO_SNAPSHOT_SPECS);

export const isPortfolioSnapshotName = (
  name: string,
): name is PortfolioSnapshotName => {
  return listNames().includes(name);
};

export const availablePortfolioSnapshotNames = (): PortfolioSnapshotName[] =>
  listNames().filter(isPortfolioSnapshotName);

const snapshotPath = (name: PortfolioSnapshotName) =>
  `${snapshotDir}/${name}.json`;
const snapshotLockPath = (name: PortfolioSnapshotName) =>
  `${snapshotDir}/${name}.lock`;

export const createPortfolioSnapshot = async (
  name: PortfolioSnapshotName,
  log: (...args: unknown[]) => void = console.log,
) => {
  const spec = PORTFOLIO_SNAPSHOT_SPECS[name];
  const baseSnapshot = await loadOrCreateRunUtilsSnapshot(
    'orchestration-base',
    log,
  );
  const kit = await makeWalletFactoryContext(
    { log } as Parameters<typeof makeWalletFactoryContext>[0],
    spec.configSpecifier,
    { snapshot: baseSnapshot },
  );
  try {
    await preparePortfolioReadyContext(kit);
    await kit.controller.snapshotAllVats();
    await kit.swingStore.hostStorage.commit();

    const body: SnapshotBody = {
      version: SNAPSHOT_VERSION,
      snapshot: kit.makeSnapshot(),
    };

    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(snapshotPath(name), JSON.stringify(body), 'utf-8');
    return snapshotPath(name);
  } finally {
    await kit.shutdown();
  }
};

export const loadPortfolioSnapshot = async (
  name: PortfolioSnapshotName,
): Promise<SwingsetTestKitSnapshot> => {
  const body = JSON.parse(
    await fs.readFile(snapshotPath(name), 'utf-8'),
  ) as SnapshotBody;
  if (body.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `Unsupported snapshot version ${body.version}, expected ${SNAPSHOT_VERSION}`,
    );
  }
  return body.snapshot;
};

export const loadOrCreatePortfolioSnapshot = async (
  name: PortfolioSnapshotName,
  log: (...args: unknown[]) => void = console.log,
): Promise<SwingsetTestKitSnapshot> => {
  const lockPath = snapshotLockPath(name);
  await fs.mkdir(snapshotDir, { recursive: true });
  for (;;) {
    try {
      return await loadPortfolioSnapshot(name);
    } catch {
      // fall through to lock acquisition and possible regeneration
    }
    let lock;
    try {
      lock = await fs.open(lockPath, 'wx');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        await delay(100);
        continue;
      }
      throw e;
    }
    try {
      try {
        return await loadPortfolioSnapshot(name);
      } catch (cause) {
        log(
          `Portfolio snapshot ${name} missing or stale; regenerating at ${snapshotPath(name)}`,
          cause,
        );
        await createPortfolioSnapshot(name, log);
        return loadPortfolioSnapshot(name);
      }
    } finally {
      await lock.close();
      await fs.rm(lockPath, { force: true });
    }
  }
};
