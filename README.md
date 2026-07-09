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
