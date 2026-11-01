import type { Sentiment } from '@lunch/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../data.ts'
import { SentimentPicker } from './ui.tsx'

/** Public info about a restaurant: free text plus a positive/neutral/negative label. */
export function NoteForm({ restaurantId, onDone }: { restaurantId: number; onDone: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const qc = useQueryClient()
  const [sentiment, setSentiment] = useState<Sentiment | null>('neutral')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!sentiment || !text.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.addNote(restaurantId, { sentiment, text: text.trim() })
      await qc.invalidateQueries({ queryKey: ['today'] })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('note.text')}</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('note.placeholder')}
          required
        />
      </label>
      <div className="field">
        <span>{t('note.tone')}</span>
        <SentimentPicker value={sentiment} onChange={setSentiment} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form__actions">
        <button type="submit" className="btn" disabled={busy || !sentiment || !text.trim()}>
          {t('note.submit')}
        </button>
      </div>
    </form>
  )
}
