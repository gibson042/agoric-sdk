/**
 * OrchestrationFlow functions for {@link portfolio.contract.ts}
 *
 * @see {openPortfolio}
 * @see {rebalance}
 */
import type { GuestInterface } from '@agoric/async-flow';
import { decodeAddressHook } from '@agoric/cosmic-proto/address-hooks.js';
import { type Amount, type NatAmount } from '@agoric/ertp';
import { makeTracer } from '@agoric/internal';
import type {
  AccountId,
  Denom,
  DenomAmount,
  OrchestrationAccount,
  OrchestrationFlow,
  Orchestrator,
} from '@agoric/orchestration';
import { coerceAccountId } from '@agoric/orchestration/src/utils/address.js';
import type { ZoeTools } from '@agoric/orchestration/src/utils/zoe-tools.js';
import type { PublicSubscribers } from '@agoric/smart-wallet/src/types.ts';
import type { VTransferIBCEvent } from '@agoric/vats';
import type { ZCFSeat } from '@agoric/zoe';
import type { ResolvedPublicTopic } from '@agoric/zoe/src/contractSupport/topics.js';
import { assert, Fail, q } from '@endo/errors';
import {
  AxelarChain,
  RebalanceStrategy,
  SupportedChain,
  type YieldProtocol,
} from './constants.js';
import type { AxelarId, EVMContractAddresses } from './portfolio.contract.ts';
import type { AccountInfoFor, PortfolioKit } from './portfolio.exo.ts';
import {
  AaveProtocol,
  BeefyProtocol,
  CCTP,
  CCTPfromEVM,
  CompoundProtocol,
  provideEVMAccount,
  type EVMContext,
} from './pos-gmp.flows.ts';
import {
  agoricToNoble,
  nobleToAgoric,
  protocolUSDN,
} from './pos-usdn.flows.ts';
import type { Position } from './pos.exo.ts';
import {
  getChainNameOfPlaceRef,
  getKeywordOfPlaceRef,
  type AssetPlaceRef,
  type MovementDesc,
  type OfferArgsFor,
} from './type-guards-steps.ts';
import {
  PoolPlaces,
  type EVMContractAddressesMap,
  type PoolKey,
  type ProposalType,
} from './type-guards.ts';
// XXX: import { VaultType } from '@agoric/cosmic-proto/dist/codegen/noble/dollar/vaults/v1/vaults';

const trace = makeTracer('PortF');
const { keys } = Object;

export type LocalAccount = OrchestrationAccount<{ chainId: 'agoric-any' }>;
export type NobleAccount = OrchestrationAccount<{ chainId: 'noble-any' }>;

export type PortfolioInstanceContext = {
  axelarIds: AxelarId;
  contracts: EVMContractAddressesMap;
  usdc: { brand: Brand<'nat'>; denom: Denom };
  gmpFeeInfo: { brand: Brand<'nat'>; denom: Denom };
  inertSubscriber: GuestInterface<ResolvedPublicTopic<never>['subscriber']>;
  zoeTools: GuestInterface<ZoeTools>;
};

type PortfolioBootstrapContext = PortfolioInstanceContext & {
  makePortfolioKit: () => GuestInterface<PortfolioKit>;
};

type AssetPlace =
  | { pos: Position }
  | { account: OrchestrationAccount<any> }
  | { proxy: AccountInfoFor[AxelarChain] }
  | { seat: ZCFSeat; keyword: string };

const placeLabel = (place: AssetPlace) => {
  if ('pos' in place) return place.pos.getPoolKey();
  if ('account' in place) return coerceAccountId(place.account.getAddress());
  if ('proxy' in place)
    return `${place.proxy.chainId}:${place.proxy.remoteAddress}`;
  return `seat:${place.keyword}`;
};

type AssetMovement = {
  how: string;
  amount: Amount<'nat'>;
  src: AssetPlace;
  dest: AssetPlace;
  apply: () => Promise<void>;
  recover: () => Promise<void>;
};
const moveStatus = ({ how, src, dest, amount }: AssetMovement) => ({
  how,
  src: placeLabel(src),
  dest: placeLabel(dest),
  amount,
});
const errmsg = (err: any) => ('message' in err ? err.message : `${err}`);

export type TransportDetail<
  How extends string,
  S extends SupportedChain,
  D extends SupportedChain,
  CTX = unknown,
