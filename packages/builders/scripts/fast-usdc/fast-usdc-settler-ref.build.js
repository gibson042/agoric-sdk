/**
 * Usage:
 * agoric run fast-usdc-settler-ref.build.js
 *
 * (see update-settler-reference.core.js)
 */
import { makeHelpers } from '@agoric/deploy-script-support';
import { getManifestForUpdateSettlerReference } from '@agoric/fast-usdc/src/update-settler-reference.core.js';

/**
 * @import {CoreEvalBuilder, DeployScriptFunction} from '@agoric/deploy-script-support/src/externalTypes.js';
 */

/**
 * @param {Parameters<CoreEvalBuilder>[0]} powers
 * @param {{}} options
 * @satisfies {CoreEvalBuilder}
 */
export const proposalBuilder = async (
  { publishRef, install },
  options = {},
) => {
  return harden({
    sourceSpec: '@agoric/fast-usdc/src/update-settler-reference.core.js',
    /** @type {[string, Parameters<typeof getManifestForUpdateSettlerReference>[1]]} */
    getManifestCall: [
      getManifestForUpdateSettlerReference.name,
      {
        options,
        installKeys: {
          fastUsdc: publishRef(
            install('@agoric/fast-usdc/src/fast-usdc.contract.js'),
          ),
        },
      },
    ],
  });
};

/** @type {DeployScriptFunction} */
export default async (homeP, endowments) => {
  const { writeCoreEval } = await makeHelpers(homeP, endowments);

  await writeCoreEval('eval-fast-usdc-settler-ref', utils =>
    proposalBuilder(utils),
  );
};
