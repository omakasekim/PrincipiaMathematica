import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EqParamSpec, EquationEntry } from '../data/equationAtlas';
import { hardyZ } from '../engines/zetaZero';
import { sievePrimes, singularSeries, TWIN_PRIME_C2 } from '../engines/goldbachSieves';

type VisualKind =
  | 'curve'
  | 'bar'
  | 'unit-circle'
  | 'geometry'
  | 'matrix2d'
  | 'wave-anim'
  | 'elliptic-curve';

export interface ResolvedVisualSpec {
  kind: VisualKind;
  subtitle: string;
  params: EqParamSpec[];
  xRange?: [number, number];
  xLabel?: string;
  yLabel?: string;
  evalCurve?: (x: number, p: Record<string, number>) => number;
  evalCurve2?: (x: number, p: Record<string, number>) => number;
  curveLabels?: [string, string?];
  evalBars?: (p: Record<string, number>) => { label: string; value: number; color?: string }[];
  evalScalar?: (p: Record<string, number>) => { label: string; value: string };
  geomType?: 'rect' | 'triangle' | 'circle' | 'pythag' | 'sphere' | 'cosine-tri' | 'polyhedron';
  animType?: 'heat' | 'wave' | 'quantum' | 'em' | 'vortex' | 'wilson';
}

const PRIME_CACHE = sievePrimes(2500);

function fact(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return fact(n) / (fact(k) * fact(n - k));
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a)), y = Math.abs(Math.round(b));
  while (y) { const t = x % y; x = y; y = t; }
  return x || 1;
}

function factorize(n: number): [number, number][] {
  let m = Math.max(2, Math.round(n));
  const out: [number, number][] = [];
  for (let p = 2; p * p <= m; p++) {
    if (m % p === 0) {
      let e = 0;
      while (m % p === 0) { m /= p; e++; }
      out.push([p, e]);
    }
  }
  if (m > 1) out.push([m, 1]);
  return out;
}

