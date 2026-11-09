import { type ChatContent, rankRestaurants } from '@lunch/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { useAppAuth } from '../auth.tsx'
import { buildSystemPrompt } from '../call/prompt.ts'
import { createLunchTools, type ToolContext } from '../call/tools.ts'
import { Notice } from '../components/ui.tsx'
import {
  newId,
  useApi,
  useAssistants,
  useChoosePlan,
  useTaste,
  useToday,
  useUserData,
} from '../data.ts'
import { Avatar } from './RingPage.tsx'

/** A conversation is kept on this device, like the thread in a phone's messages app. */
interface Item {
  id: string
  /** note = something the assistant changed for you, shown as a small grey line */
  role: 'user' | 'agent' | 'note'
  text: string
  at: number
  failed?: boolean
}
interface Thread {
  items: Item[]
  /** What the model sees, including tool calls; the display items are derived from it. */
  contents: ChatContent[]
}

const MAX_ITEMS = 80
const MAX_CONTENTS = 40
/** One reply can take a few rounds when the assistant uses tools. */
const MAX_STEPS = 4
const STAMP_GAP_MS = 60 * 60_000

const storageKey = (assistantId: string) => `lunchlinjen-chat:${assistantId}`

function loadThread(assistantId: string): Thread {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(assistantId)) ?? 'null')
    if (Array.isArray(parsed?.items) && Array.isArray(parsed?.contents)) return parsed as Thread
  } catch {
    // Storage blocked or corrupt: start a fresh thread.
  }
  return { items: [], contents: [] }
}

function saveThread(assistantId: string, thread: Thread) {
  try {
    localStorage.setItem(storageKey(assistantId), JSON.stringify(thread))
  } catch {
    // Private mode or full storage: the thread just won't survive a reload.
  }
}

