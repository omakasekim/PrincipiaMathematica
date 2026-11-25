import type { LabResult, ProgressCallback } from './types';

export interface GoldbachParams {
  nMax: number;
  circleN: number;
  arcSamples: number;
}

export const DEFAULT_GOLDBACH_PARAMS: GoldbachParams = {
  nMax: 12000,
  circleN: 1200,
  arcSamples: 360,
};

// Twin-prime constant C2 = prod_{p >= 3} (1 - 1/(p-1)^2)
export const TWIN_PRIME_C2 = 0.6601618158468696;

// Segmented bitset Sieve of Eratosthenes returning Uint8Array isPrime (1 = prime) and prime list
export function sievePrimes(limit: number): { isPrime: Uint8Array; primes: number[] } {
  const isPrime = new Uint8Array(limit + 1);
  if (limit >= 2) isPrime.fill(1, 2);
  const sq = Math.floor(Math.sqrt(limit));
  for (let p = 2; p <= sq; p++) {
    if (isPrime[p]) {
      for (let m = p * p; m <= limit; m += p) isPrime[m] = 0;
    }
  }
  const primes: number[] = [];
  for (let i = 2; i <= limit; i++) if (isPrime[i]) primes.push(i);
  return { isPrime, primes };
}

// Hardy-Littlewood singular series S(n) = 2 * C2 * prod_{p | n, p > 2} (p - 1) / (p - 2)
export function singularSeries(n: number): number {
  let s = 2 * TWIN_PRIME_C2;
  let m = n;
  while ((m & 1) === 0) m >>= 1;
  for (let p = 3; p * p <= m; p += 2) {
    if (m % p === 0) {
      s *= (p - 1) / (p - 2);
      while (m % p === 0) m /= p;
    }
  }
  if (m > 2) s *= (m - 1) / (m - 2);
  return s;
}

// Exact Goldbach partition count r_2(n) = #{(p1, p2): p1 + p2 = n, p1 <= p2}
export function goldbachCount(n: number, isPrime: Uint8Array, primes: number[]): number {
  let count = 0;
  const half = n >> 1;
  for (let i = 0; i < primes.length; i++) {
    const p = primes[i];
    if (p > half) break;
    if (isPrime[n - p]) count++;
  }
  return count;
}

