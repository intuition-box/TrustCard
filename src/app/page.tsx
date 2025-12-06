'use client'

import { useEffect, useState } from 'react'
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from 'wagmi'
import { useGetPositionsQuery } from '@0xintuition/graphql'

import styles from './page.module.css'
import { WalletConnection } from '@/components/WalletConnection'
import CreateIdentityModal from '@/components/CreateIdentityModal'
import CreateTripleModal from '@/components/CreateTripleModal'
import CreateClaimStartModal from '@/components/CreateClaimStartModal'
import TrustCardListSection from '@/components/TrustCardListSection'
import Notification, { NotificationContainer } from '@/components/Notification'

import type { TrustCardTriple, UserStake } from '@/lib/intuition/types'
import {
  type IntuitionContext,
  fetchTrustCardTriples,
  ensureIdentityAtom,
  ensureTrustCardTriple,
  buyShares,
  countUniqueVotersForVaults,
} from '@/lib/intuition/actions'
import {
  calcStake,
  parseTTrustToWei,
  parseTTrustToWeiAllowZero,
  parseAmountToNumber,
} from '@/lib/intuition/utils'
import { useWaveTimer } from '@/hooks/useWaveTimer'
import { intuitionMainnet } from '@/lib/wagmiConfig'

const MIN_TRUST_WEI = 10_000_000_000_000_000n // 0.01
const VOTE_UNIT = Number(MIN_TRUST_WEI) / 1e18

const WAVE_1_END = new Date('2025-12-07T00:00:00Z').getTime()

type StakeMap = Record<string, UserStake>

