/**
 * NOTE: This is host side code; can't use await.
 */
import type { AgoricResponse } from '@aglocal/boot/tools/axelar-supports.js';
import type { FungibleTokenPacketData } from '@agoric/cosmic-proto/ibc/applications/transfer/v2/packet.js';
import { AmountMath } from '@agoric/ertp';
import { makeTracer, mustMatch, type Remote } from '@agoric/internal';
import type {
  Marshaller,
  StorageNode,
} from '@agoric/internal/src/lib-chainStorage.js';
import { type AccountId, type CaipChainId } from '@agoric/orchestration';
import { type AxelarGmpIncomingMemo } from '@agoric/orchestration/src/axelar-types.js';
import { coerceAccountId } from '@agoric/orchestration/src/utils/address.js';
import { decodeAbiParameters } from '@agoric/orchestration/src/vendor/viem/viem-abi.js';
import type { MapStore } from '@agoric/store';
import type { TimerService } from '@agoric/time';
import type { VTransferIBCEvent } from '@agoric/vats';
import type { TargetRegistration } from '@agoric/vats/src/bridge-target.js';
import { VowShape, type Vow, type VowKit, type VowTools } from '@agoric/vow';
import type { ZCF } from '@agoric/zoe';
import type { Zone } from '@agoric/zone';
import { atob, decodeBase64 } from '@endo/base64';
import { X } from '@endo/errors';
import type { ERef } from '@endo/far';
import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { YieldProtocol } from './constants.js';
import type { NobleAccount } from './portfolio.flows.js';
import { type LocalAccount } from './portfolio.flows.js';
import {
  prepareGMPPosition,
  type GMPPosition,
  type GMPProtocol,
} from './pos-gmp.exo.js';
import { prepareUSDNPosition } from './pos-usdn.exo.js';
import type { AxelarChainsMap, StatusFor } from './type-guards.js';
import {
  makeFlowPath,
  makePortfolioPath,
  OfferArgsShapeFor,
  type makeProposalShapes,
  type OfferArgsFor,
} from './type-guards.js';

const trace = makeTracer('PortExo');
const { assign, values } = Object;
const { add, subtract } = AmountMath;

export const DECODE_CONTRACT_CALL_RESULT_ABI = [
  {
    type: 'tuple',
    components: [
      { name: 'isContractCallResult', type: 'bool' },
      {
        name: 'data',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'result', type: 'bytes' },
        ],
      },
    ],
  },
] as const;
harden(DECODE_CONTRACT_CALL_RESULT_ABI);

const OrchestrationAccountShape = M.remotable('OrchestrationAccount');
const ReaderI = M.interface('reader', {
  getGMPAddress: M.call().returns(M.any()),
  getLCA: M.call().returns(OrchestrationAccountShape),
  getPositions: M.call().returns(M.arrayOf(M.string())),
  getUSDNICA: M.call().returns(OrchestrationAccountShape),
});

const ManagerI = M.interface('manager', {
  initAave: M.call(M.string()).returns(),
  initCompound: M.call(M.string()).returns(),
  wait: M.call(M.bigint()).returns(VowShape),
});

interface PositionRd {
  getPositionId(): number;
  getYieldProtocol(): YieldProtocol;
}

interface PositionPub extends PositionRd {
  publishStatus(): void;
}

export interface Position extends PositionPub {
  recordTransferIn(amount: Amount<'nat'>): Amount<'nat'>;
  recordTransferOut(amount: Amount<'nat'>): Amount<'nat'>;
}

export type TransferStatus = {
  totalIn: Amount<'nat'>;
  totalOut: Amount<'nat'>;
  netTransfers: Amount<'nat'>;
};

export const recordTransferIn = (
  amount: Amount<'nat'>,
  state: TransferStatus,
  position: Pick<Position, 'publishStatus'>,
) => {
  const { netTransfers, totalIn } = state;
  assign(state, {
    netTransfers: add(netTransfers, amount),
    totalIn: add(totalIn, amount),
  });
  position.publishStatus();
  return state.netTransfers;
};

