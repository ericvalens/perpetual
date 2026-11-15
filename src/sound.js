// Crown clicks, synthesized: a short filtered noise burst per detent.
let ctx
let noise

function ready() {
  if (ctx) return ctx.state === "running"
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!AC) return false
  ctx = new AC()
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return ctx.state === "running"
}

// Browsers only start audio from a real gesture; call this from one.
export function wake() {
  ready()
  if (ctx?.state === "suspended") ctx.resume()
}

const VOICES = {
  wind: { freq: 3600, q: 7, gain: 0.16, len: 0.012 },
  date: { freq: 2300, q: 4, gain: 0.32, len: 0.02 },
  time: { freq: 1700, q: 3, gain: 0.07, len: 0.01 },
  pull: { freq: 900, q: 2, gain: 0.45, len: 0.035 },
}

let lastAt = 0

export function click(kind) {
  if (!ready()) return
  const v = VOICES[kind] ?? VOICES.wind
  const t = ctx.currentTime
  if (kind !== "pull" && t - lastAt < 0.018) return
  lastAt = t
  const src = ctx.createBufferSource()
  src.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = "bandpass"
  band.frequency.value = v.freq * (0.94 + Math.random() * 0.12)
  band.Q.value = v.q
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(v.gain, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + v.len)
  src.connect(band).connect(amp).connect(ctx.destination)
  src.start(t)
  src.stop(t + v.len + 0.01)
}
