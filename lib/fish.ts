// Deterministic fish drawing.
//
// A fish is a pure function of its seed. Every random choice below is drawn
// from the seeded Rng, never Math.random, so the same seed always produces a
// pixel-identical fish across reloads, browsers, and devices.
//
// The look is deliberately crude and layered, like something knocked out in MS
// Paint: wobbly hand-drawn black outlines, clashing saturated colors, smooth
// gradients, semi-transparent overlaps, and sketchy scale marks. Do not clean
// this up. Crude is the point.

import { Rng } from "./prng";

// Base thickness, in px, for the black body / fin / tail outlines (the thick
// hand-drawn edge). Every one of those outline stroke widths is this value
// times a small per-part and seeded multiplier, so this single knob scales them
// all together. Set it to 0 to draw no outlines at all: the stroke calls are
// skipped entirely, while the fish's shape and colors stay unchanged. Gill
// lines and scale marks are intentionally not affected by this.
const OUTLINE_WIDTH = 0;

// A plain 2D canvas context: the minimal drawing surface `drawFish` needs.
// `drawFish` depends only on this and a size; it never touches `window`,
// `document`, or any browser-only global, so the identical drawing code runs in
// the browser and on the server. The browser passes a real
// `CanvasRenderingContext2D`; the server passes `@napi-rs/canvas`'s
// `SKRSContext2D`. Both structurally satisfy this type, so a seed produces the
// same fish in both places. Kept as a hand-written structural type (rather than
// `CanvasRenderingContext2D`) so neither the DOM lib nor the native canvas types
// have to be a perfect superset of the other.
interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}
type Ctx = {
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  setLineDash(segments: number[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): CanvasGradientLike;
  // Styles accept a string or a gradient; typed loosely so both the DOM context
  // (which also allows CanvasPattern) and the native context assign cleanly.
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
};

type HSLA = { h: number; s: number; l: number; a?: number };

function hsla({ h, s, l, a = 1 }: HSLA): string {
  return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`;
}

// Build a closed path of points around an ellipse, each radius perturbed by a
// few pixels of seeded noise so the outline reads as hand-drawn, not vector.
function wobblyEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  rng: Rng,
  wobble: number,
  steps = 40
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const wob = 1 + rng.jitter(wobble);
    const ex = Math.cos(t) * rx * wob;
    const ey = Math.sin(t) * ry * wob;
    pts.push([cx + ex * cos - ey * sin, cy + ex * sin + ey * cos]);
  }
  return pts;
}

// The body is picked from a set of archetypes rather than always being one
// ellipse. Each is still crude and hand-drawn; the archetype only bends the
// base profile before the usual scale, tilt, and edge jitter go on top.
type BodyKind = "round" | "torpedo" | "disc" | "teardrop";

// Local silhouette point for a body archetype at angle t, before tilt and edge
// jitter. Local +x points toward the tail, -x toward the head; hw and hh are
// the base half-width and half-height. Each archetype warps the base ellipse a
// different way.
function shapePoint(kind: BodyKind, t: number, hw: number, hh: number): [number, number] {
  const ex = Math.cos(t) * hw;
  let ey = Math.sin(t) * hh;
  const nx = Math.cos(t); // -1 at the head, +1 at the tail
  if (kind === "torpedo") {
    // Pinch both ends toward blunt points so it reads as a long torpedo.
    ey *= 1 - 0.42 * Math.pow(Math.abs(nx), 2.2);
  } else if (kind === "teardrop") {
    // Fat at the head, tapering to a narrow peduncle at the tail.
    ey *= 0.5 + 0.5 * (0.5 - 0.5 * nx);
  } else if (kind === "disc") {
    // A rounder disc with a touch of belly fullness.
    ey *= 1 + 0.05 * Math.sin(t);
  }
  // "round" is just the plain ellipse.
  return [ex, ey];
}

// Build the wobbly body outline for a chosen archetype, using the same seeded
// per-point edge jitter as everything else so it stays hand-drawn.
function bodyPath(
  kind: BodyKind,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  tilt: number,
  rng: Rng,
  wobble: number,
  steps = 56
): Array<[number, number]> {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const [sx, sy] = shapePoint(kind, t, hw, hh);
    const wob = 1 + rng.jitter(wobble);
    const ex = sx * wob;
    const ey = sy * wob;
    pts.push([cx + ex * cos - ey * sin, cy + ex * sin + ey * cos]);
  }
  return pts;
}

// Trace a point list as a smooth-ish closed curve using quadratic midpoints.
function tracePath(ctx: Ctx, pts: Array<[number, number]>) {
  ctx.beginPath();
  const n = pts.length;
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  let prevMid = mid(pts[n - 1], pts[0]);
  ctx.moveTo(prevMid[0], prevMid[1]);
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const nextMid = mid(curr, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(curr[0], curr[1], nextMid[0], nextMid[1]);
    prevMid = nextMid;
  }
  ctx.closePath();
}

// Stroke a path as a wobbly black hand-drawn outline. Line width jitters a
// little along the way by overdrawing a couple of passes. `weight` is a small
// per-part multiplier of OUTLINE_WIDTH, not a pixel amount. When OUTLINE_WIDTH
// is 0 the stroke calls are skipped so nothing draws, but the seeded values are
// still consumed so the rest of the fish is unaffected.
function inkOutline(ctx: Ctx, pts: Array<[number, number]>, rng: Rng, weight: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.92)";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const passes = 2;
  for (let p = 0; p < passes; p++) {
    // Seeded per-pass variation kept as a small multiplier of OUTLINE_WIDTH.
    ctx.lineWidth = OUTLINE_WIDTH * weight * (0.75 + rng.float() * 0.6);
    if (OUTLINE_WIDTH > 0) {
      tracePath(ctx, pts);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// A tail is drawn as a rough polygon fanning out to the right of the body.
function drawTail(ctx: Ctx, rng: Rng, x: number, y: number, size: number, bodyHue: number) {
  const kind = rng.pick(["fan", "wedge", "triangle", "double"] as const);
  const c1 = hsla({ h: (bodyHue + rng.range(120, 220)) % 360, s: rng.range(70, 95), l: rng.range(45, 65), a: rng.range(0.8, 1) });
  const c2 = hsla({ h: (bodyHue + rng.range(160, 300)) % 360, s: rng.range(70, 95), l: rng.range(55, 75), a: rng.range(0.75, 1) });
  const grad = ctx.createLinearGradient(x, y - size, x + size, y + size);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);

  const w = size * rng.range(0.9, 1.4);
  const spread = size * rng.range(0.7, 1.2);

  const build = (topSpread: number, botSpread: number): Array<[number, number]> => [
    [x + rng.jitter(4), y + rng.jitter(4)],
    [x + w + rng.jitter(6), y - topSpread + rng.jitter(8)],
    [x + w * rng.range(0.85, 1.05) + rng.jitter(6), y + rng.jitter(10)],
    [x + w + rng.jitter(6), y + botSpread + rng.jitter(8)],
  ];

  ctx.save();
  ctx.fillStyle = grad;
  if (kind === "double") {
    const top = build(spread * 1.1, spread * 0.1);
    const bot = build(spread * 0.1, spread * 1.1);
    for (const poly of [top, bot]) {
      tracePath(ctx, poly);
      ctx.fill();
      inkOutline(ctx, poly, rng, 1.0);
    }
  } else {
    const topS = kind === "triangle" ? spread : spread * rng.range(0.9, 1.2);
    const botS = kind === "triangle" ? spread : spread * rng.range(0.9, 1.2);
    const poly = build(topS, botS);
    if (kind === "fan") {
      // Add a midpoint bulge on the trailing edge for a fanned look.
      poly.splice(2, 0, [x + w * 1.15 + rng.jitter(6), y - spread * 0.5 + rng.jitter(8)]);
      poly.splice(4, 0, [x + w * 1.15 + rng.jitter(6), y + spread * 0.5 + rng.jitter(8)]);
    }
    tracePath(ctx, poly);
    ctx.fill();
    inkOutline(ctx, poly, rng, 1.0);
  }
  ctx.restore();
}

// A rough leaf/ellipse fin. Used for pectoral, dorsal, and ventral fins.
function drawFin(
  ctx: Ctx,
  rng: Rng,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  hue: number,
  opts: { dashed?: boolean; gradient?: boolean } = {}
) {
  const pts = wobblyEllipse(cx, cy, rx, ry, rot, rng, 0.09, 28);
  const l1 = rng.range(45, 70);
  ctx.save();
  if (opts.gradient) {
    const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    g.addColorStop(0, hsla({ h: hue % 360, s: rng.range(70, 95), l: l1, a: rng.range(0.7, 0.95) }));
    g.addColorStop(1, hsla({ h: (hue + rng.range(20, 80)) % 360, s: rng.range(70, 95), l: l1 + 12, a: rng.range(0.7, 0.95) }));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = hsla({ h: hue % 360, s: rng.range(70, 95), l: l1, a: rng.range(0.7, 0.95) });
  }
  tracePath(ctx, pts);
  ctx.fill();

  if (opts.dashed) {
    // Dashed fin edge is a black outline too, so route it through OUTLINE_WIDTH
    // and skip it entirely when outlines are off.
    if (OUTLINE_WIDTH > 0) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = OUTLINE_WIDTH * 0.9;
      tracePath(ctx, pts);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else {
    inkOutline(ctx, pts, rng, 0.9);
  }
  ctx.restore();
}

// Sketchy scale marks: a patch of small repeated arcs over part of the body.
function drawScales(
  ctx: Ctx,
  rng: Rng,
  bodyPts: Array<[number, number]>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  bodyHue: number
) {
  ctx.save();
  // Clip to the body so scales never spill past the outline.
  tracePath(ctx, bodyPts);
  ctx.clip();

  const darker = rng.bool();
  const l = darker ? rng.range(25, 40) : rng.range(60, 80);
  ctx.strokeStyle = hsla({ h: bodyHue, s: rng.range(40, 80), l, a: rng.range(0.3, 0.55) });
  ctx.lineWidth = rng.range(1.2, 2.2);
  ctx.lineCap = "round";

  const step = rng.range(rx * 0.12, rx * 0.2);
  // Cover a sub-region of the body, offset by a seeded amount.
  const startX = cx - rx * rng.range(0.2, 0.6);
  const endX = cx + rx * rng.range(0.4, 0.85);
  const startY = cy - ry * rng.range(0.4, 0.7);
  const endY = cy + ry * rng.range(0.4, 0.7);
  let row = 0;
  for (let sy = startY; sy < endY; sy += step) {
    const offset = row % 2 === 0 ? 0 : step / 2;
    for (let sx = startX + offset; sx < endX; sx += step) {
      const r = step * rng.range(0.45, 0.62);
      ctx.beginPath();
      ctx.arc(sx + rng.jitter(2), sy + rng.jitter(2), r, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    row++;
  }
  ctx.restore();
}

// Draw one gill: a short curved black line behind the eye.
function drawGills(ctx: Ctx, rng: Rng, x: number, y: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = rng.range(1.8, 3);
  ctx.lineCap = "round";
  const count = rng.int(1, 3);
  for (let i = 0; i < count; i++) {
    const gx = x + i * rng.range(6, 11);
    ctx.beginPath();
    ctx.moveTo(gx, y - h / 2 + rng.jitter(4));
    ctx.quadraticCurveTo(gx - rng.range(6, 12), y, gx, y + h / 2 + rng.jitter(4));
    ctx.stroke();
  }
  ctx.restore();
}

// Draw the complete fish onto ctx, filling a square drawing region of side S.
export function drawFish(ctx: Ctx, seed: number, S: number) {
  const rng = new Rng(seed);

  ctx.clearRect(0, 0, S, S);

  // Shrink the whole drawing slightly around the canvas center so the fish,
  // tail and fins included, always sits inside the box with a margin.
  ctx.save();
  const fit = 0.78;
  ctx.translate(S / 2, S / 2);
  ctx.scale(fit, fit);
  ctx.translate(-S / 2, -S / 2);

  // Body geometry. Sat left of center so the tail has room on the right, with a
  // little seeded drift and a slight tilt. The seed first picks a body
  // archetype, then hw/hh (base half-width and half-height) are sized to suit
  // it: the torpedo is long and thin, the disc is taller than it is long, and
  // so on.
  const archetype = rng.pick(["round", "torpedo", "disc", "teardrop"] as const);
  const cx = S * 0.44 + rng.jitter(S * 0.03);
  const cy = S * 0.5 + rng.jitter(S * 0.05);

  let hw: number;
  let hh: number;
  if (archetype === "round") {
    hw = S * rng.range(0.22, 0.27);
    hh = hw * rng.range(0.85, 1.0);
  } else if (archetype === "torpedo") {
    hw = S * rng.range(0.26, 0.31);
    hh = hw * rng.range(0.32, 0.46);
  } else if (archetype === "disc") {
    hh = S * rng.range(0.23, 0.29);
    hw = hh * rng.range(0.6, 0.82); // taller than long, like an angelfish
  } else {
    // teardrop
    hw = S * rng.range(0.25, 0.3);
    hh = hw * rng.range(0.55, 0.72);
  }

  const tilt = rng.jitter(0.18); // a few degrees
  const wobble = rng.range(0.03, 0.08);

  const bodyHue = rng.range(0, 360);
  const finHue = (bodyHue + rng.range(120, 240)) % 360;

  // The wobbly outline for the chosen body.
  const bodyPts = bodyPath(archetype, cx, cy, hw, hh, tilt, rng, wobble, 56);

  // Attachment anchors read off the actual archetype silhouette (sampled
  // without jitter for stable placement) so the eye, gills, fins, and tail hang
  // off whichever body was chosen, not off a plain ellipse. Facing left: head
  // and eye on the left, tail on the right.
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const toWorld = (ex: number, ey: number): [number, number] => [
    cx + ex * cos - ey * sin,
    cy + ex * sin + ey * cos,
  ];
  const headTip = shapePoint(archetype, Math.PI, hw, hh); // leftmost
  const tailTip = shapePoint(archetype, 0, hw, hh); // rightmost
  const topReach = Math.abs(shapePoint(archetype, -Math.PI / 2, hw, hh)[1]);
  const botReach = Math.abs(shapePoint(archetype, Math.PI / 2, hw, hh)[1]);

  // --- Back-to-front layering ---

  // Tail, behind the body, hung off the rear of the actual body.
  const tailH = Math.max(hh * 0.8, S * 0.1);
  const tailAnchor = toWorld(tailTip[0] * 0.98, 0);
  drawTail(ctx, rng, tailAnchor[0] - hw * 0.04, tailAnchor[1], tailH * rng.range(1.0, 1.4), bodyHue);

  // Dorsal fin peeking above the body's top edge.
  const dorsal = toWorld(rng.jitter(hw * 0.3), -topReach * rng.range(0.9, 1.1));
  drawFin(
    ctx,
    rng,
    dorsal[0],
    dorsal[1],
    hw * rng.range(0.28, 0.45),
    topReach * rng.range(0.5, 0.9),
    rng.jitter(0.5),
    finHue,
    { gradient: rng.bool(0.6) }
  );

  // Ventral fin(s) peeking below the body's bottom edge.
  const ventralCount = rng.int(1, 2);
  for (let i = 0; i < ventralCount; i++) {
    const v = toWorld(-hw * 0.2 + i * hw * rng.range(0.4, 0.6), botReach * rng.range(0.9, 1.1));
    drawFin(
      ctx,
      rng,
      v[0],
      v[1],
      hw * rng.range(0.16, 0.28),
      botReach * rng.range(0.35, 0.6),
      rng.jitter(0.5),
      finHue,
      { gradient: rng.bool(0.4), dashed: rng.bool(0.2) }
    );
  }

  // Body: gradient fill (radial or two-stop linear) plus wobbly black outline.
  ctx.save();
  const bodyAlpha = rng.range(0.85, 1);
  const bodyL = rng.range(40, 58);
  const bodyS = rng.range(65, 92);
  if (rng.bool(0.6)) {
    const rg = ctx.createRadialGradient(
      cx - hw * 0.2,
      cy - hh * 0.2,
      hw * 0.1,
      cx,
      cy,
      Math.max(hw, hh)
    );
    rg.addColorStop(0, hsla({ h: bodyHue, s: bodyS, l: bodyL + rng.range(12, 24), a: bodyAlpha }));
    rg.addColorStop(1, hsla({ h: bodyHue, s: bodyS, l: bodyL, a: bodyAlpha }));
    ctx.fillStyle = rg;
  } else {
    const lg = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
    lg.addColorStop(0, hsla({ h: bodyHue, s: bodyS, l: bodyL + rng.range(8, 20), a: bodyAlpha }));
    lg.addColorStop(1, hsla({ h: (bodyHue + rng.jitter(20)) % 360, s: bodyS, l: bodyL, a: bodyAlpha }));
    ctx.fillStyle = lg;
  }
  tracePath(ctx, bodyPts);
  ctx.fill();
  ctx.restore();

  // Scales over part of the body. drawScales clips to bodyPts, so they conform
  // to whichever archetype was drawn.
  drawScales(ctx, rng, bodyPts, cx, cy, hw, hh, bodyHue);

  // Body outline drawn after scales so it stays crisp on top. The body reads a
  // touch heavier than the fins, kept as a small seeded multiplier of
  // OUTLINE_WIDTH.
  inkOutline(ctx, bodyPts, rng, rng.range(1.05, 1.45));

  // Pectoral fin on the mid body, a contrasting leaf/ellipse.
  const pec = toWorld(hw * rng.range(0.05, 0.3), botReach * rng.range(0.0, 0.35));
  drawFin(
    ctx,
    rng,
    pec[0],
    pec[1],
    hw * rng.range(0.3, 0.5),
    hh * rng.range(0.35, 0.6),
    rng.range(-0.35, 0.15),
    (finHue + rng.range(0, 60)) % 360,
    { gradient: rng.bool(0.7), dashed: rng.bool(0.25) }
  );

  // Eye near the head, keyed off the head end of the chosen body.
  const eyeLocalX = headTip[0] * 0.62;
  const eye = toWorld(eyeLocalX, -topReach * rng.range(0.12, 0.4));
  const eyeX = eye[0];
  const eyeY = eye[1];

  // Gills just behind the eye.
  const gill = toWorld(eyeLocalX + hw * 0.22, -hh * 0.05);
  drawGills(ctx, rng, gill[0], gill[1], hh * rng.range(0.7, 1.0));

  // Eye: white circle with an off-center black pupil.
  const eyeR = Math.max(hh * rng.range(0.16, 0.24), S * 0.018);
  ctx.save();
  ctx.fillStyle = "white";
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = rng.range(1.5, 2.5);
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.arc(
    eyeX + rng.jitter(eyeR * 0.5),
    eyeY + rng.jitter(eyeR * 0.5),
    eyeR * rng.range(0.45, 0.65),
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();

  // Close the fit transform opened at the top.
  ctx.restore();
}
