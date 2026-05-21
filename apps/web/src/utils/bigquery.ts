import { BigQuery } from '@google-cloud/bigquery'

export const BQ_PROJECTS = {
  mainnet: 'rwa-prod-2379',
  shadownet: 'rwa-dev-0240',
} as const

export type PricingNetwork = keyof typeof BQ_PROJECTS

export function createBigQueryClient(network: PricingNetwork): BigQuery {
  const credEnv =
    network === 'shadownet' ? process.env.GOOGLE_BQ_CREDENTIALS_SHADOWNET : process.env.GOOGLE_BQ_CREDENTIALS_MAINNET

  if (credEnv) {
    // Production: explicit service account JSON from env var
    return new BigQuery({ projectId: BQ_PROJECTS[network], credentials: JSON.parse(credEnv) })
  }

  // Local dev: use Application Default Credentials (gcloud auth application-default login)
  return new BigQuery({ projectId: BQ_PROJECTS[network] })
}