export function runGoldbachSieves(params: GoldbachParams, onProgress?: ProgressCallback): LabResult {
  const t0 = performance.now();
  const nMax = Math.max(100, Math.min(100000, params.nMax - (params.nMax % 2)));
  const { isPrime, primes } = sievePrimes(nMax);
  onProgress?.(0.2, `Sieved ${primes.length} primes up to ${nMax}`);

  // 1. Goldbach Comet: sample even integers up to nMax (exact r_2(n))
  const stepEven = Math.max(2, Math.floor(nMax / 600) * 2);
  const mod0Pts: { x: number; y: number }[] = [];
  const mod24Pts: { x: number; y: number }[] = [];
  const hlCurve: { x: number; y: number }[] = [];
  let minR2 = Infinity;
  let minN = 4;
  let ratioSum = 0;
  let ratioCount = 0;

  for (let n = 4; n <= nMax; n += stepEven) {
    const r2 = goldbachCount(n, isPrime, primes);
    if (r2 < minR2) { minR2 = r2; minN = n; }
    if (n % 6 === 0) mod0Pts.push({ x: n, y: r2 });
    else mod24Pts.push({ x: n, y: r2 });

    const ln = Math.log(n);
    const hl = (singularSeries(n) * n) / (2 * ln * ln);
    if (n >= 200) {
      ratioSum += r2 / hl;
      ratioCount++;
    }
    if (n % (stepEven * 4) === 0 || n === nMax) {
      hlCurve.push({ x: n, y: (2 * TWIN_PRIME_C2 * n) / (2 * ln * ln) });
    }
  }
  onProgress?.(0.55, 'Evaluating Circle Method exponential sums S(α; N)');

  // 2. Circle Method Major vs Minor Arcs: |S(alpha; N)| = |sum_{p <= N} log(p) exp(2pi i alpha p)|
  const cN = Math.min(nMax, Math.max(100, params.circleN));
  const cPrimes = primes.filter((p) => p <= cN);
  const logP = cPrimes.map((p) => Math.log(p));
  const arcSamples = Math.max(120, Math.min(800, params.arcSamples));
  const arcPts: { x: number; y: number }[] = [];
  let majorPeak = 0;
  let minorMax = 0;

  for (let i = 0; i <= arcSamples; i++) {
    const alpha = i / arcSamples;
    let re = 0, im = 0;
    const twoPiA = 2 * Math.PI * alpha;
    for (let j = 0; j < cPrimes.length; j++) {
      const ang = twoPiA * cPrimes[j];
      re += logP[j] * Math.cos(ang);
      im += logP[j] * Math.sin(ang);
    }
    const mag = Math.hypot(re, im);
    arcPts.push({ x: alpha, y: mag });
    if (Math.abs(alpha - 0.5) < 0.01 || alpha < 0.01 || alpha > 0.99) {
      majorPeak = Math.max(majorPeak, mag);
    } else if (Math.abs(alpha - 1 / 3) > 0.03 && Math.abs(alpha - 2 / 3) > 0.03 && Math.abs(alpha - 0.5) > 0.03) {
      minorMax = Math.max(minorMax, mag);
    }
  }
  onProgress?.(0.85, 'Computing Selberg Λ² sieve parity-barrier comparison');

  // 3. Sieve Parity-Barrier: pi(x) and twin primes pi_2(x) vs Selberg upper bound (~2x overestimate)
  const parityExact: { x: number; y: number }[] = [];
  const paritySelberg: { x: number; y: number }[] = [];
  const twinExact: { x: number; y: number }[] = [];
  const twinSelberg: { x: number; y: number }[] = [];

  let piCount = 0;
  let pi2Count = 0;
  const checkpoints = 24;
  const cpStep = Math.max(20, Math.floor(nMax / checkpoints));
  let nextCp = cpStep;
  let lastParityRatio = 2.0;

  for (let x = 2; x <= nMax; x++) {
    if (isPrime[x]) {
      piCount++;
      if (x >= 5 && isPrime[x - 2]) pi2Count++;
    }
    if (x === nextCp || x === nMax) {
      const lnx = Math.log(x);
      // Selberg Lambda^2 sieve upper bound with level z = sqrt(x): 2x / ln(x)
      const selbergPi = (2 * x) / lnx;
      // Selberg twin-prime upper bound: 8 * C2 * x / (ln x)^2 (vs Hardy-Littlewood 2 * C2 * x / (ln x)^2 => 4x, Chen P2 => 2x)
      const selbergTwin = (8 * TWIN_PRIME_C2 * x) / (lnx * lnx);
      parityExact.push({ x, y: piCount });
      paritySelberg.push({ x, y: selbergPi });
      twinExact.push({ x, y: pi2Count });
      twinSelberg.push({ x, y: selbergTwin });
      lastParityRatio = selbergPi / Math.max(1, piCount);
      nextCp += cpStep;
    }
  }

  const meanHlRatio = ratioCount > 0 ? ratioSum / ratioCount : 1;

  return {
    labId: 'GoldbachSieves',
    summary: {
      'Max Even N': nMax,
      'Primes π(N)': primes.length,
      'Min r₂(n) in Sample': `${minR2} (at n=${minN})`,
      'Mean r₂(n) / HL(n)': meanHlRatio.toFixed(3),
      'Major/Minor Arc Ratio': (majorPeak / Math.max(1e-6, minorMax)).toFixed(2),
      'Selberg / π(N) Ratio': `${lastParityRatio.toFixed(2)}×`,
    },
    invariants: [
      {
        name: 'Goldbach Verified (min r₂(n) ≥ 1)',
        value: `min = ${minR2}`,
        target: '≥ 1',
        passed: minR2 >= 1,
      },
      {
        name: 'Hardy–Littlewood Asymptotic Match',
        value: meanHlRatio.toFixed(3),
        target: '0.85 – 1.35',
        passed: meanHlRatio > 0.85 && meanHlRatio < 1.35,
      },
      {
        name: 'Selberg Parity-Barrier Bound (≈2×)',
        value: `${lastParityRatio.toFixed(2)}×`,
        target: '1.7× – 2.3×',
        passed: lastParityRatio >= 1.7 && lastParityRatio <= 2.3,
      },
    ],
    charts: [
      {
        id: 'goldbach-comet',
        title: 'Goldbach Comet r₂(n): Residue Banding & Hardy–Littlewood Baseline',
        xLabel: 'Even integer n',
        yLabel: 'Partitions r₂(n)',
        series: [
          { name: 'n ≡ 0 (mod 6)', color: '#38bdf8', mode: 'scatter', points: mod0Pts },
          { name: 'n ≡ 2,4 (mod 6)', color: '#a855f7', mode: 'scatter', points: mod24Pts },
          { name: 'HL Base 2C₂·n/(2 ln²n)', color: '#facc15', mode: 'line', points: hlCurve },
        ],
      },
      {
        id: 'circle-method',
        title: `Circle Method Exponential Sum |S(α; ${cN})| — Major vs. Minor Arcs`,
        xLabel: 'α ∈ [0, 1]',
        yLabel: '|S(α; N)|',
        series: [{ name: '|S(α; N)|', color: '#4ade80', mode: 'line', points: arcPts }],
        vLines: [
          { x: 0.5, label: '1/2', color: '#f43f5e' },
          { x: 1 / 3, label: '1/3', color: '#facc15' },
          { x: 2 / 3, label: '2/3', color: '#facc15' },
        ],
      },
      {
        id: 'parity-barrier',
        title: 'Sieve Parity Barrier: Exact π(x) vs. Selberg Λ² Upper Bound',
        xLabel: 'x',
        yLabel: 'Count',
        series: [
          { name: 'Exact π(x)', color: '#38bdf8', mode: 'line', points: parityExact },
          { name: 'Selberg Upper Bound 2x/ln(x)', color: '#f97316', mode: 'dashed', points: paritySelberg },
          { name: 'Twin Primes π₂(x)', color: '#4ade80', mode: 'line', points: twinExact },
        ],
      },
    ],
    notes: [
      'Even integers n ≡ 0 (mod 6) carry an extra factor of (3-1)/(3-2) = 2 in the singular series S(n), creating the distinct upper band of the Goldbach Comet.',
      'The Selberg Λ² sieve is blind to the parity of the number of prime factors Ω(n), causing an inherent factor-of-2 barrier over π(x).',
    ],
    elapsedMs: performance.now() - t0,
  };
}
