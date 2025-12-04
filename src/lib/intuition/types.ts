export interface AtomSummary {
  term_id: `0x${string}`
  label: string | null
  image: string | null
  url?: string | null
}

export interface AtomWithMarketCap extends AtomSummary {
  total_market_cap?: string
}

export interface VaultSummary {
  term_id: `0x${string}`
  curve_id: string
  total_shares: string
  current_share_price: string
  market_cap: string
  position_count: number
}

export interface TrustCardTriple {
  term_id: `0x${string}`
  subject: AtomSummary
  predicate: AtomSummary
  object: AtomSummary
  supportVault?: VaultSummary
  opposeVault?: VaultSummary
}

export interface UserStake {
  support: {
    value: number
    shares: number
  }
  oppose: {
    value: number
    shares: number
  }
}
