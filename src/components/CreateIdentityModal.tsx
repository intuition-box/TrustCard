'use client'

import { useEffect, useState } from 'react'
import styles from './CreateIdentityModal.module.css'

interface CreateIdentityModalProps {
  open: boolean
  onClose: () => void
  onBackToSearch?: () => void
  onConfirm: (data: {
    label: string
    image?: string
    description?: string
    url?: string
    type: string
    deposit: string
  }) => Promise<void> | void
  defaultLabel?: string
}

export default function CreateIdentityModal({
  open,
  onClose,
  onBackToSearch,
  onConfirm,
  defaultLabel,
}: CreateIdentityModalProps) {
  const [label, setLabel] = useState('')
  const [image, setImage] = useState<string>('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('person')
  const [showMore, setShowMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setShowMore(false)
      setImage('')
      setDescription('')
      setUrl('')
      setType('person')
      setLabel(defaultLabel ?? '')
    }
  }, [open, defaultLabel])

  if (!open) return null

  async function handleSubmit() {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      setError('Label cannot be empty.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      await onConfirm({
        label: trimmedLabel,
        image: image || undefined,
        description: description.trim() || undefined,
        url: url.trim() || undefined,
        // 🔹 Forcé à 'person' pour ce flow Trust Card
        type: 'person',
        deposit: '0',
      })

      onClose()
    } catch (err: any) {
      console.error(err)
      setError(err?.message ?? 'Failed to create identity.')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (onBackToSearch) {
      onBackToSearch()
    } else {
      onClose()
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setImage('')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setImage(reader.result as string)
    }
    reader.readAsDataURL(file)
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
          <span className={styles.stepPill}>Step 1 · New identity</span>
          <h2 className={styles.title}>Create new identity</h2>
          <p className={styles.muted}>
            This will create an Intuition atom for your candidate.
          </p>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <span className={styles.sectionTitle}>Core fields</span>
            <span className={styles.sectionHint}>Required</span>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Identity label</span>
            <input
              type="text"
              disabled={loading}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Exact atom label"
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Type</span>
            <select
              disabled={loading}
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={styles.select}
            >
              <option value="person">Person</option>
              <option value="account">Account</option>
              <option value="organization">Organization</option>
              <option value="thing">Thing</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className={styles.moreToggle}
          onClick={() => setShowMore((v) => !v)}
        >
          <span>{showMore ? 'Hide optional details' : 'More details (optional)'}</span>
          <span className={styles.moreChevron}>{showMore ? '▴' : '▾'}</span>
        </button>

        {showMore && (
          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeaderRow}>
              <span className={styles.sectionTitle}>Optional details</span>
              <span className={styles.sectionHint}>Improve discovery</span>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Image</span>
              <input
                type="file"
                disabled={loading}
                accept="image/*"
                onChange={handleImageChange}
                className={styles.input}
              />
            </label>

            {image && (
              <div className={styles.imagePreview}>
                <div className={styles.imagePreviewAvatar}>
                  <img src={image} alt={label || 'Identity'} />
                </div>
                <span className={styles.imagePreviewLabel}>
                  Preview
                </span>
              </div>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Description</span>
              <textarea
                disabled={loading}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short bio or context"
                className={styles.textarea}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>URL</span>
              <input
                type="text"
                disabled={loading}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className={styles.input}
              />
            </label>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.buttonsRow}>
          <button
            type="button"
            disabled={loading}
            onClick={handleBack}
            className={styles.back}
          >
            Back
          </button>

          <button
            type="button"
            disabled={loading || !label.trim()}
            onClick={handleSubmit}
            className={styles.confirm}
          >
            {loading ? 'Creating…' : 'Create identity'}
          </button>
        </div>
      </div>
    </div>
  )
}
