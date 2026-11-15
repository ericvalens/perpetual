# Perpetual

**Try it: [rolex-ui-sdk.vercel.app](https://rolex-ui-sdk.vercel.app)**

A wristwatch you can play with, built with Web Components and
[Vercel's UI SDK](https://ui-sdk.dev). No framework. The watch is three.js, and the crown clicks are
synthesized live with Web Audio.

- **Spin it.** Drag the watch; throw it and it keeps turning.
- **Work the crown.** Tap the crown to pull it out a stop: **Wind**, then **Date** (turn it to move
  the date forward), then **Time**, where the seconds hand stops while you drag the crown up or down
  to move the hands. Scroll works too. Tap again to push it home.

The watch and its crown are two UI SDK primitives (`src/primitives.js`) made with
`definePrimitive`, so they get UI SDK's keyboard, focus and agent support. The crown is a
spinbutton under the watch: Enter pulls it, the arrow keys turn it, Home pushes it in.

**Agents** can drive it. Both primitives join UI SDK's agent bridge, and browsers with WebMCP get
`snapshot` / `query` / `act` tools. From the console:

```js
await agent.act({ steps: [
  { ref: "Watch", action: "setTime", args: ["10:10"] },
  { ref: "Watch", action: "spin", args: [1] },
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