/** Drops the oldest turns, but never starts in the middle of a tool call. */
function trimContents(contents: ChatContent[]): ChatContent[] {
  let start = Math.max(0, contents.length - MAX_CONTENTS)
  while (
    start < contents.length &&
    !(contents[start]?.role === 'user' && contents[start]?.parts.some((p) => 'text' in p))
  ) {
    start++
  }
  return contents.slice(start)
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export function ChatPage() {
  const { assistantId } = useParams()
  // A new assistant means a new thread, so start from scratch.
  return <ChatScreen key={assistantId} />
}

function ChatScreen() {
  const { t, i18n } = useTranslation()
  const { assistantId = '' } = useParams()
  const navigate = useNavigate()
  const api = useApi()
  const qc = useQueryClient()
  const auth = useAppAuth()
  const assistants = useAssistants()
  const today = useToday()
  const user = useUserData()
  const taste = useTaste(today.data?.date, user.prefs.freeText, user.meals)
  const choosePlan = useChoosePlan()
  const assistant = assistants.data?.find((a) => a.id === assistantId)

  const [initial] = useState(() => loadThread(assistantId))
  const [items, setItems] = useState<Item[]>(initial.items)
  const contentsRef = useRef<ChatContent[]>(initial.contents)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [viewport, setViewport] = useState<{ height: number; keyboard: boolean } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const addItem = (role: Item['role'], text: string) =>
    setItems((prev) => [
      ...prev.slice(-(MAX_ITEMS - 1)),
      { id: newId(), role, text, at: Date.now() },
    ])

  // Tools read the latest state through this ref, so they never act on stale data.
  const ctxRef = useRef<ToolContext | null>(null)
  if (today.data) {
    ctxRef.current = {
      api,
      isSignedIn: user.isSignedIn,
      today: today.data,
      updatePrefs: user.updatePrefs,
      saveMeal: user.saveMeal,
      report: (text) => addItem('note', text),
      onMenuChanged: () => void qc.invalidateQueries({ queryKey: ['today'] }),
      choosePlan,
    }
  }
  const tools = useMemo(
    () =>
      createLunchTools(() => {
        if (!ctxRef.current) throw new Error('Chat context not ready')
        return ctxRef.current
      }),
    [],
  )

  // The system prompt is rebuilt for every round, from whatever is current then,
  // so a changed preference or menu is known to the assistant straight away.
  const buildPrompt = () => {
    if (!assistant || !today.data) throw new Error('Chat not ready')
    return buildSystemPrompt({
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
      tasteMap: taste.data,
      isSignedIn: user.isSignedIn,
      userName: auth.firstName,
      mode: 'text',
    })
  }
  const buildPromptRef = useRef(buildPrompt)
  buildPromptRef.current = buildPrompt

  const ready = !!assistant && !!today.data && !taste.isLoading

  async function deliver(text: string) {
    if (!assistant || !ready || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    const id = newId()
    setItems((prev) => [
      ...prev.filter((i) => !i.failed).slice(-(MAX_ITEMS - 1)),
      { id, role: 'user', text, at: Date.now() },
    ])
    let contents: ChatContent[] = [...contentsRef.current, { role: 'user', parts: [{ text }] }]
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const reply = await api.chat(assistant.id, buildPromptRef.current(), contents)
        contents = [...contents, reply.content]
        if (reply.text) addItem('agent', reply.text)
        if (reply.calls.length === 0) {
          if (!reply.text) throw new Error('The assistant sent an empty reply')
          break
        }
        const responses: Record<string, unknown>[] = []
        for (const call of reply.calls) {
          const run = (tools as Record<string, (p: Record<string, unknown>) => Promise<string>>)[
            call.name
          ]
          let result: string
          try {
            result = run ? await run(call.args) : `Unknown tool ${call.name}`
          } catch (err) {
            result = `Failed: ${err instanceof Error ? err.message : String(err)}`
          }
          responses.push({ functionResponse: { name: call.name, response: { result } } })
        }
        contents = [...contents, { role: 'user', parts: responses }]
      }
      contentsRef.current = trimContents(contents)
    } catch (err) {
      console.warn('Chat failed', err)
      // The history stays as it was, so trying again doesn't send the message twice.
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, failed: true } : i)))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function submit() {
    const text = draft.trim()
    if (!text || !ready || sendingRef.current) return
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    void deliver(text)
  }

  // Save once a round is over, when the history and the display agree.
  useEffect(() => {
    if (!sending) saveThread(assistantId, { items, contents: contentsRef.current })
  }, [assistantId, items, sending])

  // Newest message in view.
  const itemCount = items.length
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever something is added
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [itemCount, sending])

  // On iPhone the keyboard shrinks the visual viewport only; follow it so the
  // composer stays right above the keyboard like in a messages app.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      setViewport({ height: vv.height, keyboard: window.innerHeight - vv.height > 120 })
      window.scrollTo(0, 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

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

  function stamp(at: number) {
    const d = new Date(at)
    const time = d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
    const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000)
    if (days === 0) return `${t('chat.today')} ${time}`
    if (days === 1) return `${t('chat.yesterday')} ${time}`
    if (days < 7) return `${d.toLocaleDateString(i18n.language, { weekday: 'long' })} ${time}`
    return `${d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} ${time}`
  }

  const talk = items.filter((i) => i.role !== 'note')

  return (
    <div
      className={`sms ${viewport?.keyboard ? 'sms--keyboard' : ''}`}
      style={viewport ? { height: viewport.height } : undefined}
    >
      <header className="sms__head">
        <button
          type="button"
          className="sms__back"
          onClick={() => navigate('/ring')}
          aria-label={t('common.back')}
        >
          ‹
        </button>
        <div className="sms__who">
          <Avatar assistant={assistant} />
          <span>{assistant.name}</span>
        </div>
        <Link
          to={`/ring/${assistant.id}`}
          className="sms__call"
          aria-label={t('ring.callName', { name: assistant.name })}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
          </svg>
        </Link>
      </header>

      <div className="sms__list" ref={listRef}>
        {items.length === 0 && (
          <p className="sms__empty muted">{t('chat.empty', { name: assistant.name })}</p>
        )}
        {items.map((item) => {
          if (item.role === 'note') {
            return (
              <p key={item.id} className="sms__note">
                {item.text}
              </p>
            )
          }
          const prevTalk = talk[talk.indexOf(item) - 1]
          const nextTalk = talk[talk.indexOf(item) + 1]
          const showStamp = !prevTalk || item.at - prevTalk.at > STAMP_GAP_MS
          const last =
            !nextTalk || nextTalk.role !== item.role || nextTalk.at - item.at > STAMP_GAP_MS
          return (
            <div key={item.id} className="sms__row">
              {showStamp && <p className="sms__stamp">{stamp(item.at)}</p>}
              <div
                className={`sms__bubble sms__bubble--${item.role === 'user' ? 'me' : 'them'} ${last ? 'is-last' : ''} ${item.failed ? 'is-failed' : ''}`}
              >
                {item.text}
              </div>
              {item.failed && (
                <button
                  type="button"
                  className="sms__retry"
                  onClick={() => void deliver(item.text)}
                  disabled={sending}
                >
                  {t('chat.notDelivered')}
                </button>
              )}
            </div>
          )
        })}
        {sending && (
          <div
            className="sms__bubble sms__bubble--them sms__typing is-last"
            role="status"
            aria-label={t('chat.typing', { name: assistant.name })}
          >
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      <form
        className="sms__composer"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <textarea
          ref={inputRef}
          className="sms__input"
          rows={1}
          value={draft}
          placeholder={ready ? t('chat.placeholder') : t('chat.loading')}
          disabled={!ready}
          enterKeyHint="send"
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
          }}
          onKeyDown={(e) => {
            // Enter sends with a keyboard; on a phone it makes a new line, like Messages.
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button
          type="submit"
          className="sms__send"
          disabled={!draft.trim() || !ready || sending}
          aria-label={t('chat.send')}
          // Keep the keyboard open when tapping send.
          onPointerDown={(e) => e.preventDefault()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3.2 4.7 10.5a1.2 1.2 0 0 0 1.7 1.7l4.4-4.4V20a1.2 1.2 0 0 0 2.4 0V7.8l4.4 4.4a1.2 1.2 0 0 0 1.7-1.7z" />
          </svg>
        </button>
      </form>
    </div>
  )
}