> = {
  how: How;
  connections: { src: S; dest: D }[];
  apply: (
    ctx: CTX,
    amount: NatAmount,
    src: AccountInfoFor[S],
    dest: AccountInfoFor[D],
  ) => Promise<void>;
  recover: (
    ctx: CTX,
    amount: NatAmount,
    src: AccountInfoFor[S],
    dest: AccountInfoFor[D],
  ) => Promise<void>;
};

export type ProtocolDetail<
  P extends YieldProtocol,
  C extends SupportedChain,
  CTX = unknown,
> = {
  protocol: P;
  chains: C[];
  supply: (
    ctx: CTX,
    amount: NatAmount,
    src: AccountInfoFor[C],
  ) => Promise<void>;
  withdraw: (
    ctx: CTX,
    amount: NatAmount,
    dest: AccountInfoFor[C],
    claim?: boolean,
  ) => Promise<void>;
};

/**
 * **Failure Handling**: Attempts to unwind failed operations, but recovery
 * itself can fail. In that case, publishes final asset location to vstorage
 * and gives up. Clients must manually rebalance to recover.
 */
export const trackFlow = async (
  reporter: GuestInterface<PortfolioKit['reporter']>,
  todo: (() => Promise<AssetMovement>)[],
) => {
  const flowId = reporter.allocateFlowId();
  let step = 1;
  const moves: AssetMovement[] = [];
  try {
    for (const makeMove of todo) {
      const move = await makeMove();
      moves.push(move);
      trace(step, 'step starting', moveStatus(move));
      reporter.publishFlowStatus(flowId, { step, ...moveStatus(move) });
      await move.apply();
      trace(step, 'step done');
      const { amount, src, dest } = move;
      if ('pos' in src) {
        src.pos.recordTransferOut(amount);
      }
      if ('pos' in dest) {
        dest.pos.recordTransferIn(amount);
      }
      step += 1;
    }
    // TODO(#NNNN): delete the flow storage node
    // reporter.publishFlowStatus(flowId, { complete: true });
  } catch (err) {
    console.error('⚠️ step', step, ' failed', err);
    const failure = moves[step - 1];
    const errStep = step;
    while (step > 1) {
      step -= 1;
      const move = moves[step - 1];
      const how = `unwind: ${move.how}`;
      reporter.publishFlowStatus(flowId, { step, ...moveStatus(move), how });
      try {
        await move.recover();
      } catch (err) {
        console.error('⚠️ unwind step', step, ' failed', err);
        // if a recover fails, we just give up and report `where` the assets are
        const { dest: where, ...ms } = moveStatus(move);
        const final = { step, ...ms, how, where, error: errmsg(err) };
        reporter.publishFlowStatus(flowId, final);
        throw err;
      }
    }
    reporter.publishFlowStatus(flowId, {
      step: errStep,
      ...moveStatus(failure),
      error: errmsg(err),
    });
    throw err;
  }
};

export const provideCosmosAccount = async <C extends 'agoric' | 'noble'>(
  orch: Orchestrator,
  chainName: C,
  kit: GuestInterface<PortfolioKit>, // Guest<T>?
): Promise<AccountInfoFor[C]> => {
  await null;
  let promiseMaybe = kit.manager.reserveAccount(chainName);
  if (promiseMaybe) {
    return promiseMaybe as unknown as Promise<AccountInfoFor[C]>;
  }

  // We have the map entry reserved
  switch (chainName) {
    case 'noble': {
      const nobleChain = await orch.getChain('noble');
      const ica: NobleAccount = await nobleChain.makeAccount();
      const info: AccountInfoFor['noble'] = {
        namespace: 'cosmos',
        chainName: 'noble' as const,
        ica,
      };
      kit.manager.resolveAccount(info);
      return info as AccountInfoFor[C];
    }
    case 'agoric': {
      const agoricChain = await orch.getChain('agoric');
      const lca = await agoricChain.makeAccount();
      const reg = await lca.monitorTransfers(kit.tap);
      trace('Monitoring transfers for', lca.getAddress().value);
      const info: AccountInfoFor['agoric'] = {
        namespace: 'cosmos',
        chainName,
        lca,
        reg,
      };
      kit.manager.resolveAccount(info);
      return info as AccountInfoFor[C];
    }
    default:
      throw Error('unreachable');
  }
};

