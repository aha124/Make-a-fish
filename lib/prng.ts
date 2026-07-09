// Deterministic pseudo-random number generation.
//
// Every fish is a pure function of a 32-bit seed. All randomness in the
// drawing code flows through a Rng created here. There is no Math.random in
// the drawing path, which is what lets a share link redraw a pixel-identical
// fish with no database.

// mulberry32: a tiny, fast, well-distributed 32-bit PRNG.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small convenience wrapper over mulberry32 with helpers used by the
// drawing code. Seeded, deterministic, no global state.
export class Rng {
  private next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed >>> 0);
  }

  // Float in [0, 1).
  float(): number {
    return this.next();
  }

  // Float in [min, max).
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  // Integer in [min, max] inclusive.
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  // True with probability p.
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  // Pick one element from an array.
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  // Signed jitter in [-amount, amount).
  jitter(amount: number): number {
    return (this.next() * 2 - 1) * amount;
  }
}

// --- Seed <-> compact base62 string ---
//
// Seeds live in the URL as short base62 strings, giving links like /f/Qk9x2A.

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function encodeSeed(seed: number): string {
  let n = seed >>> 0;
  if (n === 0) return "0";
  let out = "";
  while (n > 0) {
    out = BASE62[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

// Returns a 32-bit unsigned seed, or null if the string is not valid base62.
export function decodeSeed(str: string): number | null {
  if (!str || str.length > 6) return null;
  let n = 0;
  for (const ch of str) {
    const idx = BASE62.indexOf(ch);
    if (idx === -1) return null;
    n = n * 62 + idx;
  }
  if (n < 0 || n > 0xffffffff) return null;
  return n >>> 0;
}

// A fresh random 32-bit seed from a cryptographic source (client side).
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}
