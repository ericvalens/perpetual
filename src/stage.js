import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { HDRLoader } from "three/addons/loaders/HDRLoader.js"
import { bindDrag } from "@ui-sdk/core"
import { buildWatch } from "./watch.js"

const TAU = Math.PI * 2
const BASE_RY = -0.22
const BASE_RX = -0.08
const PULL = { wind: 0, date: 0.075, time: 0.15 }
const PX_PER_CLICK = 7
const CLICK_RAD = 0.32

export function createStage(host, movement, { onCrownTap, onCrownTurn } = {}) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches

  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
  } catch {
    return null
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.setAttribute("aria-hidden", "true")
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.environmentRotation = new THREE.Euler(-0.55, 2.35, 0)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)

  const pmrem = new THREE.PMREMGenerator(renderer)
  let envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  new HDRLoader().load(
    "studio.hdr",
    (hdr) => {
      const studio = pmrem.fromEquirectangular(hdr).texture
      hdr.dispose()
      scene.environment = studio
      envTex.dispose()
      envTex = studio
    },
    undefined,
    () => {},
  )

  const keyLight = new THREE.DirectionalLight(0xfff0d8, 2.4)
  keyLight.position.set(3.5, 4.5, 6)
  const fillLight = new THREE.DirectionalLight(0xbcd0e8, 0.5)
  fillLight.position.set(-4.5, -2, 4)
  scene.add(keyLight, fillLight)

  const watch = buildWatch({ day: movement.day() })
  const sway = new THREE.Group()
  sway.add(watch.watch)
  scene.add(sway)

  // --- sizing: keep the head and the start of the bracelet in frame
  let width = 1
  let height = 1
  const resize = () => {
    const r = host.getBoundingClientRect()
    width = Math.max(1, r.width)
    height = Math.max(1, r.height)
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    camera.position.z = Math.max(3.4 / t, 2.3 / (t * camera.aspect))
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  // --- interaction
  let spinY = 0
  let tiltX = 0
  let spinVel = 0
  let pendingSpin = 0
  let lastTouch = -1e9
  let crownRot = 0
  let crownRotShown = 0
  let lights = 1
  let lightsShown = 1
  let pull = 0
  let clock = 0

  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hitsCrown = (event) => {
    const r = renderer.domElement.getBoundingClientRect()
    ndc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    return ray.intersectObject(watch.crownHit, false).length > 0
  }

  const api = {
    watch,
    pointerDown(event, el, store) {
      if (event.button !== 0) return
      lastTouch = clock
      if (hitsCrown(event)) {
        let acc = 0
        let travel = 0
        let lastY = event.clientY
        store.set({ dragging: true })
        bindDrag(el, event, {
          onMove: ({ y }) => {
            const d = lastY - y
            lastY = y
            acc += d
            travel += Math.abs(d)
            let n = 0
            while (acc >= PX_PER_CLICK) (acc -= PX_PER_CLICK), n++
            while (acc <= -PX_PER_CLICK) (acc += PX_PER_CLICK), n--
            if (n) onCrownTurn?.(n)
          },
          onEnd: (_e, canceled) => {
            store.set({ dragging: false })
            lastTouch = clock
            if (!canceled && travel <= 4) onCrownTap?.()
          },
        })
        return
      }
      let lastX = event.clientX
      let lastY = event.clientY
      spinVel = 0
      pendingSpin = 0
      store.set({ dragging: true })
      bindDrag(el, event, {
        onMove: ({ x, y }) => {
          const dx = x - lastX
          const dy = y - lastY
          lastX = x
          lastY = y
          spinY += dx * 0.011
          spinVel = spinVel * 0.6 + dx * 0.011 * 0.4
          tiltX = THREE.MathUtils.clamp(tiltX + dy * 0.007, -1.1, 1.1)
          lastTouch = clock
        },
        onEnd: () => {
          store.set({ dragging: false })
          lastTouch = clock
        },
      })
    },
    hover(event, store) {
      if (event.pointerType !== "mouse" || store.get().dragging) return
      const over = hitsCrown(event)
      if (over !== store.get().crownHover) store.set({ crownHover: over })
    },
    wheel(event) {
      if (!hitsCrown(event) && movement.crown === "wind") return
      event.preventDefault()
      wheelAcc += event.deltaY
      let n = 0
      while (wheelAcc <= -24) (wheelAcc += 24), n++
      while (wheelAcc >= 24) (wheelAcc -= 24), n--
      if (n) onCrownTurn?.(n)
    },
    turned(n) {
      crownRot += n * CLICK_RAD
    },
    spin(turns) {
      pendingSpin += turns * TAU
      lastTouch = clock
    },
    setLights(on) {
      lights = on ? 1 : 0
    },
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
    },
  }
  let wheelAcc = 0

  // --- the loop
  let shownMs = movement.ms()
  let last = performance.now()
  let raf = 0

  const frame = (now) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    clock += dt
    movement.drain(dt)

    // pose: user spin with inertia, then home after a rest
    const idle = clock - lastTouch > 2.2
    if (pendingSpin) {
      const step = pendingSpin * 0.06
      spinY += step
      pendingSpin -= step
      if (Math.abs(pendingSpin) < 0.002) pendingSpin = 0
    }
    spinVel *= 0.95
    spinY += spinVel
    if (idle && !pendingSpin && Math.abs(spinVel) < 0.002) {
      const home = Math.round(spinY / TAU) * TAU
      spinY += (home - spinY) * 0.04
      tiltX *= 0.95
    }

    pull += (PULL[movement.crown] - pull) * 0.25
    crownRotShown += (crownRot - crownRotShown) * 0.3
    watch.crown.rotation.x = crownRotShown
    watch.pullCrown(pull)

    const swayY = reduced ? 0 : Math.sin(clock * 0.4) * 0.05
    const swayX = reduced ? 0 : Math.cos(clock * 0.31) * 0.035
    sway.rotation.y = BASE_RY + swayY + spinY
    sway.rotation.x = BASE_RX + swayX + tiltX
    watch.dialUniforms.uFlare.value = 1.9 - sway.rotation.y * 2.6 + sway.rotation.x * 1.4

    // hands: an 8-beat sweep; big jumps (setting, reset) glide instead of snapping
    const target = movement.ms()
    const gap = target - shownMs
    shownMs = Math.abs(gap) > 1500 ? shownMs + gap * 0.18 : target
    const d = new Date(shownMs)
    const secs = d.getSeconds() + d.getMilliseconds() / 1000
    const beat = movement.frozen != null ? secs : Math.floor(secs * 8) / 8
    const mins = d.getMinutes() + secs / 60
    const hours = (d.getHours() % 12) + mins / 60
    watch.second.rotation.z = -(beat / 60) * TAU
    watch.minute.rotation.z = -(mins / 60) * TAU
    watch.hour.rotation.z = -(hours / 12) * TAU
    watch.shadows.forEach((s, i) => (s.rotation.z = [watch.hour, watch.minute, watch.second][i].rotation.z))
    watch.setDay(movement.day())

    // lights out: the room goes dark and the lume takes over
    lightsShown += (lights - lightsShown) * (lights > lightsShown ? 0.06 : 0.045)
    const lit = lightsShown
    const dark = 1 - lit
    renderer.toneMappingExposure = 1.12 * (0.16 + 0.84 * lit)
    keyLight.intensity = 2.4 * (0.05 + 0.95 * lit)
    fillLight.intensity = 0.5 * (0.1 + 0.9 * lit)
    scene.environmentIntensity = 0.07 + 0.93 * lit
    watch.dialUniforms.uDim.value = dark
    watch.mats.lume.emissiveIntensity = 0.12 + watch.lume.peak * dark
    watch.glow.material.opacity = dark * 0.5

    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(frame)

  return api
}
