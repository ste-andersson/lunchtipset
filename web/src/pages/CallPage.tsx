import { ConversationProvider, type Language, useConversation } from '@elevenlabs/react'
import { rankRestaurants } from '@lunch/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { useAppAuth } from '../auth.tsx'
import {
  playClick,
  setPhoneAudioMuted,
  startAmbience,
  startRingback,
  stopAmbience,
  stopRingback,
} from '../call/phoneAudio.ts'
import { buildSystemPrompt } from '../call/prompt.ts'
import { createLunchTools, type ToolContext } from '../call/tools.ts'
import { Notice } from '../components/ui.tsx'
import { useApi, useAssistants, useTaste, useToday, useUserData } from '../data.ts'
import { Avatar } from './RingPage.tsx'

/** Let it ring a little even when the connection is quick; it's part of the feel. */
const MIN_RING_MS = 2500

type Phase = 'idle' | 'ringing' | 'connected' | 'ended' | 'error'
type Line = { role: 'user' | 'agent'; text: string }

export function CallPage() {
  return (
    <ConversationProvider>
      <CallScreen />
    </ConversationProvider>
  )
}

function CallScreen() {
  const { t } = useTranslation()
  const { assistantId } = useParams()
  const navigate = useNavigate()
  const api = useApi()
  const qc = useQueryClient()
  const auth = useAppAuth()
  const assistants = useAssistants()
  const today = useToday()
  const user = useUserData()
  const taste = useTaste(today.data?.date, user.prefs.freeText, user.meals)
  const assistant = assistants.data?.find((a) => a.id === assistantId)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [captions, setCaptions] = useState(false)
  const [actions, setActions] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [speakerOff, setSpeakerOff] = useState(false)
  const captionsRef = useRef<HTMLDivElement>(null)

  // Tools read the latest state through this ref, so they never act on stale data.
  const ctxRef = useRef<ToolContext | null>(null)
  if (today.data) {
    ctxRef.current = {
      api,
      isSignedIn: user.isSignedIn,
      today: today.data,
      updatePrefs: user.updatePrefs,
      saveMeal: user.saveMeal,
      report: (text) => setActions((a) => [...a, text]),
      onMenuChanged: () => void qc.invalidateQueries({ queryKey: ['today'] }),
    }
  }
  const tools = useMemo(
    () =>
      createLunchTools(() => {
        if (!ctxRef.current) throw new Error('Call context not ready')
        return ctxRef.current
      }),
    [],
  )

  const conversation = useConversation({
    onConnect: () => {
      stopRingback()
      startAmbience(assistant?.ambience ?? null)
      setPhase('connected')
    },
    onDisconnect: () => {
      stopRingback()
      stopAmbience()
      playClick()
      setPhase((p) => (p === 'error' ? p : 'ended'))
    },
    onError: (message) => {
      console.error('Conversation error', message)
      setError(String(message))
    },
    onMessage: ({ message, role }) =>
      setLines((l) => [...l, { role: role === 'user' ? 'user' : 'agent', text: message }]),
  })

  useEffect(() => {
    if (phase !== 'connected') return
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase])

  // Hang up if the user navigates away mid-call.
  const endRef = useRef(conversation.endSession)
  endRef.current = conversation.endSession
  useEffect(
    () => () => {
      endRef.current()
      stopRingback()
      stopAmbience()
    },
    [],
  )

  const lineCount = lines.length
  useEffect(() => {
    if (captions && lineCount) {
      captionsRef.current?.scrollTo({ top: captionsRef.current.scrollHeight })
    }
  }, [captions, lineCount])

  // Start ringing as soon as the page opens; tapping the contact was the "call".
  // The timeout lets React StrictMode's mount/unmount/mount pass without dialing twice.
  const callRef = useRef(call)
  callRef.current = call
  const autoDialed = useRef(false)
  const canDial = !!assistant && !!today.data
  useEffect(() => {
    if (!canDial || autoDialed.current) return
    const id = setTimeout(() => {
      autoDialed.current = true
      void callRef.current()
    }, 0)
    return () => clearTimeout(id)
  }, [canDial])

  async function call() {
    if (!assistant || !today.data) return
    setPhase('ringing')
    setError(null)
    setLines([])
    setActions([])
    setElapsed(0)
    startRingback()
    const ringStart = Date.now()
    try {
      // Ask for the microphone up front so a denied permission fails clearly.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) track.stop()

      const { signedUrl } = await api.signedUrl(assistant.id)
      const prompt = buildSystemPrompt({
        assistant,
        today: today.data,
        prefs: user.prefs,
        meals: user.meals,
        ranked: rankRestaurants(
          today.data.restaurants,
          user.prefs,
          user.meals,
          today.data.date,
          taste.data,
        ),
        isSignedIn: user.isSignedIn,
        userName: auth.firstName,
      })
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_RING_MS - (Date.now() - ringStart))))
      conversation.startSession({
        signedUrl,
        clientTools: tools,
        overrides: {
          agent: {
            prompt: { prompt },
            firstMessage: assistant.firstMessage,
            language: assistant.language as Language,
          },
          ...(assistant.voiceId ? { tts: { voiceId: assistant.voiceId } } : {}),
        },
      })
    } catch (err) {
      stopRingback()
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? t('call.micDenied')
          : err instanceof Error
            ? err.message
            : String(err),
      )
      setPhase('error')
    }
  }

  function hangUp() {
    if (phase === 'ringing') {
      stopRingback()
      setPhase('ended')
    }
    conversation.endSession()
  }

  function toggleSpeaker() {
    const off = !speakerOff
    setSpeakerOff(off)
    conversation.setVolume({ volume: off ? 0 : 1 })
    setPhoneAudioMuted(off)
  }

  if (assistants.isLoading) return <p className="muted">{t('common.loading')}</p>
  if (!assistant) {
    return (
      <div className="call">
        <Notice tone="warn">{t('call.unknown')}</Notice>
        <Link to="/ring" className="btn">
          {t('common.back')}
        </Link>
      </div>
    )
  }

  const status =
    phase === 'ringing'
      ? t('call.ringing')
      : phase === 'connected'
        ? `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
        : phase === 'ended'
          ? t('call.ended')
          : phase === 'error'
            ? t('call.failed')
            : assistant.tagline
  const live = phase === 'ringing' || phase === 'connected'

  return (
    <div className="call">
      <button
        type="button"
        className="call__back"
        onClick={() => navigate('/ring')}
        aria-label={t('common.back')}
      >
        ‹
      </button>

      <div
        className={`call__who ${phase === 'connected' && conversation.isSpeaking ? 'is-speaking' : ''}`}
      >
        <Avatar assistant={assistant} size="xl" />
        <h1>{assistant.name}</h1>
        <p className="call__status">{status}</p>
        {phase === 'connected' && (
          <p className="call__mode muted small">
            {conversation.isSpeaking ? t('call.speaking') : t('call.listening')}
          </p>
        )}
      </div>

      {error && <Notice tone="warn">{error}</Notice>}

      {phase === 'ended' && actions.length > 0 && (
        <div className="call__summary">
          <h2>{t('call.changes')}</h2>
          <ul>
            {actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {captions && (
        <div className="captions" ref={captionsRef}>
          {lines.length === 0 ? (
            <p className="muted">{t('call.noCaptions')}</p>
          ) : (
            lines.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only transcript
              <p key={i} className={`captions__line captions__line--${l.role}`}>
                {l.text}
              </p>
            ))
          )}
        </div>
      )}

      <div className="call__controls">
        <ControlButton
          label={t('call.mute')}
          icon="🎙"
          on={conversation.isMuted}
          disabled={phase !== 'connected'}
          onClick={() => conversation.setMuted(!conversation.isMuted)}
        />
        <ControlButton
          label={t('call.speaker')}
          icon="🔈"
          on={speakerOff}
          onClick={toggleSpeaker}
        />
        <ControlButton
          label={t('call.captions')}
          icon="CC"
          on={captions}
          onClick={() => setCaptions((c) => !c)}
        />
      </div>

      {live ? (
        <button
          type="button"
          className="call__hangup"
          onClick={hangUp}
          aria-label={t('call.hangUp')}
        >
          ☎
        </button>
      ) : (
        <div className="call__actions">
          <button
            type="button"
            className="call__dial"
            onClick={call}
            disabled={!today.data}
            aria-label={t('call.call', { name: assistant.name })}
          >
            📞
          </button>
          <span className="muted small">
            {phase === 'idle' ? t('call.call', { name: assistant.name }) : t('call.callAgain')}
          </span>
          {phase === 'ended' && (
            <Link to="/" className="btn btn--ghost btn--small">
              {t('call.toToday')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function ControlButton(props: {
  label: string
  icon: string
  on: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`ctrl ${props.on ? 'is-on' : ''}`}
      aria-pressed={props.on}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="ctrl__icon" aria-hidden>
        {props.icon}
      </span>
      <span className="ctrl__label">{props.label}</span>
    </button>
  )
}
