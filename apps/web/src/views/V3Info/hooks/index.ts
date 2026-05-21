import { ChainId } from '@pancakeswap/chains'
import dayjs, { ManipulateType } from 'dayjs'
import { GraphQLClient } from 'graphql-request'
import { useMemo } from 'react'
import { multiChainId, multiChainName } from 'state/info/constant'
import { useChainNameByQueryExtend } from 'state/info/hooks'
import { Block } from 'state/info/types'
import { getChainName } from 'state/info/utils'
import { getDeltaTimestamps } from 'utils/getDeltaTimestamps'
import { v3Clients, v3InfoClients } from 'utils/graphql'
import { useBlockFromTimeStampQuery } from 'views/Info/hooks/useBlocksFromTimestamps'

import { useQuery } from '@tanstack/react-query'
import type { PriceHistory, PricePoint } from 'pages/api/price/history'
import { DURATION_INTERVAL, SUBGRAPH_START_BLOCK } from '../constants'
import { fetchPoolChartData } from '../data/pool/chartData'
import { fetchPoolDatas } from '../data/pool/poolData'
import { PoolTickData, fetchTicksSurroundingPrice } from '../data/pool/tickData'
import { fetchTopPoolAddresses } from '../data/pool/topPools'
import { fetchPoolTransactions } from '../data/pool/transactions'
import { fetchChartData } from '../data/protocol/chart'
import { fetchProtocolData } from '../data/protocol/overview'
import { fetchTopTransactions } from '../data/protocol/transactions'
import { fetchSearchResults } from '../data/search'
import { fetchTokenChartData } from '../data/token/chartData'
import { fetchPoolsForToken } from '../data/token/poolsForToken'
import { fetchPairPriceChartTokenData, fetchTokenPriceData } from '../data/token/priceData'
import { fetchedTokenDatas } from '../data/token/tokenData'
import { fetchTopTokenAddresses } from '../data/token/topTokens'
import { fetchTokenTransactions } from '../data/token/transactions'
import {
  ChartDayData,
  PoolChartEntry,
  PoolData,
  PriceChartEntry,
  ProtocolData,
  TokenChartEntry,
  TokenData,
  Transaction,
} from '../types'

// ─── Pricing ────────────────────────────────────────────────────────────────

const ONE_DAY_S = 86_400

/** Forward-fill a sorted price series: returns the last known price on or before `date`. */
function buildPriceLookup(points: PricePoint[]): (date: number) => number {
  const sorted = [...points].sort((a, b) => a.date - b.date)
  return (date: number) => {
    const dayStart = Math.floor(date / ONE_DAY_S) * ONE_DAY_S
    let price = 0
    for (const p of sorted) {
      if (p.date <= dayStart) price = p.price
      else break
    }
    return price
  }
}

