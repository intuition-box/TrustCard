'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useChainId, usePublicClient } from 'wagmi'
import {
  getMultiVaultAddressFromChainId,
  MultiVaultAbi,
} from '@0xintuition/protocol'

import styles from './TrustCardListSection.module.css'
import type { TrustCardTriple, UserStake } from '@/lib/intuition/types'

const PORTAL_ATOM_BASE = 'https://www.portal.intuition.systems/explore/atom/'

interface Props {
  triple: TrustCardTriple
  loading: boolean
  userStake: UserStake
  view: 'list' | 'grid'
  rank: number
  onUpvote: (t: TrustCardTriple, amount: string) => void | Promise<void>
  onDownvote: (t: TrustCardTriple, amount: string) => void | Promise<void>
}

type Side = 'support' | 'oppose'

function IdentityBlock({
  avatar,
  fallbackInitial,
  label,
  supportCap,
  view,
  rank,
  href,
}: {
  avatar?: string | null
  fallbackInitial: string
  label: string
  supportCap: number
  view: 'list' | 'grid'
  rank: number
  href: string
}) {
  const isGrid = view === 'grid'

  const avatarSrc =
    avatar && avatar.startsWith('http') ? avatar : 'default-avatar.png'

  return (
    <div className={styles.identityCol}>
      <div className={styles.identityLeft}>
        <div className={styles.avatar}>
          <Image
            src={avatarSrc}
            alt={label || 'Identity'}
            width={40}
            height={40}
            className={styles.avatarImg}
          />
        </div>
      </div>

      <div className={styles.identityRight}>
        <div className={styles.identityTopRow}>
          <div className={styles.titleBlock}>
            <h3 className={styles.title}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={styles.titleLink}
              >
                {label}
              </a>
            </h3>
            {view === 'list' && (
              <p className={styles.subtitleInline}>
                should be holder of → Trust Card
              </p>
            )}
          </div>

          {!isGrid && (
            <div className={styles.topRightCol}>
              <span className={styles.rankBadgeInline}>#{rank + 1}</span>
              <div className={styles.topCounts}>
                <span className={styles.topCapLabel}>SUPPORT MKT CAP</span>
                <span className={styles.topCapValue}>
                  {supportCap.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}{' '}
                  <span className={styles.topCapUnit}>TRUST</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {isGrid && (
          <p className={styles.subtitle}>
            should be holder of → Trust Card
          </p>
        )}

        {isGrid && (
          <div className={styles.topCountsGridWrapper}>
            <div className={styles.topCounts}>
              <span className={styles.topCapLabel}>SUPPORT MKT CAP</span>
              <span className={styles.topCapValue}>
                {supportCap.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })}{' '}
                <span className={styles.topCapUnit}>TRUST</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function parseTTrustToWeiAllowZero(raw: string): bigint {
  const input = (raw || '').trim() || '0'
  if (!/^\d*\.?\d*$/.test(input)) return 0n

  const [intRaw, fracRaw = ''] = input.split('.')
  const intPart = intRaw || '0'
  const fracPart = (fracRaw + '000000000000000000').slice(0, 18)
  const weiStr = intPart + fracPart

  try {
    return BigInt(weiStr || '0')
  } catch {
    return 0n
  }
}

export default function TrustCardItem({
  triple,
  loading,
  userStake,
  view,
  rank,
  onUpvote,
  onDownvote,
}: Props) {
  const chainId = useChainId()
  const publicClient = usePublicClient()

  const [activeAdjustSide, setActiveAdjustSide] = useState<Side | null>(null)
  const [amountInput, setAmountInput] = useState('0.01')
  const [showDetails, setShowDetails] = useState(false)
  const [previewShares, setPreviewShares] = useState('0.00')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  const subjectLabel = triple.subject.label ?? triple.subject.term_id ?? ''

  const avatar = triple.subject.image || null

  const fallbackInitial =
    (subjectLabel || triple.subject.term_id || '?').trim().slice(0, 2) || '?'

  const supportCap = Number(triple.supportVault?.market_cap ?? 0) / 1e18
  const opposeCap = Number(triple.opposeVault?.market_cap ?? 0) / 1e18

  const supportParticipants = triple.supportVault?.position_count ?? 0
  const opposeParticipants = triple.opposeVault?.position_count ?? 0

  const supportPrice =
    Number(triple.supportVault?.current_share_price ?? 0) / 1e18
  const opposePrice =
    Number(triple.opposeVault?.current_share_price ?? 0) / 1e18

  const supportHasLivePrice =
    !!triple.supportVault && (triple.supportVault.position_count ?? 0) > 0
  const opposeHasLivePrice =
    !!triple.opposeVault && (triple.opposeVault.position_count ?? 0) > 0

  const lockUpvote = userStake.oppose.shares > 0 || userStake.oppose.value > 0
  const lockDownvote =
    userStake.support.shares > 0 || userStake.support.value > 0

  useEffect(() => {
    const runPreview = async () => {
      if (!activeAdjustSide) {
        setPreviewShares('0.00')
        return
      }

      const trimmed = amountInput.trim()
      if (!trimmed || Number(trimmed) <= 0) {
        setPreviewShares('0.00')
        return
      }

      if (!publicClient || !chainId) {
        setPreviewShares('0.00')
        return
      }

      const vault =
        activeAdjustSide === 'support'
          ? triple.supportVault
          : triple.opposeVault
      if (!vault) {
        setPreviewShares('0.00')
        return
      }

      const multi = getMultiVaultAddressFromChainId(chainId)
      if (!multi) {
        setPreviewShares('0.00')
        return
      }

      const assetsWei = parseTTrustToWeiAllowZero(trimmed)
      if (assetsWei <= 0n) {
        setPreviewShares('0.00')
        return
      }

      try {
        setIsPreviewLoading(true)

        const curveId = BigInt(2)

        const [shares] = (await publicClient.readContract({
          address: multi as `0x${string}`,
          abi: MultiVaultAbi as any,
          functionName: 'previewDeposit',
          args: [
            vault.term_id as `0x${string}`,
            curveId,
            assetsWei,
          ],
        } as any)) as [bigint, bigint]

        const sharesNum = Number(shares) / 1e18
        const truncated = Math.floor(sharesNum * 100) / 100
        setPreviewShares(truncated.toFixed(2))
      } catch (e) {
        console.error('previewDeposit failed', e)
        setPreviewShares('0.00')
      } finally {
        setIsPreviewLoading(false)
      }
    }

    void runPreview()
  }, [
    activeAdjustSide,
    amountInput,
    triple.supportVault,
    triple.opposeVault,
    publicClient,
    chainId,
  ])

  const activeHasLivePrice =
    activeAdjustSide === 'support' ? supportHasLivePrice : opposeHasLivePrice

  const activePrice =
    activeAdjustSide === 'support'
      ? supportPrice
      : activeAdjustSide === 'oppose'
        ? opposePrice
        : 0

  const subjectUrl = (triple.subject.url ?? '').trim()
  const subjectHref =
    subjectUrl && !subjectUrl.toLowerCase().endsWith('/null')
      ? subjectUrl
      : `${PORTAL_ATOM_BASE}${triple.subject.term_id}`

  const handleToggleSide = (side: Side) => {
    setActiveAdjustSide((prev) => (prev === side ? null : side))
    setAmountInput('0.01')
    setPreviewShares('0.00')
  }

  const handleConfirm = (side: Side) => {
    if (!amountInput.trim()) return
    if (side === 'support') {
      onUpvote(triple, amountInput)
    } else {
      onDownvote(triple, amountInput)
    }
    setActiveAdjustSide(null)
  }

  const renderDetails = () => (
    <div className={styles.gridDetails}>
      <div className={styles.detailsBar}>
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? 'Hide details' : 'See details'}
        </button>
        <div className={styles.stakeHintsRow}>
          {userStake.support.value > 0 && (
            <span
              className={`${styles.stakeHint} ${styles.stakeHintSupport}`}
            >
              <span className={styles.supportTriangle}>▲ </span>
              Your support: {userStake.support.value.toFixed(3)} TRUST
            </span>
          )}
          {userStake.oppose.value > 0 && (
            <span className={`${styles.stakeHint} ${styles.stakeHintOppose}`}>
              <span className={styles.opposeTriangle}>▼ </span>
              Your oppose: {userStake.oppose.value.toFixed(3)} TRUST
            </span>
          )}
        </div>
      </div>

      {showDetails && (
        <div className={styles.marketCaps}>
          <div className={styles.pillColumn}>
            <span className={styles.pillLabel}>Total Support Mkt Cap</span>
            <span className={styles.supportPill}>
              {supportCap.toLocaleString(undefined, {
                maximumFractionDigits: 3,
                minimumFractionDigits: 3,
              })}{' '}
              TRUST
            </span>
          </div>
          <div className={styles.pillColumn}>
            <span className={styles.pillLabel}>Total Oppose Mkt Cap</span>
            <span className={styles.opposePill}>
              {opposeCap.toLocaleString(undefined, {
                maximumFractionDigits: 3,
                minimumFractionDigits: 3,
              })}{' '}
              TRUST
            </span>
          </div>
        </div>
      )}
    </div>
  )

  const renderVoteRow = () => {
    const rowClass = view === 'list' ? styles.voteRowList : styles.voteRow

    const priceText = (() => {
      if (!activeAdjustSide) return ''
      if (!activeHasLivePrice) return 'No price yet'
      if (activePrice > 0) return `${activePrice.toFixed(2)} TRUST`
      return '--'
    })()

    const sharesText = (() => {
      if (isPreviewLoading) return '…'
      if (previewShares === '0.00') return '- shares'
      return `${previewShares} shares`
    })()

    return (
      <>
        <div className={rowClass}>
          <div
            className={
              activeAdjustSide === 'support'
                ? `${styles.voteClusterColumn} ${styles.voteClusterColumnActive}`
                : styles.voteClusterColumn
            }
          >
            <button
              type="button"
              disabled={
                loading || lockUpvote || activeAdjustSide === 'oppose'
              }
              onClick={() => handleToggleSide('support')}
              className={styles.btnUp}
            >
              <span>▲ Upvote</span>
              <span
                className={`${styles.btnStat} ${styles.btnStatSupport}`}
              >
                <span
                  className={styles.personIcon}
                  aria-hidden="true"
                />
                {supportParticipants}
              </span>
            </button>
          </div>

          <div className={styles.voteGap} />

          <div
            className={
              activeAdjustSide === 'oppose'
                ? `${styles.voteClusterColumn} ${styles.voteClusterColumnActive}`
                : styles.voteClusterColumn
            }
          >
            <button
              type="button"
              disabled={
                loading || lockDownvote || activeAdjustSide === 'support'
              }
              onClick={() => handleToggleSide('oppose')}
              className={styles.btnDown}
            >
              <span>▼ Downvote</span>
              <span
                className={`${styles.btnStat} ${styles.btnStatOppose}`}
              >
                <span
                  className={styles.personIcon}
                  aria-hidden="true"
                />
                {opposeParticipants}
              </span>
            </button>
          </div>
        </div>

        {activeAdjustSide && (
          <div className={styles.adjustRowFull}>
            <span className={styles.priceTag}>
              Actual{' '}
              {activeAdjustSide === 'support' ? 'Support' : 'Oppose'} Price/Share:{' '}
              {priceText}
            </span>

            <input
              type="number"
              min="0"
              step="0.001"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className={styles.amountInput}
            />

            <span className={styles.voteAmount}>{sharesText}</span>
            <button
              type="button"
              className={styles.withdrawBtn}
              disabled={loading || !amountInput.trim()}
              onClick={() => handleConfirm(activeAdjustSide)}
            >
              Confirm
            </button>
          </div>
        )}
      </>
    )
  }

  const isGrid = view === 'grid'

  return (
    <article
      className={`${styles.card} ${
        view === 'list' ? styles.cardList : styles.cardGrid
      }`}
    >
      {isGrid && (
        <span className={styles.rankBadge} aria-label={`Rank ${rank + 1}`}>
          #{rank + 1}
        </span>
      )}

      {view === 'list' ? (
        <div className={styles.listRow}>
          <div className={styles.identityWrapper}>
            <IdentityBlock
              avatar={avatar}
              fallbackInitial={fallbackInitial}
              label={subjectLabel}
              supportCap={supportCap}
              view={view}
              rank={rank}
              href={subjectHref}
            />
          </div>

          <div className={styles.rightCol}>
            {renderVoteRow()}
            {renderDetails()}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.listRowGrid}>
            <IdentityBlock
              avatar={avatar}
              fallbackInitial={fallbackInitial}
              label={subjectLabel}
              supportCap={supportCap}
              view={view}
              rank={rank}
              href={subjectHref}
            />
            <div className={styles.sectionDivider} />
          </div>

          {renderVoteRow()}
          {renderDetails()}
        </>
      )}
    </article>
  )
}
