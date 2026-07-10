// Instagram posting via Meta's official Instagram Graph API.
//
// Only the official Graph API (graph.facebook.com) is used here. No unofficial
// or login-based Instagram library, ever.
//
// TOKEN REFRESH (out of scope for v1, read this): IG_ACCESS_TOKEN must be a
// 60-day long-lived token. There is deliberately NO automated refresh here.
// Refresh it by hand before it expires (the README explains how). Automating it
// later means adding a small stored-token step: somewhere to persist the
// rotated token between runs. We skip that for now because this project has no
// database and none of this needs one.

// Pin the Graph API version so behavior does not drift under us.
const GRAPH_API_BASE = "https://graph.facebook.com/v22.0";

// -------------------------------------------------------------------------
// Caption
// -------------------------------------------------------------------------
//
// The entire caption copy lives in this one function so it is trivial to edit.
// Keep it short and modest, no marketing shout, and NO em dashes anywhere. It
// nudges the reader to make their own fish at 11:11 in their own local time, and
// links to this exact fish's page on the site. It uses the /f/<seed> share page
// (a real page on the site), not the raw image URL, so every post pulls traffic
// back to the site.
export function buildCaption(siteUrl: string, shareToken: string): string {
  const site = trimTrailingSlash(siteUrl);
  return [
    "11:11. here is today's fish.",
    `make your own at 11:11, morning or night, your local time: ${site}`,
    `this one lives at ${site}/f/${shareToken}`,
  ].join("\n");
}

function trimTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

// -------------------------------------------------------------------------
// Graph API calls
// -------------------------------------------------------------------------

// Carries the Graph API error body so the route can return it verbatim and the
// scheduler's logs show exactly what Instagram rejected.
export class GraphApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.body = body;
  }
}

// Step 3: create a media container for the image + caption. Returns its id
// (the creation_id used to publish).
export async function createMediaContainer(params: {
  igUserId: string;
  imageUrl: string;
  caption: string;
  accessToken: string;
}): Promise<string> {
  const body = new URLSearchParams({
    image_url: params.imageUrl,
    caption: params.caption,
    access_token: params.accessToken,
  });
  const res = await fetch(`${GRAPH_API_BASE}/${params.igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new GraphApiError(extractMessage(data, "failed to create media container"), res.status, data);
  }
  const id = (data as { id?: string })?.id;
  if (!id) throw new GraphApiError("media container response missing id", 502, data);
  return String(id);
}

// Step 4: poll the container until it reads FINISHED. Images are usually ready
// fast, but we do not skip this. Short timeout, a handful of retries.
export async function waitForContainerReady(params: {
  containerId: string;
  accessToken: string;
  attempts?: number;
  delayMs?: number;
}): Promise<void> {
  const { containerId, accessToken, attempts = 6, delayMs = 1500 } = params;
  for (let i = 0; i < attempts; i++) {
    const url = `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(
      accessToken
    )}`;
    const res = await fetch(url);
    const data = await readJson(res);
    if (!res.ok) {
      throw new GraphApiError(extractMessage(data, "failed to read container status"), res.status, data);
    }
    const status = (data as { status_code?: string })?.status_code;
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new GraphApiError(`media container status is ${status}`, 502, data);
    }
    // IN_PROGRESS (or anything else): wait and retry, unless we are out of tries.
    if (i < attempts - 1) await sleep(delayMs);
  }
  throw new GraphApiError("media container was not FINISHED before timeout", 504, { containerId });
}

// Step 5: publish the container. Returns the resulting media id.
export async function publishMedia(params: {
  igUserId: string;
  creationId: string;
  accessToken: string;
}): Promise<string> {
  const body = new URLSearchParams({
    creation_id: params.creationId,
    access_token: params.accessToken,
  });
  const res = await fetch(`${GRAPH_API_BASE}/${params.igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new GraphApiError(extractMessage(data, "failed to publish media"), res.status, data);
  }
  const id = (data as { id?: string })?.id;
  if (!id) throw new GraphApiError("media_publish response missing id", 502, data);
  return String(id);
}

// -------------------------------------------------------------------------
// Small helpers
// -------------------------------------------------------------------------

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Graph API errors come back as { error: { message, ... } }. Pull the message
// out when present, else fall back to a default.
function extractMessage(data: unknown, fallback: string): string {
  const msg = (data as { error?: { message?: string } })?.error?.message;
  return msg ? String(msg) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