const getAssetPlaceRefKind = (
  ref: AssetPlaceRef,
): 'pos' | 'accountId' | 'seat' => {
  if (keys(PoolPlaces).includes(ref)) return 'pos';
  if (getKeywordOfPlaceRef(ref)) return 'seat';
  if (getChainNameOfPlaceRef(ref)) return 'accountId';
  throw Fail`bad ref: ${ref}`;
};

type Way =
  | { how: 'localTransfer' }
  | { how: 'withdrawToSeat' }
  | { how: 'IBC'; src: 'agoric'; dest: 'noble' }
  | { how: 'IBC'; src: 'noble'; dest: 'agoric' }
  | { how: 'CCTP'; dest: AxelarChain }
  | { how: 'CCTP'; src: AxelarChain }
  | {
      how: YieldProtocol;
      /** pool we're supplying */
      poolKey: PoolKey;
      /** chain with account where assets will come from */
      src: SupportedChain;
    }
  | {
      how: YieldProtocol;
      /** pool we're withdrawing from */
      poolKey: PoolKey;
      /** chain with account where assets will go */
      dest: SupportedChain;
      claim?: boolean;
    };

export const wayFromSrcToDesc = (moveDesc: MovementDesc): Way => {
  const { src } = moveDesc;
  const { dest } = moveDesc;

  const srcKind = getAssetPlaceRefKind(src);
  switch (srcKind) {
    case 'pos': {
      const destName = getChainNameOfPlaceRef(dest);
      if (!destName)
        throw Fail`src pos must have account as dest ${q(moveDesc)}`;
      const poolKey = src as PoolKey;
      const { protocol } = PoolPlaces[poolKey];
      const feeRequired = ['Compound', 'Aave', 'Beefy'];
      moveDesc.fee ||
        !feeRequired.includes(protocol) ||
        Fail`missing fee ${q(moveDesc)}`;
      // XXX check that destName is in protocol.chains
      return {
        how: protocol,
        poolKey,
        dest: destName,
        claim: moveDesc.claim,
      };
    }

    case 'seat':
      getAssetPlaceRefKind(dest) === 'accountId' || // XXX check for agoric
        Fail`src seat must have account as dest ${q(moveDesc)}`;
      return { how: 'localTransfer' };

    case 'accountId': {
      const srcName = getChainNameOfPlaceRef(src);
      assert(srcName);
      const destKind = getAssetPlaceRefKind(dest);
      switch (destKind) {
        case 'seat':
          return { how: 'withdrawToSeat' }; // XXX check that src is agoric
        case 'accountId':
          const destName = getChainNameOfPlaceRef(dest);
          assert(destName);
          if (keys(AxelarChain).includes(destName)) {
            srcName === 'noble' || Fail`src for ${q(destName)} must be noble`;
            return { how: 'CCTP', dest: destName as AxelarChain };
          }
          if (keys(AxelarChain).includes(srcName)) {
            destName === 'noble' || Fail`dest for ${q(srcName)} must be noble`;
            return { how: 'CCTP', src: srcName as AxelarChain };
          }
          if (srcName === 'agoric' && destName === 'noble') {
            return { how: 'IBC', src: srcName, dest: destName };
          } else if (srcName === 'noble' && destName === 'agoric') {
            return { how: 'IBC', src: srcName, dest: destName };
          } else {
            throw Fail`no route between chains: ${q(moveDesc)}`;
          }
        case 'pos': {
          const poolKey = dest as PoolKey;
          const { protocol } = PoolPlaces[poolKey];
          return { how: protocol, poolKey, src: srcName };
        }
        default:
          throw Fail`unreachable:${destKind} ${dest}`;
      }
    }
    default:
      throw Fail`unreachable: ${srcKind} ${src}`;
  }
};

