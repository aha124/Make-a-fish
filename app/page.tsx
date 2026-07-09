import { headers } from "next/headers";
import { computeWindow } from "@/lib/time";
import HomeClient from "./HomeClient";

// The main page is a server component. It reads the visitor's timezone from the
// trusted Vercel edge header and decides the 11:11 window on the server, using
// the server's own clock. The client never gets to override a server "closed".
export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const h = headers();

  // On Vercel this header is derived from the visitor IP and present on all
  // plans, with no configuration. It is an IANA name like "America/Chicago".
  const headerTz = h.get("x-vercel-ip-timezone");

  // Fallback for local dev or any host without the header. This path is
  // unhardened: it trusts the server process timezone, which is fine for dev.
  const timezone =
    headerTz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const state = computeWindow(timezone);

  // Dev-only override so the window can be tested at any time. This is gated so
  // it can never take effect in a production build.
  const forceOpen =
    process.env.NODE_ENV !== "production" && searchParams.forceOpen === "1";

  if (forceOpen && !state.open) {
    state.open = true;
    // Give the countdown something to run against: pretend 11:12 is a minute out.
    state.windowEnd = state.serverNow + 60_000;
  }

  return (
    <HomeClient
      open={state.open}
      serverNow={state.serverNow}
      windowEnd={state.windowEnd}
      timezone={state.timezone}
    />
  );
}
