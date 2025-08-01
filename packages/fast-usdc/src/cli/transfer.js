/* eslint-env node */
/* global globalThis */

import {
  fetchEnvNetworkConfig,
  makeVStorage,
  pickEndpoint,
} from '@agoric/client-utils';
import { encodeAddressHook } from '@agoric/cosmic-proto/address-hooks.js';
import { queryFastUSDCLocalChainAccount } from './util/agoric.js';
import { depositForBurn, makeProvider } from './util/cctp.js';
import {
  makeSigner,
  queryForwardingAccount,
  registerFwdAccount,
} from './util/noble.js';
import { queryUSDCBalance } from './util/bank.js';

/** @import { File } from './util/file.js' */
/** @import { VStorage } from '@agoric/client-utils' */
/** @import { SigningStargateClient } from '@cosmjs/stargate' */
/** @import { JsonRpcProvider as ethProvider } from 'ethers' */

/**
 * @param {File} configFile
 * @param {string} amount
 * @param {string} EUD
 * @param {typeof globalThis.console} [out]
 * @param {typeof globalThis.fetch} [fetch]
 * @param {VStorage} [vstorage]
 * @param {{signer: SigningStargateClient, address: string}} [nobleSigner]
 * @param {ethProvider} [ethProvider]
 * @param {typeof process.env} [env]
 * @param {typeof globalThis.setTimeout} [setTimeout]
 */
export const transfer = async (
  configFile,
  amount,
  EUD,
  out = console,
  fetch = globalThis.fetch,
  vstorage,
  nobleSigner,
  ethProvider,
  env = process.env,
  setTimeout = globalThis.setTimeout,
) => {
  const execute = async (
    /** @type {import('./config.js').ConfigOpts} */ config,
  ) => {
    const netConfig = await fetchEnvNetworkConfig({ env, fetch });
    vstorage ||= makeVStorage(
      { fetch },
      { chainName: 'agoric', rpcAddrs: [pickEndpoint(netConfig)] },
    );
    const agoricAddr = await queryFastUSDCLocalChainAccount(vstorage, out);
    const encodedAddr = encodeAddressHook(agoricAddr, { EUD });
    out.log(`forwarding destination ${encodedAddr}`);

    const { exists, address } = await queryForwardingAccount(
      config.nobleApi,
      config.nobleToAgoricChannel,
      encodedAddr,
      out,
      fetch,
    );

    if (!exists) {
      nobleSigner ||= await makeSigner(config.nobleSeed, config.nobleRpc, out);
      const { address: signerAddress, signer } = nobleSigner;
      try {
        const res = await registerFwdAccount(
          signer,
          signerAddress,
          config.nobleToAgoricChannel,
          encodedAddr,
          out,
        );
        out.log(res);
      } catch (e) {
        out.error(
          `Error registering noble forwarding account for ${encodedAddr} on channel ${config.nobleToAgoricChannel}`,
        );
        throw e;
      }
    }

    const destChain = config.destinationChains?.find(chain =>
      EUD.startsWith(chain.bech32Prefix),
    );
    if (!destChain) {
      out.error(
        `No destination chain found in config with matching bech32 prefix for ${EUD}, cannot query destination address`,
      );
      throw new Error();
    }
    const { api, USDCDenom } = destChain;
    const startingBalance = await queryUSDCBalance(EUD, api, USDCDenom, fetch);

    ethProvider ||= makeProvider(config.ethRpc);
    await depositForBurn(
      ethProvider,
      config.ethSeed,
      config.tokenMessengerAddress,
      config.tokenAddress,
      address,
      amount,
      out,
    );

    const refreshDelayMS = 1200;
    const completeP = /** @type {Promise<void>} */ (
      new Promise((res, rej) => {
        const refreshUSDCBalance = async () => {
          out.log('polling usdc balance');
          const currentBalance = await queryUSDCBalance(
            EUD,
            api,
            USDCDenom,
            fetch,
          );
          if (currentBalance !== startingBalance) {
            res();
          } else {
            setTimeout(() => refreshUSDCBalance().catch(rej), refreshDelayMS);
          }
        };
        refreshUSDCBalance().catch(rej);
      })
    ).catch(e => {
      out.error(
        'Error checking destination address balance, could not detect completion of transfer.',
      );
      out.error(e.message);
    });

    await completeP;
  };

  let config;
  await null;
  try {
    config = JSON.parse(await configFile.read());
  } catch {
    out.error(
      `No config found at ${configFile.path}. Use "config init" to create one, or "--home" to specify config location.`,
    );
    throw new Error();
  }
  await execute(config);
};