const stepFlow = async (
  orch: Orchestrator,
  ctx: PortfolioInstanceContext,
  seat: ZCFSeat,
  moves: MovementDesc[],
  kit: GuestInterface<PortfolioKit>,
) => {
  const todo: (() => Promise<AssetMovement>)[] = [];

  const provideEVMInfo = async (chain: AxelarChain, move: MovementDesc) => {
    const axelar = await orch.getChain('axelar');
    const { denom } = ctx.gmpFeeInfo;
    const fee = { denom, value: move.fee ? move.fee.value : 0n };
    const { axelarIds } = ctx;
    const gmp = { chain: axelar, fee: move.fee?.value || 0n, axelarIds }; // XXX throw if fee missing?
    const { lca } = await provideCosmosAccount(orch, 'agoric', kit);
    const gInfo = await provideEVMAccount(chain, gmp, lca, ctx, kit);
    const accountId: AccountId = `${gInfo.chainId}:${gInfo.remoteAddress}`;

    const evmCtx: EVMContext = harden({
      addresses: ctx.contracts[chain],
      lca,
      gmpFee: fee,
      gmpChain: axelar,
      axelarIds,
    });
    return { evmCtx, gInfo, accountId };
  };

  const makeEVMProtocolStep = async <P extends 'Compound' | 'Aave' | 'Beefy'>(
    way: Way & { how: P },
    move: MovementDesc,
  ) => {
    // XXX move this check up to wayFromSrcToDesc
    const chainName = 'src' in way ? way.src : way.dest;
    assert(keys(AxelarChain).includes(chainName));
    const evmChain = chainName as AxelarChain;

    const protocolImplMap = {
      Compound: CompoundProtocol,
      Aave: AaveProtocol,
      Beefy: BeefyProtocol,
    };
    const pImpl = protocolImplMap[way.how];

    const { evmCtx, gInfo, accountId } = await provideEVMInfo(evmChain, move);

    const pos = kit.manager.providePosition(way.poolKey, way.how, accountId);

    const { amount } = move;
    const ctx = { ...evmCtx, poolKey: way.poolKey };
    if ('src' in way) {
      return {
        how: way.how,
        amount,
        src: { proxy: gInfo },
        dest: { pos },
        apply: () => pImpl.supply(ctx, amount, gInfo),
        recover: () => assert.fail('last step. cannot recover'),
      };
    } else {
      return {
        how: way.how,
        amount,
        src: { pos },
        dest: { proxy: gInfo },
        apply: () => pImpl.withdraw(ctx, amount, gInfo, way.claim),
        recover: () => pImpl.supply(ctx, amount, gInfo),
      };
    }
  };

  const provideAgoricNoble = () =>
    Promise.all([
      provideCosmosAccount(orch, 'agoric', kit),
      provideCosmosAccount(orch, 'noble', kit),
    ]);

  for (const move of moves) {
    trace('wayFromSrcToDesc?', move);
    const way = wayFromSrcToDesc(move);
    const { amount } = move;
    switch (way.how) {
      case 'localTransfer': {
        const { give } = seat.getProposal() as ProposalType['rebalance'];
        const amounts = harden({
          Deposit: amount,
          ...('GmpFee' in give ? { GmpFee: give.GmpFee } : {}),
        });
        todo.push(async () => {
          const { lca } = await provideCosmosAccount(orch, 'agoric', kit);
          return {
            how: 'localTransfer',
            src: { seat, keyword: 'Deposit' },
            dest: { account: lca },
            amount, // XXX use amounts.Deposit
            apply: async () => {
              await ctx.zoeTools.localTransfer(seat, lca, amounts);
            },
            recover: async () => {
              await ctx.zoeTools.withdrawToSeat(lca, seat, amounts);
            },
          };
        });
        break;
      }
      case 'withdrawToSeat': {
        const amounts = { Cash: amount };
        todo.push(async () => {
          const { lca } = await provideCosmosAccount(orch, 'agoric', kit);
          return {
            how: 'withdrawToSeat',
            src: { account: lca },
            dest: { seat, keyword: 'Cash' },
            amount,
            apply: async () => {
              await ctx.zoeTools.withdrawToSeat(lca, seat, amounts);
            },
            recover: async () => {
              await ctx.zoeTools.localTransfer(seat, lca, amounts);
            },
          };
        });
        break;
      }

      case 'IBC': {
        if (way.src === 'agoric' && way.dest === 'noble') {
          const { how, apply, recover } = agoricToNoble;
          todo.push(async () => {
            const [aInfo, nInfo] = await provideAgoricNoble();
            const ctxI = { usdc: ctx.usdc };
            return {
              how,
              amount,
              src: { account: aInfo.lca },
              dest: { account: nInfo.ica },
              apply: () => apply(ctxI, amount, aInfo, nInfo),
              recover: () => recover(ctxI, amount, aInfo, nInfo),
            };
          });
        } else if (way.src === 'noble' && way.dest === 'agoric') {
          const { how, apply, recover } = nobleToAgoric;
          todo.push(async () => {
            const [aInfo, nInfo] = await provideAgoricNoble();
            const ctxI = { usdc: ctx.usdc };
            return {
              how,
              amount,
              src: { account: nInfo.ica },
              dest: { account: aInfo.lca },
              apply: () => apply(ctxI, amount, nInfo, aInfo),
              recover: () => recover(ctxI, amount, nInfo, aInfo),
            };
          });
        }
        break;
      }

      case 'CCTP': {
        todo.push(async () => {
          const { how, apply, recover } = CCTP;
          const [{ lca }, nInfo, axelar] = await Promise.all([
            provideCosmosAccount(orch, 'agoric', kit),
            provideCosmosAccount(orch, 'noble', kit),
            orch.getChain('axelar'),
          ]);

          const evmChain = 'dest' in way ? way.dest : way.src;
          const { evmCtx, gInfo } = await provideEVMInfo(evmChain, move);

          if ('dest' in way) {
            return {
              how: CCTP.how,
              amount,
              src: { account: nInfo.ica },
              dest: { proxy: gInfo },
              apply: () => CCTP.apply(null, amount, nInfo, gInfo),
              recover: () => CCTP.recover(null, amount, nInfo, gInfo),
            };
          } else {
            return {
              how: CCTPfromEVM.how,
              amount,
              src: { proxy: gInfo },
              dest: { account: nInfo.ica },
              apply: () => CCTPfromEVM.apply(evmCtx, amount, gInfo, nInfo),
              recover: () => CCTPfromEVM.recover(evmCtx, amount, gInfo, nInfo),
            };
          }
        });
        break;
      }

      case 'USDN': {
        todo.push(async () => {
          const nInfo = await provideCosmosAccount(orch, 'noble', kit);
          const acctId = coerceAccountId(nInfo.ica.getAddress());
          const pos = kit.manager.providePosition('USDN', 'USDN', acctId);
          const vault = way.poolKey === 'USDNVault' ? 1 : undefined;
          const ctxU = { usdnOut: move?.detail?.usdnOut, vault };

          if ('src' in way) {
            const { supply } = protocolUSDN;
            return {
              how: way.how,
              amount,
              src: { account: nInfo.ica },
              dest: { pos },
              apply: () => supply(ctxU, amount, nInfo),
              recover: () => Fail`no recovery from supply (final step)`,
            };
          } else {
            const { withdraw, supply } = protocolUSDN;
            return {
              how: way.how,
              amount,
              src: { pos },
              dest: { account: nInfo.ica },
              apply: () => withdraw(ctxU, amount, nInfo, way.claim),
              recover: () => supply(ctxU, amount, nInfo),
            };
          }
        });
        break;
      }

      case 'Compound':
        todo.push(() =>
          makeEVMProtocolStep(way as Way & { how: 'Compound' }, move),
        );
        break;

      case 'Aave':
        todo.push(() =>
          makeEVMProtocolStep(way as Way & { how: 'Aave' }, move),
        );
        break;

      case 'Beefy':
        todo.push(() =>
          makeEVMProtocolStep(way as Way & { how: 'Beefy' }, move),
        );
        break;

      default:
        throw Fail`unreachable: ${way}`;
    }
  }

  await trackFlow(kit.reporter, todo);
  trace('stepFlow done');
};

