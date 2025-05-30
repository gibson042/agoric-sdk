import { makeHelpers } from '@agoric/deploy-script-support';
import { AmountMath } from '@agoric/ertp';
import { multiplyBy, parseRatio } from '@agoric/ertp/src/ratio.js';
import { Far } from '@endo/far';
import { parseArgs } from 'node:util';
import { toExternalConfig } from './utils/config-marshal.js';
import { getManifestForDistributeFees } from './distribute-fees.core.js';

/**
 * @import {CoreEvalBuilder, DeployScriptFunction} from '@agoric/deploy-script-support/src/externalTypes.js'
 * @import {FeeDistributionTerms} from './distribute-fees.core.js'
 */

const usage =
  'Use: [--fixedFees <number> | --feePortion <percent>] --destinationAddress <address> ...';

const xVatCtx = /** @type {const} */ ({
  /** @type {Brand<'nat'>} */
  USDC: Far('USDC Brand'),
});
const { USDC } = xVatCtx;
const USDC_DECIMALS = 6n;
const unit = AmountMath.make(USDC, 10n ** USDC_DECIMALS);

/**
 * @param {unknown} _utils
 * @param {FeeDistributionTerms} feeTerms
 * @satisfies {CoreEvalBuilder}
 */
export const feeProposalBuilder = async (_utils, feeTerms) => {
  return harden({
    sourceSpec: './distribute-fees.core.js',
    /** @type {[string, Parameters<typeof getManifestForDistributeFees>[1]]} */
    getManifestCall: [
      getManifestForDistributeFees.name,
      { options: toExternalConfig(harden({ feeTerms }), xVatCtx) },
    ],
  });
};

/** @type {DeployScriptFunction} */
export default async (homeP, endowments) => {
  const { writeCoreEval } = await makeHelpers(homeP, endowments);
  /** @type {{ values: Record<string, string | undefined> }} */
  const {
    values: { destinationAddress, ...opt },
  } = parseArgs({
    args: endowments.scriptArgs,
    options: {
      destinationAddress: { type: 'string' },
      fixedFees: { type: 'string' },
      feePortion: { type: 'string' },
    },
  });
  if (!destinationAddress) assert.fail(usage);
  if (opt.fixedFees && opt.feePortion) assert.fail(usage);

  /** @type {FeeDistributionTerms} */
  const feeTerms = {
    destinationAddress,
    ...((opt.fixedFees && {
      fixedFees: multiplyBy(unit, parseRatio(opt.fixedFees, USDC)),
    }) ||
      (opt.feePortion && {
        feePortion: parseRatio(opt.feePortion, USDC),
      }) ||
      assert.fail(usage)),
  };
  await writeCoreEval('eval-fast-usdc-fees', utils =>
    feeProposalBuilder(utils, feeTerms),
  );
};
