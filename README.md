# Perpetual

**Try it: [rolex-ui-sdk.vercel.app](https://rolex-ui-sdk.vercel.app)**

A wristwatch you can play with, built with Web Components and
[Vercel's UI SDK](https://ui-sdk.dev). No framework. The watch is three.js, and the crown clicks are
synthesized live with Web Audio.

- **Spin it.** Drag the watch; throw it and it keeps turning.
- **Work the crown.** Tap the crown on the watch (or the one in the panel) to pull it out a stop:
  **Wind** fills the power reserve, **Date** quicksets the date forward, and **Time** stops the
  seconds hand (hacking) while you drag the crown up or down to move the hands. Scroll works too.
- **Lights out.** The room goes dark and the lume takes over.
- **Dial and metal.** Five dials, three metals, changed live.

Built from UI SDK parts: `ui-segmented-control` (crown position, dial, metal), `ui-switch`, `ui-meter` and `ui-button`. The watch and its crown are two custom primitives
(`src/primitives.js`) made with `definePrimitive`, so they get the same keyboard, focus and
agent support as the built-in parts. The crown is a spinbutton: Enter pulls it, the arrow keys turn
it, Home pushes it in.

**Agents** can drive it. Everything joins UI SDK's agent bridge, and browsers with WebMCP get
`snapshot` / `query` / `act` tools. From the console:

```js
await agent.act({ steps: [
  { ref: "Dial", action: "setValue", args: ["blue"] },
  { ref: "Watch", action: "setTime", args: ["10:10"] },
] })
```

## Develop

```bash
npm install
npm run dev     # http://localhost:4322
npm run build   # bundles src/ into public/app.js
npm test        # agent and movement tests (vitest + jsdom)
```

The studio HDR is from Poly Haven (CC0).
