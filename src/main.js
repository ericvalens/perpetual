import "./primitives.js"
import { announce } from "@ui-sdk/core"
import { createAgent, registerTools } from "@ui-sdk/web/agent"
import { Movement } from "./movement.js"
import { createStage } from "./stage.js"
import { click, wake } from "./sound.js"

const watchEl = document.querySelector("wrist-watch")
const crownEl = document.querySelector("watch-crown")
const movement = new Movement()

const stage = createStage(watchEl, movement, {
  onCrownTap: () => movement.cycleCrown(),
  onCrownTurn: (n) => movement.turn(n),
})
if (!stage) watchEl.querySelector(".nogl").hidden = false

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
watchEl.controller = controller
crownEl.controller = controller

const CROWN_TEXT = {
  wind: () => `${Math.round(movement.reserve)} hours of power reserve`,
  date: () => `date ${movement.day()}`,
  time: () => movement.clock(),
}
const crownNow = () =>
  movement.crown === "wind" ? Math.round(movement.reserve) : movement.crown === "date" ? movement.day() : Number(movement.clock().replace(":", ""))

const sync = () => {
  watchEl.api?.sync({ crown: movement.crown, value: movement.clock() })
  crownEl.api?.sync({ crown: movement.crown, now: crownNow(), text: CROWN_TEXT[movement.crown]() })
}

movement.subscribe((change) => {
  if (change.type === "crown") {
    click("pull")
    announce({ wind: "Crown pushed home. Turn it to wind.", date: "Crown out one stop. Turn it to set the date.", time: "Crown all the way out. The seconds stop; turn it to set the time." }[change.value])
  } else if (change.type === "turn") {
    stage?.turned(change.value)
    click(movement.crown)
  }
  sync()
})
sync()
setInterval(sync, 1000)

// Audio may only start from a real gesture.
addEventListener("pointerdown", wake, { capture: true })
addEventListener("keydown", wake, { capture: true })

// Agents: the watch and its crown join UI SDK's agent bridge.
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
