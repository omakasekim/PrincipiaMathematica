import React, { useEffect, useRef, useState } from 'react';
import type { LabId, LabResult } from '../engines/types';
import { DEFAULT_VORTEX_PARAMS, type VortexParams } from '../engines/vortexBlowup';
import { DEFAULT_ZETA_PARAMS, type ZetaParams } from '../engines/zetaZero';
import { DEFAULT_GOLDBACH_PARAMS, type GoldbachParams } from '../engines/goldbachSieves';
import { DEFAULT_SAT_PARAMS, type SatParams } from '../engines/pVsNpWitness';
import { DEFAULT_YANGMILLS_PARAMS, type YangMillsParams } from '../engines/yangMillsGap';
import { DEFAULT_HODGE_PARAMS, type HodgeParams } from '../engines/hodgeCycles';
import type { WorkerResponse } from '../workers/computeWorker';
import { ViewportCanvas } from './ViewportCanvas';
import { TelemetryPanel } from './TelemetryPanel';
import { EquationAtlas } from './EquationAtlas';

interface AllParams {
  VortexBlowup: VortexParams;
  ZetaZero: ZetaParams;
  GoldbachSieves: GoldbachParams;
  PvsNPWitness: SatParams;
  YangMillsGap: YangMillsParams;
  HodgeCycles: HodgeParams;
}

const DEFAULT_ALL: AllParams = {
  VortexBlowup: DEFAULT_VORTEX_PARAMS,
  ZetaZero: DEFAULT_ZETA_PARAMS,
  GoldbachSieves: DEFAULT_GOLDBACH_PARAMS,
  PvsNPWitness: DEFAULT_SAT_PARAMS,
  YangMillsGap: DEFAULT_YANGMILLS_PARAMS,
  HodgeCycles: DEFAULT_HODGE_PARAMS,
};

const LAB_META: { id: LabId; title: string; subtitle: string }[] = [
  { id: 'VortexBlowup', title: '1. VortexBlowup — 3D Navier–Stokes & Euler Lab', subtitle: 'Pseudo-spectral 3D FFT vorticity stretching, energy-enstrophy balance & BKM integral' },
  { id: 'ZetaZero', title: '2. ZetaZero — Riemann Critical-Strip & GUE Lab', subtitle: 'Riemann–Siegel Z(t), Gram points, Turing audit & Montgomery–Odlyzko spacings' },
  { id: 'GoldbachSieves', title: '3. GoldbachSieves — Additive Primes & Circle Method', subtitle: 'Goldbach Comet r₂(n), Hardy–Littlewood S(n), major/minor arcs & Selberg parity barrier' },
  { id: 'PvsNPWitness', title: '4. PvsNPWitness — SAT Phase Transition & CDCL Lab', subtitle: 'Random k-SAT CDCL solver vs. GF(2) XOR-SAT Gaussian elimination & backbone probe' },
  { id: 'YangMillsGap', title: '5. YangMillsGap — Lattice SU(2) Gauge & Mass-Gap Lab', subtitle: 'Quaternion Creutz heat-bath sweeps, Wilson loops, Creutz string tension & correlators' },
  { id: 'HodgeCycles', title: '6. HodgeCycles — Hodge Diamonds, Periods & Cycles', subtitle: 'Exact Hirzebruch χ_y Hodge diamonds, Künneth products, Shioda tuples & Fermat periods' },
];

type WorkspaceMode = 'labs' | 'atlas';

