# 11:11 make a fish

A faithful remake of [makea.fish](https://makea.fish), originally made by
weepingwitch. You can only make a fish at 11:11, morning or night, in your own
local time. Outside that window the page just tells you to come back at 11:11.

The whole charm is the crude, lovable, MS-Paint-looking fish and the ritual of
catching the exact minute. It is meant to stay crude. Please do not polish it.

## Stack

- Next.js (App Router) + TypeScript, deployed on Vercel.
- Plain HTML canvas 2D for the drawing. No game or graphics engine.
- No database, no auth, no external services, no analytics.

## How it works

### Server-authoritative time gate (anti-spoof)

The 11:11 window is decided on the **server**, never in client JavaScript,
because the browser clock is trivially spoofable.

- On Vercel we read the `x-vercel-ip-timezone` request header (an IANA name like
  `America/Chicago`, present on all plans, derived from the visitor IP).
- Using the server's own trusted UTC clock, we project it into that timezone and
  decide `open`, plus `serverNow` and the upcoming `windowEnd` (11:12:00).
- The client renders the countdown against the server clock via a measured
  offset, so even the displayed countdown does not trust the local clock. When
  it reaches `windowEnd` the page switches to the closed state with no reload.
- Fallback for local dev or any host without the header:
  `Intl.DateTimeFormat().resolvedOptions().timeZone`. This path is unhardened
  and is for dev only.
- Dev-only override: `?forceOpen=1`, gated behind `NODE_ENV !== 'production'` so
  it can never open the window in production.

See `lib/time.ts` and `app/page.tsx`.

### Seeded, database-free fish

Every fish is a pure function of a 32-bit seed. A small seeded PRNG
(mulberry32) drives every random choice in the drawing code. There is no
`Math.random` anywhere in the drawing path, so:

- The same seed draws a pixel-identical fish across reloads, browsers, devices.
- Sharing is free with no database: a share link `/f/<seed>` just redraws the
  fish for that seed, and is not time gated.

On `/`, the current seed lives in component state, not the URL, so a plain
refresh naturally makes a new fish (the authentic behavior). "Make another"
rerolls the seed. "Share" copies `https://<host>/f/<seed>`.

See `lib/prng.ts` and `lib/fish.ts`.

## Routes

- `/` : the main page. Server component computes the window, client component
  draws the fish, offers "make another" and "share", and shows a live countdown
  to 11:12. When closed it shows `come back at 11:11`.
- `/f/[seed]` : the exact fish for that seed, not time gated, plus a small link
  to go make your own at 11:11.

## The corner mark

The original places a small flag emoji in the top-left corner. It is kept as a
single labeled constant `CORNER_MARK` in `lib/constants.ts` so it is trivial to
add or remove. It is currently empty (disabled).

## Development

```bash
npm install
npm run dev      # then open http://localhost:3000/?forceOpen=1 to test the open state
npm run build
```

## Instagram auto-posting bot

The site can post a generated fish to an Instagram account twice a day. The
image is just the fish, cropped, on the site's exact blue. The caption drives
people back to the site. It uses only Meta's official Instagram Graph API, no
unofficial or login-based library.

The same seeded `drawFish` routine draws the on-site canvas and the posted
image, so a seed looks identical on the site and in the post. The server image
is rendered with `@napi-rs/canvas`.

### Endpoints

- `GET /api/fish-image?seed=<n>` : a 1080x1080 JPEG of that exact fish on blue.
  Deterministic (the same seed is byte-identical), long-cached, Node runtime.
- `POST /api/cron/post-fish` : generates a random fish and publishes it. This is
  what the external scheduler calls.

### Env vars

All read server-side, none hardcoded, none in the client bundle:

| Var               | What it is                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `IG_USER_ID`      | The Instagram Business/Creator account's user id.                 |
| `IG_ACCESS_TOKEN` | A 60-day long-lived Instagram Graph API token (see below).        |
| `POST_SECRET`     | Shared secret the scheduler sends as `Authorization: Bearer ...`. |
| `SITE_URL`        | The public origin, e.g. `https://your-site.example`. Used to build the public image and share URLs. On Vercel it falls back to `VERCEL_PROJECT_PRODUCTION_URL` if unset. |

### Getting the Instagram token and user id

You need an Instagram **Business or Creator** account linked to a Facebook Page,
and a Meta app with the Instagram Graph API product.

1. In the Meta app, use the Graph API Explorer (or your app's login flow) to get
   a **User access token** with the `instagram_basic`,
   `instagram_content_publish`, `pages_show_list`, and `pages_read_engagement`
   permissions.
2. Exchange it for a **long-lived** token (valid ~60 days):
   `GET https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_LIVED_TOKEN>`.
   Put the result in `IG_ACCESS_TOKEN`.
3. Find the Instagram user id: get your Page id from
   `GET /me/accounts`, then read
   `GET /<PAGE_ID>?fields=instagram_business_account`. The
   `instagram_business_account.id` is your `IG_USER_ID`.

**Token refresh cadence:** `IG_ACCESS_TOKEN` is a 60-day long-lived token and
there is no automated refresh in this version. Refresh it manually before it
expires by re-running the exchange above (a long-lived token can also be
refreshed via `grant_type=ig_refresh_token` once it is at least 24 hours old).
Automating this later means adding a small stored-token step to persist the
rotated token; skipped for now since there is no database.

### Dry run before going live

The posting endpoint takes a `?dryRun=1` flag that runs only the seed and
URL-building steps. It returns the seed, the image URL, the `/f/<seed>` share
URL, and the exact caption as JSON, and creates or publishes nothing on
Instagram. Use it to eyeball the image and caption first:

```bash
# 1. Dry run: check the image and caption, publishes nothing.
curl -s -X POST -H "Authorization: Bearer $POST_SECRET" \
  "https://your-site.example/api/cron/post-fish?dryRun=1"
# Open the imageUrl from the JSON to eyeball the fish.

# 2. For real: publishes to Instagram, returns the media id.
curl -s -X POST -H "Authorization: Bearer $POST_SECRET" \
  "https://your-site.example/api/cron/post-fish"
```

### External scheduler setup

Vercel's built-in cron is not used: its free tier cannot fire at a precise
minute. Point any external scheduler (cron-job.org, EasyCron, GitHub Actions
cron, your own box, etc.) at the endpoint instead. Create **two schedules** in a
named timezone so they land at 11:11 local, firing a minute early to leave room
for container creation:

- `11:00` in your chosen timezone (e.g. `America/Chicago`)
- `23:00` in the same timezone

Each schedule sends:

```
POST https://your-site.example/api/cron/post-fish
Authorization: Bearer <POST_SECRET>
```

On success the endpoint returns `{ ok: true, seed, mediaId, shareUrl, ... }`. On
any failure it returns the error body with a non-200 status, so the failure
shows up in the scheduler's logs.

### Server render check

To verify a server render matches the site for a seed, draw one to a file:

```bash
npx tsx scripts/render-fish.ts 12345 fish.jpg   # or: npm run render:fish -- 12345 fish.jpg
```
