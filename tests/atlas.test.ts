import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { EQUATION_ATLAS, EQUATION_LEVELS } from '../src/data/equationAtlas';
import type { LabId } from '../src/engines/types';

describe('100-Equation Atlas Integrity & KaTeX Suite', () => {
  it('contains exactly 100 equations with contiguous IDs 1..100 across all 4 levels', () => {
    expect(EQUATION_ATLAS.length).toBe(100);
    EQUATION_ATLAS.forEach((eq, idx) => {
      expect(eq.id).toBe(idx + 1);
      expect(eq.name.length).toBeGreaterThan(2);
      expect(eq.intuition.length).toBeGreaterThan(10);
      expect(eq.symbols.length).toBeGreaterThan(0);
    });
    for (const lvl of EQUATION_LEVELS) {
      expect(EQUATION_ATLAS.filter((e) => e.level === lvl).length).toBeGreaterThanOrEqual(20);
    }
  });

  it('renders every single one of the 100 LaTeX equations and symbol keys via KaTeX with zero errors', () => {
    for (const eq of EQUATION_ATLAS) {
      expect(() => katex.renderToString(eq.latex, { displayMode: true, throwOnError: true, strict: false })).not.toThrow();
      for (const [sym] of eq.symbols) {
        expect(() => katex.renderToString(sym, { displayMode: false, throwOnError: true, strict: false })).not.toThrow();
      }
    }
  });

  it('links to all 6 hard-math labs and evaluates all interactive specs cleanly', () => {
    const labs: LabId[] = ['VortexBlowup', 'ZetaZero', 'GoldbachSieves', 'PvsNPWitness', 'YangMillsGap', 'HodgeCycles'];
    for (const lab of labs) {
      expect(EQUATION_ATLAS.some((e) => e.relatedLab === lab)).toBe(true);
    }
    for (const eq of EQUATION_ATLAS) {
      if (!eq.interactive) continue;
      const p: Record<string, number> = {};
      for (const spec of eq.interactive.params) p[spec.key] = spec.defaultVal;
      if (eq.interactive.evalScalar) {
        expect(Number.isFinite(eq.interactive.evalScalar(p).value)).toBe(true);
      }
      if (eq.interactive.evalY && eq.interactive.xRange) {
        const mid = 0.5 * (eq.interactive.xRange[0] + eq.interactive.xRange[1]);
        expect(Number.isFinite(eq.interactive.evalY(mid, p))).toBe(true);
      }
    }
  });
});
