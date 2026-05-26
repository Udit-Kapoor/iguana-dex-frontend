export type FeeProtocolPeriod = {
  from: number // Unix timestamp inclusive
  to: number // Unix timestamp exclusive (Infinity = no end)
  feeTier: number // hundredths of a bip, e.g. 500 = 0.05%
  feeProtocol: number // 0–4000; protocol share = feeProtocol / PROTOCOL_FEE_DENOMINATOR
}

// PROTOCOL_FEE_DENOMINATOR = 10_000 (from PancakeV3Pool source)
// Protocol fee per swap = |amountIn| × (feeTier / 1_000_000) × (feeProtocol / 10_000)
export const PROTOCOL_FEE_DENOMINATOR = 10_000
export const FEE_TIER_DENOMINATOR = 1_000_000

// Periods derived from on-chain SetFeeProtocol events.
// xU3O8/USDC  disable tx: block 4739230  ts=1732983019  (2024-11-30)
// xU3O8/USDC  re-enable:  block 41830077 ts=1775566023  (2026-04-07)
// USDC/VNXAU  change:     block 41830156 ts=1775566153  (2026-04-07)
// RARE/USDC   change:     block 41830121 ts=1775566102  (2026-04-07)
export const PROTOCOL_FEE_PERIODS: Record<string, FeeProtocolPeriod[]> = {
  // xU3O8/USDC
  '0xb387d0a73619791420de4a1e5e710023cb0f49c0': [
    { from: 0, to: 1732983019, feeTier: 500, feeProtocol: 3400 },
    { from: 1732983019, to: 1775566023, feeTier: 500, feeProtocol: 0 }, // disabled
    { from: 1775566023, to: Infinity, feeTier: 500, feeProtocol: 4000 },
  ],
  // USDC/VNXAU
  '0x86d2f4ef99915652bfc3adf29683752334582b4d': [
    { from: 0, to: 1775566153, feeTier: 2500, feeProtocol: 3200 },
    { from: 1775566153, to: Infinity, feeTier: 2500, feeProtocol: 4000 },
  ],
  // RARE/USDC
  '0x35c888a9afc0866fec5bbadef790e5ec1d845653': [
    { from: 0, to: 1775566102, feeTier: 10000, feeProtocol: 3200 },
    { from: 1775566102, to: Infinity, feeTier: 10000, feeProtocol: 1000 },
  ],
}

export function getFeeProtocolForTimestamp(
  poolAddress: string,
  timestamp: number,
): { feeTier: number; feeProtocol: number } {
  const periods = PROTOCOL_FEE_PERIODS[poolAddress.toLowerCase()]
  if (!periods) return { feeTier: 0, feeProtocol: 0 }
  const period = periods.find((p) => timestamp >= p.from && timestamp < p.to)
  return period ? { feeTier: period.feeTier, feeProtocol: period.feeProtocol } : { feeTier: 0, feeProtocol: 0 }
}
