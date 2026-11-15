import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

const NOISE = `
float hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
`;
const DIAL_FRAG = `
precision highp float;

varying vec2 vUv;
uniform float uTime;
uniform float uFlare;   // radians — light direction across the dial
uniform float uBurst;   // 0 matte, 1 sunray
uniform float uDim;     // 0..1 lights out
uniform vec3  uLight;
uniform vec3  uBody;
uniform vec3  uDeep;
uniform vec3  uFlareCol;

${NOISE}

void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // radial brushing: fine angular grain, long along the radius
  float brush = noise(vec2(ang * 160.0, r * 3.0)) * 0.5
              + noise(vec2(ang * 420.0, r * 6.0)) * 0.5;
  float sand = noise(vUv * 520.0) * 0.5 + noise(vUv * 1100.0) * 0.5;
  float grain = mix(sand, brush, uBurst);

  vec3 col = mix(uLight, uBody, smoothstep(0.0, 0.75, r));
  col = mix(col, uDeep, smoothstep(0.70, 1.0, r) * 0.65);

  // the sunburst flare — two soft opposing lobes that rotate with tilt
  float lobe = pow(abs(cos(ang - uFlare)), 5.0);
  float cross = pow(abs(cos(ang - uFlare + 1.5708)), 18.0) * 0.4;
  float flare = (lobe + cross) * (0.26 + brush * 0.5) * uBurst;
  col += uFlareCol * flare * (1.0 - smoothstep(0.9, 1.0, r));

  // a matte dial still has to breathe — a whisper of directional lift
  col += uFlareCol * (1.0 - uBurst) * 0.035
       * pow(max(0.0, cos(ang - uFlare)), 2.0) * (0.5 + r * 0.5);

  col += (grain - 0.5) * mix(0.055, 0.075, uBurst);
  col *= 1.0 - smoothstep(0.93, 1.0, r) * 0.45;

  col *= mix(1.0, 0.06, uDim);

  gl_FragColor = vec4(col, 1.0);
}
`;

