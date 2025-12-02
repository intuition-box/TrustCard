import type { PublicClient, WalletClient } from 'viem'
import { createAtomFromString } from '@0xintuition/sdk'
import {
  getMultiVaultAddressFromChainId,
  deposit,
  createTriples,
} from '@0xintuition/protocol'

import {
  FIND_ATOM_BY_LABEL_QUERY,
  FIND_ATOMS_BY_LABEL_SEARCH,
  GET_ATOM_MARKETCAPS_QUERY,
  GET_TRUSTCARD_TRIPLES_QUERY,
  FIND_TRUSTCARD_TRIPLE_FOR_SUBJECT_QUERY,
} from './queries'
import { executeIntuitionQuery } from './graphqlClient'
import { PREDICATE_ID, OBJECT_ID } from './constants'
import type {
  AtomSummary,
  AtomWithMarketCap,
  VaultSummary,
  TrustCardTriple,
} from './types'

export interface IntuitionContext {
  walletClient: WalletClient
  publicClient: PublicClient
  chainId: number
}

interface RawVault {
  term_id: `0x${string}`
  curve_id: string | number
  total_shares: string
  current_share_price: string
  market_cap: string | null
  position_count: number
}

interface RawTriple {
  term_id: `0x${string}`
  subject: AtomSummary
  predicate: AtomSummary
  object: AtomSummary
  term?: { vaults: RawVault[] }
  counter_term?: { vaults: RawVault[] }
}

