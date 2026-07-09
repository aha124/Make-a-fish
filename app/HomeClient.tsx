"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FishFrame from "@/components/FishFrame";
import FishCanvas from "@/components/FishCanvas";
import { encodeSeed, randomSeed } from "@/lib/prng";
import { CLOSED_MESSAGE } from "@/lib/constants";

type Props = {
  open: boolean;
  serverNow: number;
  windowEnd: number | null;
  timezone: string;
};

export default function HomeClient({ open: serverOpen, serverNow, windowEnd }: Props) {
  // Anchor the countdown to the server clock, not the local clock. We measure
  // the offset between the server's "now" and our own once, then derive the
  // authoritative current time from performance-based elapsed wall time.
  const mountedAtRef = useRef<number>(Date.now());
  const offsetRef = useRef<number>(serverNow - Date.now());

  // The window can close while the tab is open. It never re-opens client side:
  // reopening requires a fresh server response (a reload), so we never let the
  // client flip closed -> open on its own.
  const [open, setOpen] = useState(serverOpen);

  // The current seed lives in state, not in the "/" URL, so a plain refresh
  // naturally makes a new fish (the authentic behavior).
  const [seed, setSeed] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number>(() =>
    windowEnd ? Math.max(0, windowEnd - serverNow) : 0
  );

  // Generate the first fish on mount when open.
  useEffect(() => {
    if (serverOpen) setSeed(randomSeed());
  }, [serverOpen]);

  // Server-synced countdown. Ticks off our monotonic elapsed time plus the
  // server offset, so a wrong local clock cannot lengthen or shorten it.
  useEffect(() => {
    if (!open || windowEnd == null) return;
    const tick = () => {
      const authoritativeNow = Date.now() + offsetRef.current;
      const left = windowEnd - authoritativeNow;
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        setOpen(false);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // mountedAtRef/offsetRef are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, windowEnd]);

  const makeAnother = useCallback(() => {
    setSeed(randomSeed());
    setCopied(false);
  }, []);

  const share = useCallback(async () => {
    if (seed == null) return;
    const url = `${window.location.origin}/f/${encodeSeed(seed)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail on insecure origins; fall back to a prompt.
      window.prompt("copy your fish link", url);
    }
  }, [seed]);

  if (!open) {
    return (
      <FishFrame>
        <p className="closed-message">{CLOSED_MESSAGE}</p>
      </FishFrame>
    );
  }

  return (
    <>
      <FishFrame>{seed != null ? <FishCanvas seed={seed} /> : null}</FishFrame>
      <div className="controls">
        <button onClick={makeAnother}>make another</button>
        <button onClick={share}>{copied ? "copied!" : "share"}</button>
      </div>
      <p className="countdown">{formatCountdown(remaining)}</p>
    </>
  );
}

function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `closes in ${s}s`;
}
