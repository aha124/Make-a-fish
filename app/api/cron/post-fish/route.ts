// POST /api/cron/post-fish
//
// Generates a random fish and publishes it to Instagram via the official Graph
// API. Meant to be called by an external scheduler twice a day (see README).
//
// Auth: requires `Authorization: Bearer <POST_SECRET>`. Anything else is 401.
// This is what keeps strangers from triggering posts.
//
// ?dryRun=1: runs only the seed + URL building steps and returns them as JSON
// without creating or publishing anything on Instagram, so the image and caption
// can be eyeballed before trusting the real thing.

import { randomSeed, encodeSeed } from "@/lib/prng";
import {
  buildCaption,
  createMediaContainer,
  waitForContainerReady,
  publishMedia,
  GraphApiError,
} from "@/lib/instagram";

// Needs the Node runtime: it talks to the Graph API and shares code with the
// Node-only image endpoint.
export const runtime = "nodejs";
// Never cache: every call must mint a fresh fish.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  // --- Auth: Bearer <POST_SECRET> or 401 ---
  const secret = process.env.POST_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  // The public site origin, needed to build the image + share URLs Instagram and
  // readers will fetch.
  let siteUrl: string;
  try {
    siteUrl = resolveSiteUrl();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  // Step 1: a random 32-bit seed from a cryptographic source.
  const seed = randomSeed();
  // Step 2: the public image URL Instagram will fetch (raw numeric seed).
  const imageUrl = `${siteUrl}/api/fish-image?seed=${seed}`;
  // The share page uses the base62 seed token, so /f/<token> renders this exact
  // fish. The caption links here, not to the raw image.
  const shareToken = encodeSeed(seed);
  const shareUrl = `${siteUrl}/f/${shareToken}`;
  const caption = buildCaption(siteUrl, shareToken);

  // Task 4: dry run. Return everything to verify, publish nothing.
  if (dryRun) {
    return json({ dryRun: true, seed, imageUrl, shareUrl, caption }, 200);
  }

  const igUserId = process.env.IG_USER_ID;
  const accessToken = process.env.IG_ACCESS_TOKEN;
  if (!igUserId || !accessToken) {
    return json({ error: "missing IG_USER_ID or IG_ACCESS_TOKEN" }, 500);
  }

  try {
    // Step 3: create the media container.
    const creationId = await createMediaContainer({ igUserId, imageUrl, caption, accessToken });
    // Step 4: poll until the container is FINISHED.
    await waitForContainerReady({ containerId: creationId, accessToken });
    // Step 5: publish.
    const mediaId = await publishMedia({ igUserId, creationId, accessToken });

    // Step 6: log the response including the media id, return a small summary.
    console.log("[post-fish] published", { seed, shareUrl, imageUrl, creationId, mediaId });
    return json({ ok: true, seed, shareUrl, imageUrl, creationId, mediaId }, 200);
  } catch (e) {
    // On any error, return the error body and a non-200 so the scheduler's logs
    // show the failure.
    if (e instanceof GraphApiError) {
      console.error("[post-fish] instagram error", { seed, status: e.status, body: e.body });
      const status = e.status >= 400 && e.status <= 599 ? e.status : 502;
      return json({ ok: false, error: e.message, body: e.body }, status);
    }
    console.error("[post-fish] error", e);
    return json({ ok: false, error: (e as Error)?.message ?? "unknown error" }, 500);
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Resolve the public site origin. Prefer SITE_URL; fall back to Vercel's
// production URL var if present. Trailing slashes trimmed so URL joins are clean.
function resolveSiteUrl(): string {
  const explicit = process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");
  throw new Error("SITE_URL is not set");
}
