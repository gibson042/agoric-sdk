/** @file upgrade ymax using ymaxControl */
import type { start as YMaxStart } from '@aglocal/portfolio-contract/src/portfolio.contract.ts';
import type { ContractControl } from '@agoric/deploy-script-support/src/control/contract-control.contract.js';
import { parseArgs } from 'node:util';
import type { RunTools } from './wallet-admin-types.ts';
import {
  WALLET_KEY,
  checkContract,
  netOfConfig,
} from './ymax-admin-helpers.ts';

const options = {
  contract: { type: 'string', default: 'ymax0' },
  bundle: { type: 'string' },
  overrides: { type: 'string' },
} as const;

const upgradeYmax = async ({ scriptArgs, makeAccount, cwd }: RunTools) => {
  const { values } = parseArgs({ args: scriptArgs, options });
  const { contract, bundle: bundleId, overrides } = values;
  if (!bundleId) throw Error('--bundle missing');

  const privateArgsOverrides = await (overrides
    ? cwd.readOnly().join(overrides).readJSON()
    : {});

  // XXX use different env var per account?
  const account = await makeAccount(`MNEMONIC`);
  const net = netOfConfig(account.networkConfig);
  checkContract(contract, account.address, net);

  const ymaxControl =
    account.store.get<ContractControl<typeof YMaxStart>>(WALLET_KEY);

  const { tx } = await ymaxControl.upgrade({ bundleId, privateArgsOverrides });
  console.log('upgrade tx', tx);
};

export default upgradeYmax;
