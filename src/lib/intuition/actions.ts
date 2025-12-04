import type { PublicClient, WalletClient } from 'viem'
import { createAtomFromIpfsUri } from '@0xintuition/sdk'
import {
  getMultiVaultAddressFromChainId,
  deposit,
  createTriples,
  getTripleCost,
} from '@0xintuition/protocol'

import {
  FIND_ATOM_BY_LABEL_QUERY,
  FIND_ATOMS_BY_LABEL_SEARCH,
  GET_ATOM_MARKETCAPS_QUERY,
  GET_TRUSTCARD_TRIPLES_QUERY,
  FIND_TRUSTCARD_TRIPLE_FOR_SUBJECT_QUERY,
  PIN_PERSON_MUTATION,
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

interface RawAtomSummary extends AtomSummary {
  value?: {
    person?: { url?: string | null }
    organization?: { url?: string | null }
    thing?: { url?: string | null }
  }
}

interface RawTriple {
  term_id: `0x${string}`
  subject: RawAtomSummary
  predicate: RawAtomSummary
  object: RawAtomSummary
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

function extractAtomUrl(atom?: RawAtomSummary): string | null {
  if (!atom?.value) return null
  const raw =
    atom.value.person?.url ??
    atom.value.organization?.url ??
    atom.value.thing?.url ??
    null

  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  if (trimmed.toLowerCase().endsWith('/null')) return null
  if (trimmed.toLowerCase().includes('trustcard.box/null')) return null

  return trimmed
}

function mapTriple(raw: RawTriple): TrustCardTriple {
  const termVaults = raw.term?.vaults ?? []
  const counterVaults = raw.counter_term?.vaults ?? []

  const supportRaw = pickCurveVault(termVaults)
  const opposeRaw = pickCurveVault(counterVaults)

  const supportVault = mapVault(supportRaw)
  const opposeVault = mapVault(opposeRaw)

  const subject: AtomSummary = {
    term_id: raw.subject.term_id,
    label: raw.subject.label,
    image: raw.subject.image,
    url: extractAtomUrl(raw.subject),
  }

  return {
    term_id: raw.term_id,
    subject,
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

  const variables = {
    name: trimmedLabel,
    description: metadata?.description || null,
    image: metadata?.image || null, // base64 data URL venant du file input
    url: metadata?.url || null,
    email: null as string | null,
    identifier: null as string | null,
  }

  const pinResult = await executeIntuitionQuery<{
    pinPerson?: { uri?: string | null }
  }>(PIN_PERSON_MUTATION, variables)

  const ipfsUriRaw = pinResult.pinPerson?.uri

  if (!ipfsUriRaw || typeof ipfsUriRaw !== 'string') {
    throw new Error('Failed to pin Person metadata to IPFS.')
  }

  if (!ipfsUriRaw.startsWith('ipfs://')) {
    throw new Error(`Unexpected IPFS URI returned: ${ipfsUriRaw}`)
  }

  const ipfsUri = ipfsUriRaw as `ipfs://${string}`

  // 4) Création de l'atome à partir de l'URI IPFS
  const created = await createAtomFromIpfsUri(
    {
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      address: multi,
    } as any,
    ipfsUri,
    _depositAmount,
  )

  const termId = (created as any)?.state?.termId as `0x${string}` | undefined
  if (!termId) throw new Error('Failed to get termId from atom creation')

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

  const tripleCost = await getTripleCost({
    address: multi,
    publicClient: ctx.publicClient,
  } as any)

  const amountForCreation = tripleCost

  await createTriples(
    {
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      address: multi,
    } as any,
    {
      args: [[subjectTermId], [PREDICATE_ID], [OBJECT_ID], [amountForCreation]],
      value: amountForCreation,
    } as any,
  )

  let triple: TrustCardTriple | null = null
  for (let i = 0; i < 5; i++) {
    triple = await findTrustCardTriple(subjectTermId)
    if (triple) break
    await sleep(1200)
  }

  if (!triple) {
    throw new Error('Triple creation failed')
  }

  const stakeAmount =
    depositAmount && depositAmount > 0n
      ? depositAmount
      : 10_000_000_000_000_000n

  if (stakeAmount > 0n) {
    await deposit(
      {
        walletClient: ctx.walletClient,
        publicClient: ctx.publicClient,
        address: multi,
      } as any,
      {
        args: [
          ctx.walletClient.account.address,
          triple.term_id as `0x${string}`,
          BigInt(2),
          0n,
        ],
        value: stakeAmount,
      } as any,
    )

    let withStake: TrustCardTriple | null = null
    for (let i = 0; i < 5; i++) {
      withStake = await findTrustCardTriple(subjectTermId)
      if (withStake?.supportVault) break
      await sleep(1200)
    }

    return withStake ?? triple
  }

  return triple
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