interface RawVaultCap {
  term_id: `0x${string}`
  curve_id: string | number
  market_cap: string | null
  position_count: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mapVault(raw?: RawVault | null): VaultSummary | undefined {
  if (!raw) return undefined
  const curveId =
    typeof raw.curve_id === 'number' ? raw.curve_id.toString() : raw.curve_id

  return {
    term_id: raw.term_id,
    curve_id: curveId,
    total_shares: raw.total_shares,
    current_share_price: raw.current_share_price,
    market_cap: raw.market_cap ?? '0',
    position_count: raw.position_count,
  }
}

const TARGET_CURVE_ID = '2'

function pickCurveVault(vaults: RawVault[]): RawVault | null {
  return (
    vaults.find((v) => String(v.curve_id) === TARGET_CURVE_ID) ?? vaults[0] ?? null
  )
}

function mapTriple(raw: RawTriple): TrustCardTriple {
  const termVaults = raw.term?.vaults ?? []
  const counterVaults = raw.counter_term?.vaults ?? []

  const supportRaw = pickCurveVault(termVaults)
  const opposeRaw = pickCurveVault(counterVaults)

  const supportVault = mapVault(supportRaw)
  const opposeVault = mapVault(opposeRaw)

  return {
    term_id: raw.term_id,
    subject: raw.subject,
    predicate: raw.predicate,
    object: raw.object,
    supportVault,
    opposeVault,
  }
}

async function attachAtomMarketCaps(
  atoms: AtomSummary[],
): Promise<AtomWithMarketCap[]> {
  if (!atoms.length) return []

  const termIds = atoms.map((a) => a.term_id).filter(Boolean) as `0x${string}`[]
  if (!termIds.length) return atoms as AtomWithMarketCap[]

  const data = await executeIntuitionQuery<{ vaults?: RawVaultCap[] }>(
    GET_ATOM_MARKETCAPS_QUERY,
    { termIds },
  )

  const vaults = data.vaults ?? []
  const capsByTermId = new Map<string, bigint>()

  for (const v of vaults) {
    const raw = v.market_cap
    if (!raw) continue

    let n: bigint
    try {
      n = BigInt(raw)
    } catch {
      continue
    }

    const key = v.term_id.toLowerCase()
    const prev = capsByTermId.get(key) ?? 0n
    capsByTermId.set(key, prev + n)
  }

  return atoms.map((atom) => {
    const key = atom.term_id.toLowerCase()
    const capWei = capsByTermId.get(key)
    return {
      ...atom,

      total_market_cap: capWei ? capWei.toString() : undefined,
    }
  })
}

export async function searchAtomsByLabel(query: string): Promise<AtomWithMarketCap[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const pattern = `%${trimmed}%`

  const data = await executeIntuitionQuery<{ atoms?: AtomSummary[] }>(
    FIND_ATOMS_BY_LABEL_SEARCH,
    { pattern },
  )

  const atoms = data.atoms ?? []
  return attachAtomMarketCaps(atoms)
}

export async function findAtomByLabel(
  label: string,
): Promise<AtomSummary | null> {
  const trimmed = label.trim()
  if (!trimmed) return null

  const data = await executeIntuitionQuery<{ atoms?: AtomSummary[] }>(
    FIND_ATOM_BY_LABEL_QUERY,
    { label: trimmed },
  )

  const atom = data.atoms?.[0]
  return atom ?? null
}

export async function fetchTrustCardTriples(): Promise<TrustCardTriple[]> {
  const data = await executeIntuitionQuery<{ triples?: RawTriple[] }>(
    GET_TRUSTCARD_TRIPLES_QUERY,
    {
      predicateId: PREDICATE_ID,
      objectId: OBJECT_ID,
    },
  )

  return (data.triples ?? []).map(mapTriple)
}

export async function findTrustCardTriple(
  subject: string,
): Promise<TrustCardTriple | null> {
  const data = await executeIntuitionQuery<{ triples?: RawTriple[] }>(
    FIND_TRUSTCARD_TRIPLE_FOR_SUBJECT_QUERY,
    {
      predicateId: PREDICATE_ID,
      objectId: OBJECT_ID,
      subjectId: subject,
    },
  )

  const t = data.triples?.[0]
  return t ? mapTriple(t) : null
}

export async function ensureIdentityAtom(
  ctx: IntuitionContext,
  label: string,
  _depositAmount?: bigint,
  metadata?: {
    image?: string
    description?: string
    url?: string
    type?: string
  },
): Promise<`0x${string}`> {
  if (!ctx.walletClient.account) {
    throw new Error('Wallet not connected')
  }

  const trimmedLabel = label.trim()
  if (!trimmedLabel) {
    throw new Error('Label cannot be empty.')
  }

  const existing = await findAtomByLabel(trimmedLabel)
  if (existing?.term_id) {
    return existing.term_id
  }

  const multi = getMultiVaultAddressFromChainId(ctx.chainId)
  if (!multi) throw new Error('MultiVault not found')

  const created = await createAtomFromString(
    {
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      address: multi,
    } as any,
    trimmedLabel,
  )

  const termId = (created as any)?.state?.termId as `0x${string}` | undefined
  if (!termId) throw new Error('Failed to get termId')

  return termId
}

export async function ensureTrustCardTriple(
  ctx: IntuitionContext,
  subjectTermId: `0x${string}`,
  depositAmount?: bigint,
): Promise<TrustCardTriple> {
  if (!ctx.walletClient.account) {
    throw new Error('Wallet not connected')
  }

  const existing = await findTrustCardTriple(subjectTermId)
  if (existing) {
    throw new Error('A Claim for this identity already exists.')
  }

  const multi = getMultiVaultAddressFromChainId(ctx.chainId)
  if (!multi) throw new Error('MultiVault not found')

  const stakeAmount = depositAmount ?? 10_000_000_000_000_000n

  await createTriples(
    {
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      address: multi,
    } as any,
    {
      args: [[subjectTermId], [PREDICATE_ID], [OBJECT_ID], [stakeAmount]],
      value: stakeAmount,
    } as any,
  )

  let refreshed: TrustCardTriple | null = null
  for (let i = 0; i < 5; i++) {
    refreshed = await findTrustCardTriple(subjectTermId)
    if (refreshed) break
    await sleep(1200)
  }

  if (!refreshed) {
    throw new Error('Triple creation failed')
  }

  return refreshed
}

export async function buyShares(
  ctx: IntuitionContext,
  vault: VaultSummary,
  amountWei: bigint,
) {
  if (!ctx.walletClient.account) {
    throw new Error('Wallet not connected')
  }

  const multi = getMultiVaultAddressFromChainId(ctx.chainId)
  if (!multi) throw new Error('MultiVault not found')

  const termId = vault.term_id as `0x${string}`
  const curveId = BigInt(2)

  return deposit(
    {
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      address: multi,
    } as any,
    {
      args: [
        ctx.walletClient.account.address,
        termId,
        curveId,
        0n,
      ],
      value: amountWei,
    } as any,
  )
}
