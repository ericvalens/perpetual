import { readFileSync } from "node:fs"
import { beforeAll, expect, test, vi } from "vitest"
import { Movement } from "../src/movement.js"

const tick = () => new Promise((r) => setTimeout(r, 0))
let agent
let movement
let crown
let position

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  const html = readFileSync("public/index.html", "utf8")
  document.body.innerHTML = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7)
  await import("../src/main.js")
  ;({ agent, movement } = window)
  crown = document.querySelector("watch-crown")
  position = document.querySelector('ui-segmented-control[aria-label="Position"]')
  await tick()
})

const key = (el, k, extra = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }))

test("an agent can find every control by name", () => {
  const entries = agent.snapshot().filter((e) => !e.offPage)
  for (const e of entries) expect(e.label, `${e.component} ${e.ref} has no name`).toBeTruthy()
  const labels = entries.map((e) => e.label)
  for (const label of ["Watch", "Crown", "Position", "Dial", "Metal", "Lights out", "Power reserve", "Back to now"]) {
    expect(labels, `${label} is missing`).toContain(label)
  }
  expect(entries.find((e) => e.label === "Watch").actions).toEqual(
    expect.arrayContaining(["setTime", "setDate", "setCrown", "turnCrown", "spin", "reset"]),
  )
})

test("an agent sets the time and the date", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Watch", action: "setTime", args: ["10:10"] },
      { ref: "Watch", action: "setDate", args: [28] },
    ],
  })
  expect(result.ok).toBe(true)
  expect(movement.clock()).toBe("10:10")
  expect(movement.day()).toBe(28)
  const bad = await agent.act({ steps: [{ ref: "Watch", action: "setTime", args: ["25:99"] }] })
  expect(bad.ok).toBe(false)
})

test("the crown pulls out with Enter and turns with the arrow keys", () => {
  movement.reset()
  movement.setDate(10)
  key(crown, "Enter")
  expect(movement.crown).toBe("date")
  expect(position.value).toBe("date")
  key(crown, "ArrowUp")
  key(crown, "ArrowUp")
  expect(movement.day()).toBe(12)
  key(crown, "ArrowDown")
  expect(movement.day(), "quickset only runs forward").toBe(12)

  key(crown, "Enter")
  expect(movement.crown).toBe("time")
  const frozen = movement.ms()
  key(crown, "ArrowUp", { shiftKey: true })
  expect(movement.ms() - frozen).toBe(10 * 60_000)

  key(crown, "Home")
  expect(movement.crown).toBe("wind")
  expect(crown.getAttribute("role")).toBe("spinbutton")
})

test("the Position control and an agent both move the crown", async () => {
  await agent.act({ steps: [{ ref: "Position", action: "setValue", args: ["time"] }] })
  expect(movement.crown).toBe("time")
  await agent.act({ steps: [{ ref: "Watch", action: "setCrown", args: ["wind"] }] })
  expect(position.value).toBe("wind")
})

test("winding fills the reserve and stops at full", () => {
  const m = new Movement(() => 0)
  m.reserve = 69
  expect(m.turn(1)).toBe(1)
  expect(m.reserve).toBe(69.5)
  m.turn(10)
  expect(m.reserve).toBe(70)
  expect(m.turn(1), "a full mainspring won't take more").toBe(0)
})

test("hacking: pulled to time the watch stops; pushed home it runs from the new time", () => {
  let now = Date.UTC(2026, 10, 15, 12)
  const m = new Movement(() => now)
  m.setCrown("time")
  const held = m.ms()
  now += 5000
  expect(m.ms()).toBe(held)
  m.turn(3)
  m.setCrown("wind")
  now += 1000
  expect(m.ms()).toBe(held + 3 * 60_000 + 1000)
})