/**
 * Rebalance portfolio positions between yield protocols.
 * More generally: move assets as instructed by client.
 *
 * **Non-Atomic Operations**: Cross-chain flows are not atomic. If operations
 * fail partway through, assets may be left in intermediate accounts.
 * Recovery is attempted but can also fail, leaving assets "stranded".
 *
 * **Client Recovery**: If rebalancing fails, check flow status in vstorage
 * and call rebalance() again to move assets to desired destinations.
 *
 * **Input Validation**: ASSUME caller validates args
 *
 * @param seat - proposal guarded as per {@link makeProposalShapes}
 * @param offerArgs - guarded as per {@link makeOfferArgsShapes}
 */
export const rebalance = async (
  orch: Orchestrator,
  ctx: PortfolioInstanceContext,
  seat: ZCFSeat,
  offerArgs: OfferArgsFor['rebalance'],
  kit: GuestInterface<PortfolioKit>,
) => {
  const proposal = seat.getProposal() as ProposalType['rebalance'];
  trace('rebalance proposal', proposal.give, proposal.want, offerArgs);

  try {
    if (offerArgs.targetAllocation) {
      kit.manager.setTargetAllocation(offerArgs.targetAllocation);
    }

    if (offerArgs.flow) {
      await stepFlow(orch, ctx, seat, offerArgs.flow, kit);
    }

    if (!seat.hasExited()) {
      seat.exit();
    }
  } catch (err) {
    if (!seat.hasExited()) {
      seat.fail(err);
    }
    throw err;
  }
};

