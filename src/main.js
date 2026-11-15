import "@ui-sdk/web/segmented-control"
import "@ui-sdk/web/switch"
import "@ui-sdk/web/meter"
import "@ui-sdk/web/button"
import "./primitives.js"
import { announce } from "@ui-sdk/core"
import { createAgent, registerTools } from "@ui-sdk/web/agent"
import { Movement, RESERVE_HOURS } from "./movement.js"
import { createStage } from "./stage.js"
import { click, wake } from "./sound.js"

const $ = (s) => document.querySelector(s)
const watchEl = $("wrist-watch")
const crownEl = $("watch-crown")
const positionEl = $('ui-segmented-control[aria-label="Position"]')
const dialEl = $('ui-segmented-control[aria-label="Dial"]')
const metalEl = $('ui-segmented-control[aria-label="Metal"]')
const lightsEl = $("ui-switch.lights")
const meterEl = $("ui-meter.reserve")

const movement = new Movement()

const controller = {
  setTime: (t) => movement.setTime(t),
  setDate: (d) => movement.setDate(d),
  setCrown: (p) => movement.setCrown(p),
  cycleCrown: () => movement.cycleCrown(),
  turn: (n) => movement.turn(n),
  spin: (turns) => stage?.spin(turns),
  reset: () => movement.reset(),
  pointerDown: (e, el, store) => stage?.pointerDown(e, el, store),
  hover: (e, store) => stage?.hover(e, store),
  wheel: (e) => stage?.wheel(e),
}

const stage = createStage(watchEl, movement, {
  onCrownTap: () => movement.cycleCrown(),
  onCrownTurn: (n) => movement.turn(n),
})
if (!stage) $(".nogl").hidden = false

watchEl.controller = controller
crownEl.controller = controller

const CROWN_TEXT = {
  wind: () => `${Math.round(movement.reserve)} hours of power reserve`,
  date: () => `date ${movement.day()}`,
  time: () => movement.clock(),
}
const crownNow = () =>
  movement.crown === "wind" ? Math.round(movement.reserve) : movement.crown === "date" ? movement.day() : movement.clock().replace(":", "") * 1

let knurl = 0
const syncCrown = () => {
  watchEl.api?.sync({ crown: movement.crown, value: movement.clock() })
  crownEl.api?.sync({ crown: movement.crown, now: crownNow(), text: CROWN_TEXT[movement.crown]() })
  crownEl.style.setProperty("--knurl", `${knurl}px`)
}

movement.subscribe((change) => {
  if (change.type === "crown") {
    positionEl.value = change.value
    click("pull")
    announce({ wind: "Crown pushed home. Turn it to wind.", date: "Crown out one stop. Turn it to set the date.", time: "Crown all the way out. The seconds stop; turn it to set the time." }[change.value])
  } else if (change.type === "turn") {
    stage?.turned(change.value)
    knurl += change.value * 3
    click(movement.crown)
  }
  syncCrown()
})

positionEl.addEventListener("valuechange", (e) => {
  if (e.detail.value) movement.setCrown(e.detail.value)
})
dialEl.addEventListener("valuechange", (e) => {
  if (e.detail.value) stage?.watch.setDial(e.detail.value)
})
metalEl.addEventListener("valuechange", (e) => {
  if (e.detail.value) stage?.watch.setMetal(e.detail.value)
})
lightsEl.addEventListener("checkedchange", (e) => {
  const out = !!e.detail.value
  stage?.setLights(!out)
  document.documentElement.toggleAttribute("data-lights-out", out)
})
$("ui-button").addEventListener("action", () => movement.reset())

// Audio may only start from a real gesture.
addEventListener("pointerdown", wake, { capture: true })
addEventListener("keydown", wake, { capture: true })

// The readout, a few times a second.
const hm = $(".hm")
const ss = $(".ss")
const dateNum = $(".date-num")
const reserveH = $(".reserve-h")
let shown = ""
const tickReadout = () => {
  const d = new Date(movement.ms())
  const pad = (n) => String(n).padStart(2, "0")
  const text = `${pad(d.getHours())}:${pad(d.getMinutes())}|${pad(d.getSeconds())}|${movement.day()}|${Math.round(movement.reserve)}`
  if (text !== shown) {
    shown = text
    const [a, b, c, r] = text.split("|")
    hm.textContent = a
    ss.textContent = `:${b}`
    dateNum.textContent = c
    reserveH.textContent = r
    meterEl.value = Math.min(RESERVE_HOURS, movement.reserve)
    syncCrown()
  }
}
tickReadout()
setInterval(tickReadout, 200)

// Agents: the watch, its crown and every control join UI SDK's agent bridge.
// Browsers with WebMCP get snapshot / query / act tools; from the console:
//   await agent.act({ steps: [{ ref: "Watch", action: "setTime", args: ["10:10"] }] })
const agent = createAgent()
Object.assign(window, { agent, movement })

// Some WebMCP builds return nothing from registerTool, where UI SDK 0.1 beta
// expects a promise.
const mc = document.modelContext
if (mc?.registerTool) {
  const register = mc.registerTool.bind(mc)
  try {
    mc.registerTool = (...args) => {
      try {
        return Promise.resolve(register(...args))
      } catch (error) {
        return Promise.reject(error)
      }
    }
  } catch {}
}
try {
  registerTools(agent, { allow: () => true })
} catch (error) {
  console.warn("WebMCP tools weren't registered:", error)
}