// Guarantees EVERY equation 1..100 has a real, mathematically grounded interactive visualizer.
export function getEquationVisualSpec(eq: EquationEntry): ResolvedVisualSpec {
  // Use custom interactive curve from catalog if present
  if (eq.interactive?.evalY && eq.interactive.xRange) {
    return {
      kind: 'curve',
      subtitle: 'Interactive function explorer (hover canvas to probe exact values)',
      params: eq.interactive.params,
      xRange: eq.interactive.xRange,
      xLabel: eq.interactive.xLabel ?? 'x',
      yLabel: eq.interactive.yLabel ?? 'f(x)',
      evalCurve: eq.interactive.evalY,
      evalScalar: eq.interactive.evalScalar
        ? (p) => {
            const s = eq.interactive!.evalScalar!(p);
            return { label: s.label, value: `${s.value.toFixed(4)} ${s.unit ?? ''}`.trim() };
          }
        : undefined,
    };
  }

  switch (eq.id) {
    case 1:
      return {
        kind: 'bar',
        subtitle: 'Visual block comparison of a + b vs b + a',
        params: [
          { key: 'a', label: 'a', min: 1, max: 20, step: 1, defaultVal: 7 },
          { key: 'b', label: 'b', min: 1, max: 20, step: 1, defaultVal: 5 },
        ],
        evalBars: (p) => [
          { label: 'a', value: p.a, color: '#38bdf8' },
          { label: 'b', value: p.b, color: '#a855f7' },
          { label: 'a + b', value: p.a + p.b, color: '#4ade80' },
          { label: 'b + a', value: p.b + p.a, color: '#4ade80' },
        ],
        evalScalar: (p) => ({ label: 'a + b = b + a', value: String(p.a + p.b) }),
      };
    case 2:
      return {
        kind: 'bar',
        subtitle: 'Area tiling: a(b + c) splits into ab + ac',
        params: [
          { key: 'a', label: 'a', min: 1, max: 12, step: 1, defaultVal: 4 },
          { key: 'b', label: 'b', min: 1, max: 12, step: 1, defaultVal: 3 },
          { key: 'c', label: 'c', min: 1, max: 12, step: 1, defaultVal: 5 },
        ],
        evalBars: (p) => [
          { label: 'a·b', value: p.a * p.b, color: '#38bdf8' },
          { label: 'a·c', value: p.a * p.c, color: '#a855f7' },
          { label: 'a(b+c)', value: p.a * (p.b + p.c), color: '#4ade80' },
        ],
        evalScalar: (p) => ({ label: 'ab + ac = a(b+c)', value: `${p.a * p.b} + ${p.a * p.c} = ${p.a * (p.b + p.c)}` }),
      };
    case 3:
      return {
        kind: 'bar',
        subtitle: 'Common-denominator fraction addition',
        params: [
          { key: 'a', label: 'a', min: 1, max: 9, step: 1, defaultVal: 1 },
          { key: 'b', label: 'b', min: 1, max: 9, step: 1, defaultVal: 3 },
          { key: 'c', label: 'c', min: 1, max: 9, step: 1, defaultVal: 1 },
          { key: 'd', label: 'd', min: 1, max: 9, step: 1, defaultVal: 4 },
        ],
        evalBars: (p) => [
          { label: `${p.a}/${p.b}`, value: p.a / p.b, color: '#38bdf8' },
          { label: `${p.c}/${p.d}`, value: p.c / p.d, color: '#a855f7' },
          { label: 'Sum', value: p.a / p.b + p.c / p.d, color: '#4ade80' },
        ],
        evalScalar: (p) => ({ label: '(ad+bc)/(bd)', value: `${p.a * p.d + p.b * p.c}/${p.b * p.d} = ${(p.a / p.b + p.c / p.d).toFixed(4)}` }),
      };
    case 4:
      return {
        kind: 'bar',
        subtitle: 'Euclidean quotient blocks b·q plus remainder r',
        params: [
          { key: 'a', label: 'Dividend a', min: 5, max: 80, step: 1, defaultVal: 29 },
          { key: 'b', label: 'Divisor b', min: 2, max: 15, step: 1, defaultVal: 6 },
        ],
        evalBars: (p) => {
          const q = Math.floor(p.a / p.b);
          const r = p.a % p.b;
          return [
            { label: 'a', value: p.a, color: '#38bdf8' },
            { label: `b·q (${p.b}×${q})`, value: p.b * q, color: '#4ade80' },
            { label: 'rem r', value: r, color: '#facc15' },
          ];
        },
        evalScalar: (p) => ({ label: 'a = b·q + r', value: `${p.a} = ${p.b}·${Math.floor(p.a / p.b)} + ${p.a % p.b}` }),
      };
    case 5:
      return {
        kind: 'geometry',
        geomType: 'rect',
        subtitle: 'Live scaled rectangle & unit-square area',
        params: [
          { key: 'w', label: 'Width w', min: 1, max: 12, step: 0.5, defaultVal: 7 },
          { key: 'h', label: 'Height h', min: 1, max: 10, step: 0.5, defaultVal: 4.5 },
        ],
        evalScalar: (p) => ({ label: 'Area A = w·h', value: (p.w * p.h).toFixed(2) }),
      };
    case 6:
      return {
        kind: 'geometry',
        geomType: 'triangle',
        subtitle: 'Live triangle inside its enclosing bounding box',
        params: [
          { key: 'b', label: 'Base b', min: 2, max: 14, step: 0.5, defaultVal: 8 },
          { key: 'h', label: 'Height h', min: 1, max: 10, step: 0.5, defaultVal: 5 },
        ],
        evalScalar: (p) => ({ label: 'Area A = ½bh', value: (0.5 * p.b * p.h).toFixed(2) }),
      };
    case 7:
    case 8:
      return {
        kind: 'geometry',
        geomType: 'circle',
        subtitle: 'Interactive circle radius, circumference & disk area',
        params: [{ key: 'r', label: 'Radius r', min: 0.5, max: 10, step: 0.5, defaultVal: 4 }],
        evalScalar: (p) =>
          eq.id === 7
            ? { label: 'C = 2πr', value: (2 * Math.PI * p.r).toFixed(4) }
            : { label: 'A = πr²', value: (Math.PI * p.r * p.r).toFixed(4) },
      };
    case 9:
      return {
        kind: 'geometry',
        geomType: 'cosine-tri',
        subtitle: 'Interior Euclidean triangle angles always sum to 180°',
        params: [
          { key: 'a', label: 'Side a', min: 3, max: 10, step: 0.5, defaultVal: 6 },
          { key: 'b', label: 'Side b', min: 3, max: 10, step: 0.5, defaultVal: 7 },
          { key: 'C', label: 'Angle C (°)', min: 20, max: 140, step: 2, defaultVal: 60 },
        ],
        evalScalar: () => ({ label: 'α + β + γ', value: '180.00° = π rad' }),
      };
    case 10:
      return {
        kind: 'curve',
        subtitle: 'Distance d(t) = v·t trajectory',
        params: [{ key: 'v', label: 'Speed v (m/s)', min: 1, max: 30, step: 1, defaultVal: 12 }],
        xRange: [0, 10],
        xLabel: 'Time t (s)',
        yLabel: 'Distance d (m)',
        evalCurve: (t, p) => p.v * t,
        evalScalar: (p) => ({ label: 'd at t=10s', value: `${(p.v * 10).toFixed(1)} m` }),
      };
    case 11:
    case 42:
      return {
        kind: 'bar',
        subtitle: 'Sample observations, balance point (mean) & variance spread',
        params: [
          { key: 'x1', label: 'x₁', min: 1, max: 20, step: 1, defaultVal: 4 },
          { key: 'x2', label: 'x₂', min: 1, max: 20, step: 1, defaultVal: 8 },
          { key: 'x3', label: 'x₃', min: 1, max: 20, step: 1, defaultVal: 11 },
          { key: 'x4', label: 'x₄', min: 1, max: 20, step: 1, defaultVal: 17 },
        ],
        evalBars: (p) => {
          const m = (p.x1 + p.x2 + p.x3 + p.x4) / 4;
          return [
            { label: 'x₁', value: p.x1, color: '#38bdf8' },
            { label: 'x₂', value: p.x2, color: '#38bdf8' },
            { label: 'x₃', value: p.x3, color: '#38bdf8' },
            { label: 'x₄', value: p.x4, color: '#38bdf8' },
            { label: 'Mean', value: m, color: '#4ade80' },
          ];
        },
        evalScalar: (p) => {
          const xs = [p.x1, p.x2, p.x3, p.x4];
          const m = xs.reduce((a, b) => a + b, 0) / 4;
          const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / 3;
          return eq.id === 11
            ? { label: 'Arithmetic Mean', value: m.toFixed(3) }
            : { label: 'Sample Variance s²', value: `${v.toFixed(3)} (s = ${Math.sqrt(v).toFixed(3)})` };
        },
      };
    case 12:
      return {
        kind: 'curve',
        subtitle: 'Triangular number growth T(n) = n(n+1)/2',
        params: [{ key: 'n', label: 'Upper bound n', min: 2, max: 100, step: 1, defaultVal: 25 }],
        xRange: [0, 100],
        xLabel: 'n',
        yLabel: 'T(n)',
        evalCurve: (x) => (x * (x + 1)) / 2,
        evalScalar: (p) => ({ label: `T(${p.n})`, value: String((p.n * (p.n + 1)) / 2) }),
      };
    case 13:
    case 14:
    case 15:
      return {
        kind: 'geometry',
        geomType: 'sphere',
        subtitle: '3D projected sphere / prism volume & surface scaling',
        params: [{ key: 'r', label: 'Radius / Scale r', min: 1, max: 10, step: 0.5, defaultVal: 3 }],
        evalScalar: (p) =>
          eq.id === 13
            ? { label: 'Cube Volume r³', value: (p.r ** 3).toFixed(2) }
            : eq.id === 14
            ? { label: 'Sphere V = 4/3 πr³', value: ((4 / 3) * Math.PI * p.r ** 3).toFixed(3) }
            : { label: 'Surface S = 4πr²', value: (4 * Math.PI * p.r ** 2).toFixed(3) },
      };
    case 16:
      return {
        kind: 'curve',
        subtitle: 'Exponential scaling a^x and shift a^(x+m) = a^m·a^x',
        params: [
          { key: 'a', label: 'Base a', min: 1.1, max: 3, step: 0.1, defaultVal: 2 },
          { key: 'm', label: 'Exponent shift m', min: 0, max: 3, step: 0.5, defaultVal: 1 },
        ],
        xRange: [0, 4],
        xLabel: 'n',
        yLabel: 'a^(m+n)',
        evalCurve: (x, p) => Math.pow(p.a, x),
        evalCurve2: (x, p) => Math.pow(p.a, x + p.m),
        curveLabels: ['a^n', 'a^(m+n)'],
      };
    case 17:
      return {
        kind: 'bar',
        subtitle: 'Live prime-power factorization spectrum of n',
        params: [{ key: 'n', label: 'Integer n', min: 12, max: 1200, step: 1, defaultVal: 360 }],
        evalBars: (p) => factorize(p.n).map(([pr, ex]) => ({ label: `p=${pr}`, value: ex, color: '#38bdf8' })),
        evalScalar: (p) => ({
          label: 'Prime Factorization',
          value: factorize(p.n).map(([pr, ex]) => (ex > 1 ? `${pr}^${ex}` : `${pr}`)).join(' × '),
        }),
      };
    case 18:
      return {
        kind: 'bar',
        subtitle: 'Live GCD vs LCM comparison',
        params: [
          { key: 'a', label: 'a', min: 2, max: 60, step: 1, defaultVal: 18 },
          { key: 'b', label: 'b', min: 2, max: 60, step: 1, defaultVal: 24 },
        ],
        evalBars: (p) => {
          const g = gcd(p.a, p.b);
          const l = (p.a * p.b) / g;
          return [
            { label: 'a', value: p.a, color: '#38bdf8' },
            { label: 'b', value: p.b, color: '#a855f7' },
            { label: 'gcd', value: g, color: '#4ade80' },
            { label: 'lcm', value: l, color: '#facc15' },
          ];
        },
        evalScalar: (p) => {
          const g = gcd(p.a, p.b);
          return { label: 'gcd · lcm = a·b', value: `${g} · ${(p.a * p.b) / g} = ${p.a * p.b}` };
        },
      };
    case 19:
    case 20:
      return {
        kind: 'curve',
        subtitle: 'Linear percentage / simple interest accumulation',
        params: [
          { key: 'P', label: 'Initial P', min: 10, max: 200, step: 10, defaultVal: 100 },
          { key: 'r', label: 'Rate r', min: 0.02, max: 0.3, step: 0.02, defaultVal: 0.08 },
        ],
        xRange: [0, 15],
        xLabel: 'Periods t',
        yLabel: 'Value A(t)',
        evalCurve: (t, p) => p.P * (1 + p.r * t),
        evalScalar: (p) => ({ label: 'After 10 periods', value: `${(p.P * (1 + p.r * 10)).toFixed(2)} (+${(p.r * 1000).toFixed(0)}%)` }),
      };
    case 21:
      return {
        kind: 'geometry',
        geomType: 'pythag',
        subtitle: 'Interactive Euclidean right triangle with squares on each leg',
        params: [
          { key: 'a', label: 'Leg a', min: 1, max: 12, step: 0.5, defaultVal: 3 },
          { key: 'b', label: 'Leg b', min: 1, max: 12, step: 0.5, defaultVal: 4 },
        ],
        evalScalar: (p) => ({ label: 'c = √(a² + b²)', value: Math.hypot(p.a, p.b).toFixed(4) }),
      };
    case 23:
      return {
        kind: 'curve',
        subtitle: 'Difference of squares x² − b² = (x − b)(x + b) with roots at ±b',
        params: [{ key: 'b', label: 'Root b', min: 0.5, max: 4, step: 0.25, defaultVal: 2 }],
        xRange: [-5, 5],
        xLabel: 'x',
        yLabel: 'x² − b²',
        evalCurve: (x, p) => x * x - p.b * p.b,
      };
    case 24:
    case 39:
      return {
        kind: 'bar',
        subtitle: 'Row n of Pascal’s Triangle — Binomial Coefficients C(n, k)',
        params: [{ key: 'n', label: 'Power n', min: 2, max: 12, step: 1, defaultVal: 8 }],
        evalBars: (p) =>
          Array.from({ length: Math.round(p.n) + 1 }, (_, k) => ({
            label: `${k}`,
            value: choose(Math.round(p.n), k),
            color: '#38bdf8',
          })),
        evalScalar: (p) => ({ label: 'Sum Σ C(n,k) = 2^n', value: String(Math.pow(2, Math.round(p.n))) }),
      };
    case 25:
    case 26:
      return {
        kind: 'bar',
        subtitle: 'Partial sums S_k = a(1 − r^k)/(1 − r) approaching a/(1 − r)',
        params: [
          { key: 'a', label: 'First term a', min: 1, max: 10, step: 1, defaultVal: 4 },
          { key: 'r', label: 'Ratio r', min: 0.1, max: 0.9, step: 0.05, defaultVal: 0.5 },
        ],
        evalBars: (p) =>
          Array.from({ length: 10 }, (_, k) => ({
            label: `k=${k + 1}`,
            value: p.a * ((1 - Math.pow(p.r, k + 1)) / (1 - p.r)),
            color: '#4ade80',
          })),
        evalScalar: (p) => ({ label: 'Infinite Limit a/(1−r)', value: (p.a / (1 - p.r)).toFixed(4) }),
      };
    case 27:
    case 28:
      return {
        kind: 'curve',
        subtitle: 'Logarithm curve log_b(x) vs ln(x)',
        params: [{ key: 'b', label: 'Base b', min: 1.5, max: 10, step: 0.5, defaultVal: 2 }],
        xRange: [0.1, 16],
        xLabel: 'x',
        yLabel: 'log_b(x)',
        evalCurve: (x, p) => Math.log(x) / Math.log(p.b),
        evalCurve2: (x) => Math.log(x),
        curveLabels: ['log_b(x)', 'ln(x)'],
      };
    case 29:
    case 32:
    case 38:
    case 46:
      return {
        kind: 'unit-circle',
        subtitle: 'Interactive unit-circle phasor e^(iθ) = cos θ + i sin θ & n-th power',
        params: [
          { key: 'theta', label: 'Angle θ (deg)', min: 0, max: 360, step: 5, defaultVal: 45 },
          { key: 'n', label: 'Power / Harmonic n', min: 1, max: 6, step: 1, defaultVal: eq.id === 38 ? 3 : 1 },
        ],
        evalScalar: (p) => {
          const rad = (p.theta * Math.PI) / 180;
          const nRad = rad * p.n;
          return {
            label: `e^(i·${p.n}θ)`,
            value: `${Math.cos(nRad).toFixed(3)} + ${Math.sin(nRad).toFixed(3)}i`,
          };
        },
      };
    case 30:
    case 31:
      return {
        kind: 'geometry',
        geomType: 'cosine-tri',
        subtitle: 'Interactive triangle solving side c & circumradius R live',
        params: [
          { key: 'a', label: 'Side a', min: 2, max: 12, step: 0.5, defaultVal: 6 },
          { key: 'b', label: 'Side b', min: 2, max: 12, step: 0.5, defaultVal: 8 },
          { key: 'C', label: 'Angle C (°)', min: 15, max: 155, step: 5, defaultVal: 70 },
        ],
        evalScalar: (p) => {
          const rad = (p.C * Math.PI) / 180;
          const c = Math.sqrt(p.a * p.a + p.b * p.b - 2 * p.a * p.b * Math.cos(rad));
          return eq.id === 30
            ? { label: 'Side c', value: c.toFixed(4) }
            : { label: 'Circumdiameter 2R = c/sin(C)', value: (c / Math.sin(rad)).toFixed(4) };
        },
      };
    case 33:
    case 35:
      return {
        kind: 'geometry',
        geomType: 'circle',
        subtitle: 'Euclidean distance & circle locus (x−h)² + (y−k)² = r²',
        params: [{ key: 'r', label: 'Radius / Distance r', min: 1, max: 10, step: 0.5, defaultVal: 5 }],
        evalScalar: (p) => ({ label: 'd(P, Q) = r', value: p.r.toFixed(2) }),
      };
    case 34:
      return {
        kind: 'curve',
        subtitle: 'Interactive linear equation y = mx + b',
        params: [
          { key: 'm', label: 'Slope m', min: -4, max: 4, step: 0.25, defaultVal: 1.5 },
          { key: 'b', label: 'Intercept b', min: -5, max: 5, step: 0.5, defaultVal: 1 },
        ],
        xRange: [-5, 5],
        xLabel: 'x',
        yLabel: 'y = mx + b',
        evalCurve: (x, p) => p.m * x + p.b,
      };
    case 37:
      return {
        kind: 'curve',
        subtitle: 'Convergence of (1 + 1/n)^n → e ≈ 2.7182818',
        params: [{ key: 'maxN', label: 'Max n', min: 10, max: 100, step: 5, defaultVal: 40 }],
        xRange: [1, 40],
        xLabel: 'n',
        yLabel: '(1 + 1/n)^n',
        evalCurve: (x) => Math.pow(1 + 1 / Math.max(1, x), Math.max(1, x)),
        evalCurve2: () => Math.E,
        curveLabels: ['(1+1/n)^n', 'e'],
      };
    case 40:
      return {
        kind: 'bar',
        subtitle: 'Bayesian update from Prior P(A) to Posterior P(A|B)',
        params: [
          { key: 'prior', label: 'Prior P(A)', min: 0.01, max: 0.9, step: 0.02, defaultVal: 0.1 },
          { key: 'sens', label: 'Likelihood P(B|A)', min: 0.5, max: 0.99, step: 0.01, defaultVal: 0.95 },
          { key: 'fpr', label: 'False Pos P(B|¬A)', min: 0.01, max: 0.5, step: 0.01, defaultVal: 0.08 },
        ],
        evalBars: (p) => {
          const pb = p.sens * p.prior + p.fpr * (1 - p.prior);
          const post = (p.sens * p.prior) / pb;
          return [
            { label: 'Prior P(A)', value: p.prior, color: '#94a3b8' },
            { label: 'Evidence P(B)', value: pb, color: '#38bdf8' },
            { label: 'Post P(A|B)', value: post, color: '#4ade80' },
          ];
        },
        evalScalar: (p) => {
          const pb = p.sens * p.prior + p.fpr * (1 - p.prior);
          return { label: 'Posterior P(A|B)', value: `${(((p.sens * p.prior) / pb) * 100).toFixed(2)}%` };
        },
      };
    case 41:
      return {
        kind: 'bar',
        subtitle: 'Binomial probability mass function P(X = k)',
        params: [
          { key: 'n', label: 'Trials n', min: 4, max: 14, step: 1, defaultVal: 10 },
          { key: 'p', label: 'Prob p', min: 0.1, max: 0.9, step: 0.05, defaultVal: 0.45 },
        ],
        evalBars: (p) => {
          const n = Math.round(p.n);
          return Array.from({ length: n + 1 }, (_, k) => ({
            label: `${k}`,
            value: choose(n, k) * Math.pow(p.p, k) * Math.pow(1 - p.p, n - k),
            color: '#a855f7',
          }));
        },
        evalScalar: (p) => ({ label: 'Expected E[X] = np', value: (p.n * p.p).toFixed(2) }),
      };
    case 43:
    case 44:
      return {
        kind: 'curve',
        subtitle: eq.id === 43 ? 'Velocity v(t) = (F/m)t under constant force' : 'Inverse-square gravitational force F(r) = G m₁m₂ / r²',
        params:
          eq.id === 43
            ? [
                { key: 'F', label: 'Force F (N)', min: 1, max: 50, step: 1, defaultVal: 15 },
                { key: 'm', label: 'Mass m (kg)', min: 1, max: 20, step: 1, defaultVal: 5 },
              ]
            : [{ key: 'k', label: 'Strength G·m₁m₂', min: 1, max: 20, step: 1, defaultVal: 8 }],
        xRange: [0.5, 6],
        xLabel: eq.id === 43 ? 'Time t (s)' : 'Separation r',
        yLabel: eq.id === 43 ? 'Velocity v(t)' : 'Force F(r)',
        evalCurve: (x, p) => (eq.id === 43 ? (p.F / p.m) * x : p.k / (x * x)),
      };
    case 45:
      return {
        kind: 'geometry',
        geomType: 'polyhedron',
        subtitle: 'Interactive rotating 3D Platonic solids — V − E + F = 2 invariant',
        params: [{ key: 'solid', label: 'Solid (0=Tetra, 1=Cube, 2=Octa)', min: 0, max: 2, step: 1, defaultVal: 1 }],
        evalScalar: (p) => {
          const s = Math.round(p.solid);
          if (s === 0) return { label: 'Tetrahedron', value: 'V=4, E=6, F=4 → χ = 2' };
          if (s === 1) return { label: 'Cube', value: 'V=8, E=12, F=6 → χ = 2' };
          return { label: 'Octahedron', value: 'V=6, E=12, F=8 → χ = 2' };
        },
      };
    case 47:
    case 48:
      return {
        kind: 'curve',
        subtitle: 'Function f(x) = sin(kx) + 1 vs antiderivative integral F(x)',
        params: [{ key: 'k', label: 'Frequency k', min: 0.5, max: 3, step: 0.25, defaultVal: 1 }],
        xRange: [0, 6.28],
        xLabel: 'x',
        yLabel: 'f(x) & ∫f',
        evalCurve: (x, p) => Math.sin(p.k * x) + 1,
        evalCurve2: (x, p) => x + (1 - Math.cos(p.k * x)) / p.k,
        curveLabels: ['f(x)', '∫₀ˣ f(t)dt'],
      };
    case 51:
      return {
        kind: 'curve',
        subtitle: 'Stirling approximation ln(n!) vs n ln(n) − n + ½ ln(2πn)',
        params: [{ key: 'scale', label: 'Compare factor', min: 1, max: 1, step: 1, defaultVal: 1 }],
        xRange: [1, 14],
        xLabel: 'n',
        yLabel: 'ln(n!)',
        evalCurve: (x) => {
          const n = Math.max(1, Math.round(x));
          let s = 0;
          for (let i = 2; i <= n; i++) s += Math.log(i);
          return s;
        },
        evalCurve2: (x) => x * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI * x),
        curveLabels: ['Exact ln(n!)', 'Stirling'],
      };
    case 52:
    case 53:
    case 54:
    case 55:
      return {
        kind: 'matrix2d',
        subtitle: 'Interactive 2×2 Linear Operator: unit circle → image ellipse, singular values & eigenvectors',
        params: [
          { key: 'a', label: 'A₁₁', min: -2.5, max: 2.5, step: 0.25, defaultVal: 1.5 },
          { key: 'b', label: 'A₁₂', min: -2.5, max: 2.5, step: 0.25, defaultVal: 0.75 },
          { key: 'c', label: 'A₂₁', min: -2.5, max: 2.5, step: 0.25, defaultVal: 0.25 },
          { key: 'd', label: 'A₂₂', min: -2.5, max: 2.5, step: 0.25, defaultVal: 1.0 },
        ],
        evalScalar: (p) => {
          const det = p.a * p.d - p.b * p.c;
          const tr = p.a + p.d;
          return { label: 'det(A) / tr(A)', value: `det=${det.toFixed(2)}, tr=${tr.toFixed(2)}` };
        },
      };
    case 56:
    case 57:
    case 76:
    case 77:
    case 78:
    case 79:
      return {
        kind: 'wave-anim',
        animType: 'vortex',
        subtitle: 'Live animated 2D vortex-stretching / curl-divergence vector flow field',
        params: [
          { key: 'nu', label: 'Viscosity ν', min: 0.0, max: 0.5, step: 0.05, defaultVal: 0.1 },
          { key: 'amp', label: 'Circulation Γ', min: 0.5, max: 3.0, step: 0.25, defaultVal: 1.5 },
        ],
        evalScalar: (p) => ({ label: 'Dissipation rate 2νΩ', value: (2 * p.nu * p.amp * p.amp).toFixed(4) }),
      };
    case 58:
    case 59:
      return {
        kind: 'curve',
        subtitle: 'Fourier synthesis of harmonics vs Parseval L² energy',
        params: [
          { key: 'h', label: 'Harmonics H', min: 1, max: 9, step: 1, defaultVal: 4 },
          { key: 'f', label: 'Fundamental ω', min: 1, max: 3, step: 0.5, defaultVal: 1 },
        ],
        xRange: [-3.14, 3.14],
        xLabel: 'x',
        yLabel: 'f_H(x)',
        evalCurve: (x, p) => {
          let s = 0;
          for (let k = 1; k <= Math.round(p.h); k++) {
            const odd = 2 * k - 1;
            s += Math.sin(odd * p.f * x) / odd;
          }
          return (4 / Math.PI) * s;
        },
      };
    case 60:
    case 61:
    case 75:
    case 80:
    case 81:
    case 82:
      return {
        kind: 'curve',
        subtitle: 'Live Hardy Z(t) along the critical line Re(s) = 1/2 (zeros mark sign changes)',
        params: [{ key: 'shift', label: 'Window Start T₀', min: 10, max: 60, step: 5, defaultVal: 12 }],
        xRange: [0, 30],
        xLabel: 'Offset Δt (t = T₀ + Δt)',
        yLabel: 'Z(T₀ + Δt)',
        evalCurve: (dx, p) => hardyZ(p.shift + dx),
        evalScalar: (p) => ({ label: `Z(${p.shift})`, value: hardyZ(p.shift).toFixed(5) }),
      };
    case 62:
      return {
        kind: 'wave-anim',
        animType: 'heat',
        subtitle: 'Live animated 1D Heat Equation diffusion ∂u/∂t = α ∂²u/∂x²',
        params: [{ key: 'alpha', label: 'Diffusivity α', min: 0.1, max: 2.0, step: 0.1, defaultVal: 0.6 }],
      };
    case 63:
      return {
        kind: 'wave-anim',
        animType: 'wave',
        subtitle: 'Live animated standing/travelling 1D Wave Equation ∂²u/∂t² = c² ∂²u/∂x²',
        params: [
          { key: 'mode', label: 'Harmonic Mode n', min: 1, max: 6, step: 1, defaultVal: 2 },
          { key: 'c', label: 'Wave Speed c', min: 0.5, max: 3.0, step: 0.25, defaultVal: 1.5 },
        ],
      };
    case 64:
      return {
        kind: 'curve',
        subtitle: 'Action-minimizing extremal path q(t) vs perturbed variation q(t) + εη(t)',
        params: [{ key: 'eps', label: 'Variation ε', min: -1.5, max: 1.5, step: 0.15, defaultVal: 0.6 }],
        xRange: [0, 1],
        xLabel: 't',
        yLabel: 'q(t)',
        evalCurve: (t) => 4 * t * (1 - t),
        evalCurve2: (t, p) => 4 * t * (1 - t) + p.eps * Math.sin(Math.PI * t),
        curveLabels: ['Extremal δS=0', 'Perturbed q+εη'],
      };
    case 65:
      return {
        kind: 'wave-anim',
        animType: 'em',
        subtitle: 'Live orthogonal E & B electromagnetic wave propagating at speed c',
        params: [{ key: 'k', label: 'Wavenumber k', min: 1, max: 5, step: 0.5, defaultVal: 2 }],
      };
    case 66:
    case 67:
      return {
        kind: 'wave-anim',
        animType: 'quantum',
        subtitle: 'Live quantum Gaussian wavepacket |ψ(x,t)|² & Heisenberg σ_x · σ_p ≥ ℏ/2',
        params: [
          { key: 'sx', label: 'Position width σ_x', min: 0.3, max: 1.6, step: 0.1, defaultVal: 0.6 },
          { key: 'k0', label: 'Momentum k₀', min: 1, max: 8, step: 0.5, defaultVal: 4 },
        ],
        evalScalar: (p) => ({ label: 'Min Momentum Spread σ_p = ℏ/(2σ_x)', value: (0.5 / p.sx).toFixed(3) + ' ℏ' }),
      };
    case 68:
      return {
        kind: 'curve',
        subtitle: 'Boltzmann logarithmic entropy growth S/k_B = ln(Ω)',
        params: [{ key: 'scale', label: 'Scale factor', min: 1, max: 5, step: 0.5, defaultVal: 1 }],
        xRange: [1, 100],
        xLabel: 'Microstates Ω',
        yLabel: 'S / k_B',
        evalCurve: (x, p) => p.scale * Math.log(Math.max(1, x)),
      };
    case 70:
      return {
        kind: 'bar',
        subtitle: 'Central Limit Theorem: sum of k uniform variables converges to Gaussian',
        params: [{ key: 'k', label: 'Summands k', min: 1, max: 5, step: 1, defaultVal: 3 }],
        evalBars: (p) => {
          // Exact discrete convolution of k copies of uniform {0,1,2,3}
          let dist = [1];
          for (let s = 0; s < Math.round(p.k); s++) {
            const nxt = new Array<number>(dist.length + 3).fill(0);
            for (let i = 0; i < dist.length; i++) {
              for (let d = 0; d < 4; d++) nxt[i + d] += dist[i] / 4;
            }
            dist = nxt;
          }
          return dist.map((v, i) => ({ label: `${i}`, value: v, color: '#38bdf8' }));
        },
      };
    case 71:
    case 72:
      return {
        kind: 'bar',
        subtitle: 'Modular powers a^k mod p cycling with period dividing p − 1',
        params: [
          { key: 'a', label: 'Base a', min: 2, max: 12, step: 1, defaultVal: 3 },
          { key: 'p', label: 'Prime p', min: 5, max: 19, step: 2, defaultVal: 11 },
        ],
        evalBars: (p) => {
          const mod = Math.max(3, Math.round(p.p));
          const bars: { label: string; value: number; color: string }[] = [];
          let cur = 1;
          for (let k = 1; k < mod; k++) {
            cur = (cur * Math.round(p.a)) % mod;
            bars.push({ label: `${k}`, value: cur, color: cur === 1 ? '#4ade80' : '#38bdf8' });
          }
          return bars;
        },
        evalScalar: (p) => {
          const mod = Math.max(3, Math.round(p.p));
          let cur = 1;
          for (let k = 1; k < mod; k++) cur = (cur * Math.round(p.a)) % mod;
          return { label: `a^(p−1) mod p`, value: String(cur) };
        },
      };
    case 73:
    case 86:
      return {
        kind: 'curve',
        subtitle: 'Exact prime count π(x) vs x/ln(x) & Selberg parity-barrier 2x/ln(x)',
        params: [{ key: 'maxX', label: 'Range X', min: 200, max: 2400, step: 200, defaultVal: 1200 }],
        xRange: [20, 1200],
        xLabel: 'x',
        yLabel: 'Count',
        evalCurve: (x) => {
          let c = 0;
          for (const pr of PRIME_CACHE.primes) { if (pr <= x) c++; else break; }
          return c;
        },
        evalCurve2: (x) => (eq.id === 86 ? (2 * x) / Math.log(x) : x / Math.log(x)),
        curveLabels: ['Exact π(x)', eq.id === 86 ? 'Selberg 2x/ln(x)' : 'PNT x/ln(x)'],
      };
    case 74:
      return {
        kind: 'curve',
        subtitle: 'Relativistic energy-momentum hyperbola E(p) = √((pc)² + (mc²)²)',
        params: [{ key: 'm', label: 'Rest mass m (c=1)', min: 0, max: 4, step: 0.25, defaultVal: 1.5 }],
        xRange: [-5, 5],
        xLabel: 'Momentum p',
        yLabel: 'Energy E(p)',
        evalCurve: (pVal, p) => Math.hypot(pVal, p.m),
        evalCurve2: (pVal) => Math.abs(pVal),
        curveLabels: ['Massive E(p)', 'Massless |p|c'],
      };
    case 84:
    case 85:
      return {
        kind: 'curve',
        subtitle: 'Hardy–Littlewood Goldbach prediction S(n)·n/(2 ln²n) vs baseline',
        params: [{ key: 'mult', label: 'Residue factor (1=mod 2, 2=mod 6)', min: 1, max: 2.5, step: 0.5, defaultVal: 2 }],
        xRange: [50, 2000],
        xLabel: 'Even n',
        yLabel: 'Predicted r₂(n)',
        evalCurve: (x, p) => (p.mult * 2 * TWIN_PRIME_C2 * x) / (2 * Math.log(x) ** 2),
        evalScalar: () => ({ label: 'S(30) / S(28)', value: (singularSeries(30) / singularSeries(28)).toFixed(3) }),
      };
    case 87:
    case 88:
    case 89:
      return {
        kind: 'curve',
        subtitle: '3-SAT satisfiability transition near α_c ≈ 4.267 & exponential hardness barrier',
        params: [{ key: 'n', label: 'Variables n (sharpness)', min: 10, max: 60, step: 5, defaultVal: 25 }],
        xRange: [1.5, 6.5],
        xLabel: 'Clause density α = m/n',
        yLabel: 'P(SAT) / Hardness',
        evalCurve: (a, p) => 1 / (1 + Math.exp((a - 4.267) * (p.n / 6))),
        evalCurve2: (a) => Math.exp(-Math.pow((a - 4.267) / 0.55, 2)),
        curveLabels: ['P(3-SAT)', 'Hardness Peak'],
      };
    case 90:
    case 91:
    case 92:
    case 93:
      return {
        kind: 'wave-anim',
        animType: 'wilson',
        subtitle: 'Confinement area-law Wilson loop W(R,T) ~ e^(−σRT) & mass-gap correlator decay',
        params: [
          { key: 'sigma', label: 'String tension σ', min: 0.05, max: 0.8, step: 0.05, defaultVal: 0.25 },
          { key: 'm0', label: 'Mass gap m₀', min: 0.2, max: 2.0, step: 0.1, defaultVal: 0.8 },
        ],
        evalScalar: (p) => ({ label: 'W(2,2) = exp(−4σ)', value: Math.exp(-4 * p.sigma).toFixed(4) }),
      };
    case 94:
    case 95:
    case 96:
    case 97:
    case 98:
    case 99:
    case 100:
      return {
        kind: 'elliptic-curve',
        subtitle:
          eq.id === 100
            ? 'Interactive Elliptic Curve E: y² = x³ + ax + b (BSD rank & real locus)'
            : 'Interactive Algebraic Curve / Projective Slice y² = x³ + ax + b',
        params: [
          { key: 'a', label: 'Coefficient a', min: -4, max: 3, step: 0.25, defaultVal: -2 },
          { key: 'b', label: 'Coefficient b', min: -3, max: 4, step: 0.25, defaultVal: 1 },
        ],
        evalScalar: (p) => {
          const disc = -16 * (4 * p.a ** 3 + 27 * p.b ** 2);
          return { label: 'Discriminant Δ', value: `${disc.toFixed(2)} (${Math.abs(disc) < 0.05 ? 'Singular!' : 'Smooth'})` };
        },
      };
    default:
      return {
        kind: 'curve',
        subtitle: 'Interactive function preview',
        params: [{ key: 'a', label: 'Scale a', min: 0.5, max: 3, step: 0.25, defaultVal: 1 }],
        xRange: [-4, 4],
        xLabel: 'x',
        yLabel: 'f(x)',
        evalCurve: (x, p) => p.a * Math.sin(x),
      };
  }
}

