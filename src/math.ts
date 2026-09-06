export type Parameters = { r: number; x0: number; iterations: number };
export const DEFAULTS: Parameters = { r: 3.9, x0: 0.2, iterations: 80 };
export const DELTA = 1e-7;

export function validateParameters(value: Parameters): void {
  if (
    !value ||
    !Number.isFinite(value.r) ||
    value.r < 0 ||
    value.r > 4 ||
    !Number.isFinite(value.x0) ||
    value.x0 < 0 ||
    value.x0 > 1 ||
    !Number.isInteger(value.iterations) ||
    value.iterations < 1 ||
    value.iterations > 300
  ) {
    throw new RangeError(
      "参数范围：0 ≤ r ≤ 4，0 ≤ x₀ ≤ 1，迭代数为 1–300 的整数。",
    );
  }
}

/** On 0 ≤ r ≤ 4, x ∈ [0,1] remains in [0,1] in exact arithmetic. */
export function logistic(r: number, x: number): number {
  return r * x * (1 - x);
}

export function orbit(r: number, x0: number, count: number): number[] {
  validateParameters({ r, x0, iterations: 1 });
  if (!Number.isInteger(count) || count < 0 || count > 100_000)
    throw new RangeError("Invalid orbit length.");
  const values = [x0];
  for (let n = 0; n < count; n++) values.push(logistic(r, values[n]));
  return values;
}

export function nearbyInitial(x0: number): number {
  if (!Number.isFinite(x0) || x0 < 0 || x0 > 1)
    throw new RangeError("Invalid initial value.");
  return x0 + DELTA <= 1 ? x0 + DELTA : x0 - DELTA;
}

/** Finite post-burn-in mean of log|f'(x)|, not a proof of chaos.
 * Zero derivatives are not clipped: any sampled log(0) gives −Infinity.
 * Discarded transient derivatives do not enter this finite-window estimate. */
export function lyapunov(r: number, x0: number, burnIn = 1000, samples = 4000) {
  validateParameters({ r, x0, iterations: 1 });
  if (
    !Number.isInteger(burnIn) ||
    burnIn < 0 ||
    burnIn > 100_000 ||
    !Number.isInteger(samples) ||
    samples < 1 ||
    samples > 100_000
  )
    throw new RangeError("Invalid sample window.");
  let x = x0;
  for (let n = 0; n < burnIn; n++) x = logistic(r, x);
  let sum = 0;
  let zeroDerivatives = 0;
  for (let n = 0; n < samples; n++) {
    const derivative = Math.abs(r * (1 - 2 * x));
    if (derivative === 0) zeroDerivatives++;
    sum += Math.log(derivative);
    x = logistic(r, x);
  }
  return { value: sum / samples, zeroDerivatives, burnIn, samples };
}

/** A repeated finite tail is evidence of an approximate period only. */
export function approximatePeriod(
  values: readonly number[],
  maxPeriod = 16,
  tolerance = 1e-8,
): number | null {
  if (
    !Number.isInteger(maxPeriod) ||
    maxPeriod < 1 ||
    maxPeriod > 1000 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0
  )
    throw new RangeError("Invalid period check.");
  for (let period = 1; period <= maxPeriod; period++) {
    if (values.length < period * 4) continue;
    const tail = values.slice(-period * 4);
    if (
      tail.every(
        (x, i) =>
          Number.isFinite(x) &&
          (i < period || Math.abs(x - tail[i - period]) <= tolerance),
      )
    )
      return period;
  }
  return null;
}

/** Deterministic finite bifurcation sampling, one trajectory per parameter. */
export function bifurcation(
  x0: number,
  minR = 2.5,
  maxR = 4,
  columns = 900,
  burnIn = 700,
  samples = 100,
): Float32Array {
  validateParameters({ r: minR, x0, iterations: 1 });
  validateParameters({ r: maxR, x0, iterations: 1 });
  if (
    minR >= maxR ||
    !Number.isInteger(columns) ||
    columns < 2 ||
    columns > 1600 ||
    !Number.isInteger(burnIn) ||
    burnIn < 0 ||
    burnIn > 3000 ||
    !Number.isInteger(samples) ||
    samples < 1 ||
    samples > 300
  )
    throw new RangeError("Invalid bifurcation sampling.");
  const points = new Float32Array(columns * samples * 2);
  let cursor = 0;
  for (let column = 0; column < columns; column++) {
    const r = minR + ((maxR - minR) * column) / (columns - 1);
    let x = x0;
    for (let n = 0; n < burnIn; n++) x = logistic(r, x);
    for (let n = 0; n < samples; n++) {
      points[cursor++] = r;
      points[cursor++] = x;
      x = logistic(r, x);
    }
  }
  return points;
}

export function encodeParameters(value: Parameters): string {
  validateParameters(value);
  return `#r=${value.r}&x=${value.x0}&n=${value.iterations}`;
}

export function decodeParameters(hash: string): Parameters | null {
  if (typeof hash !== "string" || hash.length > 120) return null;
  const match =
    /^#?r=([0-9]+(?:\.[0-9]+)?(?:e-?[0-9]+)?)&x=([0-9]+(?:\.[0-9]+)?(?:e-?[0-9]+)?)&n=([0-9]+)$/.exec(
      hash,
    );
  if (!match) return null;
  const value = {
    r: Number(match[1]),
    x0: Number(match[2]),
    iterations: Number(match[3]),
  };
  try {
    validateParameters(value);
    // Accept only one spelling, and ensure links created by this app round-trip.
    return encodeParameters(value).replace(/^#/, "") === hash.replace(/^#/, "")
      ? value
      : null;
  } catch {
    return null;
  }
}
