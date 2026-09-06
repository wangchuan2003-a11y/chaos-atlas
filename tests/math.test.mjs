import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  DELTA,
  logistic,
  orbit,
  nearbyInitial,
  lyapunov,
  approximatePeriod,
  bifurcation,
  encodeParameters,
  decodeParameters,
} from "../.test-build/math.js";

test("the unit interval is invariant throughout the supported parameter domain", () => {
  for (let ri = 0; ri <= 40; ri++)
    for (let xi = 0; xi <= 40; xi++) {
      for (const value of orbit(ri / 10, xi / 40, 200))
        assert.ok(value >= 0 && value <= 1);
    }
  assert.equal(logistic(4, 0.5), 1);
  assert.deepEqual(orbit(4, 1, 3), [1, 0, 0, 0]);
  assert.deepEqual(orbit(0, 0.3, 3), [0.3, 0, 0, 0]);
});

test("known fixed points persist and stable trajectories converge to the analytic fixed point", () => {
  for (const r of [1.2, 2, 2.8]) {
    const fixed = 1 - 1 / r;
    for (const value of orbit(r, fixed, 100))
      assert.ok(Math.abs(value - fixed) < 1e-12);
    assert.ok(Math.abs(orbit(r, 0.2, 1000).at(-1) - fixed) < 1e-10);
  }
  for (const value of orbit(0.8, 0.8, 1000).slice(-20))
    assert.ok(value < 1e-30);
});

test("period-two orbit matches the analytic roots and period-four preset repeats", () => {
  const r = 3.2;
  const roots = [
    (r + 1 - Math.sqrt((r - 3) * (r + 1))) / (2 * r),
    (r + 1 + Math.sqrt((r - 3) * (r + 1))) / (2 * r),
  ];
  const values = orbit(r, 0.2, 1200).slice(-32);
  assert.equal(approximatePeriod(values), 2);
  for (const value of values)
    assert.ok(roots.some((root) => Math.abs(value - root) < 1e-12));
  assert.equal(approximatePeriod(orbit(3.5, 0.2, 1200).slice(-128)), 4);
  assert.equal(approximatePeriod(orbit(2.8, 0.2, 1200).slice(-128)), 1);
  assert.equal(approximatePeriod(orbit(3.9, 0.2, 1200).slice(-128)), null);
  assert.equal(
    approximatePeriod([1, 2, 1]),
    null,
    "insufficient observations cannot establish even an approximate cycle",
  );
});

test("Lyapunov estimates agree with analytic fixed-point derivatives", () => {
  assert.ok(Math.abs(lyapunov(2.8, 0.2).value - Math.log(0.8)) < 1e-10);
  assert.ok(Math.abs(lyapunov(0.8, 0.2).value - Math.log(0.8)) < 1e-10);
  assert.equal(lyapunov(0, 0.2, 10, 100).value, -Infinity);
  assert.deepEqual(lyapunov(2, 0.5, 0, 20), {
    value: -Infinity,
    zeroDerivatives: 20,
    burnIn: 0,
    samples: 20,
  });
  assert.equal(
    lyapunov(4, 0.5, 0, 20).value,
    -Infinity,
    "a sampled critical derivative is not silently clipped",
  );
  assert.ok(
    Math.abs(lyapunov(4, 0.5, 2, 100).value - Math.log(4)) < 1e-12,
    "burned-in zero derivatives are outside the stated finite window",
  );
});

test("r=4 typical orbit has Lyapunov exponent near ln 2; positive estimates do not prove chaos", () => {
  const result = lyapunov(4, 0.123456789, 1000, 20000);
  assert.ok(Math.abs(result.value - Math.LN2) < 0.025, String(result.value));
  assert.equal(result.zeroDerivatives, 0);
  assert.deepEqual(orbit(4, 0, 3), [0, 0, 0, 0]);
  assert.ok(
    Math.abs(lyapunov(4, 0).value - Math.log(4)) < 1e-10,
    "unstable fixed trajectory gives a positive exponent",
  );
});

test("nearby initial conditions stay inside the domain including endpoints", () => {
  for (const x of [0, 0.2, 0.5, 0.99999999, 1]) {
    const other = nearbyInitial(x);
    assert.ok(other >= 0 && other <= 1);
    assert.ok(Math.abs(Math.abs(other - x) - DELTA) < 1e-16);
    assert.notEqual(x, other);
  }
  assert.ok(nearbyInitial(1) < 1);
  const a = orbit(3.9, 0.2, 80),
    b = orbit(3.9, nearbyInitial(0.2), 80);
  assert.ok(
    a.some((value, i) => Math.abs(value - b[i]) > 0.1),
    "the default pair eventually separates",
  );
});

test("bifurcation sampling is deterministic, bounded, and honors special initial conditions", () => {
  const a = bifurcation(0.2, 2.5, 4, 20, 100, 20);
  assert.deepEqual(a, bifurcation(0.2, 2.5, 4, 20, 100, 20));
  assert.equal(a.length, 800);
  for (let i = 0; i < a.length; i += 2) {
    assert.ok(a[i] >= 2.5 && a[i] <= 4);
    assert.ok(a[i + 1] >= 0 && a[i + 1] <= 1);
  }
  const zero = bifurcation(0, 0, 4, 20, 100, 20);
  for (let i = 1; i < zero.length; i += 2) assert.equal(zero[i], 0);
});

test("share parameters round-trip canonically, including tiny valid initial values", () => {
  for (const value of [
    DEFAULTS,
    { r: 0, x0: 1, iterations: 1 },
    { r: 4, x0: 1e-7, iterations: 300 },
    { r: 1e-8, x0: Number.MIN_VALUE, iterations: 42 },
  ]) {
    const before = structuredClone(value);
    const hash = encodeParameters(value);
    assert.ok(hash.length <= 120);
    assert.deepEqual(decodeParameters(hash), value);
    assert.deepEqual(decodeParameters(hash.slice(1)), value);
    assert.deepEqual(value, before);
  }
  for (const hash of [
    null,
    undefined,
    {},
    42,
    "",
    "#r=5&x=0.2&n=80",
    "#r=3.9&x=2&n=80",
    "#r=3.9&x=0.2&n=0",
    "#r=3.9&x=0.2&n=301",
    "#r=03.9&x=0.2&n=80",
    "#r=3.9&x=.2&n=80",
    "#r=3.9&x=0.20&n=80",
    "#r=3.9&x=0.2&n=80\n",
    "#r=NaN&x=0.2&n=80",
    "#r=3.9&x=0.2&n=80&x=1",
    "#".repeat(2000),
  ])
    assert.equal(decodeParameters(hash), null);
});

test("invalid numeric inputs fail explicitly before computation", () => {
  for (const values of [
    [-1, 0.2],
    [4.1, 0.2],
    [NaN, 0.2],
    [Infinity, 0.2],
    [2, -1],
    [2, 1.1],
    [2, NaN],
  ]) {
    assert.throws(() => orbit(...values, 10), RangeError);
    assert.throws(() => lyapunov(...values), RangeError);
  }
  for (const n of [-1, 1.5, Infinity, 100001])
    assert.throws(() => orbit(2, 0.2, n), RangeError);
  assert.throws(() => lyapunov(2, 0.2, 0, 0), RangeError);
  assert.throws(() => bifurcation(0.2, 3, 2), RangeError);
  assert.throws(() => bifurcation(0.2, 0, 4, 1000000), RangeError);
});
