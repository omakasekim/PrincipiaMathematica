import { describe, it, expect } from 'vitest';
import { runVortexBlowup, DEFAULT_VORTEX_PARAMS } from '../src/engines/vortexBlowup';
import { runZetaZero, hardyZ, DEFAULT_ZETA_PARAMS } from '../src/engines/zetaZero';
import { runGoldbachSieves, sievePrimes, goldbachCount, DEFAULT_GOLDBACH_PARAMS } from '../src/engines/goldbachSieves';
import { runPvsNPWitness, solveCdcl, verifySatModel, solveXorSat, DEFAULT_SAT_PARAMS } from '../src/engines/pVsNpWitness';
import { runYangMillsGap, DEFAULT_YANGMILLS_PARAMS } from '../src/engines/yangMillsGap';
import {
  runHodgeCycles,
  hodgeCompleteIntersection,
  kunnethProduct,
  fermatHodgeAnalysis,
  integrateFermatPeriod,
  DEFAULT_HODGE_PARAMS,
} from '../src/engines/hodgeCycles';

describe('PrincipiaMathematica Mathematical Invariant Suite', () => {
  it('Lab 1 (VortexBlowup): preserves incompressibility and energy-enstrophy balance', () => {
    const res = runVortexBlowup({ ...DEFAULT_VORTEX_PARAMS, gridN: 16, viscosity: 0.02, tEnd: 0.5 });
    expect(res.invariants.every((i) => i.passed)).toBe(true);
    expect(res.heatmap?.nx).toBe(16);
  });

  it('Lab 2 (ZetaZero): locates the first three Riemann zeta zeros accurately', () => {
    const known = [14.13472514, 21.02203964, 25.01085758];
    for (const g of known) {
      expect(Math.abs(hardyZ(g))).toBeLessThan(1e-3);
    }
    const res = runZetaZero({ ...DEFAULT_ZETA_PARAMS, tMin: 10, tMax: 45, samples: 600, gueCount: 40 });
    expect(res.invariants.every((i) => i.passed)).toBe(true);
    expect(res.table!.rows.length).toBeGreaterThanOrEqual(7);
  });

  it('Lab 3 (GoldbachSieves): matches exact Goldbach counts r2(100)=6 and r2(1000)=28', () => {
    const { isPrime, primes } = sievePrimes(2000);
    expect(goldbachCount(100, isPrime, primes)).toBe(6);
    expect(goldbachCount(1000, isPrime, primes)).toBe(28);
    const res = runGoldbachSieves({ ...DEFAULT_GOLDBACH_PARAMS, nMax: 6000, circleN: 600, arcSamples: 200 });
    expect(res.invariants.every((i) => i.passed)).toBe(true);
  });

  it('Lab 4 (PvsNPWitness): CDCL SAT/UNSAT soundness and GF(2) XOR-SAT exactness', () => {
    // Unsatisfiable 2-var formula: (x0) & (~x0 | x1) & (~x1)
    const unsat = solveCdcl(2, [[0], [1, 2], [3]]);
    expect(unsat.sat).toBe(false);

    // Satisfiable formula with model verification
    const clauses = [[0, 2], [1, 4], [3, 5], [0, 5]];
    const sat = solveCdcl(3, clauses);
    expect(sat.sat).toBe(true);
    expect(verifySatModel(clauses, sat.model!)).toBe(true);

    // GF(2) XOR-SAT: x0 ^ x1 = 1, x1 ^ x2 = 1, x0 ^ x2 = 1 (inconsistent!)
    const xorUnsat = solveXorSat(3, [
      { vars: [0, 1], rhs: 1 },
      { vars: [1, 2], rhs: 1 },
      { vars: [0, 2], rhs: 1 },
    ]);
    expect(xorUnsat.sat).toBe(false);

    const res = runPvsNPWitness({ ...DEFAULT_SAT_PARAMS, numVars: 22, trialsPerAlpha: 8, alphaSteps: 8 });
    expect(res.invariants.every((i) => i.passed)).toBe(true);
  });

  it('Lab 5 (YangMillsGap): satisfies SU(2) unitarity, local gauge invariance, and strong-coupling <P>~beta/4', () => {
    const res = runYangMillsGap({
      ...DEFAULT_YANGMILLS_PARAMS,
      dim: 4,
      latticeL: 3,
      betaMin: 0.5,
      betaMax: 2.5,
      betaSteps: 5,
      thermSweeps: 8,
      measSweeps: 10,
    });
    expect(res.invariants.every((i) => i.passed)).toBe(true);
  });

  it('Lab 6 (HodgeCycles): computes exact K3, Quintic CY3, Abelian Surface & Fermat period', () => {
    // Quartic K3 surface X_4 in CP^3: h^{2,0}=1, h^{1,1}=20, chi=24
    const k3 = hodgeCompleteIntersection(2, [4]);
    expect(k3[2][0]).toBe(1);
    expect(k3[1][1]).toBe(20);
    expect(k3[0][2]).toBe(1);

    // Quintic Calabi-Yau 3-fold X_5 in CP^4: h^{3,0}=1, h^{2,1}=101, h^{1,1}=1, chi=-200
    const cy3 = hodgeCompleteIntersection(3, [5]);
    expect(cy3[3][0]).toBe(1);
    expect(cy3[2][1]).toBe(101);
    expect(cy3[1][1]).toBe(1);

    // Product of two elliptic curves E x E: h^{1,1} = 4, h^{2,0} = 1
    const e1 = hodgeCompleteIntersection(1, [3]);
    const abel = kunnethProduct(e1, e1);
    expect(abel[1][1]).toBe(4);
    expect(abel[2][0]).toBe(1);

    // Fermat quartic surface (d=4, dim=2): known primitive Hodge rank = 19 (total Picard rank = 20 = h^{1,1})
    const fa = fermatHodgeAnalysis(2, 4);
    expect(fa.totalHodgeTuples).toBe(19);

    // Fermat period for d=4, a=0, b=3: int_0^1 (1-x^4)^(-3/4) dx = (1/4)*B(1/4, 1/4) = Gamma(1/4)^2 / (4*sqrt(pi)) ≈ 1.8540746773
    const p4 = integrateFermatPeriod(4, 0, 3);
    expect(Math.abs(p4 - 1.8540746773)).toBeLessThan(1e-6);

    const res = runHodgeCycles(DEFAULT_HODGE_PARAMS);
    expect(res.invariants.every((i) => i.passed)).toBe(true);
    expect(res.hodgeDiamond?.euler).toBe(24);
  });
});
