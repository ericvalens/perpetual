# Perpetual

A wristwatch you can play with. Plain web components on Vercel's UI SDK (`@ui-sdk/web` + `@ui-sdk/core`),
three.js for the watch, bundled with esbuild.

Before using ui-sdk, follow the `ui-sdk` skill (`.agents/skills/ui-sdk`) and read
`node_modules/@ui-sdk/web/docs/llms.txt`. To build a new component, also search
`node_modules/@ui-sdk/web/docs/core.md` by heading, and read `rendering.md` next to it.

For visual or accessibility passes, run the `web-design-guidelines` skill over
`public/index.html`, `public/styles.css` and `src/`.

- `npm run dev` serves http://localhost:4322 (no live reload: refresh). `npm test` runs the agent tests.
- `src/movement.js` is the watch's state (time, date, crown, reserve) with no DOM, so tests run without WebGL.
- `src/watch.js` builds the model. `src/stage.js` renders and handles the pointer.
