import { gql, GraphQLClient } from 'graphql-request'

export type SwapRecord = {
  id: string
  timestamp: number
  txHash: string
  sender: string
  amount0: number
  amount1: number
  token0Symbol: string
  token1Symbol: string
}

const POOL_SWAPS_QUERY = gql`
  query PoolSwaps($pool: String!, $cursor: Int!, $first: Int!) {
    swaps(first: $first, where: { pool: $pool, timestamp_gt: $cursor }, orderBy: timestamp, orderDirection: asc) {
      id
      timestamp
      transaction {
        id
      }
      origin
      amount0
      amount1
      token0 {
        symbol
      }
      token1 {
        symbol
      }
    }
  }
`

export async function fetchAllPoolSwaps(
  poolAddress: string,
  client: GraphQLClient,
  fromTimestamp = 0,
  onProgress?: (count: number) => void,
): Promise<SwapRecord[]> {
  const results: SwapRecord[] = []
  let cursor = fromTimestamp

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const data = await client.request<{ swaps: any[] }>(POOL_SWAPS_QUERY, {
      pool: poolAddress.toLowerCase(),
      cursor,
      first: 1000,
    })

    const batch = data.swaps ?? []
    if (!batch.length) break

    for (const s of batch) {
      results.push({
        id: s.id,
        timestamp: parseInt(s.timestamp, 10),
        txHash: s.transaction.id,
        sender: s.origin,
        amount0: parseFloat(s.amount0),
        amount1: parseFloat(s.amount1),
        token0Symbol: s.token0.symbol,
        token1Symbol: s.token1.symbol,
      })
    }

    onProgress?.(results.length)
    cursor = results[results.length - 1].timestamp

    if (batch.length < 1000) break
  }

  return results
}
