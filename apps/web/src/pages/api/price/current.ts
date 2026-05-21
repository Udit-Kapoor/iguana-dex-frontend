import type { NextApiRequest, NextApiResponse } from 'next'
import { BQ_PROJECTS, PricingNetwork, createBigQueryClient } from 'utils/bigquery'

const STABLECOIN_PRICES: Record<string, number> = {
  USDT: 1,
  USDC: 1,
  DAI: 1,
  BUSD: 1,
}

async function getMetalPrices(network: PricingNetwork): Promise<Record<string, number>> {
  const project = BQ_PROJECTS[network]
  try {
    const bq = createBigQueryClient(network)
    // Filter to last 24h first (cheap partition scan), then take latest row per symbol.
    // QUALIFY is evaluated after the window function, pruning to one row per symbol.
    const query = `
      SELECT symbol, price
      FROM \`${project}.monitoring.price_liquidity\`
      WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        AND price IS NOT NULL
      QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY timestamp DESC) = 1
    `
    const [rows] = await bq.query({ query })
    return Object.fromEntries((rows as { symbol: string; price: number }[]).map((r) => [r.symbol, r.price]))
  } catch (e) {
    console.error(`BigQuery price fetch failed for ${network}:`, e)
    return {}
  }
}

async function getXtzPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return 0
    const data = await res.json()
    return (data as { tezos?: { usd?: number } })?.tezos?.usd ?? 0
  } catch {
    return 0
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const network: PricingNetwork = req.query.network === 'shadownet' ? 'shadownet' : 'mainnet'

  const [metalPrices, xtzPrice] = await Promise.all([getMetalPrices(network), getXtzPrice()])

  const prices: Record<string, number> = {
    ...STABLECOIN_PRICES,
    ...metalPrices,
    XTZ: xtzPrice,
  }

  // 60s fresh, serve stale for up to 5 min while revalidating in background
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  res.status(200).json(prices)
}
