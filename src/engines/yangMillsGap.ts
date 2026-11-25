import type { LabResult, ProgressCallback } from './types';

export interface YangMillsParams {
  dim: 2 | 3 | 4;
  latticeL: number;
  betaMin: number;
  betaMax: number;
  betaSteps: number;
  thermSweeps: number;
  measSweeps: number;
  seed: number;
}

export const DEFAULT_YANGMILLS_PARAMS: YangMillsParams = {
  dim: 4,
  latticeL: 4,
  betaMin: 0.4,
  betaMax: 3.2,
  betaSteps: 8,
  thermSweeps: 10,
  measSweeps: 14,
  seed: 1370359,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Unit quaternion representation of SU(2): U = q0*I + i*(q1*sigma1 + q2*sigma2 + q3*sigma3), |q|^2 = 1
// Trace(U)/2 = q0.
type Quat = [number, number, number, number];

function qMul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function qDag(a: Quat): Quat {
  return [a[0], -a[1], -a[2], -a[3]];
}

function qNorm(a: Quat): number {
  return Math.hypot(a[0], a[1], a[2], a[3]);
}

function qUnit(a: Quat): Quat {
  const n = qNorm(a);
  if (n < 1e-15) return [1, 0, 0, 0];
  return [a[0] / n, a[1] / n, a[2] / n, a[3] / n];
}

function randomSU2(rng: () => number): Quat {
  // Uniform on S^3 via Marsaglia / Gaussian projection
  const g = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
  return qUnit([g(), g(), g(), g()]);
}

// Creutz heat-bath sampling for P(x0) ~ sqrt(1 - x0^2) * exp(alpha * x0), x0 in [-1, 1]
function sampleCreutzX0(alpha: number, rng: () => number): number {
  if (alpha < 1e-6) {
    // Uniform on S^3 => x0 = cos(theta)
    const q = randomSU2(rng);
    return q[0];
  }
  const expMin = Math.exp(-2 * alpha);
  for (let tries = 0; tries < 64; tries++) {
    const r = expMin + rng() * (1 - expMin);
    const x0 = 1 + Math.log(Math.max(1e-15, r)) / alpha;
    if (x0 >= -1 && x0 <= 1) {
      if (rng() * rng() <= 1 - x0 * x0) return x0;
    }
  }
  return 0;
}

class SU2Lattice {
  readonly dim: number;
  readonly L: number;
  readonly nSites: number;
  readonly strides: number[];
  readonly links: Float64Array; // nSites * dim * 4

  constructor(dim: number, L: number) {
    this.dim = dim;
    this.L = L;
    this.strides = [];
    let s = 1;
    for (let d = 0; d < dim; d++) {
      this.strides.push(s);
      s *= L;
    }
    this.nSites = s;
    this.links = new Float64Array(this.nSites * dim * 4);
    // Cold start: identity matrices
    for (let i = 0; i < this.nSites * dim; i++) this.links[4 * i] = 1;
  }

  getLink(site: number, mu: number): Quat {
    const o = (site * this.dim + mu) * 4;
    return [this.links[o], this.links[o + 1], this.links[o + 2], this.links[o + 3]];
  }

  setLink(site: number, mu: number, q: Quat): void {
    const o = (site * this.dim + mu) * 4;
    this.links[o] = q[0];
    this.links[o + 1] = q[1];
    this.links[o + 2] = q[2];
    this.links[o + 3] = q[3];
  }

  shift(site: number, mu: number, delta: number): number {
    const stride = this.strides[mu];
    const coord = Math.floor(site / stride) % this.L;
    const nextCoord = (coord + delta + this.L) % this.L;
    return site + (nextCoord - coord) * stride;
  }

  // Sum of staples A around link U_mu(x) such that S_local = - (beta/2) Re Tr(U_mu(x) * A)
  stapleSum(site: number, mu: number): Quat {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    const xPlusMu = this.shift(site, mu, 1);
    for (let nu = 0; nu < this.dim; nu++) {
      if (nu === mu) continue;
      // Forward staple: U_nu(x+mu) * U_mu^dag(x+nu) * U_nu^dag(x)
      const xPlusNu = this.shift(site, nu, 1);
      const fwd = qMul(
        qMul(this.getLink(xPlusMu, nu), qDag(this.getLink(xPlusNu, mu))),
        qDag(this.getLink(site, nu))
      );
      // Backward staple: U_nu^dag(x+mu-nu) * U_mu^dag(x-nu) * U_nu(x-nu)
      const xMinusNu = this.shift(site, nu, -1);
      const xPlusMuMinusNu = this.shift(xPlusMu, nu, -1);
      const bwd = qMul(
        qMul(qDag(this.getLink(xPlusMuMinusNu, nu)), qDag(this.getLink(xMinusNu, mu))),
        this.getLink(xMinusNu, nu)
      );
      a0 += fwd[0] + bwd[0];
      a1 += fwd[1] + bwd[1];
      a2 += fwd[2] + bwd[2];
      a3 += fwd[3] + bwd[3];
    }
    return [a0, a1, a2, a3];
  }

  heatBathSweep(beta: number, rng: () => number): void {
    for (let site = 0; site < this.nSites; site++) {
      for (let mu = 0; mu < this.dim; mu++) {
        const A = this.stapleSum(site, mu);
        const k = qNorm(A);
        if (k < 1e-12) {
          this.setLink(site, mu, randomSU2(rng));
          continue;
        }
        const V: Quat = [A[0] / k, A[1] / k, A[2] / k, A[3] / k];
        const x0 = sampleCreutzX0(beta * k, rng);
        const r = Math.sqrt(Math.max(0, 1 - x0 * x0));
        const cosT = 2 * rng() - 1;
        const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
        const phi = 2 * Math.PI * rng();
        const X: Quat = [x0, r * sinT * Math.cos(phi), r * sinT * Math.sin(phi), r * cosT];
        // U = X * V^dag so Re Tr(U * A) = 2 * k * x0
        this.setLink(site, mu, qUnit(qMul(X, qDag(V))));
      }
    }
  }

  averagePlaquette(): number {
    let sum = 0;
    let count = 0;
    for (let site = 0; site < this.nSites; site++) {
      for (let mu = 0; mu < this.dim; mu++) {
        const xMu = this.shift(site, mu, 1);
        for (let nu = mu + 1; nu < this.dim; nu++) {
          const xNu = this.shift(site, nu, 1);
          const p = qMul(
            qMul(this.getLink(site, mu), this.getLink(xMu, nu)),
            qMul(qDag(this.getLink(xNu, mu)), qDag(this.getLink(site, nu)))
          );
          sum += p[0];
          count++;
        }
      }
    }
    return sum / count;
  }

  wilsonLoop(R: number, T: number): number {
    let sum = 0;
    let count = 0;
    for (let site = 0; site < this.nSites; site++) {
      for (let mu = 0; mu < this.dim; mu++) {
        for (let nu = mu + 1; nu < this.dim; nu++) {
          let cur = site;
          let acc: Quat = [1, 0, 0, 0];
          for (let r = 0; r < R; r++) {
            acc = qMul(acc, this.getLink(cur, mu));
            cur = this.shift(cur, mu, 1);
          }
          for (let t = 0; t < T; t++) {
            acc = qMul(acc, this.getLink(cur, nu));
            cur = this.shift(cur, nu, 1);
          }
          for (let r = 0; r < R; r++) {
            cur = this.shift(cur, mu, -1);
            acc = qMul(acc, qDag(this.getLink(cur, mu)));
          }
          for (let t = 0; t < T; t++) {
            cur = this.shift(cur, nu, -1);
            acc = qMul(acc, qDag(this.getLink(cur, nu)));
          }
          sum += acc[0];
          count++;
        }
      }
    }
    return sum / count;
  }

  // Zero-momentum time-slice spatial plaquette operator O(t) for mass-gap correlator C(tau)
  timeSlicePlaquetteProfile(): number[] {
    const tAxis = this.dim - 1;
    const tStride = this.strides[tAxis];
    const prof = new Array<number>(this.L).fill(0);
    const counts = new Array<number>(this.L).fill(0);
    for (let site = 0; site < this.nSites; site++) {
      const t = Math.floor(site / tStride) % this.L;
      const mu = 0;
      const nu = this.dim > 2 ? 1 : tAxis;
      const xMu = this.shift(site, mu, 1);
      const xNu = this.shift(site, nu, 1);
      const p = qMul(
        qMul(this.getLink(site, mu), this.getLink(xMu, nu)),
        qMul(qDag(this.getLink(xNu, mu)), qDag(this.getLink(site, nu)))
      );
      prof[t] += p[0];
      counts[t]++;
    }
    return prof.map((v, t) => v / Math.max(1, counts[t]));
  }

  maxUnitarityError(): number {
    let err = 0;
    for (let i = 0; i < this.nSites * this.dim; i++) {
      const o = 4 * i;
      const n = Math.hypot(this.links[o], this.links[o + 1], this.links[o + 2], this.links[o + 3]);
      err = Math.max(err, Math.abs(n - 1));
    }
    return err;
  }

  // Verify local SU(2) gauge invariance: U_mu(x) -> g(x) U_mu(x) g(x+mu)^dag preserves averagePlaquette
  gaugeInvarianceError(rng: () => number): number {
    const before = this.averagePlaquette();
    const g: Quat[] = Array.from({ length: this.nSites }, () => randomSU2(rng));
    const saved = this.links.slice();
    for (let site = 0; site < this.nSites; site++) {
      for (let mu = 0; mu < this.dim; mu++) {
        const xMu = this.shift(site, mu, 1);
        const uNew = qMul(qMul(g[site], this.getLink(site, mu)), qDag(g[xMu]));
        this.setLink(site, mu, uNew);
      }
    }
    const after = this.averagePlaquette();
    this.links.set(saved);
    return Math.abs(after - before);
  }
}

function jackknifeMeanErr(samples: number[]): { mean: number; err: number } {
  const n = samples.length;
  if (n <= 1) return { mean: samples[0] ?? 0, err: 0 };
  const sum = samples.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const jk = (sum - samples[i]) / (n - 1);
    sq += (jk - mean) ** 2;
  }
  return { mean, err: Math.sqrt(((n - 1) / n) * sq) };
}

