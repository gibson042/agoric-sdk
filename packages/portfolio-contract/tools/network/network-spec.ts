import type { NatValue } from '@agoric/ertp';
import type {
  YieldProtocol,
  SupportedChain,
} from '@agoric/portfolio-api/src/constants.js';

import type { PoolKey } from '../../src/type-guards.js';
import type { AssetPlaceRef } from '../../src/type-guards-steps.js';

// Control and transfer planes
export type ControlProtocol = 'ibc' | 'axelar' | 'local';
export type TransferProtocol =
  | 'ibc'
  | 'fastusdc'
  | 'cctpFromNoble'
  | 'cctpToNoble' // (often to a forwarding address)
  | 'cctpV2'
  | 'local';
/**
 * Link to Factory and Wallet contracts:
 * https://github.com/agoric-labs/agoric-to-axelar-local/blob/cd6087fa44de3b019b2cdac6962bb49b6a2bc1ca/packages/axelar-local-dev-cosmos/src/__tests__/contracts/Factory.sol
 *
 * Steps submitted to the contract are expected to include fee/gas payment
 * details which vary by the traversed link.
 * - toUSDN: transferring into USDN transfer reduces the *payload* (e.g., $10k
 *   might get reduced to $9995)
 * - makeEvmAccount: the fee for executing the Factory contract to
 *   create a new remote wallet
 * - evmToNoble: the fee for running the tx to send tokens from the remote wallet
 *   to Noble
 * - evmToPool: the fee for sending and executing a tx on the Wallet contract
 *   to supply tokens to a specified pool
 * - poolToEvm: the fee for sending and executing a tx on the Wallet contract
 *   to withdraw tokens from a specified pool
 */
export type FeeMode =
  | 'toUSDN'
  | 'makeEvmAccount'
  | 'evmToNoble'
  | 'evmToPool'
  | 'poolToEvm'
  | 'evmToEvm';

// Chains (hubs)
export interface ChainSpec {
  name: SupportedChain;
  /** how agoric reaches this chain: 'ibc' (noble) or 'axelar' (EVM) or 'local' (agoric) */
  control: ControlProtocol;
  /** minimum delta amount for planned moves involving this chain */
  deltaSoftMin?: NatValue;
}

// Pools (leaves)
export interface PoolSpec {
  pool: PoolKey;
  /** host chain of the corresponding instrument */
  chain: SupportedChain;
  /** protocol of the corresponding instrument */
  protocol: YieldProtocol;
}

/**
 * A +agoric local account or <Deposit>/<Cash> Agoric blockchain contract seat.
 */
export interface LocalPlaceSpec {
  id: '<Deposit>' | '<Cash>' | '+agoric';
  chain: 'agoric';
}

/**
 * A directed edge from one place to another, usually having at least one hub
 * endpoint.
 */
export interface LinkSpec {
  src: AssetPlaceRef;
  dest: AssetPlaceRef;

  /**
   * variable transfer fee in basis points to be applied against the transferred
   * amount of major units (e.g., USDC)
   */
  variableFeeBps: number;
  /** flat-rate transfer fee in minor units (e.g., uusdc) */
  flatFee?: NatValue;

  /** expected transfer settlement time in seconds */
  timeSec: number;
  /** inclusive maximum transfer amount in minor units (e.g., uusdc) */
  capacity?: NatValue;
  /** inclusive minimum transfer amount in minor units (e.g., uusdc) */
  min?: NatValue;

  /** mechanism by which the transfer occurs */
  transfer: TransferProtocol;
  /** designator for how fees apply to transactions over this link */
  feeMode?: FeeMode;
}

/** Details of how chains/pools/etc. and how they connect. */
export interface NetworkSpec {
  debug?: boolean;
  environment?: 'dev' | 'test' | 'prod';

  chains: ChainSpec[];
  pools: PoolSpec[];
  localPlaces?: LocalPlaceSpec[];
  links: LinkSpec[];
}
export type { PoolKey };