const useTokenPrices = (chainId: ChainId | undefined): Record<string, number> => {
  const network = chainId === ChainId.ETHERLINK_TESTNET ? 'shadownet' : 'mainnet'
  const { data } = useQuery<Record<string, number>>({
    queryKey: [`prices/${network}`],
    queryFn: () => fetch(`/api/price/current?network=${network}`).then((r) => r.json()),
    enabled: Boolean(chainId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  return data ?? {}
}

const usePriceHistory = (chainId: ChainId | undefined, symbols: string[], startTime: number): PriceHistory => {
  const network = chainId === ChainId.ETHERLINK_TESTNET ? 'shadownet' : 'mainnet'
  const key = symbols.slice().sort().join(',')
  const { data } = useQuery<PriceHistory>({
    queryKey: [`priceHistory/${network}/${key}/${startTime}`],
    queryFn: () =>
      fetch(`/api/price/history?network=${network}&symbols=${key}&startTime=${startTime}`).then((r) => r.json()),
    enabled: Boolean(chainId && symbols.length && startTime > 0),
    staleTime: 300_000,
  })
  return data ?? {}
}

function enrichPoolDataWithPrices(
  data: { [address: string]: PoolData } | undefined,
  prices: Record<string, number>,
): { [address: string]: PoolData } | undefined {
  if (!data || Object.keys(prices).length === 0) return data
  return Object.fromEntries(
    Object.entries(data).map(([addr, pool]) => {
      const p0 = prices[pool.token0.symbol] ?? 0
      const p1 = prices[pool.token1.symbol] ?? 0
      if (!p0 && !p1) return [addr, pool]
      const tvlUSD = pool.tvlToken0 * p0 + pool.tvlToken1 * p1
      const volumeUSD = pool.volumeToken0 * p0
      const feeUSD = volumeUSD * (pool.feeTier / 1_000_000)
      return [addr, { ...pool, tvlUSD, volumeUSD, feeUSD }]
    }),
  )
}

function enrichTokenDataWithPrices(
  data: { [address: string]: TokenData } | undefined,
  prices: Record<string, number>,
): { [address: string]: TokenData } | undefined {
  if (!data || Object.keys(prices).length === 0) return data
  return Object.fromEntries(
    Object.entries(data).map(([addr, token]) => {
      const price = prices[token.symbol] ?? 0
      if (!price) return [addr, token]
      const tvlUSD = token.tvlToken * price
      const volumeUSD = token.volumeToken * price
      return [addr, { ...token, tvlUSD, volumeUSD, priceUSD: price }]
    }),
  )
}

// ────────────────────────────────────────────────────────────────────────────

const QUERY_SETTINGS_IMMUTABLE = {
  retry: 3,
  retryDelay: 3000,
  keepPreviousData: true,
  refetchOnMount: false,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
}

export const useProtocolChartData = (): ChartDayData[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const { data: chartData } = useQuery({
    queryKey: [`v3/info/protocol/ProtocolChartData/${chainId}`, chainId],
    queryFn: () => fetchChartData(v3InfoClients[chainId]),
    enabled: Boolean(chainId),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(() => chartData?.data ?? [], [chartData])
}

export const useProtocolData = (): ProtocolData | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const [t24, t48] = getDeltaTimestamps()
  const { blocks } = useBlockFromTimeStampQuery([t24, t48])
  const { data } = useQuery({
    queryKey: [`v3/info/protocol/ProtocolData/${chainId}`, chainId],
    queryFn: () => fetchProtocolData(v3InfoClients[chainId], blocks),
    enabled: Boolean(chainId),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return data?.data ?? undefined
}

export const useProtocolTransactionData = (): Transaction[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const { data } = useQuery({
    queryKey: [`v3/info/protocol/ProtocolTransactionData/${chainId}`, chainId],
    queryFn: () => fetchTopTransactions(v3InfoClients[chainId]),
    enabled: Boolean(chainId),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(() => data ?? [], [data])
}

export const useTokenPriceChartData = (
  address: string,
  duration?: 'day' | 'week' | 'month' | 'year',
  targetChainId?: ChainId,
): PriceChartEntry[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const utcCurrentTime = dayjs()
  const startTimestamp = utcCurrentTime
    .subtract(1, duration ?? 'day')
    .startOf('hour')
    .unix()

  const { data } = useQuery({
    queryKey: [`v3/info/token/priceData/${address}/${duration}`, targetChainId ?? chainId],

    queryFn: () =>
      fetchTokenPriceData(
        address,
        DURATION_INTERVAL[duration ?? 'day'],
        startTimestamp,
        v3InfoClients[targetChainId ?? chainId],
        multiChainName[targetChainId ?? chainId],
        SUBGRAPH_START_BLOCK[chainId],
      ),

    enabled: Boolean(chainId && address),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return data?.data ?? []
}

// this is for the swap page and ROI calculator
export const usePairPriceChartTokenData = (
  address?: string,
  duration?: 'day' | 'week' | 'month' | 'year',
  targetChainId?: ChainId,
  enabled = true,
): { data: PriceChartEntry[] | undefined; maxPrice?: number; minPrice?: number; averagePrice?: number } => {
  const chainName = useChainNameByQueryExtend()
  const chainId = targetChainId || multiChainId[chainName]

  const { data } = useQuery({
    queryKey: [`v3/info/token/pairPriceChartToken/${address}/${duration}`, targetChainId ?? chainId],

    queryFn: async () => {
      if (!address) {
        throw new Error('Address is not defined')
      }
      const utcCurrentTime = dayjs()
      const startTimestamp = utcCurrentTime
        .subtract(1, duration ?? 'day')
        .startOf('hour')
        .unix()
      return fetchPairPriceChartTokenData(
        address,
        DURATION_INTERVAL[duration ?? 'day'],
        startTimestamp,
        v3Clients[targetChainId ?? chainId],
        multiChainName[targetChainId ?? chainId],
        SUBGRAPH_START_BLOCK[chainId],
      )
    },

    enabled: Boolean(enabled && chainId && address),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(
    () => ({
      data: data?.data ?? [],
      maxPrice: data?.maxPrice,
      minPrice: data?.minPrice,
      averagePrice: data?.averagePrice,
    }),
    [data],
  )
}

export async function fetchTopTokens(dataClient: GraphQLClient, blocks?: Block[]) {
  try {
    const topTokenAddress = await fetchTopTokenAddresses(dataClient)
    const data = await fetchedTokenDatas(dataClient, topTokenAddress.addresses ?? [], blocks)
    return data
  } catch (e) {
    console.error(e)
    return {
      data: {},
      error: true,
    }
  }
}

export const useTopTokensData = ():
  | {
      [address: string]: TokenData
    }
  | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const [t24, t48, t7d] = getDeltaTimestamps()
  const { blocks } = useBlockFromTimeStampQuery([t24, t48, t7d])
  const prices = useTokenPrices(chainId)

  const { data } = useQuery({
    queryKey: [`v3/info/token/TopTokensData/${chainId}/${blocks?.[0]?.number ?? 'noblocks'}`, chainId],

    queryFn: () =>
      fetchTopTokens(
        v3InfoClients[chainId],
        blocks?.filter((d) => d.number >= SUBGRAPH_START_BLOCK[chainId]),
      ),

    enabled: Boolean(chainId),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(() => enrichTokenDataWithPrices(data?.data, prices), [data, prices])
}

const graphPerPage = 50

const tokenDataFetcher = (dataClient: GraphQLClient, tokenAddresses: string[], blocks?: Block[]) => {
  const times = Math.ceil(tokenAddresses.length / graphPerPage)
  const addressGroup: Array<string[]> = []
  for (let i = 0; i < times; i++) {
    addressGroup.push(tokenAddresses.slice(i * graphPerPage, (i + 1) * graphPerPage))
  }
  return Promise.all(addressGroup.map((d) => fetchedTokenDatas(dataClient, d, blocks)))
}
export const useTokensData = (addresses: string[], targetChainId?: ChainId): TokenData[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = targetChainId ?? multiChainId[chainName]
  const [t24, t48, t7d] = getDeltaTimestamps()
  const { blocks } = useBlockFromTimeStampQuery([t24, t48, t7d], undefined, undefined, getChainName(chainId))
  const prices = useTokenPrices(chainId)

  const { data } = useQuery({
    queryKey: [`v3/info/token/tokensData/${targetChainId}/${addresses?.join()}`, chainId],

    queryFn: () =>
      tokenDataFetcher(
        v3InfoClients[chainId],
        addresses,
        blocks?.filter((d) => d.number >= SUBGRAPH_START_BLOCK[chainId]),
      ),

    enabled: Boolean(chainId && addresses && addresses?.length > 0),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  const allTokensData = useMemo(() => {
    if (data) {
      return data.reduce((acc, d) => {
        return { ...acc, ...d.data }
      }, {})
    }
    return undefined
  }, [data])

  return useMemo(() => {
    if (!allTokensData) return undefined
    return Object.values(enrichTokenDataWithPrices(allTokensData, prices) ?? allTokensData)
  }, [allTokensData, prices])
}

export const useTokenData = (address: string): TokenData | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const [t24, t48, t7d] = getDeltaTimestamps()
  const { blocks } = useBlockFromTimeStampQuery([t24, t48, t7d])
  const prices = useTokenPrices(chainId)

  const { data } = useQuery({
    queryKey: [`v3/info/token/tokenData/${chainId}/${address}`, chainId],

    queryFn: () =>
      fetchedTokenDatas(
        v3InfoClients[chainId],
        [address],
        blocks?.filter((d) => d.number >= SUBGRAPH_START_BLOCK[chainId]),
      ),

    enabled: Boolean(chainId && address && address !== 'undefined'),
    ...QUERY_SETTINGS_IMMUTABLE,
  })

  return useMemo(() => {
    const tokenMap = enrichTokenDataWithPrices(data?.data, prices)
    return tokenMap?.[address]
  }, [data, prices, address])
}

export const usePoolsForToken = (address: string): string[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const { data } = useQuery({
    queryKey: [`v3/info/token/poolsForToken/${chainId}/${address}`, chainId],
    queryFn: () => fetchPoolsForToken(address, v3InfoClients[chainId]),
    enabled: Boolean(chainId && address),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return data?.addresses
}

export const useTokenChartData = (address: string): TokenChartEntry[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]

  const { data } = useQuery({
    queryKey: [`v3/info/token/tokenChartData/${chainId}/${address}`, chainId],
    queryFn: () => fetchTokenChartData(address, v3InfoClients[chainId]),
    enabled: Boolean(chainId && address),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return data?.data
}

export const useTokenPriceData = (
  address: string,
  interval: number,
  timeWindow: ManipulateType,
): PriceChartEntry[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const utcCurrentTime = dayjs()
  const startTimestamp = utcCurrentTime
    .subtract(1, timeWindow ?? 'day')
    .startOf('hour')
    .unix()

  const { data } = useQuery({
    queryKey: [`v3/info/token/tokenPriceData/${chainId}/${address}/${interval}/${timeWindow}`, chainId],

    queryFn: () =>
      fetchTokenPriceData(
        address,
        interval,
        startTimestamp,
        v3InfoClients[chainId],
        multiChainName[chainId],
        SUBGRAPH_START_BLOCK[chainId],
      ),

    enabled: Boolean(chainId && address),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return data?.data
}

export const useTokenTransactions = (address: string): Transaction[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const { data } = useQuery({
    queryKey: [`v3/info/token/tokenTransaction/${chainId}/${address}`, chainId],
    queryFn: () => fetchTokenTransactions(address, v3InfoClients[chainId]),
    enabled: Boolean(chainId && address),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(() => data?.data ?? [], [data])
}

export async function fetchTopPools(dataClient: GraphQLClient, chainId: ChainId, blocks?: Block[]) {
  try {
    const topPoolAddress = await fetchTopPoolAddresses(dataClient, chainId)
    const data = await fetchPoolDatas(dataClient, topPoolAddress.addresses ?? [], blocks)
    return data
  } catch (e) {
    console.error(e)
    return {
      data: {},
      error: true,
    }
  }
}

export const useTopPoolsData = ():
  | {
      [address: string]: PoolData
    }
  | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const [t24, t48, t7d] = getDeltaTimestamps()
  const { blocks } = useBlockFromTimeStampQuery([t24, t48, t7d])
  const prices = useTokenPrices(chainId)

  const { data } = useQuery({
    queryKey: [`v3/info/pool/TopPoolsData/${chainId}/${blocks?.[0]?.number ?? 'noblocks'}`, chainId],

    queryFn: () =>
      fetchTopPools(
        v3InfoClients[chainId],
        chainId,
        blocks?.filter((d) => d.number >= SUBGRAPH_START_BLOCK[chainId]),
      ),

    enabled: Boolean(chainId),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(() => enrichPoolDataWithPrices(data?.data, prices), [data, prices])
}

export const usePoolsData = (addresses: string[]): PoolData[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const [t24, t48, t7d] = getDeltaTimestamps()
  const { blocks } = useBlockFromTimeStampQuery([t24, t48, t7d])
  const prices = useTokenPrices(chainId)

  const { data } = useQuery({
    queryKey: [`v3/info/pool/poolsData/${chainId}/${addresses.join()}`, chainId],

    queryFn: () =>
      fetchPoolDatas(
        v3InfoClients[chainId],
        addresses,
        blocks?.filter((d) => d.number >= SUBGRAPH_START_BLOCK[chainId]),
      ),

    enabled: Boolean(chainId && addresses && addresses?.length > 0),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(() => {
    if (!data?.data) return undefined
    return Object.values(enrichPoolDataWithPrices(data.data, prices) ?? data.data)
  }, [data, prices])
}

export const usePoolData = (address: string): PoolData | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const [t24, t48, t7d] = getDeltaTimestamps()
  const { blocks } = useBlockFromTimeStampQuery([t24, t48, t7d])
  const prices = useTokenPrices(chainId)

  const { data } = useQuery({
    queryKey: [`v3/info/pool/poolData/${chainId}/${address}`, chainId],

    queryFn: () =>
      fetchPoolDatas(
        v3InfoClients[chainId],
        [address],
        blocks?.filter((d) => d.number >= SUBGRAPH_START_BLOCK[chainId]),
      ),

    enabled: Boolean(chainId && address && address !== 'undefined'),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(() => {
    const poolMap = enrichPoolDataWithPrices(data?.data, prices)
    return poolMap?.[address] ?? undefined
  }, [data, prices, address])
}
export const usePoolTransactions = (address: string): Transaction[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]

  const { data } = useQuery({
    queryKey: [`v3/info/pool/poolTransaction/${chainId}/${address}`, chainId],
    queryFn: () => fetchPoolTransactions(address, v3InfoClients[chainId]),
    enabled: Boolean(chainId && address),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return useMemo(() => data?.data ?? undefined, [data])
}

export const usePoolChartData = (address: string): PoolChartEntry[] | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]

  const { data } = useQuery({
    queryKey: [`v3/info/pool/poolChartData/${chainId}/${address}`, chainId],
    queryFn: () => fetchPoolChartData(address, v3InfoClients[chainId]),
    enabled: Boolean(chainId && address && address !== 'undefined'),
    ...QUERY_SETTINGS_IMMUTABLE,
  })

  // Pool metadata needed for token symbols and feeTier
  const poolData = usePoolData(address)
  const token0Symbol = poolData?.token0?.symbol
  const token1Symbol = poolData?.token1?.symbol
  const feeTier = poolData?.feeTier

  // Earliest data point as startTime for price history request
  const startTime = useMemo(() => {
    const first = data?.data?.[0]
    return first ? Math.floor(first.date / ONE_DAY_S) * ONE_DAY_S : 0
  }, [data])

  const symbols = useMemo(() => [token0Symbol, token1Symbol].filter(Boolean) as string[], [token0Symbol, token1Symbol])

  const priceHistory = usePriceHistory(chainId, symbols, startTime)

  return useMemo(() => {
    if (!data?.data) return undefined
    const lookup0 = token0Symbol && priceHistory[token0Symbol] ? buildPriceLookup(priceHistory[token0Symbol]) : null
    const lookup1 = token1Symbol && priceHistory[token1Symbol] ? buildPriceLookup(priceHistory[token1Symbol]) : null

    if (!lookup0 && !lookup1) return data.data

    const poolFeeTier = feeTier ?? 3_000

    return data.data.map((entry) => {
      const t0 = entry.tvlToken0 ?? 0
      const t1 = entry.tvlToken1 ?? 0
      const vol0 = entry.volumeToken0 ?? 0
      const p0 = lookup0 ? lookup0(entry.date) : 0
      const p1 = lookup1 ? lookup1(entry.date) : 0

      const totalValueLockedUSD = t0 * p0 + t1 * p1
      const volumeUSD = vol0 * p0
      const feesUSD = volumeUSD * (poolFeeTier / 1_000_000)

      return { ...entry, totalValueLockedUSD, volumeUSD, feesUSD }
    })
  }, [data, priceHistory, token0Symbol, token1Symbol, feeTier])
}

export const usePoolTickData = (address: string): PoolTickData | undefined => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]

  const { data } = useQuery({
    queryKey: [`v3/info/pool/poolTickData/${chainId}/${address}`, chainId],
    queryFn: () => fetchTicksSurroundingPrice(address, v3InfoClients[chainId], chainId),
    enabled: Boolean(chainId && address),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  return data?.data ?? undefined
}

export const useSearchData = (
  searchValue: string,
): { tokens: TokenData[]; pools: PoolData[]; loading: boolean; error: any } => {
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const [t24, t48, t7d] = getDeltaTimestamps()
  const { blocks } = useBlockFromTimeStampQuery([t24, t48, t7d])
  const { data, status, error } = useQuery({
    queryKey: [`v3/info/pool/searchData/${chainId}/${searchValue}`, chainId],

    queryFn: () =>
      fetchSearchResults(
        v3InfoClients[chainId],
        searchValue,
        blocks?.filter((d) => d.number >= SUBGRAPH_START_BLOCK[chainId]),
      ),

    enabled: Boolean(chainId && searchValue),
    ...QUERY_SETTINGS_IMMUTABLE,
  })
  const searchResult = useMemo(() => {
    if (data) {
      return {
        ...data,
        loading: status !== 'success',
        error,
      }
    }
    return {
      tokens: [],
      pools: [],
      loading: true,
      error,
    }
  }, [data, status, error])
  return searchResult
}
