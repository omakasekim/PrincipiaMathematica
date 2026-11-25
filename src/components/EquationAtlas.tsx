import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EQUATION_ATLAS,
  EQUATION_LEVELS,
  type EquationEntry,
  type EquationLevel,
} from '../data/equationAtlas';
import type { LabId } from '../engines/types';
import { Latex } from './Latex';

function LiveEquationPlot({
  eq,
  values,
}: {
  eq: EquationEntry;
  values: Record<string, number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spec = eq.interactive;

  useEffect(() => {
    if (!spec?.evalY || !spec.xRange) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const W = c.width;
    const H = c.height;
    const padL = 44, padR = 16, padT = 16, padB = 26;
    const pw = W - padL - padR;
    const ph = H - padT - padB;
    const [x0, x1] = spec.xRange;

    const pts: { x: number; y: number }[] = [];
    let yMin = Infinity, yMax = -Infinity;
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const x = x0 + (i / N) * (x1 - x0);
      const y = spec.evalY(x, values);
      if (Number.isFinite(y)) {
        pts.push({ x, y });
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
    if (!isFinite(yMin)) { yMin = -1; yMax = 1; }
    if (yMax === yMin) { yMin -= 1; yMax += 1; }
    const padY = (yMax - yMin) * 0.1;
    yMin -= padY; yMax += padY;

    const toX = (x: number) => padL + ((x - x0) / (x1 - x0)) * pw;
    const toY = (y: number) => padT + ph - ((y - yMin) / (yMax - yMin)) * ph;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070b13';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#94a3b8';
    for (let i = 0; i <= 3; i++) {
      const py = padT + (i / 3) * ph;
      ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(padL + pw, py); ctx.stroke();
      const val = yMax - (i / 3) * (yMax - yMin);
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), padL - 5, py + 3);
    }
    if (yMin < 0 && yMax > 0) {
      const yz = toY(0);
      ctx.strokeStyle = 'rgba(226,232,240,0.35)';
      ctx.beginPath(); ctx.moveTo(padL, yz); ctx.lineTo(padL + pw, yz); ctx.stroke();
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, idx) => {
      const px = toX(p.x), py = toY(p.y);
      if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(spec.xLabel ?? 'x', padL + pw / 2, H - 6);
  }, [spec, values]);

  if (!spec?.evalY) return null;
  return <canvas ref={canvasRef} width={420} height={175} className="atlas-plot-canvas" />;
}

export function EquationAtlas({
  selectedId,
  pinnedIds,
  onSelectId,
  onTogglePin,
  onJumpToLab,
}: {
  selectedId: number;
  pinnedIds: number[];
  onSelectId: (id: number) => void;
  onTogglePin: (id: number) => void;
  onJumpToLab: (labId: LabId) => void;
}) {
  const [levelFilter, setLevelFilter] = useState<'All' | EquationLevel>('All');
  const [query, setQuery] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EQUATION_ATLAS.filter((eq) => {
      if (levelFilter !== 'All' && eq.level !== levelFilter) return false;
      if (pinnedOnly && !pinnedIds.includes(eq.id)) return false;
      if (!q) return true;
      return (
        eq.name.toLowerCase().includes(q) ||
        eq.category.toLowerCase().includes(q) ||
        eq.intuition.toLowerCase().includes(q) ||
        String(eq.id) === q ||
        (eq.relatedLab?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [levelFilter, query, pinnedOnly, pinnedIds]);

  const activeEq = useMemo(
    () => EQUATION_ATLAS.find((e) => e.id === selectedId) ?? filtered[0] ?? EQUATION_ATLAS[0],
    [selectedId, filtered]
  );

  // Interactive parameter state for currently inspected equation
  const [paramVals, setParamVals] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!activeEq.interactive) {
      setParamVals({});
      return;
    }
    const init: Record<string, number> = {};
    for (const p of activeEq.interactive.params) init[p.key] = p.defaultVal;
    setParamVals(init);
  }, [activeEq]);

  const scalarOut = useMemo(() => {
    if (!activeEq.interactive?.evalScalar) return null;
    if (Object.keys(paramVals).length === 0) return null;
    return activeEq.interactive.evalScalar(paramVals);
  }, [activeEq, paramVals]);

  const isPinned = pinnedIds.includes(activeEq.id);

  return (
    <div className="atlas-layout">
      <section className="atlas-browser">
        <div className="atlas-filters">
          <label>
            Level
            <select
              id="atlas-level-dropdown"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as 'All' | EquationLevel)}
            >
              <option value="All">All Levels (100)</option>
              {EQUATION_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl} ({EQUATION_ATLAS.filter((x) => x.level === lvl).length})
                </option>
              ))}
            </select>
          </label>

          <label>
            Quick Equation Picker
            <select
              id="equation-dropdown"
              value={activeEq.id}
              onChange={(e) => onSelectId(Number(e.target.value))}
            >
              {filtered.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  #{eq.id} — {eq.name} [{eq.level}]
                </option>
              ))}
            </select>
          </label>

          <label className="search-wrap">
            Search Atlas
            <input
              id="atlas-search"
              type="text"
              placeholder="Search name, topic, lab (e.g. Navier, Zeta, Hodge)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <button
            className={pinnedOnly ? 'btn-primary' : ''}
            onClick={() => setPinnedOnly((v) => !v)}
            style={{ alignSelf: 'flex-end' }}
          >
            ★ Pinned ({pinnedIds.length})
          </button>
        </div>

        <div className="atlas-count">
          Showing <strong>{filtered.length}</strong> of 100 equations
        </div>

        <div className="atlas-list">
          {filtered.map((eq) => {
            const pinned = pinnedIds.includes(eq.id);
            const selected = eq.id === activeEq.id;
            return (
              <div
                key={eq.id}
                className={`eq-row${selected ? ' selected' : ''}`}
                onClick={() => onSelectId(eq.id)}
              >
                <div className="eq-row-head">
                  <span className="eq-num">#{eq.id}</span>
                  <span className="eq-title">{eq.name}</span>
                  <span className={`lvl-pill lvl-${eq.level.split(' ')[0].toLowerCase()}`}>{eq.level}</span>
                  {eq.relatedLab && <span className="lab-link-pill">{eq.relatedLab}</span>}
                  {pinned && <span className="pin-star">★</span>}
                </div>
                <div className="eq-row-tex">
                  <Latex tex={eq.latex} />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty-state">No equations match your filter.</div>
          )}
        </div>
      </section>

      <aside className="atlas-inspector">
        <div className="inspector-header">
          <div>
            <span className="eq-num">Equation #{activeEq.id}</span>
            <span className={`lvl-pill lvl-${activeEq.level.split(' ')[0].toLowerCase()}`} style={{ marginLeft: 8 }}>
              {activeEq.level}
            </span>
            <span className="cat-pill">{activeEq.category}</span>
          </div>
          <button onClick={() => onTogglePin(activeEq.id)}>
            {isPinned ? '★ Pinned' : '☆ Pin'}
          </button>
        </div>

        <h2 className="inspector-title">{activeEq.name}</h2>

        <div className="inspector-formula">
          <Latex tex={activeEq.latex} display />
        </div>

        <div className="inspector-section">
          <h3>Mathematical Intuition</h3>
          <p>{activeEq.intuition}</p>
        </div>

        <div className="inspector-section">
          <h3>Symbols &amp; Definitions</h3>
          <table className="kv-table">
            <tbody>
              {activeEq.symbols.map(([sym, desc], i) => (
                <tr key={i}>
                  <td><Latex tex={sym} /></td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {activeEq.interactive && (
          <div className="inspector-section">
            <h3>Interactive Explorer</h3>
            {activeEq.interactive.params.map((p) => (
              <label key={p.key} className="eq-slider-label">
                <span>{p.label}: <strong>{paramVals[p.key] ?? p.defaultVal}</strong></span>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={paramVals[p.key] ?? p.defaultVal}
                  onChange={(e) =>
                    setParamVals((prev) => ({ ...prev, [p.key]: parseFloat(e.target.value) }))
                  }
                />
              </label>
            ))}
            {scalarOut && (
              <div className="scalar-readout">
                <span>{scalarOut.label}</span>
                <code>
                  {scalarOut.value.toFixed(5)} {scalarOut.unit ?? ''}
                </code>
              </div>
            )}
            <LiveEquationPlot eq={activeEq} values={paramVals} />
          </div>
        )}

        {activeEq.relatedLab && (
          <div className="inspector-section">
            <h3>Connected Hard-Math Laboratory</h3>
            <button
              id="btn-jump-lab"
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={() => onJumpToLab(activeEq.relatedLab!)}
            >
              Jump to {activeEq.relatedLab} Lab →
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
