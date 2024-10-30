/* eslint-env node */
/**
 * @file The goal of this file is to implement a set of tests to make sure PSM works properly
 *
 * Here are the steps we want to take;
 * 1 - Change swap fees and mint limit according to "psmTestSpecs" below
 * 2 - Create a new user using agd.keys
 * 3 - Fund new user with a stable coin from the VALIDATOR
 *     - Do not provision manually
 * 4 - Make sure new user is able to mint IST from PSM (fees are applied)
 * 5 - Make sure new user can pay their debt and get their anchor (fees are applied)
 * 6 - Make sure mint limit is adhered
 */

import test from 'ava';
import {
  agd,
  agoric,
  getUser,
  GOV1ADDR,
  GOV2ADDR,
} from '@agoric/synthetic-chain';
import { waitUntilAccountFunded } from '@agoric/client-utils';
import { NonNullish } from './test-lib/errors.js';
import {
  adjustBalancesIfNotProvisioned,
  bankSend,
  checkGovParams,
  checkSwapExceedMintLimit,
  checkSwapSucceeded,
  getPsmMetrics,
  implementPsmGovParamChange,
  initializeNewUser,
  maxMintBelowLimit,
  psmSwap,
} from './test-lib/psm-lib.js';
import { getBalances } from './test-lib/utils.js';

// =============================================================================
// COPIED FROM @agoric/internal TO AVOID lockdown()
// =============================================================================
/**
 * @param {any} value
 * @param {string | undefined} name
 * @param {object | undefined} container
 * @param {(value: any, name: string, record: object) => any} mapper
 * @returns {any}
 */
const deepMapObjectInternal = (value, name, container, mapper) => {
  if (container && typeof name === 'string') {
    const mapped = mapper(value, name, container);
    if (mapped !== value) {
      return mapped;
    }
  }

  if (typeof value !== 'object' || !value) {
    return value;
  }

  let wasMapped = false;
  const mappedEntries = Object.entries(value).map(([innerName, innerValue]) => {
    const mappedInnerValue = deepMapObjectInternal(
      innerValue,
      innerName,
      value,
      mapper,
    );
    wasMapped ||= mappedInnerValue !== innerValue;
    return [innerName, mappedInnerValue];
  });

  return wasMapped ? Object.fromEntries(mappedEntries) : value;
};

/**
 * Recursively traverses a record object structure, calling a mapper function
 * for each enumerable string-keyed property and returning a record composed of
 * the results. If none of the values are changed, the original object is
 * returned, maintaining its identity.
 *
 * When the property value is an object, it is sent to the mapper like any other
 * value, and then recursively traversed unless replaced with a distinct value.
 *
 * @param {object} obj
 * @param {(value: any, name: string, record: object) => any} mapper
 * @returns {object}
 */
export const deepMapObject = (obj, mapper) =>
  deepMapObjectInternal(obj, undefined, undefined, mapper);
// =============================================================================
// END COPY
// =============================================================================

/**
 * Given either an array of [key, value] or
 * { [labelKey]: string, [valueKey]: unknown } entries, or a
 * Record<LabelString, Value> object, log a concise representation similar to
 * the latter but hiding implementation details of any embedded remotables.
 */