export const DIAL_VERT = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function drawSpaced(ctx, text, x, y, size, spacing, color, weight = 600) {
  ctx.font = `${weight} ${size}px Inter, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let cx = x - total / 2;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
}

function dialCanvas(size = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  return { canvas, ctx, R: size / 2 };
}

function finishTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDateTexture(day) {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f6f1e6";
  ctx.fillRect(0, 0, S, S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, "rgba(0,0,0,0.34)");
  g.addColorStop(0.22, "rgba(0,0,0,0)");
  g.addColorStop(0.85, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "#241d14";
  ctx.font = `700 ${S * 0.62}px Inter, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(day), S / 2, S * 0.55);
  return finishTexture(canvas);
}
function makeGlowTexture() {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(canvas);
}
function flutedBezelGeometry(innerR, outerR, flutes, zInner, zOuter, ridge) {
  const steps = flutes * 2;
  const dA = (Math.PI * 2) / steps;
  const midR = (innerR + outerR) / 2;
  const zMid = (zInner + zOuter) / 2;
  const positions = [];
  const vert = (r, a, z) => {
    positions.push(Math.cos(a) * r, Math.sin(a) * r, z);
  };
  for (let j = 0; j < steps; j += 1) {
    const a0 = j * dA;
    const a1 = (j + 1) * dA;
    const h0 = j % 2 === 0 ? ridge : 0;
    const h1 = j % 2 === 0 ? 0 : ridge;
    vert(innerR, a0, zInner); vert(midR, a0, zMid + h0); vert(midR, a1, zMid + h1);
    vert(innerR, a0, zInner); vert(midR, a1, zMid + h1); vert(innerR, a1, zInner);
    vert(midR, a0, zMid + h0); vert(outerR, a0, zOuter); vert(outerR, a1, zOuter);
    vert(midR, a0, zMid + h0); vert(outerR, a1, zOuter); vert(midR, a1, zMid + h1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function curlBand({ rows, rowH, radius, yStart, makeRow, parent }) {
  for (let side = 0; side < 2; side += 1) {
    const sign = side === 0 ? 1 : -1;
    for (let i = 0; i < rows; i += 1) {
      const phi = ((i + 0.5) * rowH) / radius;
      const row = makeRow(i, sign);
      row.position.y = sign * (yStart + radius * Math.sin(phi));
      row.position.z = -radius * (1 - Math.cos(phi)) - 0.10;
      row.rotation.x = -sign * phi;
      parent.add(row);
    }
  }
}

function makeMaterials(spec) {
  const m = spec.metals;
  return {
    polished: new THREE.MeshStandardMaterial({
      color: m.polished,
      metalness: 1,
      roughness: 0.16,
      envMapIntensity: 1.25,
    }),
    bezel: new THREE.MeshStandardMaterial({
      color: m.bezel,
      metalness: 1,
      roughness: 0.10,
      envMapIntensity: 1.45,
      flatShading: !!m.bezelFlat,
    }),
    satin: new THREE.MeshStandardMaterial({
      color: m.satin,
      metalness: 1,
      roughness: 0.30,
      envMapIntensity: 1.0,
    }),
    center: new THREE.MeshStandardMaterial({
      color: m.center,
      metalness: 1,
      roughness: 0.22,
      envMapIntensity: 1.1,
    }),
    markers: new THREE.MeshStandardMaterial({
      color: m.markers,
      metalness: 1,
      roughness: 0.14,
      envMapIntensity: 1.35,
    }),
    hands: new THREE.MeshStandardMaterial({
      color: m.hands,
      metalness: 1,
      roughness: 0.09,
      envMapIntensity: 1.7,
    }),
    rehaut: new THREE.MeshStandardMaterial({
      color: m.rehaut,
      metalness: 0.6,
      roughness: 0.5,
      side: THREE.DoubleSide,
    }),
    handShadow: new THREE.MeshBasicMaterial({
      color: m.handShadow,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
    }),
    lume: new THREE.MeshStandardMaterial({
      color: spec.lume.face,
      metalness: 0,
      roughness: 0.6,
      emissive: new THREE.Color(spec.lume.glow),
      emissiveIntensity: 0.12,
    }),
    crystal: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.6,
      depthWrite: false,
    }),
    strap: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.92,
    }),
  };
}

function dialUniformsFor(spec) {
  return {
    uTime: { value: 0 },
    uFlare: { value: 1.9 },
    uBurst: { value: spec.dial.burst },
    uDim: { value: 0 },
    uLight: { value: new THREE.Color(...spec.dial.light) },
    uBody: { value: new THREE.Color(...spec.dial.body) },
    uDeep: { value: new THREE.Color(...spec.dial.deep) },
    uFlareCol: { value: new THREE.Color(...spec.dial.flare) },
  };
}

function makeDial(spec) {
  const uniforms = dialUniformsFor(spec);
  const dial = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 128),
    new THREE.ShaderMaterial({
      vertexShader: DIAL_VERT,
      fragmentShader: DIAL_FRAG,
      uniforms,
    }),
  );
  return { dial, uniforms };
}

function makePrint(texture) {
  const print = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 96),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  print.position.z = 0.012;
  return print;
}

