"use client";

import { useEffect, useRef } from "react";
import { drawFish } from "@/lib/fish";

// Renders a single seeded fish into a canvas. Redraws whenever the seed changes
// or the box is resized. All drawing is deterministic from the seed.
export default function FishCanvas({ seed }: { seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const cssSize = Math.max(1, Math.min(rect.width, rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(cssSize * dpr);
      canvas.height = Math.round(cssSize * dpr);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFish(ctx, seed, cssSize);
    };

    render();

    const ro = new ResizeObserver(render);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [seed]);

  return <canvas ref={canvasRef} className="fish-canvas" aria-label="a crude fish" />;
}