export const logKeyedNumerics = (t, label, data) => {
  const entries = Array.isArray(data) ? [...data] : Object.entries(data);
  /** @type {[labelKey: PropertyKey, valueKey: PropertyKey]} */
  let shape;
  for (let i = 0; i < entries.length; i += 1) {
    let entry = entries[i];
    if (!Array.isArray(entry)) {
      // Determine which key of a two-property "entry object" (e.g.,
      // {denom, amount} or {brand, value} is the label and which is the value
      // (which may be of type object or number or bigint or string).
      if (!shape) {
        const entryKeys = Object.keys(entry);
        t.is(
          entryKeys.length,
          2,
          `not shaped like a record entry: {${entryKeys}}`,
        );
        const numericKeyIndex = entryKeys.findIndex(
          k =>
            typeof entry[k] === 'object' ||
            (entry[k] !== '' && !Number.isNaN(Number(entry[k]))),
        );
        t.not(
          numericKeyIndex,
          undefined,
          `no numeric-valued property: {${entryKeys}}={${Object.values(entry).map(String)}}`,
        );
        shape = numericKeyIndex === 1 ? entryKeys : entryKeys.reverse();
      }
      // Convert that object to a [key, value] entry array.
      entries[i] = shape.map(k => entry[k]);
      entry = entries[i];
    }
    // Simplify remotables in the value.
    entry[1] = deepMapObject(entry[1], value => {
      const tag =
        value && typeof value === 'object' && value[Symbol.toStringTag];
      return tag
        ? Object.defineProperty({}, Symbol.toStringTag, { value: tag })
        : value;
    });
  }
  t.log(
    label,
    shape ? `{ [${shape[0]}]: ${shape[1]} }` : '',
    Object.fromEntries(entries),
  );
  // TODO gibson: Remove this temporary hedge against t.log not being visible upon timeout.
  console.log(
    label,
    shape ? `{ [${shape[0]}]: ${shape[1]} }` : '',
    Object.fromEntries(entries),
  );
};

// Export these from synthetic-chain?
const USDC_DENOM = NonNullish(process.env.USDC_DENOM);
const PSM_PAIR = NonNullish(process.env.PSM_PAIR);
const PSM_INSTANCE = `psm-${PSM_PAIR.replace('.', '-')}`;

const psmSwapIo = {
  now: Date.now,
  follow: agoric.follow,
  setTimeout,
};

const psmTestSpecs = {
  govParams: {
    giveMintedFeeVal: 10n, // in %
    wantMintedFeeVal: 10n, // in %
    mintLimit: 500n * 1_000_000n, // in IST
    votingDuration: 1, // in minutes
  },
  psmInstance: PSM_INSTANCE,
  anchor: PSM_INSTANCE.split('-')[2],
  newUser: {
    name: 'new-psm-trader',
    fund: {
      denom: USDC_DENOM,
      value: '300000000', // 300 USDC_axl
    },
  },
  otherUser: {
    name: 'gov1',
    fund: {
      denom: USDC_DENOM,
      value: '1000000000', // 1000 USDC_axl
    },
    toIst: {
      value: 500, // in IST
    },
  },
  toIst: {
    value: 50, // in IST
  },
  fromIst: {
    value: 50, // in USDC_axl
  },
};

test.serial('change gov params', async t => {
  await implementPsmGovParamChange(
    {
      address: GOV1ADDR,
      instanceName: psmTestSpecs.psmInstance,
      newParams: psmTestSpecs.govParams,
      votingDuration: psmTestSpecs.govParams.votingDuration,
    },
    { committeeAddrs: [GOV1ADDR, GOV2ADDR], position: 0 },
    { now: Date.now, follow: agoric.follow },
  );

  await checkGovParams(
    t,
    {
      GiveMintedFee: {
        type: 'ratio',
        value: {
          numerator: { value: psmTestSpecs.govParams.giveMintedFeeVal * 100n }, // convert to bps
        },
      },
      WantMintedFee: {
        type: 'ratio',
        value: {
          numerator: { value: psmTestSpecs.govParams.wantMintedFeeVal * 100n }, // convert to bps
        },
      },
      MintLimit: {
        type: 'amount',
        value: {
          value: psmTestSpecs.govParams.mintLimit,
        },
      },
    },
    psmTestSpecs.psmInstance.split('-')[2],
  );
});

test.serial('initialize new user', async t => {
  const {
    newUser: { name, fund },
  } = psmTestSpecs;

  await initializeNewUser(name, fund, { query: agd.query, setTimeout });
  t.pass();
});

