'use client'

import { useState } from 'react'
import styles from './CreateIdentityModal.module.css'

interface Props {
  open: boolean
  subjectLabel: string
  predicateLabel: string
  objectLabel: string
  onClose: () => void
  onConfirm: (deposit: string) => Promise<void> | void
}

export default function CreateTripleModal({
  open,
  subjectLabel,
  predicateLabel,
  objectLabel,
  onClose,
  onConfirm,
}: Props) {
  const [deposit, setDeposit] = useState('0.01')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const trimmedDeposit = deposit.trim()
  const numericDeposit = Number(trimmedDeposit)
  const isValidDeposit =
    trimmedDeposit !== '' && !Number.isNaN(numericDeposit) && numericDeposit > 0

  async function handleSubmit() {
    setError(null)

    if (!isValidDeposit) {
      setError('Stake must be greater than 0.')
      return
    }

    setLoading(true)
    try {
      await onConfirm(trimmedDeposit)
      setDeposit('0.01')
    } catch (err: any) {
      console.error(err)
      setError(err?.message ?? 'Failed to create triple.')
    } finally {
      setLoading(false)
    }
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
          <span className={styles.stepPill}>Step 2 · Seed the Claim</span>
          <h2 className={styles.title}>Create Trust Card</h2>
          <p className={styles.muted}>
            Choose how much TRUST you want to stake on this Claim.
          </p>
        </div>

        <div className={styles.summaryBox}>
          <div className={styles.summaryChain}>
            <span className={styles.summaryValue}>{subjectLabel}</span>
            <span className={styles.summarySeparator}>→</span>
            <span className={styles.summaryValue}>{predicateLabel}</span>
            <span className={styles.summarySeparator}>→</span>
            <span className={styles.summaryValue}>{objectLabel}</span>
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <span className={styles.sectionTitle}>Initial stake</span>
            <span className={styles.sectionHint}>Required &gt; 0</span>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Stake on this Claim (TRUST)</span>
            <input
              type="number"
              min="0.000000000000000001"
              step="0.001"
              disabled={loading}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="0.01"
              className={styles.input}
            />
            <span className={styles.helper}>
              You can always buy more later from the main list.
            </span>
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.buttonsRow}>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className={styles.back}
          >
            Back
          </button>

          <button
            type="button"
            disabled={loading || !isValidDeposit}
            onClick={handleSubmit}
            className={styles.confirm}
          >
            {loading ? 'Creating…' : 'Create Claim'}
          </button>
        </div>
      </div>
    </div>
  )
}