export function runYangMillsGap(params: YangMillsParams, onProgress?: ProgressCallback): LabResult {
  const t0 = performance.now();
  const rng = mulberry32(params.seed);
  const dim = params.dim;
  const L = Math.max(3, Math.min(dim === 4 ? 5 : 8, params.latticeL));
  const steps = Math.max(4, Math.min(12, params.betaSteps));
  const lat = new SU2Lattice(dim, L);

  const plaqPts: { x: number; y: number; yErr: number }[] = [];
  const strongPts: { x: number; y: number }[] = [];
  const weakPts: { x: number; y: number }[] = [];

  // Reference measurements at mid-coupling (e.g., beta ~ 2.0) for Wilson loops & mass-gap correlator
  const refIdx = Math.floor(steps * 0.55);
  let w11 = 0, w12 = 0, w22 = 0;
  const corrSum = new Array<number>(Math.floor(L / 2) + 1).fill(0);
  let corrCount = 0;
  let refBeta = params.betaMin;

  for (let bi = 0; bi < steps; bi++) {
    const beta = params.betaMin + (bi / (steps - 1)) * (params.betaMax - params.betaMin);
    for (let s = 0; s < params.thermSweeps; s++) lat.heatBathSweep(beta, rng);

    const pSamples: number[] = [];
    const profiles: number[][] = [];
    for (let m = 0; m < params.measSweeps; m++) {
      lat.heatBathSweep(beta, rng);
      pSamples.push(lat.averagePlaquette());
      if (bi === refIdx) {
        w11 += lat.wilsonLoop(1, 1);
        w12 += lat.wilsonLoop(1, 2);
        w22 += lat.wilsonLoop(2, 2);
        profiles.push(lat.timeSlicePlaquetteProfile());
      }
    }

    if (bi === refIdx) {
      refBeta = beta;
      w11 /= params.measSweeps;
      w12 /= params.measSweeps;
      w22 /= params.measSweeps;
      // Compute connected time-slice correlator C(tau) = <O(t) O(t+tau)> - <O>^2
      const flatMean = profiles.flat().reduce((a, b) => a + b, 0) / (profiles.length * L);
      for (const prof of profiles) {
        for (let tau = 0; tau < corrSum.length; tau++) {
          let sTau = 0;
          for (let t = 0; t < L; t++) {
            sTau += (prof[t] - flatMean) * (prof[(t + tau) % L] - flatMean);
          }
          corrSum[tau] += sTau / L;
        }
        corrCount++;
      }
    }

    const { mean, err } = jackknifeMeanErr(pSamples);
    plaqPts.push({ x: beta, y: mean, yErr: err });
    // Strong coupling: <P> ~ beta/4 (d>=3) or I2(beta)/I1(beta) ~ beta/4
    strongPts.push({ x: beta, y: Math.min(1, beta / 4) });
    // Weak coupling 1-loop: <P> ~ 1 - 3/(4 * beta) in d=4, 1 - 3/(2*dim*beta) general
    weakPts.push({ x: beta, y: Math.max(0, 1 - 3 / (dim * beta)) });
    onProgress?.((bi + 1) / steps, `β = ${beta.toFixed(2)}: ⟨P⟩ = ${mean.toFixed(4)}`);
  }

  const unitErr = lat.maxUnitarityError();
  const gaugeErr = lat.gaugeInvarianceError(rng);

  // Creutz ratio chi(2,2) = -ln( W(2,2) * W(1,1) / W(1,2)^2 ) => string tension sigma
  const creutzRatio =
    w22 > 1e-6 && w11 > 1e-6 && w12 > 1e-6 ? -Math.log((w22 * w11) / (w12 * w12)) : 0;

  const corrPts = corrSum.map((v, tau) => ({
    x: tau,
    y: Math.max(1e-6, Math.abs(v / Math.max(1, corrCount))),
  }));
  const c0 = corrPts[0]?.y ?? 1e-6;
  const c1 = corrPts[1]?.y ?? 1e-6;
  const mEff = c0 > c1 && c1 > 1e-6 ? Math.log(c0 / c1) : 0;

  // Check strong coupling agreement at lowest beta <= 1.0
  const lowBetaPt = plaqPts[0];
  const strongRelErr = lowBetaPt.x <= 1.0 ? Math.abs(lowBetaPt.y - lowBetaPt.x / 4) : 0;

  return {
    labId: 'YangMillsGap',
    summary: {
      'Lattice': `SU(2) on ${L}^${dim} (${lat.nSites} sites)`,
      'Ref Coupling β': refBeta.toFixed(2),
      '⟨W(1,1)⟩': w11.toFixed(4),
      '⟨W(1,2)⟩': w12.toFixed(4),
      '⟨W(2,2)⟩': w22.toFixed(4),
      'Creutz String Tension χ(2,2)': creutzRatio.toFixed(3),
      'Effective Mass m_eff(0→1)': mEff.toFixed(3),
    },
    invariants: [
      {
        name: 'SU(2) Unitarity max||q| − 1|',
        value: unitErr.toExponential(2),
        target: '< 1e-12',
        passed: unitErr < 1e-12,
      },
      {
        name: 'Local Gauge Invariance |Δ⟨P⟩|',
        value: gaugeErr.toExponential(2),
        target: '< 1e-12',
        passed: gaugeErr < 1e-12,
      },
      {
        name: 'Strong-Coupling ⟨P⟩ ≈ β/4 Check',
        value: `|Δ| = ${strongRelErr.toFixed(3)}`,
        target: '< 0.08',
        passed: strongRelErr < 0.08,
      },
    ],
    charts: [
      {
        id: 'beta-sweep',
        title: `SU(2) Average Plaquette ⟨P⟩ vs. β on ${L}^${dim} Lattice (Jackknife Errors)`,
        xLabel: 'Inverse Coupling β = 4/g²',
        yLabel: 'Average Plaquette ⟨P⟩',
        series: [
          { name: 'Heat-Bath ⟨P⟩', color: '#38bdf8', mode: 'line', points: plaqPts },
          { name: 'Strong-Coupling β/4', color: '#facc15', mode: 'dashed', points: strongPts },
          { name: `Weak-Coupling 1 − 3/(${dim}β)`, color: '#4ade80', mode: 'dashed', points: weakPts },
        ],
      },
      {
        id: 'wilson-corr',
        title: `Zero-Momentum Plaquette Correlator |C(τ)| at β = ${refBeta.toFixed(2)}`,
        xLabel: 'Euclidean Time Separation τ',
        yLabel: '|C(τ)|',
        yLog: true,
        series: [{ name: '|C(τ)|', color: '#ec4899', mode: 'line', points: corrPts }],
      },
    ],
    notes: [
      'Uses exact unit-quaternion SU(2) links with Creutz heat-bath sweeps under the Wilson plaquette action.',
      'Positive Creutz ratio χ(2,2) > 0 signals area-law confinement W(R,T) ~ exp(-σRT) and a non-vanishing mass gap.',
    ],
    elapsedMs: performance.now() - t0,
  };
}