function buildDatejust(mats, spec, parts) {
  const watch = new THREE.Group();

  // --- case (lathe profile, y-up, rotated to face +z)
  const profile = [
    [0.0, -0.46], [0.55, -0.44], [0.95, -0.38], [1.22, -0.22],
    [1.36, -0.02], [1.38, 0.06], [1.30, 0.13], [1.14, 0.15],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const caseMesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 120), mats.polished);
  caseMesh.rotation.x = Math.PI / 2;
  watch.add(caseMesh);

  // --- fluted bezel + retaining rings
  const bezel = new THREE.Mesh(
    flutedBezelGeometry(1.08, 1.27, 46, 0.16, 0.05, 0.085),
    mats.bezel,
  );
  watch.add(bezel);

  const seat = new THREE.Mesh(new THREE.TorusGeometry(1.085, 0.026, 20, 96), mats.polished);
  seat.position.z = 0.14;
  watch.add(seat);

  const bezelRim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.275, 1.31, 0.10, 96, 1, true),
    mats.polished,
  );
  bezelRim.rotation.x = Math.PI / 2;
  bezelRim.position.z = 0.07;
  watch.add(bezelRim);

  // --- dial: sunburst shader + printed layer + rehaut
  const { dial, uniforms } = makeDial(spec);
  watch.add(dial);
  const print = makePrint(makeDatejustPrint(spec.ink));
  watch.add(print);

  const rehaut = new THREE.Mesh(
    new THREE.CylinderGeometry(1.08, 1.0, 0.11, 96, 1, true),
    mats.rehaut,
  );
  rehaut.rotation.x = Math.PI / 2;
  rehaut.position.z = 0.055;
  watch.add(rehaut);

  // --- applied markers (skip 3 o'clock for the date)
  const batonGeo = new RoundedBoxGeometry(0.055, 0.21, 0.05, 3, 0.018);
  for (let h = 0; h < 12; h += 1) {
    if (h === 3) continue;
    const a = Math.PI / 2 - (h / 12) * Math.PI * 2;
    const place = (offset) => {
      const marker = new THREE.Mesh(batonGeo, mats.markers);
      marker.position.set(Math.cos(a) * 0.80, Math.sin(a) * 0.80, 0.03);
      marker.rotation.z = a - Math.PI / 2;
      if (offset) marker.translateX(offset);
      watch.add(marker);
    };
    const plot = new THREE.Mesh(new THREE.CircleGeometry(0.024, 20), mats.lume);
    plot.position.set(Math.cos(a) * 0.925, Math.sin(a) * 0.925, 0.016);
    watch.add(plot);
    if (h === 0) {
      place(-0.047);
      place(0.047);
    } else {
      place(0);
    }
  }

  // --- date window + cyclops at 3
  const dateFrame = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.225), mats.markers);
  dateFrame.position.set(0.62, 0, 0.008);
  watch.add(dateFrame);

  const dateFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.255, 0.18),
    new THREE.MeshBasicMaterial({ map: makeDateTexture(parts.day) }),
  );
  dateFace.position.set(0.62, 0, 0.016);
  watch.add(dateFace);

  const cyclops = new THREE.Mesh(new THREE.SphereGeometry(0.19, 40, 24), mats.crystal);
  cyclops.scale.set(0.95, 0.72, 0.32);
  cyclops.position.set(0.62, 0, 0.155);
  watch.add(cyclops);

  // --- hands
  const hour = new THREE.Group();
  {
    const stem = new THREE.Mesh(
      new RoundedBoxGeometry(0.055, 0.42, 0.03, 2, 0.012),
      mats.hands,
    );
    stem.position.y = 0.21;
    hour.add(stem);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.024, 16, 40), mats.hands);
    ring.position.y = 0.50;
    hour.add(ring);
    const lume = new THREE.Mesh(new THREE.CircleGeometry(0.068, 32), mats.lume);
    lume.position.set(0, 0.50, 0.004);
    hour.add(lume);
    for (let i = 0; i < 3; i += 1) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.074, 0.02), mats.hands);
      spoke.position.y = 0.50;
      spoke.rotation.z = (i / 3) * Math.PI * 2;
      spoke.translateY(0.036);
      hour.add(spoke);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.13, 4), mats.hands);
    tip.position.y = 0.655;
    hour.add(tip);
  }
  hour.position.z = 0.055;
  watch.add(hour);

  const minute = new THREE.Group();
  {
    const stem = new THREE.Mesh(
      new RoundedBoxGeometry(0.044, 0.90, 0.024, 2, 0.010),
      mats.hands,
    );
    stem.position.y = 0.45;
    minute.add(stem);
    const lume = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.44), mats.lume);
    lume.position.set(0, 0.55, 0.014);
    minute.add(lume);
  }
  minute.position.z = 0.082;
  watch.add(minute);

  const second = new THREE.Group();
  {
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.18, 0.008), mats.hands);
    needle.position.y = 0.34;
    second.add(needle);
    const lollipop = new THREE.Mesh(new THREE.SphereGeometry(0.030, 20, 14), mats.hands);
    lollipop.position.y = 0.76;
    second.add(lollipop);
    const counter = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), mats.hands);
    counter.scale.z = 0.5;
    counter.position.y = -0.20;
    second.add(counter);
  }
  second.position.z = 0.105;
  watch.add(second);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 24), mats.hands);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.06;
  watch.add(cap);

  // --- crystal dome (rim tucks under the bezel)
  const domeR = 3.2;
  const theta = Math.asin(1.12 / domeR);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(domeR, 72, 24, 0, Math.PI * 2, 0, theta),
    mats.crystal,
  );
  dome.rotation.x = Math.PI / 2;
  dome.position.z = 0.14 - domeR * Math.cos(theta);
  watch.add(dome);

  // --- crown at 3 o'clock (markers metal, so it stays gold on the two-tone)
  const crown = new THREE.Group();
  {
    const knurl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135, 0.135, 0.12, 20, 1, false),
      mats.bezel,
    );
    knurl.rotation.z = Math.PI / 2;
    crown.add(knurl);
    const capC = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.12, 0.045, 20),
      mats.markers,
    );
    capC.rotation.z = Math.PI / 2;
    capC.position.x = 0.078;
    crown.add(capC);
    const stemC = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.16, 16),
      mats.markers,
    );
    stemC.rotation.z = Math.PI / 2;
    stemC.position.x = -0.11;
    crown.add(stemC);
  }
  crown.position.set(1.43, 0, -0.06);
  watch.add(crown);

  // --- lugs + end links flush against the case
  const lugGeo = new RoundedBoxGeometry(0.24, 0.44, 0.30, 3, 0.09);
  [
    [0.52, 1.30, -0.16],
    [-0.52, 1.30, -0.16],
    [0.52, -1.30, 0.16],
    [-0.52, -1.30, 0.16],
  ].forEach(([x, y, tilt]) => {
    const lug = new THREE.Mesh(lugGeo, mats.polished);
    lug.position.set(x, y, -0.10);
    lug.rotation.x = tilt;
    watch.add(lug);
  });

  const endLinkGeo = new RoundedBoxGeometry(1.06, 0.20, 0.13, 3, 0.045);
  [1.30, -1.30].forEach((y) => {
    const endLink = new THREE.Mesh(endLinkGeo, mats.satin);
    endLink.position.set(0, y, -0.05);
    watch.add(endLink);
  });

  // --- jubilee-style bracelet, curling back like it's on a wrist
  const widths = [0.46, 0.25, 0.29, 0.25, 0.46];
  const gap = 0.014;
  const rowGeoWide = new RoundedBoxGeometry(0.45, 0.248, 0.105, 3, 0.032);
  const rowGeoMid = new RoundedBoxGeometry(0.24, 0.248, 0.125, 3, 0.032);
  const rowGeoCtr = new RoundedBoxGeometry(0.28, 0.248, 0.125, 3, 0.032);
  curlBand({
    rows: 9,
    rowH: 0.262,
    radius: 2.4,
    yStart: 1.40,
    parent: watch,
    makeRow: () => {
      const row = new THREE.Group();
      let x = -(widths.reduce((a, b) => a + b, 0) + gap * 4) / 2;
      widths.forEach((w, i) => {
        const centre = i > 0 && i < 4;
        const geo = i === 2 ? rowGeoCtr : centre ? rowGeoMid : rowGeoWide;
        const link = new THREE.Mesh(geo, centre ? mats.center : mats.satin);
        link.position.x = x + w / 2;
        link.position.z = centre ? 0.02 : 0;
        row.add(link);
        x += w + gap;
      });
      return row;
    },
  });

  return {
    watch,
    dialUniforms: uniforms,
    hour,
    minute,
    second,
    crown,
    dateFace,
    reprint: () => {
      print.material.map.dispose();
      print.material.map = makeDatejustPrint(spec.ink);
      print.material.needsUpdate = true;
    },
  };
}

