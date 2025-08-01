/**
 * @import {AxelarChain} from '@aglocal/portfolio-contract/src/constants.js';
 * @import {EVMContractAddresses} from '@aglocal/portfolio-contract/src/portfolio.contract.ts';
 * @import {BaseChainInfo} from '@agoric/orchestration'
 * @import {EVMContractAddressesMap} from '@aglocal/portfolio-contract/src/type-guards.ts';
 */

/**
 * @typedef {object} AxelarChainIdEntry
 * @property {string} testnet - The Axelar chain ID used in testnet.
 * @property {string} mainnet - The Axelar chain ID used in mainnet.
 *
 */

/**
 * A mapping between internal AxelarChain enum keys and their corresponding
 * Axelar chain identifiers for both testnet and mainnet environments.
 *
 * This is used by YMax to dynamically switch between environments when interacting
 * with Axelar-supported chains.
 *
 * @type {Record<keyof typeof AxelarChain, AxelarChainIdEntry>}
 *
 * @see {@link https://docs.axelar.dev/resources/contract-addresses/testnet/#evm-contract-addresses}
 * @see {@link https://github.com/axelarnetwork/axelarjs-sdk/blob/f84c8a21ad9685091002e24cac7001ed1cdac774/src/chains/supported-chains-list.ts | supported-chains-list.ts}
 */
const AxelarChainIdMap = harden({
  Avalanche: {
    testnet: 'Avalanche',
    mainnet: 'Avalanche',
  },
  Arbitrum: {
    testnet: 'arbitrum-sepolia',
    mainnet: 'arbitrum',
  },
  Optimism: {
    testnet: 'optimism-sepolia',
    mainnet: 'optimism',
  },
  Polygon: {
    testnet: 'polygon-sepolia',
    mainnet: 'Polygon',
  },
});

/**
 * @typedef {`0x${string}`} HexAddress
 * @typedef {Record<string, HexAddress>} EvmAddressesMap
 * @typedef {{ mainnet: EvmAddressesMap, testnet: EvmAddressesMap }} AddressesMap
 */

/**
 * @typedef {object} AxelarChainConfig
 * @property {string} axelarId
 * @property {BaseChainInfo<"eip155">} chainInfo
 * @property {EVMContractAddresses} contracts
 */

/**
 * @typedef {Record<AxelarChain, AxelarChainConfig>} AxelarChainConfigMap
 */

/** @type {AddressesMap} */
const aaveAddresses = {
  mainnet: {
    Avalanche: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    Arbitrum: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    Optimism: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    // TODO: Temporary placeholder — AAVE support on Polygon is not intended.
    // Find a cleaner strategy to handle unsupported chains.
    Polygon: '0x',
  },
  testnet: {
    Avalanche: '0x8B9b2AF4afB389b4a70A474dfD4AdCD4a302bb40',
    Arbitrum: '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff',
    Optimism: '0xb50201558B00496A145fE76f7424749556E326D8',
    // TODO: Temporary placeholder — AAVE support on Polygon is not intended.
    // Find a cleaner strategy to handle unsupported chains.
    Polygon: '0x',
  },
};

/** @type {AddressesMap} */
const usdcAddresses = {
  mainnet: {
    Avalanche: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // https://developers.circle.com/stablecoins/usdc-contract-addresses
    Arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // https://developers.circle.com/stablecoins/usdc-contract-addresses
    Optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // https://developers.circle.com/stablecoins/usdc-contract-addresses
    Polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // https://developers.circle.com/stablecoins/usdc-contract-addresses
  },
  testnet: {
    Avalanche: '0x5425890298aed601595a70AB815c96711a31Bc65', // https://testnet.snowtrace.io/token/0x5425890298aed601595a70AB815c96711a31Bc65
    Arbitrum: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // https://sepolia.arbiscan.io/token/0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
    Optimism: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // https://sepolia-optimism.etherscan.io/token/0x5fd84259d66Cd46123540766Be93DFE6D43130D7
    Polygon: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582', // https://amoy.polygonscan.com/token/0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582
  },
};

/** @type {AddressesMap} */
const aaveUsdcAddresses = {
  mainnet: {
    Avalanche: '0x',
    Arbitrum: '0x',
    Optimism: '0x',
    // TODO: Temporary placeholder — AAVE support on Polygon is not intended.
    // Find a cleaner strategy to handle unsupported chains.
    Polygon: '0x',
  },
  testnet: {
    Avalanche: '0xb1c85310a1b809C70fA6806d27Da425C1261F801', // Fuji
    Arbitrum: '0x', // Arbitrum Sepolia
    Optimism: '0x', // OP Sepolia
    // TODO: Temporary placeholder — AAVE support on Polygon is not intended.
    // Find a cleaner strategy to handle unsupported chains.
    Polygon: '0x',
  },
};

