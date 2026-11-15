// Two UI SDK primitives: the watch on the stage, and its crown.
import { bindDrag, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"

const CROWN_LABEL = { wind: "Wind", date: "Set date", time: "Set time" }

// ---------------------------------------------------------------------------
// <wrist-watch>: the stage. Drag it to spin the watch; grab the crown on the
// model to pull it out and turn it. What an agent sees is its actions.
// ---------------------------------------------------------------------------

export const wristWatch = definePrimitive({
  name: "wrist-watch",
  options: { controller: "value" },
  state: () => ({ value: "", crown: "wind", dragging: false, crownHover: false }),
  api: (context) => {
    const c = () => {
      const controller = context.options().controller
      if (!controller) throw new Error("The watch isn't ready yet.")
      return controller
    }
    return {
      /** Set the hands, 24-hour "HH:MM". */
      setTime: (time) => c().setTime(time),
      /** Set the date wheel, 1 to 31. */
      setDate: (day) => c().setDate(day),
      /** Pull or push the crown: "wind", "date" or "time". */
      setCrown: (position) => c().setCrown(position),
      /** Turn the crown by clicks. What it does depends on its position. */
      turnCrown: (clicks) => c().turn(clicks),
      /** Spin the watch round by a number of turns. */
      spin: (turns = 1) => c().spin(Number(turns)),
      /** Back to the real time, crown pushed home. */
      reset: () => c().reset(),
      sync: (s) => context.store.set(s),
      down: (event, el) => c().pointerDown(event, el, context.store),
      hover: (event) => c().hover(event, context.store),
      wheel: (event) => c().wheel(event),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-crown": state.crown,
        "data-dragging": state.dragging ? "" : undefined,
        "data-crown-hover": state.crownHover ? "" : undefined,
      }),
      on: {
        pointerdown: (event, { el, api }) => api.down(event, el),
        pointermove: (event, { api }) => api.hover(event),
        wheel: (event, { api }) => api.wheel(event),
      },
    }),
  }),
  agent: { actions: ["setTime", "setDate", "setCrown", "turnCrown", "spin", "reset"] },
})

createParts(wristWatch, {
  root: { tag: "wrist-watch", api: ["sync", "setTime", "setDate", "setCrown", "turnCrown", "spin", "reset"] },
})

// ---------------------------------------------------------------------------
// <watch-crown>: the crown, for keys and fingers. Press it to pull it out a
// stop; drag it up and down, or use the arrow keys, to turn it.
// ---------------------------------------------------------------------------

const TURN_KEYS = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 15, PageDown: -15 }
const PX_PER_CLICK = 7

export const watchCrown = definePrimitive({
  name: "watch-crown",
  options: { controller: "value" },
  state: () => ({ crown: "wind", now: 0, text: "", turning: false }),
  api: (context) => {
    let stop
    context.onDestroy(() => stop?.())
    const c = () => context.options().controller
    return {
      /** Pull out one stop; from the last stop, push it home. */
      pull: () => c()?.cycleCrown(),
      /** Turn by clicks. Positive winds, moves the date on, or the hands forward. */
      turn: (clicks) => c()?.turn(clicks),
      sync: (s) => context.store.set(s),
      key(event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          c()?.cycleCrown()
          return
        }
        if (event.key === "Home") {
          event.preventDefault()
          c()?.setCrown("wind")
          return
        }
        const step = TURN_KEYS[event.key]
        if (!step) return
        event.preventDefault()
        c()?.turn(step * (event.shiftKey ? 10 : 1))
      },
      down(event, el) {
        if (event.button !== 0) return
        stop?.()
        let acc = 0
        let travel = 0
        let lastY = event.clientY
        stop = bindDrag(el, event, {
          onMove: ({ y }) => {
            const d = lastY - y
            lastY = y
            acc += d
            travel += Math.abs(d)
            if (travel > 4 && !context.store.get().turning) context.store.set({ turning: true })
            let n = 0
            while (acc >= PX_PER_CLICK) (acc -= PX_PER_CLICK), n++
            while (acc <= -PX_PER_CLICK) (acc += PX_PER_CLICK), n--
            if (n) c()?.turn(n)
          },
          onEnd: (_event, canceled) => {
            stop = undefined
            context.store.set({ turning: false })
            if (!canceled && travel <= 4) c()?.cycleCrown()
          },
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "spinbutton",
      focus: "tab-stop",
      keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "Enter", " "],
      attrs: (state) => ({
        tabindex: "0",
        "aria-valuenow": String(state.now),
        "aria-valuetext": `${CROWN_LABEL[state.crown]}: ${state.text}`,
        "data-crown": state.crown,
        "data-turning": state.turning ? "" : undefined,
      }),
      on: {
        keydown: (event, { api }) => api.key(event),
        pointerdown: (event, { el, api }) => api.down(event, el),
      },
    }),
  }),
  agent: { actions: ["pull", "turn"] },
})

createParts(watchCrown, {
  root: { tag: "watch-crown", api: ["sync", "pull", "turn"] },
})