test.serial('swap into IST', async t => {
  const {
    newUser: { name },
    anchor,
    toIst,
    govParams: { wantMintedFeeVal },
  } = psmTestSpecs;

  const psmTrader = await getUser(name);
  t.log('TRADER', psmTrader);

  const balances = await getBalances([psmTrader]);
  logKeyedNumerics(t, 'BALANCES', balances);
  const metricsBefore = await getPsmMetrics(anchor);
  logKeyedNumerics(t, 'METRICS', metricsBefore);

  const balancesBefore = await adjustBalancesIfNotProvisioned(
    balances,
    psmTrader,
  );
  logKeyedNumerics(t, 'BALANCES_ADJUSTED', balancesBefore);

  await psmSwap(
    psmTrader,
    [
      'swap',
      '--pair',
      PSM_PAIR,
      '--wantMinted',
      toIst.value,
      '--feePct',
      wantMintedFeeVal,
    ],
    psmSwapIo,
  );
  logKeyedNumerics(t, 'SWAPPED', []);

  await checkSwapSucceeded(t, metricsBefore, balancesBefore, {
    wantMinted: toIst.value,
    trader: psmTrader,
    fee: Number(wantMintedFeeVal) / 100, // fee has to be between 0 and 1
    anchor,
  });
});

test.serial('swap out of IST', async t => {
  const {
    newUser: { name },
    anchor,
    fromIst,
    govParams: { giveMintedFeeVal },
  } = psmTestSpecs;

  const psmTrader = await getUser(name);

  const [metricsBefore, balancesBefore] = await Promise.all([
    getPsmMetrics(anchor),
    getBalances([psmTrader]),
  ]);

  logKeyedNumerics(t, 'METRICS', metricsBefore);
  logKeyedNumerics(t, 'BALANCES', balancesBefore);

  await psmSwap(
    psmTrader,
    [
      'swap',
      '--pair',
      PSM_PAIR,
      '--giveMinted',
      fromIst.value,
      '--feePct',
      giveMintedFeeVal,
    ],
    psmSwapIo,
  );

  await checkSwapSucceeded(t, metricsBefore, balancesBefore, {
    giveMinted: fromIst.value,
    trader: psmTrader,
    fee: Number(giveMintedFeeVal) / 100, // fee has to be between 0 and 1
    anchor,
  });
});

test.serial('mint limit is adhered', async t => {
  const {
    otherUser: {
      fund: { denom, value },
      name,
    },
    govParams,
    anchor,
  } = psmTestSpecs;

  // Fund other user
  const otherAddr = await getUser(name);
  await bankSend(otherAddr, `${value}${denom}`);
  await waitUntilAccountFunded(
    otherAddr,
    { log: t.log, query: agd.query, setTimeout },
    { denom, value: parseInt(value, 10) },
    { errorMessage: `${otherAddr} could not be funded with ${value}${denom}` },
  );

  const [metricsBefore, balancesBefore] = await Promise.all([
    getPsmMetrics(anchor),
    getBalances([otherAddr]),
  ]);

  logKeyedNumerics(t, 'METRICS', metricsBefore);
  logKeyedNumerics(t, 'BALANCES', balancesBefore);

  const { maxMintableValue, wantFeeValue } = await maxMintBelowLimit(anchor);
  const maxMintFeesAccounted = Math.floor(
    maxMintableValue * (1 - wantFeeValue),
  );
  t.log({ maxMintableValue, wantFeeValue, maxMintFeesAccounted });

  // Send a swap, should fail because mint limit is exceeded
  await t.throwsAsync(
    () =>
      psmSwap(
        otherAddr,
        [
          'swap',
          '--pair',
          PSM_PAIR,
          '--wantMinted',
          maxMintFeesAccounted / 1000000 + 2, // Make sure we exceed the limit
          '--feePct',
          govParams.wantMintedFeeVal,
        ],
        psmSwapIo,
      ),
    { message: /not succeeded/ },
  );

  // Now check if failed with correct error message
  await checkSwapExceedMintLimit(t, otherAddr, metricsBefore);

  // Send another swap offer, this time should succeed
  await psmSwap(
    otherAddr,
    [
      'swap',
      '--pair',
      PSM_PAIR,
      '--wantMinted',
      maxMintFeesAccounted / 1000000,
      '--feePct',
      govParams.wantMintedFeeVal,
    ],
    psmSwapIo,
  );

  // Make sure swap succeeded
  await checkSwapSucceeded(t, metricsBefore, balancesBefore, {
    wantMinted: maxMintFeesAccounted / 1000000,
    trader: otherAddr,
    fee: Number(govParams.wantMintedFeeVal) / 100, // fee has to be between 0 and 1
    anchor,
  });
});