/** @type {AddressesMap} */
const aaveRewardsControllerAddresses = {
  mainnet: {
    Avalanche: '0x929EC64c34a17401F460460D4B9390518E5B473e', // https://aave.com/docs/resources/addresses
    Arbitrum: '0x929EC64c34a17401F460460D4B9390518E5B473e', // https://aave.com/docs/resources/addresses
    Optimism: '0x929EC64c34a17401F460460D4B9390518E5B473e', // https://aave.com/docs/resources/addresses
    // TODO: Temporary placeholder — AAVE support on Polygon is not intended.
    // Find a cleaner strategy to handle unsupported chains.
    Polygon: '0x',
  },
  testnet: {
    Avalanche: '0x03aFC1Dfb53eae8eB7BE0E8CB6524aa79C3F8578', // Fuji https://testnet.snowtrace.io/address/0x03aFC1Dfb53eae8eB7BE0E8CB6524aa79C3F8578
    Arbitrum: '0x', // Arbitrum Sepolia
    Optimism: '0x', // OP Sepolia
    // TODO: Temporary placeholder — AAVE support on Polygon is not intended.
    // Find a cleaner strategy to handle unsupported chains.
    Polygon: '0x',
  },
};

/** @type {AddressesMap} */
const compoundAddresses = {
  mainnet: {
    Polygon: '0xF25212E676D1F7F89Cd72fFEe66158f541246445', // Polygon Mainnet - USDC Base
    Arbitrum: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf', // Arbitrum - USDC Base (Native)
    Optimism: '0x2e44e174f7D53F0212823acC11C01A11d58c5bCB', // Optimism - USDC Base
  },
  testnet: {
    Polygon: '0xF09F0369aB0a875254fB565E52226c88f10Bc839', // Polygon Mumbai Testnet - USDC Base
    Arbitrum: '0x',
    Optimism: '0x',
  },
};

/** @type {AddressesMap} */
const compoundRewardsControllerAddresses = {
  mainnet: {
    Polygon: '0x45939657d1CA34A8FA39A924B71D28Fe8431e581', // Polygon Mainnet - USDC Base
    Arbitrum: '0x88730d254A2f7e6AC8388c3198aFd694bA9f7fae', // Arbitrum - USDC Base (Native)
    Optimism: '0x443EA0340cb75a160F31A440722dec7b5bc3C2E9', // Optimism - USDC Base
  },
  testnet: {
    Polygon: '0x0785f2AC0dCBEDEE4b8D62c25A34098E9A0dF4bB', // Polygon Mumbai Testnet - USDC Base
    Arbitrum: '0x',
    Optimism: '0x',
  },
};

/** @type {AddressesMap} */
const beefyre7Addresses = {
  mainnet: {
    Avalanche: '0xdA640bE4588C469C9DB45D082B36913490924c08', // Beefy re7 vault on Avalanche
  },
  // No testnet beefy vaults available as yet
  testnet: {},
};

// TODO: deploy the factory in testnet and fill these addresses
/** @type {AddressesMap} */
const factoryAddresses = {
  mainnet: {
    Avalanche: '0x724fB9Fd9876d12Da33223C84E7Abf46fFc159C1', // https://snowtrace.io/address/0x724fB9Fd9876d12Da33223C84E7Abf46fFc159C1
    Arbitrum: '0x6ca3e8BFe9196A463136cB2442672e46BBe00BCc', // https://arbiscan.io/address/0x6ca3e8BFe9196A463136cB2442672e46BBe00BCc
    Optimism: '0x724fB9Fd9876d12Da33223C84E7Abf46fFc159C1', // https://optimistic.etherscan.io/address/0x724fB9Fd9876d12Da33223C84E7Abf46fFc159C1
    Polygon: '0x724fB9Fd9876d12Da33223C84E7Abf46fFc159C1', // https://polygonscan.com/address/0x724fB9Fd9876d12Da33223C84E7Abf46fFc159C1
  },
  testnet: {
    Avalanche: '0xe4Bf676E956AF5f30876b9af9E93D3CCC4D2ECfF', // https://testnet.snowtrace.io/address/0xe4Bf676E956AF5f30876b9af9E93D3CCC4D2ECfF
    Arbitrum: '0x',
    Optimism: '0x',
    Polygon: '0x',
  },
};

