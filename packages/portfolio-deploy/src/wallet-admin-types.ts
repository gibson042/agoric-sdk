/**
 * @file types for admin tool endowments
 *
 * @see '../scripts/wallet-admin.ts'
 */
import type {
  SigningSmartWalletKit,
  SmartWalletKit,
  reflectWalletStore,
} from '@agoric/client-utils';
import type { FileRW } from '@agoric/pola-io/src/file.js';
import type { E } from '@endo/far';

export type SigningSmartWalletKitWithStore = SigningSmartWalletKit & {
  store: ReturnType<typeof reflectWalletStore>;
};

export interface RunTools {
  scriptArgs: string[];
  walletKit: SmartWalletKit;
  makeAccount(name: string): Promise<SigningSmartWalletKitWithStore>;
  E: typeof E;
  harden: typeof harden;
  cwd: FileRW;
}
