// GET /api/fish-image?seed=<n>
//
// Returns a 1080x1080 JPEG of the fish for a given seed, drawn on the site's
// exact blue with the SAME shared drawing routine the browser uses, so a seed
// looks identical on the site and in an Instagram post. Instagram only accepts
// JPEG, so this is image/jpeg, never PNG.
//
// Deterministic: the same seed always produces the same bytes, so long cache
// headers are safe.

import { createCanvas } from "@napi-rs/canvas";
import { drawFish } from "@/lib/fish";
import { BLUE } from "@/lib/constants";

// Needs the Node runtime for @napi-rs/canvas (native), not the Edge runtime.
export const runtime = "nodejs";

// Instagram expects a square; 1080x1080 is the standard feed size.
const SIZE = 1080;
// Fixed quality keeps the output byte-identical across reloads for a seed.
const JPEG_QUALITY = 92;

export async function GET(req: Request): Promise<Response> {
  const seed = parseSeed(new URL(req.url).searchParams.get("seed"));
  if (seed == null) {
    return new Response(JSON.stringify({ error: "invalid or missing seed" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  // The shared routine clears to transparent then paints the fish, already
  // centered and scaled to sit inside the square with padding (tail and fins
  // included), with no browser chrome, frame, or caption text.
  drawFish(ctx, seed, SIZE);

  // Fill the square with the site's exact blue, painted BEHIND the fish so
  // semi-transparent fish pixels blend against blue exactly as they do over the
  // site's blue background. JPEG has no alpha, so this also makes the empty area
  // solid blue instead of black.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const jpeg = canvas.toBuffer("image/jpeg", JPEG_QUALITY);

  return new Response(jpeg, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// Accept a decimal 32-bit unsigned seed (matches ?seed=${seed} where seed is a
// raw number). Returns the normalized seed, or null if it is not a valid
// 32-bit unsigned integer.
function parseSeed(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
  return n >>> 0;
}
