import type { ChainAddress } from '@agoric/orchestration';
import type { IBCChannelID } from '@agoric/vats';
import type { Amount } from '@agoric/ertp';
import type { PendingTxStatus } from './constants.js';

export type EvmHash = `0x${string}`;
export type NobleAddress = `noble1${string}`;

export interface CctpTxEvidence {
  /** from Noble RPC */
  aux: {
    forwardingChannel: IBCChannelID;
    recipientAddress: ChainAddress['value'];
  };
  blockHash: EvmHash;
  blockNumber: bigint;
  blockTimestamp: bigint;
  chainId: number;
  /** data covered by signature (aka txHash) */
  tx: {
    amount: bigint;
    forwardingAddress: NobleAddress;
  };
  txHash: EvmHash;
}

export type LogFn = (...args: unknown[]) => void;

export interface PendingTx extends CctpTxEvidence {
  status: PendingTxStatus;
}

/** internal key for `StatusManager` exo */
export type PendingTxKey = `pendingTx:${string}`;

/** internal key for `StatusManager` exo */
export type SeenTxKey = `seenTx:${string}`;

export type FeeConfig = {
  flat: Amount<'nat'>;
  variableRate: Ratio;
  maxVariable: Amount<'nat'>;
  contractRate: Ratio;
};

export interface PoolStats {
  totalBorrows: Amount<'nat'>;
  totalContractFees: Amount<'nat'>;
  totalPoolFees: Amount<'nat'>;
  totalRepays: Amount<'nat'>;
}

export interface PoolMetrics extends PoolStats {
  encumberedBalance: Amount<'nat'>;
  shareWorth: Ratio;
}

export type * from './constants.js';