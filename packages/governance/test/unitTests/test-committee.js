// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import '@agoric/zoe/exported.js';

import path from 'path';
import { E } from '@agoric/eventual-send';
import { makeZoeKit } from '@agoric/zoe';
import fakeVatAdmin from '@agoric/zoe/tools/fakeVatAdmin.js';
import bundleSource from '@agoric/bundle-source';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';

import {
  ChoiceMethod,
  ElectionType,
  QuorumRule,
  looksLikeBallotSpec,
} from '../../src/ballotBuilder.js';

const filename = new URL(import.meta.url).pathname;
const dirname = path.dirname(filename);

const registrarRoot = `${dirname}/../../src/committeeRegistrar.js`;
const counterRoot = `${dirname}/../../src/binaryBallotCounter.js`;

const setupContract = async () => {
  const { zoeService } = makeZoeKit(fakeVatAdmin);
  const feePurse = E(zoeService).makeFeePurse();
  const zoe = E(zoeService).bindDefaultFeePurse(feePurse);

  // pack the contract
  const [registrarBundle, counterBundle] = await Promise.all([
    bundleSource(registrarRoot),
    bundleSource(counterRoot),
  ]);
  // install the contract
  const [registrarInstallation, counterInstallation] = await Promise.all([
    E(zoe).install(registrarBundle),
    E(zoe).install(counterBundle),
  ]);
  const terms = { committeeName: 'illuminati', committeeSize: 13 };
  const registrarStartResult = await E(zoe).startInstance(
    registrarInstallation,
    {},
    terms,
  );

  /** @type {ContractFacet} */
  return { registrarStartResult, counterInstallation };
};

test('committee-open no questions', async t => {
  const {
    registrarStartResult: { publicFacet },
  } = await setupContract();
  t.deepEqual(await publicFacet.getOpenQuestions(), []);
});

test('committee-open question:one', async t => {
  const {
    registrarStartResult: { creatorFacet, publicFacet },
    counterInstallation,
  } = await setupContract();

  const positions = [harden({ text: 'because' }), harden({ text: 'why not?' })];
  const ballotSpec = looksLikeBallotSpec({
    method: ChoiceMethod.CHOOSE_N,
    question: harden({ text: 'why' }),
    positions,
    electionType: ElectionType.SURVEY,
    maxChoices: 1,
    closingRule: {
      timer: buildManualTimer(console.log),
      deadline: 2n,
    },
    quorumRule: QuorumRule.MAJORITY,
    tieOutcome: positions[1],
  });
  await E(creatorFacet).addQuestion(counterInstallation, ballotSpec);
  const question = await publicFacet.getOpenQuestions();
  const ballot = E(publicFacet).getBallot(question[0]);
  const ballotDetails = await E(ballot).getDetails();
  t.deepEqual(ballotDetails.question.text, 'why');
});

test('committee-open question:mixed', async t => {
  const {
    registrarStartResult: { creatorFacet, publicFacet },
    counterInstallation,
  } = await setupContract();

  const timer = buildManualTimer(console.log);
  const positions = [harden({ text: 'because' }), harden({ text: 'why not?' })];
  const ballotSpec = looksLikeBallotSpec({
    method: ChoiceMethod.CHOOSE_N,
    question: harden({ text: 'why' }),
    positions,
    electionType: ElectionType.SURVEY,
    maxChoices: 1,
    closingRule: { timer, deadline: 4n },
    quorumRule: QuorumRule.MAJORITY,
    tieOutcome: positions[1],
  });
  await E(creatorFacet).addQuestion(counterInstallation, ballotSpec);

  const ballotSpec2 = {
    ...ballotSpec,
    question: harden({ text: 'why2' }),
    closingRule: ballotSpec.closingRule,
    quorumRule: QuorumRule.MAJORITY,
  };
  await E(creatorFacet).addQuestion(counterInstallation, ballotSpec2);

  const ballotSpec3 = {
    ...ballotSpec,
    question: harden({ text: 'why3' }),
    closingRule: {
      timer,
      deadline: 1n,
    },
    quorumRule: QuorumRule.MAJORITY,
  };
  const { publicFacet: counterPublic } = await E(creatorFacet).addQuestion(
    counterInstallation,
    ballotSpec3,
  );
  // We didn't add any votes. getOutcome() will eventually return a broken
  // promise, but not until some time after tick(). Add a .catch() for it.
  E(counterPublic)
    .getOutcome()
    .catch(e => t.deepEqual(e, 'No quorum'));

  timer.tick();

  const questions = await publicFacet.getOpenQuestions();
  t.deepEqual(questions.length, 2);
});
