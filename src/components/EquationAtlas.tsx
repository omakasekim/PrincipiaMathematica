import React, { useMemo, useState } from 'react';
import {
  EQUATION_ATLAS,
  EQUATION_LEVELS,
  type EquationLevel,
} from '../data/equationAtlas';
import type { LabId } from '../engines/types';
import { Latex } from './Latex';
import { EquationVisualizer } from './EquationVisuals';

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
          Showing <strong>{filtered.length}</strong> of 100 interactive equations — click any card to explore live visuals
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

        <EquationVisualizer eq={activeEq} />

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