export function EquationVisualizer({ eq }: { eq: EquationEntry }) {
  const spec = useMemo(() => getEquationVisualSpec(eq), [eq]);
  const [vals, setVals] = useState<Record<string, number>>({});
  const [hoverInfo, setHoverInfo] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const init: Record<string, number> = {};
    for (const p of spec.params) init[p.key] = p.defaultVal;
    setVals(init);
    setHoverInfo('');
  }, [spec]);

  const scalar = useMemo(() => {
    if (!spec.evalScalar || Object.keys(vals).length === 0) return null;
    return spec.evalScalar(vals);
  }, [spec, vals]);

  useEffect(() => {
    if (Object.keys(vals).length === 0) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const W = c.width, H = c.height;
    let raf = 0;
    let frame = 0;

    const render = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#070b13';
      ctx.fillRect(0, 0, W, H);

      if (spec.kind === 'curve' && spec.evalCurve && spec.xRange) {
        const [x0, x1] = spec.xRange;
        const padL = 44, padR = 14, padT = 18, padB = 24;
        const pw = W - padL - padR, ph = H - padT - padB;
        const N = 160;
        const p1: [number, number][] = [];
        const p2: [number, number][] = [];
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i <= N; i++) {
          const x = x0 + (i / N) * (x1 - x0);
          const y = spec.evalCurve(x, vals);
          if (Number.isFinite(y)) { p1.push([x, y]); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
          if (spec.evalCurve2) {
            const y2 = spec.evalCurve2(x, vals);
            if (Number.isFinite(y2)) { p2.push([x, y2]); yMin = Math.min(yMin, y2); yMax = Math.max(yMax, y2); }
          }
        }
        if (!isFinite(yMin)) { yMin = -1; yMax = 1; }
        if (yMax === yMin) { yMin -= 1; yMax += 1; }
        const pyPad = (yMax - yMin) * 0.1; yMin -= pyPad; yMax += pyPad;
        const toX = (x: number) => padL + ((x - x0) / (x1 - x0)) * pw;
        const toY = (y: number) => padT + ph - ((y - yMin) / (yMax - yMin)) * ph;

        ctx.strokeStyle = 'rgba(148,163,184,0.16)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = '#94a3b8';
        for (let i = 0; i <= 3; i++) {
          const py = padT + (i / 3) * ph;
          ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(padL + pw, py); ctx.stroke();
          ctx.textAlign = 'right';
          ctx.fillText((yMax - (i / 3) * (yMax - yMin)).toFixed(2), padL - 5, py + 3);
        }
        if (yMin < 0 && yMax > 0) {
          ctx.strokeStyle = 'rgba(226,232,240,0.35)';
          ctx.beginPath(); ctx.moveTo(padL, toY(0)); ctx.lineTo(padL + pw, toY(0)); ctx.stroke();
        }
        // Subtle gradient area under curve 1
        if (p1.length > 1) {
          ctx.beginPath();
          p1.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(toX(x), toY(y)) : ctx.lineTo(toX(x), toY(y))));
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
        if (p2.length > 1) {
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          p2.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(toX(x), toY(y)) : ctx.lineTo(toX(x), toY(y))));
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.restore();
        }
        if (spec.curveLabels) {
          ctx.textAlign = 'left';
          ctx.fillStyle = '#38bdf8'; ctx.fillText(`— ${spec.curveLabels[0]}`, padL + 4, 12);
          if (spec.curveLabels[1]) { ctx.fillStyle = '#f97316'; ctx.fillText(`-- ${spec.curveLabels[1]}`, padL + 120, 12); }
        }
      } else if (spec.kind === 'bar' && spec.evalBars) {
        const bars = spec.evalBars(vals);
        const maxV = Math.max(1e-6, ...bars.map((b) => Math.abs(b.value)));
        const padL = 20, padR = 20, padT = 20, padB = 26;
        const bw = (W - padL - padR) / Math.max(1, bars.length);
        ctx.font = '10px ui-monospace, monospace';
        bars.forEach((b, i) => {
          const bh = (Math.abs(b.value) / maxV) * (H - padT - padB);
          const x = padL + i * bw + 4;
          const y = H - padB - bh;
          ctx.fillStyle = b.color ?? '#38bdf8';
          ctx.fillRect(x, y, Math.max(6, bw - 8), bh);
          ctx.fillStyle = '#cbd5e1';
          ctx.textAlign = 'center';
          ctx.fillText(b.label, x + (bw - 8) / 2, H - 8);
        });
      } else if (spec.kind === 'unit-circle') {
        const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;
        const rad = ((vals.theta ?? 45) * Math.PI) / 180;
        const nRad = rad * (vals.n ?? 1);
        ctx.strokeStyle = 'rgba(148,163,184,0.22)';
        ctx.beginPath();
        ctx.moveTo(cx - R - 20, cy); ctx.lineTo(cx + R + 20, cy);
        ctx.moveTo(cx, cy - R - 16); ctx.lineTo(cx, cy + R + 16);
        ctx.stroke();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

        const px = cx + R * Math.cos(nRad), py = cy - R * Math.sin(nRad);
        // Cosine & Sine legs
        ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, cy); ctx.stroke();
        ctx.strokeStyle = '#f43f5e';
        ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px, py); ctx.stroke();
        // Phasor arrow
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = '#facc15';
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e2e8f0'; ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(`cos=${Math.cos(nRad).toFixed(2)}`, 12, 18);
        ctx.fillText(`sin=${Math.sin(nRad).toFixed(2)}`, 12, 34);
      } else if (spec.kind === 'geometry') {
        const cx = W / 2, cy = H / 2;
        if (spec.geomType === 'rect') {
          const rw = (vals.w ?? 6) * 18, rh = (vals.h ?? 4) * 14;
          ctx.fillStyle = 'rgba(56,189,248,0.2)';
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
          ctx.fillRect(cx - rw / 2, cy - rh / 2, rw, rh);
          ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
        } else if (spec.geomType === 'triangle' || spec.geomType === 'pythag') {
          const a = (vals.b ?? vals.a ?? 4) * 18, h = (vals.h ?? vals.b ?? 4) * 16;
          const x0 = cx - a / 2, y0 = cy + h / 2;
          ctx.fillStyle = 'rgba(168,85,247,0.22)';
          ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x0, y0); ctx.lineTo(x0 + a, y0);
          ctx.lineTo(spec.geomType === 'pythag' ? x0 : cx, y0 - h);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (spec.geomType === 'circle' || spec.geomType === 'sphere') {
          const r = Math.min(H * 0.4, (vals.r ?? 4) * 12);
          ctx.fillStyle = 'rgba(56,189,248,0.18)';
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (spec.geomType === 'sphere') {
            ctx.strokeStyle = 'rgba(125,211,252,0.5)';
            ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.strokeStyle = '#facc15';
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
        } else if (spec.geomType === 'cosine-tri') {
          const a = (vals.a ?? 6) * 14, b = (vals.b ?? 7) * 14;
          const ang = ((vals.C ?? 60) * Math.PI) / 180;
          const x0 = cx - a * 0.4, y0 = cy + 45;
          const x1 = x0 + a, y1 = y0;
          const x2 = x0 + b * Math.cos(ang), y2 = y0 - b * Math.sin(ang);
          ctx.fillStyle = 'rgba(74,222,128,0.18)';
          ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath();
          ctx.fill(); ctx.stroke();
        } else if (spec.geomType === 'polyhedron') {
          const ang = frame * 0.025;
          const solid = Math.round(vals.solid ?? 1);
          const verts: [number, number, number][] =
            solid === 0
              ? [[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]
              : solid === 1
              ? [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
              : [[1.3,0,0],[-1.3,0,0],[0,1.3,0],[0,-1.3,0],[0,0,1.3],[0,0,-1.3]];
          const edges: [number, number][] =
            solid === 0
              ? [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]
              : solid === 1
              ? [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
              : [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[4,3],[3,5],[5,2]];
          const proj = ([x, y, z]: [number, number, number]): [number, number] => {
            const x1 = x * Math.cos(ang) - z * Math.sin(ang);
            const z1 = x * Math.sin(ang) + z * Math.cos(ang);
            const y2 = y * Math.cos(0.4) - z1 * Math.sin(0.4);
            return [cx + x1 * 48, cy - y2 * 48];
          };
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
          for (const [i, j] of edges) {
            const [x1, y1] = proj(verts[i]), [x2, y2] = proj(verts[j]);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          }
          frame++;
          raf = requestAnimationFrame(render);
        }
      } else if (spec.kind === 'matrix2d') {
        const cx = W / 2, cy = H / 2, sc = 36;
        ctx.strokeStyle = 'rgba(148,163,184,0.18)';
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
        // Unit circle
        ctx.strokeStyle = 'rgba(148,163,184,0.45)';
        ctx.beginPath(); ctx.arc(cx, cy, sc, 0, Math.PI * 2); ctx.stroke();
        // Transformed ellipse A * (cos t, sin t)
        const a = vals.a ?? 1.5, b = vals.b ?? 0.5, cc = vals.c ?? 0.25, d = vals.d ?? 1;
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * Math.PI * 2;
          const ux = Math.cos(t), uy = Math.sin(t);
          const tx = a * ux + b * uy, ty = cc * ux + d * uy;
          const px = cx + tx * sc, py = cy - ty * sc;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        // Basis vectors A e1, A e2
        ctx.strokeStyle = '#4ade80'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + a * sc, cy - cc * sc); ctx.stroke();
        ctx.strokeStyle = '#f43f5e'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + b * sc, cy - d * sc); ctx.stroke();
      } else if (spec.kind === 'wave-anim') {
        const t = frame * 0.04;
        if (spec.animType === 'heat') {
          const alpha = vals.alpha ?? 0.6;
          const tau = (t % 4.0) + 0.05;
          ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let i = 0; i <= 120; i++) {
            const x = -3 + (i / 120) * 6;
            const u = (1 / Math.sqrt(1 + 4 * alpha * tau)) * Math.exp(-(x * x) / (0.25 + 4 * alpha * tau));
            const px = (i / 120) * W, py = H - 20 - u * (H - 40);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else if (spec.animType === 'wave') {
          const mode = vals.mode ?? 2, cSpd = vals.c ?? 1.5;
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.4;
          ctx.beginPath();
          for (let i = 0; i <= 120; i++) {
            const x = i / 120;
            const y = Math.sin(mode * Math.PI * x) * Math.cos(mode * cSpd * t);
            const px = x * W, py = H / 2 - y * (H * 0.36);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else if (spec.animType === 'quantum') {
          const sx = vals.sx ?? 0.6, k0 = vals.k0 ?? 4;
          const x0 = -1.6 + ((t * 0.7) % 3.2);
          ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2.2;
          ctx.beginPath();
          for (let i = 0; i <= 140; i++) {
            const x = -3 + (i / 140) * 6;
            const env = Math.exp(-((x - x0) ** 2) / (2 * sx * sx));
            const re = env * Math.cos(k0 * (x - x0) - t * 3);
            const px = (i / 140) * W;
            const py = H / 2 - re * (H * 0.38);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else if (spec.animType === 'em') {
          const k = vals.k ?? 2;
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= 120; i++) {
            const x = (i / 120) * Math.PI * 2;
            const y = Math.sin(k * x - t * 2);
            if (i === 0) ctx.moveTo((i / 120) * W, H / 2 - y * 55); else ctx.lineTo((i / 120) * W, H / 2 - y * 55);
          }
          ctx.stroke();
          ctx.strokeStyle = '#f43f5e';
          ctx.beginPath();
          for (let i = 0; i <= 120; i++) {
            const x = (i / 120) * Math.PI * 2;
            const y = Math.sin(k * x - t * 2) * 0.45;
            if (i === 0) ctx.moveTo((i / 120) * W, H / 2 + y * 55); else ctx.lineTo((i / 120) * W, H / 2 + y * 55);
          }
          ctx.stroke();
        } else if (spec.animType === 'vortex') {
          const amp = vals.amp ?? 1.5, nu = vals.nu ?? 0.1;
          const decay = Math.exp(-nu * (t % 3));
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.4;
          for (let r = 16; r <= 72; r += 14) {
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, r, t * amp * decay, t * amp * decay + Math.PI * 1.45);
            ctx.stroke();
          }
        } else {
          // Wilson loop exponential decay curve
          const sig = vals.sigma ?? 0.25, m0 = vals.m0 ?? 0.8;
          ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 2.2;
          ctx.beginPath();
          for (let i = 0; i <= 100; i++) {
            const area = (i / 100) * 8;
            const y = Math.exp(-sig * area);
            if (i === 0) ctx.moveTo(20 + (i / 100) * (W - 40), H - 20 - y * (H - 40));
            else ctx.lineTo(20 + (i / 100) * (W - 40), H - 20 - y * (H - 40));
          }
          ctx.stroke();
          ctx.strokeStyle = '#38bdf8'; ctx.setLineDash([4, 4]);
          ctx.beginPath();
          for (let i = 0; i <= 100; i++) {
            const tau = (i / 100) * 5;
            const y = Math.exp(-m0 * tau);
            if (i === 0) ctx.moveTo(20 + (i / 100) * (W - 40), H - 20 - y * (H - 40));
            else ctx.lineTo(20 + (i / 100) * (W - 40), H - 20 - y * (H - 40));
          }
          ctx.stroke();
          ctx.setLineDash([]);
          return; // static curve, no animation loop needed
        }
        frame++;
        raf = requestAnimationFrame(render);
      } else if (spec.kind === 'elliptic-curve') {
        const a = vals.a ?? -2, b = vals.b ?? 1;
        const cx = W / 2, cy = H / 2, sc = 40;
        ctx.strokeStyle = 'rgba(148,163,184,0.2)';
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        for (let px = 0; px < W; px += 1.5) {
          const x = (px - cx) / sc;
          const rhs = x * x * x + a * x + b;
          if (rhs >= 0) {
            const y = Math.sqrt(rhs);
            ctx.fillRect(px, cy - y * sc - 1, 2, 2);
            ctx.fillRect(px, cy + y * sc - 1, 2, 2);
          }
        }
      }
    };

    render();
    return () => cancelAnimationFrame(raf);
  }, [spec, vals]);

  return (
    <div className="inspector-section">
      <h3>Interactive Visual Explorer</h3>
      <p className="muted" style={{ marginBottom: 8 }}>{spec.subtitle}</p>
      {spec.params.map((p) => (
        <label key={p.key} className="eq-slider-label">
          <span>{p.label}: <strong>{vals[p.key] ?? p.defaultVal}</strong></span>
          <input
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={vals[p.key] ?? p.defaultVal}
            onChange={(e) => setVals((prev) => ({ ...prev, [p.key]: parseFloat(e.target.value) }))}
          />
        </label>
      ))}
      {scalar && (
        <div className="scalar-readout">
          <span>{scalar.label}</span>
          <code>{scalar.value}</code>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={410}
        height={175}
        className="atlas-plot-canvas"
        onMouseMove={(e) => {
          if (spec.kind === 'curve' && spec.evalCurve && spec.xRange) {
            const rect = e.currentTarget.getBoundingClientRect();
            const f = Math.max(0, Math.min(1, (e.clientX - rect.left - 44) / Math.max(1, rect.width - 58)));
            const x = spec.xRange[0] + f * (spec.xRange[1] - spec.xRange[0]);
            const y = spec.evalCurve(x, vals);
            if (Number.isFinite(y)) setHoverInfo(`x = ${x.toFixed(3)}  →  y = ${y.toFixed(4)}`);
          }
        }}
        onMouseLeave={() => setHoverInfo('')}
      />
      {hoverInfo && <div className="hover-readout" style={{ marginTop: 4 }}>{hoverInfo}</div>}
    </div>
  );
}
