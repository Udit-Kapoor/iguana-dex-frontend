import { useTranslation } from '@pancakeswap/localization'
import { Box, Button, Flex, Heading, Spinner, Text } from '@pancakeswap/uikit'
import Page from 'components/Layout/Page'
import { useQuery } from '@tanstack/react-query'
import { ChainId } from '@pancakeswap/chains'
import { useMemo, useState } from 'react'
import { styled } from 'styled-components'
import { multiChainId } from 'state/info/constant'
import { useChainNameByQueryExtend } from 'state/info/hooks'
import { v3InfoClients } from 'utils/graphql'
import type { PriceHistory, PricePoint } from 'pages/api/price/history'
import { fetchAllPoolSwaps, SwapRecord } from '../data/pool/swapHistory'
import {
  getFeeProtocolForTimestamp,
  PROTOCOL_FEE_DENOMINATOR,
  FEE_TIER_DENOMINATOR,
} from '../constants/protocolFeePeriods'

// ─── Constants ────────────────────────────────────────────────────────────────

const ONE_DAY_S = 86_400

const REPORT_POOLS = [
  {
    address: '0xb387d0a73619791420de4a1e5e710023cb0f49c0',
    label: 'xU3O8/USDC',
    token0: 'xU3O8',
    token1: 'USDC',
  },
  {
    address: '0x86d2f4ef99915652bfc3adf29683752334582b4d',
    label: 'USDC/VNXAU',
    token0: 'USDC',
    token1: 'VNXAU',
  },
  {
    address: '0x35c888a9afc0866fec5bbadef790e5ec1d845653',
    label: 'RARE/USDC',
    token0: 'RARE',
    token1: 'USDC',
  },
] as const

// Earliest swap across all pools: xU3O8/USDC first swap 2024-11-29
const REPORT_START_TIME = 1732838400

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

type EnrichedSwap = SwapRecord & {
  poolAddress: string
  poolLabel: string
  volumeUSD: number
  swapFeeUSD: number
  protocolFeeUSD: number
  feeProtocolActive: boolean
}

function enrichSwap(
  swap: SwapRecord,
  poolAddress: string,
  poolLabel: string,
  lookup0: ((d: number) => number) | null,
  lookup1: ((d: number) => number) | null,
): EnrichedSwap {
  const { feeTier, feeProtocol } = getFeeProtocolForTimestamp(poolAddress, swap.timestamp)

  const p0 = lookup0 ? lookup0(swap.timestamp) : 0
  const p1 = lookup1 ? lookup1(swap.timestamp) : 0

  // Input amount is whichever is positive (the token entering the pool)
  const inputUSD = Math.max(swap.amount0, 0) * p0 + Math.max(swap.amount1, 0) * p1

  const swapFeeUSD = inputUSD * (feeTier / FEE_TIER_DENOMINATOR)
  const protocolFeeUSD = swapFeeUSD * (feeProtocol / PROTOCOL_FEE_DENOMINATOR)

  return {
    ...swap,
    poolAddress,
    poolLabel,
    volumeUSD: inputUSD,
    swapFeeUSD,
    protocolFeeUSD,
    feeProtocolActive: feeProtocol > 0,
  }
}