// No maker's name: the dial carries the library it was built with.
function makeDatejustPrint(ink) {
  const { canvas, ctx, R } = dialCanvas()
  const [r, g, b] = ink
  const strong = `rgba(${r}, ${g}, ${b}, 0.9)`
  const soft = `rgba(${r}, ${g}, ${b}, 0.62)`

  for (let i = 0; i < 60; i += 1) {
    const major = i % 5 === 0
    ctx.save()
    ctx.rotate((i / 60) * Math.PI * 2)
    ctx.fillStyle = strong
    const len = major ? 0.052 * R : 0.028 * R
    const w = major ? 0.01 * R : 0.005 * R
    ctx.fillRect(-w / 2, -0.955 * R, w, len)
    ctx.restore()
  }

  drawSpaced(ctx, "UI SDK", 0, -0.34 * R, 0.06 * R, 0.03 * R, strong, 680)
  drawSpaced(ctx, "PERPETUAL", 0, -0.26 * R, 0.03 * R, 0.026 * R, soft, 600)
  drawSpaced(ctx, "WEB COMPONENTS", 0, 0.42 * R, 0.024 * R, 0.02 * R, soft, 600)

  ctx.fillStyle = strong
  const cy = -0.46 * R
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath()
    ctx.arc(i * 0.022 * R, cy - Math.cos(i * 0.62) * 0.02 * R, 0.008 * R, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(-0.05 * R, cy + 0.012 * R)
  ctx.lineTo(0.05 * R, cy + 0.012 * R)
  ctx.lineTo(0.038 * R, cy + 0.034 * R)
  ctx.lineTo(-0.038 * R, cy + 0.034 * R)
  ctx.closePath()
  ctx.fill()

  return finishTexture(canvas)
}

export const DIALS = {
  champagne: {
    label: "Champagne",
    swatch: "#cbb07a",
    burst: 1,
    light: [0.93, 0.85, 0.64],
    body: [0.8, 0.69, 0.47],
    deep: [0.48, 0.38, 0.22],
    flare: [1.0, 0.93, 0.72],
    ink: [52, 40, 22],
  },
  black: {
    label: "Black",
    swatch: "#1b1c1f",
    burst: 0.35,
    light: [0.055, 0.056, 0.062],
    body: [0.026, 0.027, 0.03],
    deep: [0.008, 0.008, 0.01],
    flare: [0.62, 0.64, 0.7],
    ink: [238, 238, 236],
  },
  blue: {
    label: "Blue",
    swatch: "#203f86",
    burst: 1,
    light: [0.11, 0.21, 0.47],
    body: [0.045, 0.1, 0.28],
    deep: [0.012, 0.03, 0.1],
    flare: [0.5, 0.7, 1.0],
    ink: [236, 240, 248],
  },
  green: {
    label: "Green",
    swatch: "#2f5a35",
    burst: 1,
    light: [0.2, 0.36, 0.22],
    body: [0.09, 0.2, 0.11],
    deep: [0.025, 0.065, 0.035],
    flare: [0.72, 0.92, 0.62],
    ink: [236, 242, 232],
  },
  silver: {
    label: "Silver",
    swatch: "#c9ccd1",
    burst: 1,
    light: [0.9, 0.91, 0.92],
    body: [0.74, 0.75, 0.77],
    deep: [0.45, 0.46, 0.48],
    flare: [1.0, 1.0, 1.0],
    ink: [38, 40, 46],
  },
}

export const METALS = {
  twotone: {
    label: "Two-tone",
    polished: 0xd7d8da,
    bezel: 0xe3bd72,
    satin: 0xc6c8cb,
    center: 0xd9b268,
    markers: 0xdcb76e,
    hands: 0xcfa658,
  },
  steel: {
    label: "Steel",
    polished: 0xd7d8da,
    bezel: 0xe4e6ea,
    satin: 0xc4c6c9,
    center: 0xd0d2d5,
    markers: 0xe1e3e7,
    hands: 0xdcdee2,
  },
  gold: {
    label: "Gold",
    polished: 0xe0b96c,
    bezel: 0xe6c077,
    satin: 0xd2ab62,
    center: 0xdcb46a,
    markers: 0xe0bb72,
    hands: 0xd2a85a,
  },
}

const SPEC = {
  ink: DIALS.champagne.ink,
  dial: DIALS.champagne,
  metals: { ...METALS.twotone, bezelFlat: true, rehaut: 0x8a6f45, handShadow: 0x241a0e },
  lume: { face: 0xf2f4e6, glow: 0xb9f0c9, peak: 3.2 },
}

export function buildWatch({ day = 1, dial = "champagne", metal = "twotone" } = {}) {
  const spec = { ...SPEC, metals: { ...SPEC.metals }, dial: { ...SPEC.dial } }
  const mats = makeMaterials(spec)
  const built = buildDatejust(mats, spec, { day })
  const { watch } = built

  const shadows = [built.hour, built.minute, built.second].map((hand, i) => {
    const shadow = hand.clone(true)
    shadow.traverse((node) => {
      if (node.isMesh) node.material = mats.handShadow
    })
    shadow.position.set(0.02, -0.025, Math.max(0.02, hand.position.z - [0.03, 0.05, 0.07][i]))
    shadow.scale.set(1.02, 1.02, 0.01)
    watch.add(shadow)
    return shadow
  })

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 3.6),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      color: new THREE.Color(spec.lume.glow),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  )
  glow.position.z = 0.6
  glow.renderOrder = 4
  watch.add(glow)

  // A generous invisible target, so the crown is easy to grab on a phone.
  const crownHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  built.crown.add(crownHit)

  const crownX = built.crown.position.x

  const dateCache = new Map()
  let shownDay = day
  dateCache.set(day, built.dateFace.material.map)

  const api = {
    ...built,
    mats,
    shadows,
    glow,
    crownHit,
    lume: spec.lume,
    setDial(id) {
      const d = DIALS[id]
      if (!d) return
      const u = built.dialUniforms
      u.uBurst.value = d.burst
      u.uLight.value.setRGB(...d.light)
      u.uBody.value.setRGB(...d.body)
      u.uDeep.value.setRGB(...d.deep)
      u.uFlareCol.value.setRGB(...d.flare)
      spec.ink = d.ink
      built.reprint()
      mats.rehaut.color.setRGB(d.body[0] * 0.75, d.body[1] * 0.75, d.body[2] * 0.75)
      mats.handShadow.color.setRGB(d.deep[0] * 0.35, d.deep[1] * 0.35, d.deep[2] * 0.35)
      mats.handShadow.opacity = d.light[0] > 0.5 ? 0.3 : 0.55
    },
    setMetal(id) {
      const m = METALS[id]
      if (!m) return
      for (const key of ["polished", "bezel", "satin", "center", "markers", "hands"]) {
        mats[key].color.setHex(m[key])
      }
    },
    setDay(n) {
      if (n === shownDay) return
      shownDay = n
      if (!dateCache.has(n)) dateCache.set(n, makeDateTexture(n))
      built.dateFace.material.map = dateCache.get(n)
      built.dateFace.material.needsUpdate = true
    },
    pullCrown(pull) {
      built.crown.position.x = crownX + pull
    },
  }
  api.setDial(dial)
  api.setMetal(metal)
  return api
}