export const rebalanceFromTransfer = (async (
  orch: Orchestrator,
  ctx: PortfolioInstanceContext,
  packet: VTransferIBCEvent['packet'],
  kit: PortfolioKit,
): Promise<{
  parsed: Awaited<ReturnType<LocalAccount['parseInboundTransfer']>> | null;
  handled: boolean;
}> => {
  await null;
  const { reader } = kit;

  const lca = reader.getLocalAccount();
  const parsed = await lca.parseInboundTransfer(packet);
  if (!parsed) {
    return harden({ parsed: null, handled: false });
  }
  trace('rebalanceFromTransfer parsed', parsed);

  const {
    amount,
    extra: { receiver },
  } = parsed;
  const { baseAddress, query } = decodeAddressHook(receiver);
  const { rebalance: strategy } = query;
  if (strategy === undefined) {
    return harden({ parsed, handled: false });
  }

  switch (strategy) {
    // Preset strategy is currently hardcoded to PreserveExistingProportions
    // XXX make it more dynamic, such as taking into account any prior
    // explicit earmarking of inbound transfers.
    case RebalanceStrategy.Preset:
    case RebalanceStrategy.PreserveExistingProportions: {
      // XXX implement PreserveExistingProportions
      trace(
        'rebalanceFromTransfer PreserveExistingProportions',
        amount,
        query,
        baseAddress,
      );
      throw harden({
        msg: 'rebalanceFromTransfer unimplemented PreserveExistingProportions strategy',
        amount,
        query,
        baseAddress,
      });
    }
    default: {
      Fail`unknown rebalance strategy ${strategy} for ${amount} in ${baseAddress}`;
    }
  }

  // Don't continue with the transfer, since we handled it.
  return harden({ parsed, handled: true });
}) satisfies OrchestrationFlow;

/**
 * Offer handler to make a portfolio and, optionally, open yield positions.
 *
 * **Input Validation**: ASSUME caller validates args
 *
 * @param seat - proposal guarded as per {@link makeProposalShapes}
 * @param offerArgs - guarded as per {@link makeOfferArgsShapes}
 * @returns {*} following continuing invitation pattern,
 * with a topic for the portfolio.
 */
export const openPortfolio = (async (
  orch: Orchestrator,
  ctx: PortfolioBootstrapContext,
  seat: ZCFSeat,
  offerArgs: OfferArgsFor['openPortfolio'],
) => {
  await null; // see https://github.com/Agoric/agoric-sdk/wiki/No-Nested-Await
  try {
    const { makePortfolioKit, ...ctxI } = ctx;
    const { inertSubscriber } = ctxI;
    const kit = makePortfolioKit();
    await provideCosmosAccount(orch, 'agoric', kit);

    // Set target allocation if provided
    if (offerArgs.targetAllocation) {
      kit.manager.setTargetAllocation(offerArgs.targetAllocation);
    }

    if (!seat.hasExited()) {
      try {
        await rebalance(orch, ctxI, seat, offerArgs, kit);
      } catch (err) {
        console.error('⚠️ rebalance failed', err);
        if (!seat.hasExited()) seat.fail(err);
      }
    }

    if (!seat.hasExited()) seat.exit();

    const publicSubscribers: GuestInterface<PublicSubscribers> = {
      portfolio: {
        description: 'Portfolio',
        storagePath: await kit.reader.getStoragePath(),
        subscriber: inertSubscriber as any,
      },
    };
    return harden({
      invitationMakers: kit.invitationMakers,
      publicSubscribers,
    });
    /* c8 ignore start */
  } catch (err) {
    // XXX async flow DX: stack traces don't cross vow boundaries?
    console.error('🚨 openPortfolio flow failed', err);
    throw err;
  }
  /* c8 ignore end */
}) satisfies OrchestrationFlow;
harden(openPortfolio);