function monthKey(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatUSD(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function buildCSV(swaps: EnrichedSwap[]): string {
  const header = [
    'Date',
    'Pool',
    'Tx Hash',
    'Sender',
    'Token0',
    'Amount0',
    'Token1',
    'Amount1',
    'Volume USD',
    'Swap Fee USD',
    'Protocol Fee USD',
    'Protocol Fee Active',
  ].join(',')

  const rows = swaps.map((s) =>
    [
      formatDate(s.timestamp),
      s.poolLabel,
      s.txHash,
      s.sender,
      s.token0Symbol,
      Math.abs(s.amount0).toFixed(8),
      s.token1Symbol,
      Math.abs(s.amount1).toFixed(8),
      s.volumeUSD.toFixed(6),
      s.swapFeeUSD.toFixed(6),
      s.protocolFeeUSD.toFixed(6),
      s.feeProtocolActive ? 'Yes' : 'No',
    ].join(','),
  )

  return [header, ...rows].join('\n')
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Styled ──────────────────────────────────────────────────────────────────

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
`

const Th = styled.th`
  padding: 10px 12px;
  text-align: left;
  border-bottom: 2px solid ${({ theme }) => theme.colors.cardBorder};
  color: ${({ theme }) => theme.colors.textSubtle};
  font-weight: 600;
  white-space: nowrap;
`

const Td = styled.td`
  padding: 10px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.cardBorder};
`

const SummaryCard = styled(Box)`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.cardBorder};
  border-radius: 16px;
  padding: 20px 24px;
  min-width: 180px;
`

// ─── Main component ───────────────────────────────────────────────────────────

const ReportPage: React.FC = () => {
  const { t } = useTranslation()
  const chainName = useChainNameByQueryExtend()
  const chainId = multiChainId[chainName]
  const network = chainId === ChainId.ETHERLINK_TESTNET ? 'shadownet' : 'mainnet'

  const [selectedPool, setSelectedPool] = useState<string>('all')

  // ── 1. Fetch swap history for all 3 pools (explicit hooks, no loop)
  const swapQuery0 = useQuery({
    queryKey: [`v3/report/swaps/${chainId}/${REPORT_POOLS[0].address}`],
    queryFn: () => fetchAllPoolSwaps(REPORT_POOLS[0].address, v3InfoClients[chainId]),
    enabled: Boolean(chainId),
    staleTime: 5 * 60_000,
    retry: 2,
  })
  const swapQuery1 = useQuery({
    queryKey: [`v3/report/swaps/${chainId}/${REPORT_POOLS[1].address}`],
    queryFn: () => fetchAllPoolSwaps(REPORT_POOLS[1].address, v3InfoClients[chainId]),
    enabled: Boolean(chainId),
    staleTime: 5 * 60_000,
    retry: 2,
  })
  const swapQuery2 = useQuery({
    queryKey: [`v3/report/swaps/${chainId}/${REPORT_POOLS[2].address}`],
    queryFn: () => fetchAllPoolSwaps(REPORT_POOLS[2].address, v3InfoClients[chainId]),
    enabled: Boolean(chainId),
    staleTime: 5 * 60_000,
    retry: 2,
  })
  const swapQueries = [swapQuery0, swapQuery1, swapQuery2]

  const swapsLoading = swapQueries.some((q) => q.isLoading)
  const swapsError = swapQueries.some((q) => q.isError)

  // ── 2. Fetch price history for all symbols from BQ
  const allSymbols = ['xU3O8', 'USDC', 'VNXAU', 'RARE']
  const symbolKey = allSymbols.join(',')
  const { data: priceHistory, isLoading: pricesLoading } = useQuery<PriceHistory>({
    queryKey: [`v3/report/priceHistory/${network}/${symbolKey}/${REPORT_START_TIME}`],
    queryFn: () =>
      fetch(`/api/price/history?network=${network}&symbols=${symbolKey}&startTime=${REPORT_START_TIME}`).then((r) =>
        r.json(),
      ),
    enabled: Boolean(chainId),
    staleTime: 5 * 60_000,
  })

  // ── 3. Build price lookups per symbol
  const priceLookups = useMemo(() => {
    if (!priceHistory) return {} as Record<string, (d: number) => number>
    return Object.fromEntries(
      Object.entries(priceHistory).map(([sym, pts]) => [sym, buildPriceLookup(pts as PricePoint[])]),
    )
  }, [priceHistory])

  // ── 4. Enrich all swaps with USD values
  const allEnrichedSwaps = useMemo((): EnrichedSwap[] => {
    return REPORT_POOLS.flatMap((pool, i) => {
      const swaps = swapQueries[i].data ?? []
      const lookup0 = priceLookups[pool.token0] ?? null
      const lookup1 = priceLookups[pool.token1] ?? null
      return swaps.map((s) => enrichSwap(s, pool.address, pool.label, lookup0, lookup1))
    })
  }, [swapQueries, priceLookups]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 5. Filter by selected pool
  const filteredSwaps = useMemo(
    () => (selectedPool === 'all' ? allEnrichedSwaps : allEnrichedSwaps.filter((s) => s.poolAddress === selectedPool)),
    [allEnrichedSwaps, selectedPool],
  )

  // ── 6. Monthly aggregate
  type MonthRow = {
    month: string
    pool: string
    swapCount: number
    volumeUSD: number
    swapFeeUSD: number
    protocolFeeUSD: number
  }

  const monthlyRows = useMemo((): MonthRow[] => {
    const map: Record<string, MonthRow> = {}
    for (const s of filteredSwaps) {
      const mk = `${monthKey(s.timestamp)}|${s.poolLabel}`
      if (!map[mk]) {
        map[mk] = {
          month: monthKey(s.timestamp),
          pool: s.poolLabel,
          swapCount: 0,
          volumeUSD: 0,
          swapFeeUSD: 0,
          protocolFeeUSD: 0,
        }
      }
      map[mk].swapCount += 1
      map[mk].volumeUSD += s.volumeUSD
      map[mk].swapFeeUSD += s.swapFeeUSD
      map[mk].protocolFeeUSD += s.protocolFeeUSD
    }
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month) || a.pool.localeCompare(b.pool))
  }, [filteredSwaps])

  // ── 7. Totals
  const totals = useMemo(
    () =>
      filteredSwaps.reduce(
        (acc, s) => ({
          swaps: acc.swaps + 1,
          volume: acc.volume + s.volumeUSD,
          fees: acc.fees + s.swapFeeUSD,
          protocol: acc.protocol + s.protocolFeeUSD,
        }),
        { swaps: 0, volume: 0, fees: 0, protocol: 0 },
      ),
    [filteredSwaps],
  )

  const isLoading = swapsLoading || pricesLoading

  // ── Handlers
  const handleDownloadAll = () => {
    const sorted = [...filteredSwaps].sort((a, b) => a.timestamp - b.timestamp)
    const csv = buildCSV(sorted)
    const poolLabel =
      selectedPool === 'all' ? 'all-pools' : REPORT_POOLS.find((p) => p.address === selectedPool)?.label ?? 'pool'
    downloadCSV(csv, `protocol-fee-report-${poolLabel}-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <Page>
      <Flex
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        mb="24px"
        mt="40px"
        style={{ gap: '12px' }}
      >
        <Heading scale="lg">{t('Protocol Fee Report')}</Heading>
        <Button onClick={handleDownloadAll} disabled={isLoading || filteredSwaps.length === 0} scale="sm">
          {t('Download CSV')}
        </Button>
      </Flex>

      {/* Pool selector */}
      <Flex mb="24px" flexWrap="wrap" style={{ gap: '8px' }}>
        {[{ address: 'all', label: t('All Pools') }, ...REPORT_POOLS].map((pool) => (
          <Button
            key={pool.address}
            scale="sm"
            variant={selectedPool === pool.address ? 'primary' : 'tertiary'}
            onClick={() => setSelectedPool(pool.address)}
          >
            {pool.label}
          </Button>
        ))}
      </Flex>

      {isLoading ? (
        <Flex
          justifyContent="center"
          alignItems="center"
          flexDirection="column"
          style={{ minHeight: '200px', gap: '12px' }}
        >
          <Spinner />
          <Text color="textSubtle">{swapsLoading ? t('Fetching swap history…') : t('Loading prices…')}</Text>
        </Flex>
      ) : swapsError ? (
        <Text color="failure">{t('Failed to load swap data. Please try again.')}</Text>
      ) : (
        <>
          {/* Summary cards */}
          <Flex mb="32px" flexWrap="wrap" style={{ gap: '16px' }}>
            <SummaryCard>
              <Text color="textSubtle" fontSize="12px" mb="4px">
                {t('Total Swaps')}
              </Text>
              <Text bold fontSize="20px">
                {totals.swaps.toLocaleString()}
              </Text>
            </SummaryCard>
            <SummaryCard>
              <Text color="textSubtle" fontSize="12px" mb="4px">
                {t('Total Volume')}
              </Text>
              <Text bold fontSize="20px">
                {formatUSD(totals.volume)}
              </Text>
            </SummaryCard>
            <SummaryCard>
              <Text color="textSubtle" fontSize="12px" mb="4px">
                {t('Total Swap Fees')}
              </Text>
              <Text bold fontSize="20px">
                {formatUSD(totals.fees)}
              </Text>
            </SummaryCard>
            <SummaryCard>
              <Text color="textSubtle" fontSize="12px" mb="4px">
                {t('Protocol Fees Collected')}
              </Text>
              <Text bold fontSize="20px" color="success">
                {formatUSD(totals.protocol)}
              </Text>
            </SummaryCard>
          </Flex>

          {/* Monthly breakdown table */}
          <Box overflowX="auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t('Month')}</Th>
                  <Th>{t('Pool')}</Th>
                  <Th style={{ textAlign: 'right' }}>{t('Swaps')}</Th>
                  <Th style={{ textAlign: 'right' }}>{t('Volume USD')}</Th>
                  <Th style={{ textAlign: 'right' }}>{t('Swap Fees USD')}</Th>
                  <Th style={{ textAlign: 'right' }}>{t('Protocol Fees USD')}</Th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((row) => (
                  <tr key={`${row.month}-${row.pool}`}>
                    <Td>{row.month}</Td>
                    <Td>{row.pool}</Td>
                    <Td style={{ textAlign: 'right' }}>{row.swapCount.toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right' }}>{formatUSD(row.volumeUSD)}</Td>
                    <Td style={{ textAlign: 'right' }}>{formatUSD(row.swapFeeUSD)}</Td>
                    <Td style={{ textAlign: 'right' }}>
                      <Text bold color={row.protocolFeeUSD > 0 ? 'success' : 'textDisabled'}>
                        {formatUSD(row.protocolFeeUSD)}
                      </Text>
                    </Td>
                  </tr>
                ))}
                {monthlyRows.length === 0 && (
                  <tr>
                    <Td colSpan={6} style={{ textAlign: 'center' }}>
                      <Text color="textSubtle">{t('No data')}</Text>
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Box>
        </>
      )}
    </Page>
  )
}

export default ReportPage
