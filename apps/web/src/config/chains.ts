import { ChainId, chainNames } from '@pancakeswap/chains'
import memoize from 'lodash/memoize'
import { Chain, bsc as bsc_ } from 'wagmi/chains'

export const CHAIN_QUERY_NAME = chainNames

const CHAIN_QUERY_NAME_TO_ID = Object.entries(CHAIN_QUERY_NAME).reduce((acc, [chainId, chainName]) => {
  return {
    [chainName.toLowerCase()]: chainId as unknown as ChainId,
    ...acc,
  }
}, {} as Record<string, ChainId>)

export const getChainId = memoize((chainName: string) => {
  if (!chainName) return undefined
  return CHAIN_QUERY_NAME_TO_ID[chainName.toLowerCase()] ? +CHAIN_QUERY_NAME_TO_ID[chainName.toLowerCase()] : undefined
})

const bsc = {
  ...bsc_,
  rpcUrls: {
    ...bsc_.rpcUrls,
    public: {
      ...bsc_.rpcUrls.public,
      http: ['https://bsc-dataseed.binance.org/'],
    },
    default: {
      ...bsc_.rpcUrls.default,
      http: ['https://bsc-dataseed.binance.org/'],
    },
  },
} satisfies Chain

const etherlinkTestnet = {
  id: 127_823,
  name: 'Etherlink Shadownet',
  network: 'etherlink-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'tez',
    symbol: 'XTZ',
  },
  rpcUrls: {
    public: { http: ['https://node.shadownet.etherlink.com'] },
    default: { http: ['https://node.shadownet.etherlink.com'] },
  },
  blockExplorers: {
    etherscan: { name: 'Testnet Etherscout', url: 'https://testnet.explorer.etherlink.com/' },
    default: { name: 'Testnet Etherscout', url: 'https://testnet.explorer.etherlink.com/' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 220050,
    },
  },
  testnet: true,
} as const satisfies Chain

const etherlink = {
  id: 42_793,
  name: 'Etherlink',
  network: 'etherlink',
  nativeCurrency: {
    decimals: 18,
    name: 'tez',
    symbol: 'XTZ',
  },
  rpcUrls: {
    public: { http: ['https://node.mainnet.etherlink.com'] },
    default: { http: ['https://node.mainnet.etherlink.com'] },
  },
  blockExplorers: {
    etherscan: { name: 'Etherscout', url: 'https://explorer.etherlink.com/' },
    default: { name: 'Etherscout', url: 'https://explorer.etherlink.com/' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 33899,
    },
  },
} as const satisfies Chain

/**
 * Controls some L2 specific behavior, e.g. slippage tolerance, special UI behavior.
 * The expectation is that all of these networks have immediate transaction confirmation.
 */
export const L2_CHAIN_IDS: ChainId[] = [
  ChainId.ARBITRUM_ONE,
  ChainId.ARBITRUM_GOERLI,
  ChainId.POLYGON_ZKEVM,
  ChainId.POLYGON_ZKEVM_TESTNET,
  ChainId.ZKSYNC,
  ChainId.ZKSYNC_TESTNET,
  ChainId.LINEA_TESTNET,
  ChainId.LINEA,
  ChainId.BASE,
  ChainId.BASE_TESTNET,
  ChainId.OPBNB,
  ChainId.OPBNB_TESTNET,
  ChainId.ARBITRUM_SEPOLIA,
  ChainId.BASE_SEPOLIA,
  ChainId.ETHERLINK_TESTNET,
  ChainId.ETHERLINK,
]

export const CHAINS = [
  etherlink,
  etherlinkTestnet,
  // bsc,
  // bscTestnet,
  // mainnet,
  // goerli,
  // sepolia,
  // polygonZkEvm,
  // polygonZkEvmTestnet,
  // zkSync,
  // zkSyncTestnet,
  // arbitrum,
  // arbitrumGoerli,
  // arbitrumSepolia,
  // linea,
  // lineaTestnet,
  // base,
  // baseGoerli,
  // baseSepolia,
  // opBNB,
  // opBNBTestnet,
  // scrollSepolia,
]
