// Task 1 checkpoint: render a fish on the server.
//
// Draws a seed to a JPEG using @napi-rs/canvas and the SAME shared `drawFish`
// routine the browser uses, so you can eyeball that a server render matches the
// on-site canvas for a given seed. This is a dev aid, not part of the app.
//
// Usage:
//   npx tsx scripts/render-fish.ts <seed> [outfile]
//   npx tsx scripts/render-fish.ts 12345 fish.jpg
//
// (or `npm run render:fish -- 12345 fish.jpg`)

import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { drawFish } from "../lib/fish";
import { BLUE } from "../lib/constants";

const SIZE = 1080;
const JPEG_QUALITY = 92;

const seed = (Number(process.argv[2] ?? "12345") >>> 0) as number;
const out = process.argv[3] ?? `fish-${seed}.jpg`;

const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext("2d");

// Same routine as the site. It clears to transparent, then paints the fish.
drawFish(ctx, seed, SIZE);

// Paint the site's exact blue behind the fish so the transparent background
// becomes solid blue (JPEG has no alpha). `destination-over` draws beneath the
// existing fish, matching how the site shows blue behind a transparent canvas.
ctx.globalCompositeOperation = "destination-over";
ctx.fillStyle = BLUE;
ctx.fillRect(0, 0, SIZE, SIZE);

writeFileSync(out, canvas.toBuffer("image/jpeg", JPEG_QUALITY));
console.log(`wrote ${out} for seed ${seed}`);
