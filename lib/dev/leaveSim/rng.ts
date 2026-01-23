export type Rng = () => number

/**
 * Deterministic 32-bit hash for string seeds.
 * Stable across sessions and platforms.
 */
export function hashSeedToUint32(seed: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Mulberry32 PRNG - fast, deterministic, decent distribution for simulations.
 */
export function createRng(seed: string | number): Rng {
  const s = typeof seed === 'number' ? (seed >>> 0) : hashSeedToUint32(String(seed))
  let t = s
  return () => {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  const min = Math.ceil(minInclusive)
  const max = Math.floor(maxInclusive)
  if (max < min) return min
  return min + Math.floor(rng() * (max - min + 1))
}

export function randChoice<T>(rng: Rng, items: readonly T[]): T | undefined {
  if (!items || items.length === 0) return undefined
  return items[randInt(rng, 0, items.length - 1)]
}

export function shuffleInPlace<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i)
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
  return items
}

export function pickWeighted<T>(
  rng: Rng,
  options: Array<{ value: T; weight: number }>
): T | undefined {
  const filtered = options.filter((o) => Number.isFinite(o.weight) && o.weight > 0)
  if (filtered.length === 0) return undefined
  const total = filtered.reduce((sum, o) => sum + o.weight, 0)
  let r = rng() * total
  for (const o of filtered) {
    r -= o.weight
    if (r <= 0) return o.value
  }
  return filtered[filtered.length - 1]!.value
}