/** @see {@link https://developers.circle.com/cctp/evm-smart-contracts#tokenmessenger-mainnet} */
const mainnetTokenMessenger = (rows =>
  Object.fromEntries(
    rows.map(([Chain, Domain, Address]) => [Chain, { Domain, Address }]),
  ))(
  /** @type {[string, number, `0x${string}`][]} */ ([
    ['Avalanche', 1, '0x6B25532e1060CE10cc3B0A99e5683b91BFDe6982'],
    ['OP Mainnet', 2, '0x2B4069517957735bE00ceE0fadAE88a26365528f'],
    ['Arbitrum', 3, '0x19330d10D9Cc8751218eaf51E8885D058642E08A'],
    ['Polygon PoS', 7, '0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE'],
    ['Unichain', 10, '0x4e744b28E787c3aD0e810eD65A24461D4ac5a762'],
  ]),
);

/**
 * Mainnet configuration with real contract addresses
 * @type {EVMContractAddressesMap}
 
 */
const mainnetContracts = {
  Avalanche: {
    aavePool: aaveAddresses.mainnet.Avalanche,
    compound: '0x', // TODO
    compoundRewardsController: '0x', // TODO
    factory: factoryAddresses.mainnet.Avalanche,
    usdc: usdcAddresses.mainnet.Avalanche,
    tokenMessenger: mainnetTokenMessenger.Avalanche.Address,
    aaveUSDC: aaveUsdcAddresses.mainnet.Avalanche,
    aaveRewardsController: aaveRewardsControllerAddresses.mainnet.Avalanche,
    Beefy_re7_Avalanche: beefyre7Addresses.mainnet.Avalanche,
  },
  Optimism: {
    aavePool: aaveAddresses.mainnet.Optimism,
    compound: compoundAddresses.mainnet.Optimism,
    compoundRewardsController:
      compoundRewardsControllerAddresses.mainnet.Optimism,
    factory: factoryAddresses.mainnet.Optimism,
    usdc: usdcAddresses.mainnet.Optimism,
    tokenMessenger: mainnetTokenMessenger['OP Mainnet'].Address,
    aaveUSDC: aaveUsdcAddresses.mainnet.Optimism,
    aaveRewardsController: aaveRewardsControllerAddresses.mainnet.Optimism,
  },
  Arbitrum: {
    aavePool: aaveAddresses.mainnet.Arbitrum,
    compound: compoundAddresses.mainnet.Arbitrum,
    compoundRewardsController:
      compoundRewardsControllerAddresses.mainnet.Arbitrum,
    factory: factoryAddresses.mainnet.Arbitrum,
    usdc: usdcAddresses.mainnet.Arbitrum,
    tokenMessenger: mainnetTokenMessenger.Arbitrum.Address,
    aaveUSDC: aaveUsdcAddresses.mainnet.Arbitrum,
    aaveRewardsController: aaveRewardsControllerAddresses.mainnet.Arbitrum,
  },
  Polygon: {
    aavePool: aaveAddresses.mainnet.Polygon,
    compound: compoundAddresses.mainnet.Polygon,
    compoundRewardsController:
      compoundRewardsControllerAddresses.mainnet.Polygon,
    factory: factoryAddresses.mainnet.Polygon,
    usdc: usdcAddresses.mainnet.Polygon,
    tokenMessenger: mainnetTokenMessenger['Polygon PoS'].Address,
    aaveUSDC: aaveUsdcAddresses.mainnet.Polygon,
    aaveRewardsController: aaveRewardsControllerAddresses.mainnet.Polygon,
  },
};
harden(mainnetContracts);

/** https://developers.circle.com/cctp/evm-smart-contracts#tokenmessenger-testnet */
const testnetTokenMessenger = (rows =>
  Object.fromEntries(
    rows.map(([Chain, Domain, Address]) => [Chain, { Domain, Address }]),
  ))(
  /** @type {[string, number, `0x${string}`][]} */ ([
    ['Avalanche Fuji', 1, '0xeb08f243E5d3FCFF26A9E38Ae5520A669f4019d0'],
    ['OP Sepolia', 2, '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'],
    ['Arbitrum Sepolia', 3, '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'],
    ['Polygon PoS Amoy', 7, '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'],
    ['Unichain Sepolia', 10, '0x8ed94B8dAd2Dc5453862ea5e316A8e71AAed9782'],
  ]),
);

// XXX turn these inside out? contract.chain.address
/**
 * Testnet configuration with testnet contract addresses
 * @type {EVMContractAddressesMap}
 */