export function App() {
  const [viewMode, setViewMode] = useState<WorkspaceMode>('labs');
  const [activeLab, setActiveLab] = useState<LabId>('ZetaZero');
  const [allParams, setAllParams] = useState<AllParams>(DEFAULT_ALL);
  const [results, setResults] = useState<Partial<Record<LabId, LabResult>>>({});
  const [selectedEqId, setSelectedEqId] = useState<number>(81);
  const [pinnedEqIds, setPinnedEqIds] = useState<number[]>([46, 76, 81, 95]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ fraction: number; status: string }>({ fraction: 0, status: 'Ready' });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string>('');

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);

  const spawnWorker = () => {
    workerRef.current?.terminate();
    const w = new Worker(new URL('../workers/computeWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.runId !== runIdRef.current) return;
      if (msg.type === 'progress') {
        setProgress({ fraction: msg.fraction, status: msg.status });
      } else if (msg.type === 'result') {
        setResults((prev) => ({ ...prev, [msg.result.labId]: msg.result }));
        setRunning(false);
        setProgress({ fraction: 1, status: `Done (${msg.result.elapsedMs.toFixed(0)} ms)` });
      } else if (msg.type === 'error') {
        setError(msg.message);
        setRunning(false);
      }
    };
    w.onerror = (ev) => {
      setError(ev.message || 'Worker error');
      setRunning(false);
    };
    workerRef.current = w;
    return w;
  };

  const runLab = (labId: LabId, customParams?: unknown) => {
    const w = workerRef.current ?? spawnWorker();
    const runId = ++runIdRef.current;
    setError(null);
    setRunning(true);
    setProgress({ fraction: 0.05, status: `Launching ${labId}…` });
    w.postMessage({ runId, labId, params: customParams ?? allParams[labId] });
  };

  const cancelRun = () => {
    runIdRef.current++;
    spawnWorker();
    setRunning(false);
    setProgress({ fraction: 0, status: 'Cancelled' });
  };

  useEffect(() => {
    let initLab: LabId = 'ZetaZero';
    let initParams: AllParams = DEFAULT_ALL;
    try {
      const q = new URLSearchParams(location.search).get('state');
      if (q) {
        const parsed = JSON.parse(atob(q));
        if (parsed.viewMode === 'atlas' || parsed.viewMode === 'labs') setViewMode(parsed.viewMode);
        if (typeof parsed.selectedEqId === 'number') setSelectedEqId(parsed.selectedEqId);
        if (Array.isArray(parsed.pinnedEqIds)) setPinnedEqIds(parsed.pinnedEqIds);
        if (parsed.lab && parsed.params) {
          initLab = parsed.lab;
          initParams = { ...DEFAULT_ALL, [initLab]: { ...DEFAULT_ALL[initLab as LabId], ...parsed.params } };
          setActiveLab(initLab);
          setAllParams(initParams);
        }
      }
    } catch { /* ignore malformed URL state */ }
    spawnWorker();
    runLab(initLab, initParams[initLab]);
    return () => { workerRef.current?.terminate(); };
  }, []);

  const updateParam = <K extends LabId>(lab: K, patch: Partial<AllParams[K]>) => {
    setAllParams((prev) => ({ ...prev, [lab]: { ...prev[lab], ...patch } }));
  };

  const handleLabChange = (nextLab: LabId) => {
    setActiveLab(nextLab);
    setViewMode('labs');
    if (!results[nextLab]) {
      runLab(nextLab, allParams[nextLab]);
    }
  };

  const togglePin = (id: number) => {
    setPinnedEqIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const currentResult = results[activeLab] ?? null;

  const exportJson = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            viewMode,
            lab: activeLab,
            params: allParams[activeLab],
            selectedEqId,
            pinnedEqIds,
            result: currentResult,
          },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `principia-${activeLab.toLowerCase()}.json`;
    a.click();
  };

  const exportCsv = () => {
    if (!currentResult || !currentResult.charts.length) return;
    const ch = currentResult.charts[0];
    const lines = ['series,x,y,yErr'];
    for (const s of ch.series) {
      for (const p of s.points) lines.push(`"${s.name}",${p.x},${p.y},${p.yErr ?? ''}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `principia-${activeLab.toLowerCase()}.csv`;
    a.click();
  };

  const copyUrl = () => {
    const payload = btoa(
      JSON.stringify({
        viewMode,
        lab: activeLab,
        params: allParams[activeLab],
        selectedEqId,
        pinnedEqIds,
      })
    );
    const url = `${location.origin}${location.pathname}?state=${encodeURIComponent(payload)}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setToast('Shareable URL copied');
    setTimeout(() => setToast(''), 2200);
  };

  const renderControls = () => {
    if (activeLab === 'VortexBlowup') {
      const p = allParams.VortexBlowup;
      return (
        <>
          <div className="preset-bar">
            <button onClick={() => { const np: VortexParams = { ...p, preset: 'taylor-green', viscosity: 0.0, tEnd: 1.0 }; updateParam('VortexBlowup', np); runLab('VortexBlowup', np); }}>Taylor–Green Inviscid</button>
            <button onClick={() => { const np: VortexParams = { ...p, preset: 'anti-parallel', viscosity: 0.015, tEnd: 1.2 }; updateParam('VortexBlowup', np); runLab('VortexBlowup', np); }}>Anti-Parallel Tubes</button>
            <button onClick={() => { const np: VortexParams = { ...p, preset: 'dipole', viscosity: 0.01, tEnd: 1.0 }; updateParam('VortexBlowup', np); runLab('VortexBlowup', np); }}>ABC Dipole</button>
          </div>
          <label>Flow Preset
            <select value={p.preset} onChange={(e) => updateParam('VortexBlowup', { preset: e.target.value as VortexParams['preset'] })}>
              <option value="taylor-green">Taylor–Green Vortex</option>
              <option value="anti-parallel">Anti-Parallel Vortex Tubes</option>
              <option value="dipole">Perturbed 3D Dipole</option>
            </select>
          </label>
          <label>Grid Resolution N³
            <select value={p.gridN} onChange={(e) => updateParam('VortexBlowup', { gridN: Number(e.target.value) as 16 | 24 | 32 })}>
              <option value={16}>16³ (Fast)</option>
              <option value={24}>24³ (Medium)</option>
              <option value={32}>32³ (High-Res)</option>
            </select>
          </label>
          <label>Viscosity ν: <b>{p.viscosity.toFixed(3)}</b>
            <input type="range" min={0} max={0.1} step={0.005} value={p.viscosity} onChange={(e) => updateParam('VortexBlowup', { viscosity: +e.target.value })} />
          </label>
          <label>Final Time T: <b>{p.tEnd.toFixed(2)}</b>
            <input type="range" min={0.3} max={2.5} step={0.1} value={p.tEnd} onChange={(e) => updateParam('VortexBlowup', { tEnd: +e.target.value })} />
          </label>
        </>
      );
    }
    if (activeLab === 'ZetaZero') {
      const p = allParams.ZetaZero;
      return (
        <>
          <div className="preset-bar">
            <button onClick={() => { const np: ZetaParams = { tMin: 10, tMax: 75, samples: 900, gueCount: 80 }; updateParam('ZetaZero', np); runLab('ZetaZero', np); }}>First ~20 Zeros</button>
            <button onClick={() => { const np: ZetaParams = { tMin: 100, tMax: 165, samples: 1200, gueCount: 120 }; updateParam('ZetaZero', np); runLab('ZetaZero', np); }}>Gram Block (t≈126)</button>
          </div>
          <label>T_min: <b>{p.tMin}</b>
            <input type="range" min={6} max={200} step={2} value={p.tMin} onChange={(e) => updateParam('ZetaZero', { tMin: +e.target.value, tMax: Math.max(p.tMax, +e.target.value + 15) })} />
          </label>
          <label>T_max: <b>{p.tMax}</b>
            <input type="range" min={25} max={260} step={5} value={p.tMax} onChange={(e) => updateParam('ZetaZero', { tMax: Math.max(p.tMin + 10, +e.target.value) })} />
          </label>
          <label>GUE Spacing Sample: <b>{p.gueCount}</b>
            <input type="range" min={30} max={180} step={10} value={p.gueCount} onChange={(e) => updateParam('ZetaZero', { gueCount: +e.target.value })} />
          </label>
        </>
      );
    }
    if (activeLab === 'GoldbachSieves') {
      const p = allParams.GoldbachSieves;
      return (
        <>
          <div className="preset-bar">
            <button onClick={() => { const np: GoldbachParams = { nMax: 12000, circleN: 1200, arcSamples: 360 }; updateParam('GoldbachSieves', np); runLab('GoldbachSieves', np); }}>Comet N=12k</button>
            <button onClick={() => { const np: GoldbachParams = { nMax: 50000, circleN: 2500, arcSamples: 450 }; updateParam('GoldbachSieves', np); runLab('GoldbachSieves', np); }}>Deep Sieve N=50k</button>
          </div>
          <label>Max Even N: <b>{p.nMax}</b>
            <input type="range" min={1000} max={80000} step={1000} value={p.nMax} onChange={(e) => updateParam('GoldbachSieves', { nMax: +e.target.value })} />
          </label>
          <label>Circle Method N: <b>{p.circleN}</b>
            <input type="range" min={200} max={4000} step={100} value={p.circleN} onChange={(e) => updateParam('GoldbachSieves', { circleN: +e.target.value })} />
          </label>
        </>
      );
    }
    if (activeLab === 'PvsNPWitness') {
      const p = allParams.PvsNPWitness;
      return (
        <>
          <div className="preset-bar">
            <button onClick={() => { const np: SatParams = { ...p, mode: 'ksat', k: 3, numVars: 34, alphaMin: 2.0, alphaMax: 6.0 }; updateParam('PvsNPWitness', np); runLab('PvsNPWitness', np); }}>3-SAT α_c≈4.267</button>
            <button onClick={() => { const np: SatParams = { ...p, mode: 'xorsat', k: 3, numVars: 40, alphaMin: 0.4, alphaMax: 1.4 }; updateParam('PvsNPWitness', np); runLab('PvsNPWitness', np); }}>3-XOR-SAT (P)</button>
            <button onClick={() => { const np: SatParams = { ...p, mode: 'ksat', k: 2, numVars: 40, alphaMin: 0.4, alphaMax: 2.0 }; updateParam('PvsNPWitness', np); runLab('PvsNPWitness', np); }}>2-SAT α_c=1.0</button>
          </div>
          <label>Solver Mode
            <select value={p.mode} onChange={(e) => updateParam('PvsNPWitness', { mode: e.target.value as 'ksat' | 'xorsat' })}>
              <option value="ksat">Random k-SAT (CDCL)</option>
              <option value="xorsat">Random k-XOR-SAT (GF(2))</option>
            </select>
          </label>
          <label>Clause Width k
            <select value={p.k} onChange={(e) => updateParam('PvsNPWitness', { k: Number(e.target.value) as 2 | 3 | 4 })}>
              <option value={2}>k = 2</option>
              <option value={3}>k = 3</option>
              <option value={4}>k = 4</option>
            </select>
          </label>
          <label>Variables n: <b>{p.numVars}</b>
            <input type="range" min={14} max={50} step={2} value={p.numVars} onChange={(e) => updateParam('PvsNPWitness', { numVars: +e.target.value })} />
          </label>
          <label>Trials / α: <b>{p.trialsPerAlpha}</b>
            <input type="range" min={6} max={30} step={2} value={p.trialsPerAlpha} onChange={(e) => updateParam('PvsNPWitness', { trialsPerAlpha: +e.target.value })} />
          </label>
        </>
      );
    }
    if (activeLab === 'YangMillsGap') {
      const p = allParams.YangMillsGap;
      return (
        <>
          <div className="preset-bar">
            <button onClick={() => { const np: YangMillsParams = { ...p, dim: 4, latticeL: 4, betaMin: 0.4, betaMax: 3.2 }; updateParam('YangMillsGap', np); runLab('YangMillsGap', np); }}>4D SU(2) Crossover</button>
            <button onClick={() => { const np: YangMillsParams = { ...p, dim: 3, latticeL: 5, betaMin: 0.4, betaMax: 3.6 }; updateParam('YangMillsGap', np); runLab('YangMillsGap', np); }}>3D Confinement</button>
          </div>
          <label>Spacetime Dim d
            <select value={p.dim} onChange={(e) => updateParam('YangMillsGap', { dim: Number(e.target.value) as 2 | 3 | 4 })}>
              <option value={2}>d = 2</option>
              <option value={3}>d = 3</option>
              <option value={4}>d = 4</option>
            </select>
          </label>
          <label>Lattice Extent L: <b>{p.latticeL}</b>
            <input type="range" min={3} max={p.dim === 4 ? 5 : 7} step={1} value={p.latticeL} onChange={(e) => updateParam('YangMillsGap', { latticeL: +e.target.value })} />
          </label>
          <label>Meas. Sweeps: <b>{p.measSweeps}</b>
            <input type="range" min={6} max={30} step={2} value={p.measSweeps} onChange={(e) => updateParam('YangMillsGap', { measSweeps: +e.target.value })} />
          </label>
        </>
      );
    }
    const p = allParams.HodgeCycles;
    return (
      <>
        <div className="preset-bar">
          <button onClick={() => { const np: HodgeParams = { ...p, mode: 'hypersurface', dim: 2, degree: 4 }; updateParam('HodgeCycles', np); runLab('HodgeCycles', np); }}>Quartic K3 (d=4, n=2)</button>
          <button onClick={() => { const np: HodgeParams = { ...p, mode: 'hypersurface', dim: 3, degree: 5 }; updateParam('HodgeCycles', np); runLab('HodgeCycles', np); }}>Quintic CY3 (d=5, n=3)</button>
          <button onClick={() => { const np: HodgeParams = { ...p, mode: 'hypersurface', dim: 4, degree: 4 }; updateParam('HodgeCycles', np); runLab('HodgeCycles', np); }}>Quartic Fourfold</button>
          <button onClick={() => { const np: HodgeParams = { ...p, mode: 'product', prodD1: 3, prodD2: 3, prodDim1: 1, prodDim2: 1 }; updateParam('HodgeCycles', np); runLab('HodgeCycles', np); }}>E × E Abelian Surface</button>
        </div>
        <label>Variety Family
          <select value={p.mode} onChange={(e) => updateParam('HodgeCycles', { mode: e.target.value as HodgeParams['mode'] })}>
            <option value="hypersurface">Smooth Hypersurface X_d ⊂ ℂℙ^(n+1)</option>
            <option value="complete-intersection">Complete Intersection X_(d₁,…,dᵣ)</option>
            <option value="product">Künneth Product X₁ × X₂</option>
          </select>
        </label>
        {p.mode !== 'product' ? (
          <>
            <label>Complex Dim n: <b>{p.dim}</b>
              <input type="range" min={1} max={4} step={1} value={p.dim} onChange={(e) => updateParam('HodgeCycles', { dim: +e.target.value })} />
            </label>
            {p.mode === 'hypersurface' ? (
              <label>Degree d: <b>{p.degree}</b>
                <input type="range" min={1} max={8} step={1} value={p.degree} onChange={(e) => updateParam('HodgeCycles', { degree: +e.target.value })} />
              </label>
            ) : (
              <label>Degrees (comma-sep)
                <input type="text" value={p.ciDegrees} onChange={(e) => updateParam('HodgeCycles', { ciDegrees: e.target.value })} />
              </label>
            )}
          </>
        ) : (
          <>
            <label>Degree d₁: <b>{p.prodD1}</b>
              <input type="range" min={2} max={5} step={1} value={p.prodD1} onChange={(e) => updateParam('HodgeCycles', { prodD1: +e.target.value })} />
            </label>
            <label>Degree d₂: <b>{p.prodD2}</b>
              <input type="range" min={2} max={5} step={1} value={p.prodD2} onChange={(e) => updateParam('HodgeCycles', { prodD2: +e.target.value })} />
            </label>
          </>
        )}
      </>
    );
  };

  const meta = LAB_META.find((m) => m.id === activeLab)!;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>PrincipiaMathematica</h1>
          <span className="tagline">6 Hard-Math Labs &amp; 100-Equation Atlas</span>
        </div>

        <div className="mode-tabs">
          <button
            id="tab-labs"
            className={viewMode === 'labs' ? 'btn-primary' : ''}
            onClick={() => setViewMode('labs')}
          >
            6 Hard-Math Labs
          </button>
          <button
            id="tab-atlas"
            className={viewMode === 'atlas' ? 'btn-primary' : ''}
            onClick={() => setViewMode('atlas')}
          >
            100-Equation Atlas
          </button>
        </div>

        {viewMode === 'labs' ? (
          <>
            <div className="lab-selector-wrap">
              <label htmlFor="lab-dropdown">Hard-Math Lab:</label>
              <select
                id="lab-dropdown"
                value={activeLab}
                onChange={(e) => handleLabChange(e.target.value as LabId)}
              >
                {LAB_META.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
            <div className="run-controls">
              <button id="btn-run" className="btn-primary" disabled={running} onClick={() => runLab(activeLab)}>
                {running ? 'Running…' : '▶ Run Solver'}
              </button>
              {running && <button onClick={cancelRun}>Cancel</button>}
              <button onClick={() => { updateParam(activeLab, DEFAULT_ALL[activeLab]); runLab(activeLab, DEFAULT_ALL[activeLab]); }}>Reset</button>
            </div>
          </>
        ) : (
          <div className="run-controls">
            <button onClick={exportJson}>Export Atlas State</button>
            <button onClick={copyUrl}>Share URL</button>
          </div>
        )}
      </header>

      <div className="status-strip">
        {viewMode === 'labs' ? (
          <>
            <span><strong>{meta.title}</strong> — {meta.subtitle}</span>
            <span className="status-right">
              {toast ? toast : progress.status}
              {running && (
                <span className="prog-bar"><i style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></span>
              )}
            </span>
          </>
        ) : (
          <>
            <span><strong>100-Equation Atlas</strong> — Primary to PhD reference with live KaTeX, interactive evaluators &amp; one-click jump to connected hard labs</span>
            <span className="status-right">{toast || `${pinnedEqIds.length} pinned`}</span>
          </>
        )}
      </div>

      {error && <div className="error-banner">Solver error: {error}</div>}

      {viewMode === 'labs' ? (
        <main className="workspace-grid">
          <section className="params-panel">
            <h2>Parameters &amp; Presets</h2>
            {renderControls()}
          </section>

          <section className="viz-panel">
            {currentResult ? (
              <ViewportCanvas
                charts={currentResult.charts}
                heatmap={currentResult.heatmap}
                hodgeDiamond={currentResult.hodgeDiamond}
                table={currentResult.table}
              />
            ) : (
              <div className="empty-state">Computing live results in Web Worker…</div>
            )}
          </section>

          <TelemetryPanel
            result={currentResult}
            onExportJson={exportJson}
            onExportCsv={exportCsv}
            onCopyUrl={copyUrl}
          />
        </main>
      ) : (
        <EquationAtlas
          selectedId={selectedEqId}
          pinnedIds={pinnedEqIds}
          onSelectId={setSelectedEqId}
          onTogglePin={togglePin}
          onJumpToLab={(labId) => {
            handleLabChange(labId);
            runLab(labId, allParams[labId]);
          }}
        />
      )}
    </div>
  );
}
