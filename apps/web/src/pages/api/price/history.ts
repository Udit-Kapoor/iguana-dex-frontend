import type { NextApiRequest, NextApiResponse } from 'next'
import { BQ_PROJECTS, PricingNetwork, createBigQueryClient } from 'utils/bigquery'

export type PricePoint = { date: number; price: number }
export type PriceHistory = Record<string, PricePoint[]>

const ONE_DAY_S = 86_400

async function getBqPriceHistory(network: PricingNetwork, symbols: string[], startTime: number): Promise<PriceHistory> {
  if (!symbols.length) return {}
  const project = BQ_PROJECTS[network]
  try {
    const bq = createBigQueryClient(network)
    // Aggregate per-minute rows into daily averages.
    // Using parameterized query to avoid SQL injection.
    const query = `
      SELECT
        symbol,
        UNIX_SECONDS(TIMESTAMP_TRUNC(timestamp, DAY)) AS date,
        AVG(price) AS price
      FROM \`${project}.monitoring.price_liquidity\`
      WHERE symbol IN UNNEST(@symbols)
        AND timestamp >= TIMESTAMP_SECONDS(@startTime)
        AND price IS NOT NULL
      GROUP BY symbol, date
      ORDER BY symbol, date
    `
    const [rows] = await bq.query({
      query,
      params: { symbols, startTime },
    })
    const result: PriceHistory = {}
    for (const row of rows as { symbol: string; date: { value: string } | number; price: number }[]) {
      const sym = row.symbol
      // BigQuery returns INT64 as object with .value on some drivers
      const dateNum = typeof row.date === 'object' ? parseInt((row.date as { value: string }).value) : Number(row.date)
      if (!result[sym]) result[sym] = []
      result[sym].push({ date: dateNum, price: row.price })
    }
    return result
  } catch (e) {
    console.error(`BQ price history failed for ${network}:`, e)
    return {}
  }
}

async function getXtzPriceHistory(startTime: number): Promise<PricePoint[]> {
  try {
    const days = Math.ceil((Date.now() / 1000 - startTime) / ONE_DAY_S) + 1
    const url = `https://api.coingecko.com/api/v3/coins/tezos/market_chart?vs_currency=usd&days=${days}&interval=daily`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { prices: [number, number][] }
    return data.prices.map(([tsMs, price]) => ({
      date: Math.floor(tsMs / 1000 / ONE_DAY_S) * ONE_DAY_S,
      price,
    }))
  } catch {
    return []
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const network: PricingNetwork = req.query.network === 'shadownet' ? 'shadownet' : 'mainnet'
  const symbolsParam = typeof req.query.symbols === 'string' ? req.query.symbols : ''
  const startTime = parseInt(typeof req.query.startTime === 'string' ? req.query.startTime : '0') || 0

  const allSymbols = symbolsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const stablecoins = new Set(['USDT', 'USDC', 'DAI', 'BUSD'])
  const isStable = (s: string) => stablecoins.has(s.toUpperCase())
  const isXtz = (s: string) => s.toUpperCase() === 'XTZ'
  const bqSymbols = allSymbols.filter((s) => !isXtz(s) && !isStable(s))
  const needsXtz = allSymbols.some(isXtz)

  const [bqHistory, xtzHistory] = await Promise.all([
    getBqPriceHistory(network, bqSymbols, startTime),
    needsXtz ? getXtzPriceHistory(startTime) : Promise.resolve([] as PricePoint[]),
  ])

  const result: PriceHistory = { ...bqHistory }
  if (needsXtz && xtzHistory.length) result.XTZ = xtzHistory
  for (const sym of allSymbols) {
    if (isStable(sym)) {
      result[sym] = [{ date: startTime, price: 1 }]
    }
  }

  // 5 min fresh — historical prices don't change frequently
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
  res.status(200).json(result)
}
