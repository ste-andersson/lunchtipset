const PATH = '/phone-sounds/'
const AMBIENCE_VOLUME = 0.12

let ringback: HTMLAudioElement | null = null
let ambience: HTMLAudioElement | null = null
const click = typeof Audio !== 'undefined' ? new Audio(`${PATH}phone_click.mp3`) : null

function play(a: HTMLAudioElement) {
  a.currentTime = 0
  void a.play().catch(() => {})
}

export function playClick() {
  if (click) play(click)
}

export function startRingback() {
  if (ringback) return
  ringback = new Audio(`${PATH}ringback_tone.mp3`)
  ringback.loop = true
  play(ringback)
}

export function stopRingback() {
  if (!ringback) return
  ringback.pause()
  ringback = null
  playClick()
}

/** A quiet background loop gives the call a sense of place. */
export function startAmbience(file: string | null) {
  stopAmbience()
  if (!file) return
  ambience = new Audio(`${PATH}${file}`)
  ambience.loop = true
  ambience.volume = AMBIENCE_VOLUME
  play(ambience)
}

export function stopAmbience() {
  ambience?.pause()
  ambience = null
}

export function setPhoneAudioMuted(muted: boolean) {
  for (const a of [ringback, ambience, click]) if (a) a.muted = muted
}