export default function TrustCardVotePage() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [triples, setTriples] = useState<TrustCardTriple[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [uniqueVoterCount, setUniqueVoterCount] = useState<number | null>(null)
  const [isStatsLoading, setIsStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  type Toast = { id: number; type: 'success' | 'error'; message: string }
  const [toasts, setToasts] = useState<Toast[]>([])

  function showNotification(type: 'success' | 'error', message: string) {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, type, message }])
  }

  function removeNotification(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const [search, setSearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isTripleModalOpen, setIsTripleModalOpen] = useState(false)
  const [isStartModalOpen, setIsStartModalOpen] = useState(false)
  const [pendingSubject, setPendingSubject] = useState<{
    termId: `0x${string}` | null
    label: string
  }>({ termId: null, label: '' })
  const [prefillLabel, setPrefillLabel] = useState('')
  const [isCreateBusy, setIsCreateBusy] = useState(false)

  const [workingTripleId, setWorkingTripleId] = useState<string | null>(null)
  const [userStakes, setUserStakes] = useState<StakeMap>({})

  const timeLeft = useWaveTimer(WAVE_1_END)

  function getContextOrError(action: string): IntuitionContext | null {
    if (!walletClient || !publicClient || !chainId) {
      setError(`Connect your wallet to the Intuition Mainnet to ${action}.`)
      return null
    }

    if (chainId !== intuitionMainnet.id) {
      setError(
        `Wrong network: you are on chain id ${chainId}, please switch your wallet to Intuition Mainnet (chain id ${intuitionMainnet.id}) to ${action}.`,
      )
      return null
    }

    return { walletClient, publicClient, chainId }
  }

  async function reloadTriples() {
    try {
      setIsLoadingList(true)
      setIsStatsLoading(true)
      const data = await fetchTrustCardTriples()
      setTriples(data)

      const vaultIds = data
        .flatMap((t) => [t.supportVault?.term_id, t.opposeVault?.term_id])
        .filter((id): id is `0x${string}` => Boolean(id))
      const uniqueVaultIds = [...new Set(vaultIds)]

      const voters = uniqueVaultIds.length
        ? await countUniqueVotersForVaults(uniqueVaultIds)
        : 0

      setUniqueVoterCount(voters)
    } catch (err) {
      console.error(err)
      setError('Error while loading the list.')
      setUniqueVoterCount(null)
    } finally {
      setIsStatsLoading(false)
      setIsLoadingList(false)
    }
  }

  useEffect(() => {
    void reloadTriples()
  }, [])

  const lowerAddress = address?.toLowerCase()
  const positionsVariables = address
    ? {
        where: {
          _or: [
            { account_id: { _eq: address } },
            { account_id: { _eq: lowerAddress } },
            { account_id: { _ilike: lowerAddress } },
          ],
        },
        limit: 200,
      }
    : undefined

  const {
    data: positionsData,
    refetch: refetchPositions,
    isLoading: positionsLoading,
  } = useGetPositionsQuery(positionsVariables, {
    enabled: Boolean(lowerAddress),
  })

  useEffect(() => {
    if (!positionsData) return

    const stakes: StakeMap = {}
    const tripleById = new Map(triples.map((t) => [t.term_id, t]))

    for (const pos of positionsData.positions ?? []) {
      const vaultId = pos.vault?.term_id as `0x${string}` | undefined
      const shares = Number(pos.shares ?? 0) / 1e18
      if (!vaultId || shares <= 0) continue

      const tripleFromVault =
        [...tripleById.values()].find(
          (t) =>
            t.supportVault?.term_id === vaultId ||
            t.opposeVault?.term_id === vaultId,
        ) ?? null
      if (!tripleFromVault) continue

      const tripleId = tripleFromVault.term_id

      const targetVault =
        vaultId === tripleFromVault.supportVault?.term_id
          ? tripleFromVault.supportVault
          : vaultId === tripleFromVault.opposeVault?.term_id
            ? tripleFromVault.opposeVault
            : undefined
      if (!targetVault) continue

      const { value, shares: normShares } = calcStake(
        targetVault,
        pos.shares,
      )

      const isSupport = vaultId === tripleFromVault.supportVault?.term_id
      const current =
        stakes[tripleId] ??
        {
          support: { value: 0, shares: 0 },
          oppose: { value: 0, shares: 0 },
        }

      stakes[tripleId] = {
        support: isSupport
          ? { value, shares: normShares }
          : current.support,
        oppose: !isSupport
          ? { value, shares: normShares }
          : current.oppose,
      }
    }

    setUserStakes(stakes)
  }, [positionsData, triples])

  async function refreshStakeForTriple(
    triple: TrustCardTriple,
  ): Promise<UserStake | undefined> {
    const res = await refetchPositions()
    const latest = res.data?.positions ?? []

    let stake: UserStake | undefined

    for (const pos of latest) {
      const vaultId = pos.vault?.term_id as `0x${string}` | undefined
      const shares = Number(pos.shares ?? 0) / 1e18
      if (!vaultId || shares <= 0) continue

      const isSameTriple =
        vaultId === triple.supportVault?.term_id ||
        vaultId === triple.opposeVault?.term_id
      if (!isSameTriple) continue

      const targetVault =
        vaultId === triple.supportVault?.term_id
          ? triple.supportVault
          : vaultId === triple.opposeVault?.term_id
            ? triple.opposeVault
            : undefined
      if (!targetVault) continue

      const { value, shares: normShares } = calcStake(
        targetVault,
        pos.shares,
      )

      const isSupport = vaultId === triple.supportVault?.term_id
      const current =
        stake ??
        {
          support: { value: 0, shares: 0 },
          oppose: { value: 0, shares: 0 },
        }

      stake = {
        support: isSupport
          ? { value, shares: normShares }
          : current.support,
        oppose: !isSupport
          ? { value, shares: normShares }
          : current.oppose,
      }
    }

    if (stake) {
      setUserStakes((prev) => ({ ...prev, [triple.term_id]: stake }))
    }

    return stake
  }

  function bumpStake(
    tripleId: string,
    side: 'support' | 'oppose',
    deltaValue: number,
    deltaShares = 0,
  ) {
    const hasDeltaValue = Number.isFinite(deltaValue) && deltaValue !== 0
    const hasDeltaShares = Number.isFinite(deltaShares) && deltaShares !== 0
    if (!hasDeltaValue && !hasDeltaShares) return

    setUserStakes((prev) => {
      const current =
        prev[tripleId] ??
        {
          support: { value: 0, shares: 0 },
          oppose: { value: 0, shares: 0 },
        }

      const next: UserStake = {
        support:
          side === 'support'
            ? {
                value: Math.max(0, current.support.value + (deltaValue || 0)),
                shares: Math.max(
                  0,
                  current.support.shares + (deltaShares || 0),
                ),
              }
            : current.support,
        oppose:
          side === 'oppose'
            ? {
                value: Math.max(0, current.oppose.value + (deltaValue || 0)),
                shares: Math.max(
                  0,
                  current.oppose.shares + (deltaShares || 0),
                ),
              }
            : current.oppose,
      }

      return { ...prev, [tripleId]: next }
    })
  }

  function bumpTripleVotes(
    tripleId: string,
    side: 'support' | 'oppose',
    deltaCount: number,
  ) {
    if (!Number.isFinite(deltaCount) || deltaCount === 0) return

    setTriples((prev) =>
      prev.map((t) => {
        if (t.term_id !== tripleId) return t

        if (side === 'support' && t.supportVault) {
          return {
            ...t,
            supportVault: {
              ...t.supportVault,
              position_count: Math.max(
                0,
                (t.supportVault.position_count ?? 0) + deltaCount,
              ),
            },
          }
        }

        if (side === 'oppose' && t.opposeVault) {
          return {
            ...t,
            opposeVault: {
              ...t.opposeVault,
              position_count: Math.max(
                0,
                (t.opposeVault.position_count ?? 0) + deltaCount,
              ),
            },
          }
        }

        return t
      }),
    )
  }

  async function handleCreateIdentity(form: {
    label: string
    image?: string
    description?: string
    url?: string
    type?: string
    deposit: string
  }) {
    if (!isConnected) {
      throw new Error('Connect your wallet first to create an identity.')
    }

    const ctx = getContextOrError('create an identity')
    if (!ctx) {
      throw new Error(
        'Connect your wallet to the Intuition Mainnet before creating an identity.',
      )
    }

    try {
      setIsCreateBusy(true)

      const depositWei = parseTTrustToWeiAllowZero(form.deposit)
      const subjectTermId = await ensureIdentityAtom(
        ctx,
        form.label,
        depositWei,
        {
          image: form.image,
          description: form.description,
          url: form.url,
          type: form.type,
        },
      )

      setPendingSubject({ termId: subjectTermId, label: form.label })
      setIsTripleModalOpen(true)

      showNotification('success', `Identity "${form.label}" ready.`)
    } catch (err: any) {
      showNotification('error', err?.message ?? 'Failed to create identity.')
      throw err
    } finally {
      setIsCreateBusy(false)
    }
  }

  function openCreateModal() {
    setError(null)
    setIsStartModalOpen(true)
  }

  function closeCreateModal() {
    if (isCreateBusy) return
    setIsCreateModalOpen(false)
    setPrefillLabel('')
  }

  function closeTripleModal() {
    if (isCreateBusy) return
    setIsTripleModalOpen(false)
    setPendingSubject({ termId: null, label: '' })
  }

  function handleUseExisting(label: string, termId: `0x${string}`) {
    setPendingSubject({ termId, label })
    setIsStartModalOpen(false)
    setIsTripleModalOpen(true)
  }

  function handleCreateNew(label: string) {
    setPrefillLabel(label)
    setIsStartModalOpen(false)
    setIsCreateModalOpen(true)
  }

  function closeStartModal() {
    if (isCreateBusy) return
    setIsStartModalOpen(false)
  }

  async function handleCreateTriple(deposit: string) {
    const subjectId = pendingSubject.termId
    if (!subjectId) {
      setError('Subject not ready, retry creation.')
      return
    }

    const ctx = getContextOrError('create a triple')
    if (!ctx) return

    try {
      setIsCreateBusy(true)
      const depositWei = parseTTrustToWeiAllowZero(deposit)
      await ensureTrustCardTriple(ctx, subjectId, depositWei)
      await reloadTriples()
      showNotification('success', 'Claim created successfully.')
    } catch (err: any) {
      console.error(err)
      const msg = String(err?.message ?? '')

      if (msg.includes('MultiVault_InsufficientBalance')) {
        const friendly =
          'MultiVault reports insufficient balance to seed this Claim. Make sure you have enough native TRUST on Intuition Mainnet for the chosen amount (plus gas).'
        setError(friendly)
        showNotification('error', friendly)
      } else {
        showNotification('error', err?.message ?? 'Failed to create claim.')
      }
    } finally {
      setIsCreateBusy(false)
      closeTripleModal()
    }
  }

  async function handleUpvote(triple: TrustCardTriple, amount: string) {
    setError(null)

    if (lowerAddress && positionsLoading) {
      setError(
        'Your on-chain positions are still loading. Please try again in a moment.',
      )
      return
    }

    if (!isConnected) {
      setError('Connect your wallet first to vote.')
      return
    }

    const vault = triple.supportVault
    if (!vault) {
      setError('Support vault not found for this triple.')
      return
    }

    const currentStake =
      userStakes[triple.term_id] ?? (await refreshStakeForTriple(triple))

    if (currentStake?.oppose && currentStake.oppose.value > 0) {
      setError(
        'You already opposed this triple. Sell/withdraw that position before upvoting.',
      )
      return
    }

    const ctx = getContextOrError('trade')
    if (!ctx) return

    try {
      setWorkingTripleId(triple.term_id)

      const wei = parseTTrustToWei(amount)
      if (wei < MIN_TRUST_WEI) {
        throw new Error('Minimum amount is 0.01 TRUST.')
      }
      const amountNum = parseAmountToNumber(amount)

      await buyShares(ctx, vault, wei)

      const price =
        Number(triple.supportVault?.current_share_price ?? 0) / 1e18
      const mintedShares = price > 0 ? amountNum / price : amountNum

      bumpStake(triple.term_id, 'support', amountNum, mintedShares)
      bumpTripleVotes(
        triple.term_id,
        'support',
        Math.max(1, Math.floor(amountNum / VOTE_UNIT)),
      )

      await reloadTriples()
      await refetchPositions()
      showNotification('success', 'Your support position was submitted.')
    } catch (err: any) {
      console.error(err)
      const message = err?.message ?? ''
      if (message.includes('MultiVault_HasCounterStake')) {
        const m =
          'You already hold a position on the opposite side. Sell/withdraw it before upvoting.'
        setError(m)
        showNotification('error', m)
      } else if (message.includes('MultiVault_InsufficientBalance')) {
        const friendly =
          'MultiVault reports insufficient balance to buy this position. Make sure you have enough native TRUST on Intuition Mainnet for the chosen amount (plus gas).'
        setError(friendly)
        showNotification('error', friendly)
      } else {
        const fallback = message || 'Error while sending your upvote.'
        setError(fallback)
        showNotification('error', fallback)
      }
    } finally {
      setWorkingTripleId(null)
    }
  }

  async function handleDownvote(triple: TrustCardTriple, amount: string) {
    setError(null)

    if (lowerAddress && positionsLoading) {
      setError(
        'Your on-chain positions are still loading. Please try again in a moment.',
      )
      return
    }

    if (!isConnected) {
      setError('Connect your wallet first to vote.')
      return
    }

    const vault = triple.opposeVault
    if (!vault) {
      setError('Oppose vault not found for this triple.')
      return
    }

    const currentStake =
      userStakes[triple.term_id] ?? (await refreshStakeForTriple(triple))

    if (currentStake?.support && currentStake.support.value > 0) {
      setError(
        'You already supported this triple. Sell/withdraw that position before downvoting.',
      )
      return
    }

    const ctx = getContextOrError('trade')
    if (!ctx) return

    try {
      setWorkingTripleId(triple.term_id)

      const wei = parseTTrustToWei(amount)
      if (wei < MIN_TRUST_WEI) {
        throw new Error('Minimum amount is 0.01 TRUST.')
      }
      const amountNum = parseAmountToNumber(amount)

      await buyShares(ctx, vault, wei)

      const price =
        Number(triple.opposeVault?.current_share_price ?? 0) / 1e18
      const mintedShares = price > 0 ? amountNum / price : amountNum

      bumpStake(triple.term_id, 'oppose', amountNum, mintedShares)
      bumpTripleVotes(
        triple.term_id,
        'oppose',
        Math.max(1, Math.floor(amountNum / VOTE_UNIT)),
      )

      await reloadTriples()
      await refetchPositions()
      showNotification('success', 'Your oppose position was submitted.')
    } catch (err: any) {
      console.error(err)
      const message = err?.message ?? ''
      if (message.includes('MultiVault_HasCounterStake')) {
        const m =
          'You already hold a position on the opposite side. Sell/withdraw it before downvoting.'
        setError(m)
        showNotification('error', m)
      } else if (message.includes('MultiVault_InsufficientBalance')) {
        const friendly =
          'MultiVault reports insufficient balance to buy this position. Make sure you have enough native TRUST on Intuition Mainnet for the chosen amount (plus gas).'
        setError(friendly)
        showNotification('error', friendly)
      } else {
        const fallback = message || 'Error while sending your downvote.'
        setError(fallback)
        showNotification('error', fallback)
      }
    } finally {
      setWorkingTripleId(null)
    }
  }

  const displayTimeLeft =
    timeLeft.days > 0 || timeLeft.hours > 0 || timeLeft.minutes > 0
      ? `${timeLeft.days}d ${timeLeft.hours}h ${timeLeft.minutes}m`
      : `${timeLeft.seconds}s`

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.hero}>
          <div className={styles.heroTopRow}>
            <div className={styles.tagRow}>
              <div className={styles.waveItem}>
                <span className={styles.waveDotActive} />
                <span className={styles.waveLabel}>Wave 1</span>
              </div>
              <div className={styles.waveItem}>
                <span className={styles.waveDotIdle} />
                <span className={styles.waveLabel}>Wave 2</span>
              </div>
              <div className={styles.waveItem}>
                <span className={styles.waveDotIdle} />
                <span className={styles.waveLabel}>Wave 3</span>
              </div>
            </div>

            <div className={styles.heroWallet}>
              <WalletConnection />
            </div>
          </div>

          <div className={styles.heroContent}>
            <h1 className={styles.heroHeading}>
              Vote for the firsts 100 <span>Trust Card holders</span>
            </h1>

            <p className={styles.heroSubtitle}>
              The Intuition community signals who truly deserves the first Trust Cards.
            </p>

            <div className={styles.heroMeta}>
              <div className={styles.timerBlock}>
                {/* <span className={styles.metaLabel}>Time left (Current Wave)</span> */}
                {/* <span className={styles.timerValue}>{displayTimeLeft}</span> */}
              </div>
            </div>

            <div className={styles.heroActions}>
              <a
                href="https://docs.trustcard.box/"
                target="_blank"
                rel="noreferrer"
                className={styles.heroCTA}
              >
                Trust Card Docs
              </a>
            </div>

            <div className={styles.heroStats}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Total Contenders</span>
                <span className={styles.statValue}>
                  {isLoadingList ? '…' : triples.length.toLocaleString()}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Voters</span>
                <span className={styles.statValue}>
                  {isStatsLoading
                    ? '…'
                    : uniqueVoterCount !== null
                      ? uniqueVoterCount.toLocaleString()
                      : 'N/A'}
                </span>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}
          </div>
        </div>
      </header>

      <section>
        {!isLoadingList && (
          <TrustCardListSection
            triples={triples}
            filter={search}
            onFilterChange={setSearch}
            onAddNew={openCreateModal}
            workingId={workingTripleId}
            userStakes={userStakes}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
          />
        )}
        {isLoadingList && (
          <div className={styles.listHeaderRow}>
            <span className={styles.loadingText}>Loading…</span>
          </div>
        )}
      </section>

      <CreateClaimStartModal
        open={isStartModalOpen}
        predicateLabel="should be holder of"
        objectLabel="Trust Card"
        onClose={closeStartModal}
        onUseExisting={handleUseExisting}
        onCreateNew={handleCreateNew}
      />
      <CreateIdentityModal
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        onConfirm={handleCreateIdentity}
        defaultLabel={prefillLabel}
      />
      <CreateTripleModal
        open={isTripleModalOpen}
        subjectLabel={pendingSubject.label}
        predicateLabel="should be holder of"
        objectLabel="Trust Card"
        onClose={closeTripleModal}
        onConfirm={handleCreateTriple}
      />

      <NotificationContainer>
        {toasts.map((t) => (
          <Notification
            key={t.id}
            type={t.type}
            message={t.message}
            onClose={() => removeNotification(t.id)}
          />
        ))}
      </NotificationContainer>
    </main>
  )
}