const testnetContracts = {
  Avalanche: {
    aavePool: aaveAddresses.testnet.Avalanche,
    compound: '0x', // TODO
    compoundRewardsController: '0x',
    factory: factoryAddresses.testnet.Avalanche,
    usdc: usdcAddresses.testnet.Avalanche,
    tokenMessenger: testnetTokenMessenger['Avalanche Fuji'].Address,
    aaveUSDC: aaveUsdcAddresses.testnet.Avalanche,
    aaveRewardsController: aaveRewardsControllerAddresses.testnet.Avalanche,
  },
  Optimism: {
    aavePool: aaveAddresses.testnet.Optimism,
    compound: '0x', // TODO
    compoundRewardsController: '0x',
    factory: factoryAddresses.testnet.Optimism,
    usdc: usdcAddresses.testnet.Optimism,
    tokenMessenger: testnetTokenMessenger['OP Sepolia'].Address,
    aaveUSDC: aaveUsdcAddresses.testnet.Optimism,
    aaveRewardsController: aaveRewardsControllerAddresses.testnet.Optimism,
  },
  Arbitrum: {
    aavePool: aaveAddresses.testnet.Arbitrum,
    compound: '0x', // TODO
    compoundRewardsController: '0x',
    factory: factoryAddresses.testnet.Arbitrum,
    usdc: usdcAddresses.testnet.Arbitrum,
    tokenMessenger: testnetTokenMessenger['Arbitrum Sepolia'].Address,
    aaveUSDC: aaveUsdcAddresses.testnet.Arbitrum,
    aaveRewardsController: aaveRewardsControllerAddresses.testnet.Arbitrum,
  },
  Polygon: {
    // TODO: AAVE and Compound on polygon testnet?
    aavePool: '0x',
    compound: '0x',
    compoundRewardsController: '0x',
    factory: factoryAddresses.testnet.Polygon,
    usdc: usdcAddresses.testnet.Polygon,
    tokenMessenger: testnetTokenMessenger['Polygon PoS Amoy'].Address,
    aaveUSDC: '0x',
    aaveRewardsController: '0x',
  },
};
harden(testnetContracts);

/**
 * Mainnet chains only.
 *
 * Sourced from:
 *
 * - https://developers.circle.com/stablecoins/supported-domains
 * - https://chainlist.org/
 * - https://docs.simplehash.com/reference/supported-chains-testnets (accessed on
 *   4 July 2025)
 *  @satisfies {AxelarChainConfigMap}
 */
export const axelarConfig = {
  Avalanche: {
    axelarId: AxelarChainIdMap.Avalanche.mainnet,
    chainInfo: {
      namespace: 'eip155',
      reference: '43114',
      cctpDestinationDomain: 1,
    },
    contracts: { ...mainnetContracts.Avalanche },
  },
  Optimism: {
    axelarId: AxelarChainIdMap.Optimism.mainnet,
    chainInfo: {
      namespace: 'eip155',
      reference: '10',
      cctpDestinationDomain: 2,
    },
    contracts: { ...mainnetContracts.Optimism },
  },
  Arbitrum: {
    axelarId: AxelarChainIdMap.Arbitrum.mainnet,
    chainInfo: {
      namespace: 'eip155',
      reference: '42161',
      cctpDestinationDomain: 3,
    },
    contracts: { ...mainnetContracts.Arbitrum },
  },
  Polygon: {
    axelarId: AxelarChainIdMap.Polygon.mainnet,
    chainInfo: {
      namespace: 'eip155',
      reference: '137',
      cctpDestinationDomain: 7,
    },
    contracts: { ...mainnetContracts.Polygon },
  },
};

/**
 * Testnet chains only.
 *
 * Sourced from:
 *
 * - https://developers.circle.com/stablecoins/supported-domains
 * - https://chainlist.org/
 * - https://docs.simplehash.com/reference/supported-chains-testnets (accessed on
 *   4 July 2025)
 *  @satisfies {AxelarChainConfigMap}
 */
export const axelarConfigTestnet = {
  Avalanche: {
    axelarId: AxelarChainIdMap.Avalanche.testnet,
    chainInfo: {
      namespace: 'eip155',
      reference: '43113',
      cctpDestinationDomain: 1,
    },
    contracts: { ...testnetContracts.Avalanche },
  },
  Optimism: {
    axelarId: AxelarChainIdMap.Optimism.testnet,
    chainInfo: {
      namespace: 'eip155',
      reference: '11155420',
      cctpDestinationDomain: 2,
    },
    contracts: { ...testnetContracts.Optimism },
  },
  Arbitrum: {
    axelarId: AxelarChainIdMap.Arbitrum.testnet,
    chainInfo: {
      namespace: 'eip155',
      reference: '421614',
      cctpDestinationDomain: 3,
    },
    contracts: { ...testnetContracts.Arbitrum },
  },
  Polygon: {
    axelarId: AxelarChainIdMap.Polygon.testnet,
    chainInfo: {
      namespace: 'eip155',
      reference: '80002',
      cctpDestinationDomain: 7,
    },
    contracts: { ...testnetContracts.Polygon },
  },
};