export const recordTransferOut = (
  amount: Amount<'nat'>,
  state: TransferStatus,
  position: Pick<Position, 'publishStatus'>,
) => {
  const { netTransfers, totalOut } = state;
  assign(state, {
    netTransfers: subtract(netTransfers, amount),
    totalOut: add(totalOut, amount),
  });
  position.publishStatus();
  return state.netTransfers;
};

export type AccountInfoFor = {
  agoric: { type: 'agoric'; lca: LocalAccount; reg: TargetRegistration };
  noble: { type: 'noble'; ica: NobleAccount };
};

export type AccountInfo = AccountInfoFor['agoric'] | AccountInfoFor['noble'];
// XXX expand scope to GMP

/** keyed by chain such as agoric, noble, base, arbitrum */
export type ChainAccountKey = 'agoric' | 'noble';

type PortfolioKitState = {
  portfolioId: number;
  accountsPending: MapStore<ChainAccountKey, VowKit<AccountInfo>>;
  accounts: MapStore<ChainAccountKey, AccountInfo>;
  positions: MapStore<number, Position>;
  nextFlowId: number;
};

const accountIdByChain = (accounts: PortfolioKitState['accounts']) => {
  const byChain = {};
  for (const [n, info] of accounts.entries()) {
    assert.equal(n, info.type);
    switch (info.type) {
      case 'agoric':
        const { lca } = info;
        byChain[n] = coerceAccountId(lca.getAddress());
        break;
      case 'noble':
        const { ica } = info;
        byChain[n] = coerceAccountId(ica.getAddress());
        break;
      default:
        assert.fail(X`no such type: ${info}`);
    }
  }
  return harden(byChain);
};

export type PublishStatusFn = <K extends keyof StatusFor>(
  path: string[],
  status: StatusFor[K],
) => void;

