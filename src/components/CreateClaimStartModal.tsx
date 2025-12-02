'use client'

import { useState, useEffect } from 'react'
import styles from './CreateIdentityModal.module.css'
import { searchAtomsByLabel } from '@/lib/intuition/actions'
import type { AtomWithMarketCap } from '@/lib/intuition/types'

interface Props {
  open: boolean
  predicateLabel: string
  objectLabel: string
  onClose: () => void
  onUseExisting: (label: string, termId: `0x${string}`) => void
  onCreateNew: (label: string) => void
}

function formatMarketCap(weiStr?: string | null): string {
  if (!weiStr) return 'Market cap: —'

  let wei: bigint
  try {
    wei = BigInt(weiStr)
  } catch {
    return 'Market cap: —'
  }

  if (wei === 0n) return 'Market cap: 0 TRUST'

  const trust = Number(wei) / 1e18
  if (!Number.isFinite(trust)) return 'Market cap: —'

  let display: string
  let suffix = ''

  if (trust >= 1_000_000) {
    display = (trust / 1_000_000).toFixed(2)
    suffix = 'M'
  } else if (trust >= 1_000) {
    display = (trust / 1_000).toFixed(2)
    suffix = 'k'
  } else {
    display = trust.toFixed(2)
  }

  return `Market cap: ${display}${suffix} TRUST`
}

export default function CreateClaimStartModal({
  open,
  predicateLabel,
  objectLabel,
  onClose,
  onUseExisting,
  onCreateNew,
}: Props) {
  const [subject, setSubject] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<AtomWithMarketCap[]>([])
  const [selectedAtom, setSelectedAtom] = useState<AtomWithMarketCap | null>(null)

  useEffect(() => {
    if (!open) {
      setSubject('')
      setStatus(null)
      setLoading(false)
      setSuggestions([])
      setSelectedAtom(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const trimmed = subject.trim()

    if (!trimmed) {
      setStatus(null)
      setSuggestions([])
      setSelectedAtom(null)
      return
    }

    if (trimmed.length < 2) {
      setStatus('Type at least 2 characters to search.')
      setSuggestions([])
      setSelectedAtom(null)
      return
    }

    const timer = setTimeout(() => {
      setStatus('Searching on Intuition…')
      setLoading(true)

      searchAtomsByLabel(trimmed)
        .then((atoms) => {
          setSuggestions(atoms)

          if (atoms.length === 0) {
            setStatus('No matching identities found yet. You can create a new one.')
          } else if (atoms.length === 1) {
            setStatus('1 identity found on Intuition.')
          } else {
            setStatus(`${atoms.length} identities found on Intuition.`)
          }
        })
        .catch((err: any) => {
          console.error(err)
          setSuggestions([])
          setSelectedAtom(null)
          setStatus(err?.message ?? 'Search failed.')
        })
        .finally(() => setLoading(false))
    }, 400)

    return () => clearTimeout(timer)
  }, [subject, open])

  if (!open) return null

  const trimmedSubject = subject.trim()
  const canContinue = !!trimmedSubject && !loading

  // Si un atome a été explicitement sélectionné on le privilégie
  const exactMatchFromList = suggestions.find(
    (atom) =>
      atom.label &&
      atom.label.toLowerCase() === trimmedSubject.toLowerCase(),
  )

  const activeMatch = selectedAtom ?? exactMatchFromList ?? null

  const isExisting = Boolean(activeMatch?.term_id)
  const isNeutralInfo = !!status && !status.toLowerCase().includes('failed')
  const statusClass = isNeutralInfo ? styles.helper : styles.error

  function handlePickSuggestion(atom: AtomWithMarketCap) {
    if (!atom.label) return
    setSubject(atom.label)
    setSelectedAtom(atom)
  }

  function handleChangeSubject(value: string) {
    setSubject(value)
    // Dès que l’utilisateur retape, on oublie le choix précédent
    setSelectedAtom(null)
  }

  function handleContinueExisting() {
    if (!activeMatch?.term_id || !activeMatch.label) return
    onUseExisting(activeMatch.label, activeMatch.term_id as `0x${string}`)
  }

  return (
    <div className={styles.overlay}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </button>

        <div className={styles.modalHeaderRow}>
          <span className={styles.stepPill}>Step 1 · Choose identity</span>
        </div>

        <div className={styles.summaryBox}>
          <div className={styles.summaryChain}>
            <span className={styles.summaryValue}>{trimmedSubject || '—'}</span>
            <span className={styles.summarySeparator}>→</span>
            <span className={styles.summaryValue}>{predicateLabel}</span>
            <span className={styles.summarySeparator}>→</span>
            <span className={styles.summaryValue}>{objectLabel}</span>
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <span className={styles.sectionTitle}>Subject identity</span>
            <span className={styles.sectionHint}></span>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Identity label</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => handleChangeSubject(e.target.value)}
              disabled={loading}
              placeholder="Search"
              className={styles.input}
            />
          </label>

          {status && <p className={statusClass}>{status}</p>}

          {suggestions.length > 0 && (
            <ul className={styles.suggestionsList}>
              {suggestions.map((atom) => {
                const isSelected =
                  selectedAtom?.term_id === atom.term_id

                return (
                  <li key={atom.term_id} className={styles.suggestionItem}>
                    <button
                      type="button"
                      className={
                        isSelected
                          ? `${styles.suggestionButton} ${styles.suggestionButtonSelected}`
                          : styles.suggestionButton
                      }
                      onClick={() => handlePickSuggestion(atom)}
                    >
                      <div className={styles.suggestionAvatar}>
                        {atom.image ? (
                          <img src={atom.image} alt={atom.label ?? 'Identity'} />
                        ) : (
                          <span className={styles.suggestionInitial}>
                            {(atom.label || '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className={styles.suggestionContent}>
                        <div className={styles.suggestionLabel}>
                          {atom.label || 'Unnamed atom'}
                        </div>
                        <div className={styles.suggestionMeta}>
                          {formatMarketCap(atom.total_market_cap)}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {isExisting && (
            <div className={styles.suggestionPill}>
              <span className={styles.suggestionDot} />
              Identity “{activeMatch?.label}” already exists — you can use it
              directly.
            </div>
          )}
        </div>

        <div className={styles.buttonsRow}>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className={styles.back}
          >
            Back
          </button>

          {isExisting ? (
            <button
              type="button"
              disabled={!canContinue}
              onClick={handleContinueExisting}
              className={styles.confirm}
            >
              Next · Create Claim
            </button>
          ) : (
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => onCreateNew(trimmedSubject)}
              className={styles.confirm}
            >
              Create new identity
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
