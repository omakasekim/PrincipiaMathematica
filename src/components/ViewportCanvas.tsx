import React, { useEffect, useRef, useState } from 'react';
import type { ChartSpec, HeatmapSpec, HodgeDiamondData } from '../engines/types';

function ChartCanvas({ chart }: { chart: ChartSpec }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverText, setHoverText] = useState<string>('');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState<[number, number] | null>(null); // normalized [0..1, 0..1] X window

  const toggleSeries = (name: string) => {
    setHidden((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const draw = (hoverX?: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const W = c.width;
    const H = c.height;
    const padL = 58;
    const padR = chart.yRightLabel ? 58 : 20;
    const padT = 30;
    const padB = 38;
    const pw = W - padL - padR;
    const ph = H - padT - padB;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070b13';
    ctx.fillRect(0, 0, W, H);

    const visibleSeries = chart.series.filter((s) => !hidden[s.name]);
    let fullXMin = Infinity, fullXMax = -Infinity;
    for (const s of visibleSeries) {
      for (const p of s.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < fullXMin) fullXMin = p.x;
        if (p.x > fullXMax) fullXMax = p.x;
      }
    }
    if (!isFinite(fullXMin)) { fullXMin = 0; fullXMax = 1; }
    if (fullXMax === fullXMin) fullXMax = fullXMin + 1;

    const xMin = zoom ? fullXMin + zoom[0] * (fullXMax - fullXMin) : fullXMin;
    const xMax = zoom ? fullXMin + zoom[1] * (fullXMax - fullXMin) : fullXMax;

    let yLMin = Infinity, yLMax = -Infinity;
    let yRMin = Infinity, yRMax = -Infinity;
    for (const s of visibleSeries) {
      const right = s.yAxis === 'right';
      for (const p of s.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < xMin || p.x > xMax) continue;
        const yv = chart.yLog ? Math.log10(Math.max(1e-9, p.y)) : p.y;
        if (right) {
          if (yv < yRMin) yRMin = yv;
          if (yv > yRMax) yRMax = yv;
        } else {
          if (yv < yLMin) yLMin = yv;
          if (yv > yLMax) yLMax = yv;
        }
      }
    }
    if (!isFinite(yLMin)) { yLMin = 0; yLMax = 1; }
    if (yLMax === yLMin) { yLMin -= 0.5; yLMax += 0.5; }
    if (!isFinite(yRMin)) { yRMin = 0; yRMax = 1; }
    if (yRMax === yRMin) { yRMin -= 0.5; yRMax += 0.5; }

    const yPadL = (yLMax - yLMin) * 0.08;
    yLMin -= yPadL; yLMax += yPadL;
    const yPadR = (yRMax - yRMin) * 0.08;
    yRMin -= yPadR; yRMax += yPadR;

    const toX = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * pw;
    const toYL = (y: number) => {
      const yv = chart.yLog ? Math.log10(Math.max(1e-9, y)) : y;
      return padT + ph - ((yv - yLMin) / (yLMax - yLMin)) * ph;
    };
    const toYR = (y: number) => padT + ph - ((y - yRMin) / (yRMax - yRMin)) * ph;

    // Grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = '#94a3b8';

    for (let i = 0; i <= 4; i++) {
      const py = padT + (i / 4) * ph;
      ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(padL + pw, py); ctx.stroke();
      const val = yLMax - (i / 4) * (yLMax - yLMin);
      const label = chart.yLog ? `1e${val.toFixed(1)}` : Math.abs(val) < 1e-2 && val !== 0 ? val.toExponential(1) : val.toFixed(2);
      ctx.textAlign = 'right';
      ctx.fillText(label, padL - 6, py + 4);
      if (chart.yRightLabel) {
        const valR = yRMax - (i / 4) * (yRMax - yRMin);
        ctx.textAlign = 'left';
        ctx.fillText(valR.toFixed(2), padL + pw + 6, py + 4);
      }
    }
    for (let i = 0; i <= 5; i++) {
      const px = padL + (i / 5) * pw;
      ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, padT + ph); ctx.stroke();
      const val = xMin + (i / 5) * (xMax - xMin);
      ctx.textAlign = 'center';
      ctx.fillText(Math.abs(val) >= 100 ? val.toFixed(0) : val.toFixed(2), px, H - 18);
    }

    // Clipped plot region
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, pw, ph);
    ctx.clip();

    if (!chart.yLog && yLMin < 0 && yLMax > 0) {
      const y0 = toYL(0);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
      ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(padL + pw, y0); ctx.stroke();
    }

    if (chart.vLines) {
      for (const vl of chart.vLines) {
        if (vl.x < xMin || vl.x > xMax) continue;
        const px = toX(vl.x);
        ctx.save();
        ctx.strokeStyle = vl.color;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, padT + ph); ctx.stroke();
        ctx.fillStyle = vl.color;
        ctx.textAlign = 'left';
        ctx.fillText(vl.label, px + 4, padT + 14);
        ctx.restore();
      }
    }

    for (const s of visibleSeries) {
      const toY = s.yAxis === 'right' ? toYR : toYL;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      if (s.mode === 'bar') {
        const bw = Math.max(4, (pw / Math.max(8, s.points.length)) * 0.72);
        ctx.globalAlpha = 0.75;
        for (const p of s.points) {
          if (p.x < xMin || p.x > xMax) continue;
          const px = toX(p.x) - bw / 2;
          const py = toY(p.y);
          ctx.fillRect(px, py, bw, Math.max(1, padT + ph - py));
        }
      } else if (s.mode === 'scatter') {
        for (const p of s.points) {
          if (p.x < xMin || p.x > xMax) continue;
          ctx.beginPath();
          ctx.arc(toX(p.x), toY(p.y), 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.lineWidth = 2;
        if (s.mode === 'dashed') ctx.setLineDash([6, 4]);
        ctx.beginPath();
        let started = false;
        for (const p of s.points) {
          const px = toX(p.x), py = toY(p.y);
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1.2;
        for (const p of s.points) {
          if (p.yErr && p.yErr > 0 && p.x >= xMin && p.x <= xMax) {
            const px = toX(p.x);
            const yHi = toY(p.y + p.yErr);
            const yLo = toY(p.y - p.yErr);
            ctx.beginPath();
            ctx.moveTo(px, yHi); ctx.lineTo(px, yLo);
            ctx.moveTo(px - 3, yHi); ctx.lineTo(px + 3, yHi);
            ctx.moveTo(px - 3, yLo); ctx.lineTo(px + 3, yLo);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // Hover crosshair + glowing markers on each visible series
    if (hoverX !== undefined && hoverX >= padL && hoverX <= padL + pw) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hoverX, padT); ctx.lineTo(hoverX, padT + ph); ctx.stroke();
      ctx.setLineDash([]);
      const xVal = xMin + ((hoverX - padL) / pw) * (xMax - xMin);
      const parts: string[] = [`x=${xVal.toFixed(3)}`];
      for (const s of visibleSeries) {
        if (!s.points.length) continue;
        let best = s.points[0];
        let bestD = Math.abs(best.x - xVal);
        for (const p of s.points) {
          const d = Math.abs(p.x - xVal);
          if (d < bestD) { bestD = d; best = p; }
        }
        const toY = s.yAxis === 'right' ? toYR : toYL;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(toX(best.x), toY(best.y), 4.2, 0, Math.PI * 2);
        ctx.fill();
        parts.push(`${s.name}: ${best.y.toFixed(4)}`);
      }
      setHoverText(parts.join('  |  '));
    }
    ctx.restore();

    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(chart.xLabel, padL + pw / 2, H - 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(chart.title + (zoom ? '  [Zoomed — double-click to reset]' : ''), padL, 18);
  };

  useEffect(() => {
    setZoom(null);
  }, [chart]);

  useEffect(() => {
    draw();
  }, [chart, hidden, zoom]);

  return (
    <div className="chart-card">
      <canvas
        ref={canvasRef}
        width={680}
        height={240}
        onWheel={(e) => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const [z0, z1] = zoom ?? [0, 1];
          const span = z1 - z0;
          const factor = e.deltaY < 0 ? 0.78 : 1.28;
          const nextSpan = Math.max(0.05, Math.min(1, span * factor));
          const center = z0 + f * span;
          let n0 = center - f * nextSpan;
          let n1 = n0 + nextSpan;
          if (n0 < 0) { n1 -= n0; n0 = 0; }
          if (n1 > 1) { n0 -= (n1 - 1); n1 = 1; }
          setZoom(nextSpan >= 0.99 ? null : [Math.max(0, n0), Math.min(1, n1)]);
        }}
        onDoubleClick={() => setZoom(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const scaleX = e.currentTarget.width / rect.width;
          draw((e.clientX - rect.left) * scaleX);
        }}
        onMouseLeave={() => {
          setHoverText('');
          draw();
        }}
      />
      <div className="chart-legend">
        <div className="legend-items">
          {chart.series.map((s) => (
            <button
              key={s.name}
              className={`legend-pill-btn${hidden[s.name] ? ' is-hidden' : ''}`}
              onClick={() => toggleSeries(s.name)}
              title="Click to toggle series visibility"
            >
              <i style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
          {zoom && <button className="legend-pill-btn" onClick={() => setZoom(null)}>Reset Zoom</button>}
        </div>
        {hoverText && <span className="hover-readout">{hoverText}</span>}
      </div>
    </div>
  );
}

function HodgeDiamondView({ data }: { data: HodgeDiamondData }) {
  const { dim, h, fermatInfo } = data;
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(
    dim % 2 === 0 ? [dim / 2, dim / 2] : [dim, 0]
  );

  const rows: { k: number; entries: { p: number; q: number; val: number; isMiddle: boolean }[] }[] = [];
  for (let k = 2 * dim; k >= 0; k--) {
    const entries: { p: number; q: number; val: number; isMiddle: boolean }[] = [];
    for (let p = Math.min(dim, k); p >= Math.max(0, k - dim); p--) {
      const q = k - p;
      entries.push({ p, q, val: h[p][q], isMiddle: dim % 2 === 0 && p === dim / 2 && q === dim / 2 });
    }
    rows.push({ k, entries });
  }

  return (
    <div className="chart-card hodge-card">
      <div className="card-subhead">
        Interactive Hodge Diamond h^(p,q)(X) — Click any entry to highlight Hodge &amp; Serre duals
      </div>
      <div className="diamond-grid">
        {rows.map((r) => (
          <div key={r.k} className="diamond-row">
            {r.entries.map((e) => {
              const isSel = selectedCell && selectedCell[0] === e.p && selectedCell[1] === e.q;
              const isSym = selectedCell && selectedCell[0] === e.q && selectedCell[1] === e.p && !isSel;
              const isSerre = selectedCell && selectedCell[0] === dim - e.p && selectedCell[1] === dim - e.q && !isSel;
              return (
                <button
                  key={`${e.p}-${e.q}`}
                  className={`diamond-cell${e.isMiddle ? ' middle-hkk' : ''}${isSel ? ' d-sel' : ''}${isSym ? ' d-sym' : ''}${isSerre ? ' d-serre' : ''}`}
                  title={`h^{${e.p},${e.q}} = ${e.val}`}
                  onClick={() => setSelectedCell([e.p, e.q])}
                >
                  {e.val}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {selectedCell && (
        <div className="fermat-box">
          Selected: <strong>h^({selectedCell[0]},{selectedCell[1]}) = {h[selectedCell[0]][selectedCell[1]]}</strong>
          {'  •  '}Hodge conjugate: <strong>h^({selectedCell[1]},{selectedCell[0]}) = {h[selectedCell[1]][selectedCell[0]]}</strong>
          {'  •  '}Serre dual: <strong>h^({dim - selectedCell[0]},{dim - selectedCell[1]}) = {h[dim - selectedCell[0]][dim - selectedCell[1]]}</strong>
        </div>
      )}
      {fermatInfo && (
        <div className="fermat-box">
          <strong>Fermat X_{fermatInfo.degree} ⊂ ℂℙ^{fermatInfo.ambientDim}:</strong>{' '}
          {fermatInfo.totalHodgeTuples > 0
            ? `Shioda primitive Hodge tuples = ${fermatInfo.totalHodgeTuples} (linear-subspace cycles = ${fermatInfo.linearCycleRank})`
            : 'Period integral evaluated via tanh-sinh quadrature'}
          {fermatInfo.periodIntegral && (
            <div className="mono-line">
              {fermatInfo.periodIntegral.label} ≈ {fermatInfo.periodIntegral.re.toFixed(10)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ViewportCanvas({
  charts,
  hodgeDiamond,
  table,
}: {
  charts: ChartSpec[];
  heatmap?: HeatmapSpec;
  hodgeDiamond?: HodgeDiamondData;
  table?: { title: string; columns: string[]; rows: (string | number)[][] };
}) {
  return (
    <div className="viewport-grid">
      {hodgeDiamond && <HodgeDiamondView data={hodgeDiamond} />}
      {charts.map((c) => (
        <ChartCanvas key={c.id} chart={c} />
      ))}
      {table && (
        <div className="chart-card table-card">
          <div className="card-subhead">{table.title}</div>
          <table className="data-table">
            <thead>
              <tr>
                {table.columns.map((col) => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, idx) => (
                <tr key={idx}>
                  {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