export const preparePortfolioKit = (
  zone: Zone,
  {
    axelarChainsMap,
    rebalance,
    timer,
    proposalShapes,
    vowTools,
    zcf,
    portfoliosNode,
    marshaller,
    usdcBrand,
  }: {
    axelarChainsMap: AxelarChainsMap;
    rebalance: (
      seat: ZCFSeat,
      offerArgs: OfferArgsFor['rebalance'],
      keeper: unknown, // XXX avoid circular reference
    ) => Vow<any>; // XXX HostForGuest???
    timer: Remote<TimerService>;
    proposalShapes: ReturnType<typeof makeProposalShapes>;
    vowTools: VowTools;
    zcf: ZCF;
    portfoliosNode: ERef<StorageNode>;
    marshaller: Marshaller;
    usdcBrand: Brand<'nat'>;
  },
) => {
  const makePathNode = (path: string[]) => {
    let node = portfoliosNode;
    for (const segment of path) {
      node = E(node).makeChildNode(segment);
    }
    return node;
  };
  const publishStatus: PublishStatusFn = (path, status): void => {
    const node = makePathNode(path);
    // Don't await, just writing to vstorage.
    void E.when(E(marshaller).toCapData(status), capData =>
      E(node).setValue(JSON.stringify(capData)),
    );
  };

  const usdcEmpty = AmountMath.makeEmpty(usdcBrand);
  const emptyTransferState = harden({
    totalIn: usdcEmpty,
    totalOut: usdcEmpty,
    netTransfers: usdcEmpty,
  });

  const makeUSDNPosition = prepareUSDNPosition(
    zone,
    emptyTransferState,
    publishStatus,
  );

  const makeGMPPosition = prepareGMPPosition(
    zone,
    vowTools,
    emptyTransferState,
    publishStatus,
  );

  return zone.exoClassKit(
    'Portfolio',
    undefined /* TODO {
      tap: M.interface('tap', {
        receiveUpcall: M.call(M.record()).returns(M.promise()),
      }),
      reader: ReaderI,
      manager: ManagerI,
      rebalanceHandler: OfferHandlerI,
      invitationMakers: M.interface('invitationMakers', {
        Rebalance: M.callWhen().returns(InvitationShape),
      })}*/,
    ({ portfolioId }: { portfolioId: number }): PortfolioKitState => {
      return {
        portfolioId,
        nextFlowId: 1,
        accounts: zone.detached().mapStore('accounts', {
          keyShape: M.string(),
          valueShape: M.or(
            M.remotable('Account'),
            // XXX for EVM/GMP account info
            M.record(),
          ),
        }),
        accountsPending: zone.detached().mapStore('accountsPending'),
        // NEEDSTEST: for forgetting to use detached()
        positions: zone.detached().mapStore('positions', {
          keyShape: M.number(),
          valueShape: M.remotable('Position'),
        }),
      };
    },
    {
      tap: {
        async receiveUpcall(event: VTransferIBCEvent) {
          trace('receiveUpcall', event);

          const tx: FungibleTokenPacketData = JSON.parse(
            atob(event.packet.data),
          );

          trace('receiveUpcall packet data', tx);
          if (!tx.memo) return;
          const memo: AxelarGmpIncomingMemo = JSON.parse(tx.memo); // XXX unsound! use typed pattern

          if (
            !values(axelarChainsMap)
              .map(chain => chain.axelarId)
              .includes(memo.source_chain)
          ) {
            console.warn('unknown source_chain', memo);
            return;
          }

          const payloadBytes = decodeBase64(memo.payload);
          const [{ isContractCallResult, data }] = decodeAbiParameters(
            DECODE_CONTRACT_CALL_RESULT_ABI,
            payloadBytes,
          ) as [AgoricResponse];

          trace(
            'receiveUpcall Decoded:',
            JSON.stringify({ isContractCallResult, data }),
          );

          if (isContractCallResult) {
            console.warn('TODO: Handle the result of the contract call', data);
          } else {
            const [message] = data;
            const { success, result } = message;
            if (!success) return;

            const [address] = decodeAbiParameters(
              [{ type: 'address' }],
              result,
            );

            const gmpPos = this.facets.manager.findPendingGMPPosition();
            if (!gmpPos) {
              trace('no pending GMP position', address);
              return;
            }
            gmpPos.resolveAddress(address);
            trace(`remoteAddress ${address}`);
          }

          trace('receiveUpcall completed');
        },
      },
      reader: {
        getStoragePath() {
          const { portfolioId } = this.state;
          const node = makePathNode(makePortfolioPath(portfolioId));
          return vowTools.asVow(() => E(node).getPath());
        },
        getPortfolioId() {
          return this.state.portfolioId;
        },
        getGMPAddress(protocol: YieldProtocol) {
          const { positions } = this.state;
          for (const pos of positions.values()) {
            if (protocol === pos.getYieldProtocol()) {
              // XXX is there a typesafe way?
              const gp = pos as unknown as GMPPosition;
              return gp.getAddress();
              // TODO: what if there are > 1?
            }
          }
          assert.fail(`no position for ${protocol}`);
        },
      },
      reporter: {
        publishStatus() {
          const { portfolioId, positions, accounts, nextFlowId } = this.state;
          publishStatus(makePortfolioPath(portfolioId), {
            positionCount: positions.getSize(),
            flowCount: nextFlowId - 1,
            accountIdByChain: accountIdByChain(accounts),
          });
        },
        allocateFlowId() {
          const { nextFlowId } = this.state;
          this.state.nextFlowId = nextFlowId + 1;
          this.facets.reporter.publishStatus();
          return nextFlowId;
        },
        publishFlowStatus(id: number, status: StatusFor['flow']) {
          const { portfolioId } = this.state;
          publishStatus(makeFlowPath(portfolioId, id), status);
        },
      },
      manager: {
        reserveAccount<C extends ChainAccountKey>(
          chainName: C,
        ): undefined | Vow<AccountInfoFor[C]> {
          const { accounts, accountsPending } = this.state;
          if (accounts.has(chainName)) {
            return vowTools.asVow(async () => {
              const infoAny = accounts.get(chainName);
              assert.equal(infoAny.type, chainName);
              const info = infoAny as AccountInfoFor[C];
              return info;
            });
          }
          if (accountsPending.has(chainName)) {
            return accountsPending.get(chainName).vow as Vow<AccountInfoFor[C]>;
          }
          const pending: VowKit<AccountInfoFor[C]> = vowTools.makeVowKit();
          accountsPending.init(chainName, pending);
          return undefined;
        },
        resolveAccount(info: AccountInfo) {
          const { accounts, accountsPending } = this.state;
          accountsPending.delete(info.type);
          accounts.init(info.type, info);
          this.facets.reporter.publishStatus();
        },
        // TODO: support >1 pending position?
        findPendingGMPPosition() {
          const { positions } = this.state;
          for (const pos of positions.values()) {
            if (['Aave', 'Compound'].includes(pos.getYieldProtocol())) {
              // XXX is there a typesafe way?
              return pos as unknown as GMPPosition;
            }
          }
          return undefined; // like array.find()
        },
        provideGMPPositionOn(protocol: GMPProtocol, chain: CaipChainId) {
          const { positions } = this.state;
          for (const pos of positions.values()) {
            if (['Aave', 'Compound'].includes(pos.getYieldProtocol())) {
              const gpos = pos as unknown as GMPPosition;
              if (gpos.getChainId() === chain)
                return { position: gpos, isNew: false };
            }
          }
          const { portfolioId } = this.state;
          const positionId = positions.getSize() + 1;
          const position = makeGMPPosition(
            portfolioId,
            positionId,
            protocol,
            chain,
          );
          positions.init(positionId, position);
          position.publishStatus();
          this.facets.reporter.publishStatus();
          return { position, isNew: true };
        },
        provideAavePositionOn(chain: CaipChainId) {
          const { manager } = this.facets;
          return manager.provideGMPPositionOn('Aave', chain);
        },
        provideCompoundPositionOn(chain: CaipChainId) {
          const { manager } = this.facets;
          return manager.provideGMPPositionOn('Compound', chain);
        },
        provideUSDNPosition(accountId: AccountId) {
          const { positions } = this.state;
          for (const pos of positions.values()) {
            if (pos.getYieldProtocol() === 'USDN') {
              return pos;
            }
          }
          const { portfolioId } = this.state;
          const positionId = positions.getSize() + 1;
          const position = makeUSDNPosition(portfolioId, positionId, accountId);
          positions.init(positionId, position);
          position.publishStatus();
          this.facets.reporter.publishStatus();
          return position;
        },
        /** KLUDGE around lack of synchronization signals for now. TODO: rethink design. */
        waitKLUDGE(val: bigint) {
          return vowTools.watch(E(timer).delay(val));
        },
      },
      rebalanceHandler: {
        async handle(seat: ZCFSeat, offerArgs: unknown) {
          const { reader, manager } = this.facets;
          const keeper = { ...reader, ...manager };
          mustMatch(offerArgs, OfferArgsShapeFor.rebalance);
          return rebalance(seat, offerArgs, keeper);
        },
      },
      invitationMakers: {
        Rebalance() {
          const { rebalanceHandler } = this.facets;
          return zcf.makeInvitation(
            rebalanceHandler,
            'rebalance',
            undefined,
            proposalShapes.rebalance,
          );
        },
      },
    },
    {
      finish({ facets }) {
        facets.reporter.publishStatus();
      },
    },
  );
};
harden(preparePortfolioKit);

export type PortfolioKit = ReturnType<ReturnType<typeof preparePortfolioKit>>;

export type USDNPosition = ReturnType<
  PortfolioKit['manager']['provideUSDNPosition']
>;
