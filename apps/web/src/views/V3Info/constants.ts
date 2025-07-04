import { ChainId } from '@pancakeswap/chains'
import { ManipulateType } from 'dayjs'

export const v3InfoPath = `info/v3`

export const POOL_HIDE: { [key: string]: string[] } = {
  // TODO: update to our own
  [ChainId.ETHEREUM]: [
    '0x86d257cDB7bC9c0dF10E84C8709697F92770b335',
    '0xf8DBD52488978a79DfE6ffBd81A01Fc5948bF9eE',
    '0x8Fe8D9bb8Eeba3Ed688069c3D6b556C9ca258248',
    '0xA850478aDAACe4c08fc61DE44d8CF3b64f359bEc',
    '0x277667eB3e34f134adf870be9550E9f323d0dc24',
    '0x8c0411F2ad5470A66cb2E9C64536CFb8dcD54d51',
    '0x055284A4CA6532ECc219Ac06b577D540C686669d',
    '0xB078BF211E330b5F95B7114AE845188CC36B795D',
    '0x7778797342652bd27B365962Ffc7f6eCE356EB57',
    '0xe9825d867e3BeF05223bDA609fA8aB89AeF93797',
  ],
  [ChainId.BSC]: [
    '0x87196a3BCeC98116307bdc8B887c3074E8b5bc96',
    '0x4b2C510Fe0b6a50D117220cd6D66a9C714C83dFb',
    '0xf0b579380cA08e75441DC73c2Da9f27CE23725F2',
    '0x9829f916C617e1b269b410dfD84c7F22ad479417',
    '0x9829f916C617e1b269b410dfD84c7F22ad479417',
    '0xA0E4442DC4aDDba0A57be757fbb802b48BA8051C',
    '0xBAdBEdaFe2cA7318a25B665bfA307e91A3EEb88d',
    '0xa7619D726F619062d2d2BCAdbb2ee1FB1952d6d7',
    '0x5FB5EB2c8Ecbf712115007990C70B79F6B256f9b',
  ],
}

export const TOKEN_HIDE: { [key: string]: string[] } = {
  [ChainId.ETHEREUM]: [
    '0xD46bA6D942050d489DBd938a2C909A5d5039A161',
    '0x7dFB72A2AAd08C937706f21421B15bFC34Cba9ca',
    '0x12B32f10A499Bf40Db334Efe04226Cca00Bf2D9B',
    '0x160dE4468586B6B2F8a92FEB0c260Fc6cFC743B1',
    '0xD84787a01B0cad89fBCa231E6960cC0f3f18df34',
    '0xdb19f2052D2B1aD46Ed98C66336A5dAADEB13005',
  ],
  [ChainId.BSC]: ['0xdb19f2052D2B1aD46Ed98C66336A5dAADEB13005', '0x57a63C32CC2aD6CE4FBE5423d548D12d0EEDdfc1'],
}

export const TimeWindow: {
  [key: string]: ManipulateType
} = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
}

export const ONE_HOUR_SECONDS = 3600
export const ONE_DAY_SECONDS = 86400
export const MAX_UINT128 = 2n ** 128n - 1n

export const SUBGRAPH_START_BLOCK = {
  [ChainId.BSC]: 26956207,
  [ChainId.ETHEREUM]: 16950686,
  [ChainId.POLYGON_ZKEVM]: 750149,
  [ChainId.ZKSYNC]: 8639214,
  [ChainId.ARBITRUM_ONE]: 101028949,
  [ChainId.LINEA]: 1444,
  [ChainId.BASE]: 2912007,
  [ChainId.OPBNB]: 1721753,
  [ChainId.ETHERLINK]: 19940245,
  [ChainId.ETHERLINK_TESTNET]: 4190090,
}

export const NODE_REAL_ADDRESS_LIMIT = 50

export const DURATION_INTERVAL = {
  day: ONE_HOUR_SECONDS,
  week: ONE_DAY_SECONDS,
  month: ONE_DAY_SECONDS,
  year: ONE_DAY_SECONDS,
}
