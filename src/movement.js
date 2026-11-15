// The movement: what time and date the watch shows, and what the crown does.
// Plain state, no DOM, so the agent tests run without WebGL.

export const CROWN = ["wind", "date", "time"]
export const RESERVE_HOURS = 70
const MINUTE = 60_000

export class Movement {
  constructor(now = () => Date.now()) {
    this.now = now
    this.offset = 0
    this.dateShift = 0
    this.crown = "wind"
    this.frozen = null
    this.reserve = 42
    this.listeners = new Set()
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(change) {
    for (const fn of this.listeners) fn(change)
  }

  // Watch time in ms. Pulled out to "time", the seconds hand stops (hacking).
  ms() {
    return this.frozen ?? this.now() + this.offset
  }

  day() {
    const d = new Date(this.ms()).getDate()
    return ((d - 1 + this.dateShift) % 31 + 31) % 31 + 1
  }

  clock() {
    const d = new Date(this.ms())
    const pad = (n) => String(n).padStart(2, "0")
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  setCrown(position) {
    const next = String(position).toLowerCase()
    if (!CROWN.includes(next)) throw new Error(`The crown has three positions: ${CROWN.join(", ")}.`)
    if (next === this.crown) return false
    if (next === "time") this.frozen = this.now() + this.offset
    else if (this.crown === "time") {
      this.offset = this.frozen - this.now()
      this.frozen = null
    }
    this.crown = next
    this.emit({ type: "crown", value: next })
    return true
  }

  // Pull out one stop, and from the last stop push it all the way home.
  cycleCrown() {
    const i = CROWN.indexOf(this.crown)
    this.setCrown(CROWN[(i + 1) % CROWN.length])
    return this.crown
  }

  // One click of the crown. What it does depends on where the crown is.
  turn(clicks) {
    const n = Math.trunc(Number(clicks))
    if (!n) return 0
    if (this.crown === "wind") {
      const before = this.reserve
      this.reserve = Math.min(RESERVE_HOURS, Math.max(0, this.reserve + Math.max(0, n) * 0.5))
      if (this.reserve === before) return 0
    } else if (this.crown === "date") {
      // Quickset only runs forward, like the real thing.
      if (n < 0) return 0
      this.dateShift += n
    } else {
      this.frozen += n * MINUTE
    }
    this.emit({ type: "turn", value: n })
    return n
  }

  // Jump straight to a time, "HH:MM" (24h). Keeps the date the watch shows.
  setTime(text) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim())
    if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('Use 24-hour "HH:MM", like "10:10".')
    const day = this.day()
    const d = new Date(this.ms())
    d.setHours(+m[1], +m[2], 0, 0)
    const target = d.getTime()
    if (this.frozen != null) this.frozen = target
    else this.offset = target - this.now()
    this.dateShift += day - this.day()
    this.emit({ type: "time", value: this.clock() })
    return this.clock()
  }

  setDate(n) {
    const day = Math.trunc(Number(n))
    if (!(day >= 1 && day <= 31)) throw new Error("The date wheel runs 1 to 31.")
    this.dateShift += day - this.day()
    this.emit({ type: "date", value: day })
    return day
  }

  // Back to real local time, crown home.
  reset() {
    this.offset = 0
    this.dateShift = 0
    this.frozen = null
    this.crown = "wind"
    this.emit({ type: "reset" })
  }

  // The mainspring lets down in real time, an hour per hour.
  drain(seconds) {
    this.reserve = Math.max(0, this.reserve - seconds / 3600)
  }
}

