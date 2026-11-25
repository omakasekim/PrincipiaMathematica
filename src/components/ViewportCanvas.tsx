import React, { useEffect, useRef, useState } from 'react';
import type { ChartSpec, HeatmapSpec, HodgeDiamondData } from '../engines/types';

function ChartCanvas({ chart }: { chart: ChartSpec }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverText, setHoverText] = useState<string>('');

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

    // Compute bounds
    let xMin = Infinity, xMax = -Infinity;
    let yLMin = Infinity, yLMax = -Infinity;
    let yRMin = Infinity, yRMax = -Infinity;

    for (const s of chart.series) {
      const right = s.yAxis === 'right';
      for (const p of s.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        const yv = chart.yLog ? Math.log10(Math.max(1e-9, p.y)) : p.y;
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (right) {
          if (yv < yRMin) yRMin = yv;
          if (yv > yRMax) yRMax = yv;
        } else {
          if (yv < yLMin) yLMin = yv;
          if (yv > yLMax) yLMax = yv;
        }
      }
    }
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; }
    if (xMax === xMin) xMax = xMin + 1;
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

    // Zero line if in range
    if (!chart.yLog && yLMin < 0 && yLMax > 0) {
      const y0 = toYL(0);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
      ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(padL + pw, y0); ctx.stroke();
    }

    // Vertical reference lines
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

    // Series rendering
    for (const s of chart.series) {
      const toY = s.yAxis === 'right' ? toYR : toYL;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      if (s.mode === 'bar') {
        const bw = Math.max(4, (pw / Math.max(8, s.points.length)) * 0.72);
        ctx.globalAlpha = 0.75;
        for (const p of s.points) {
          const px = toX(p.x) - bw / 2;
          const py = toY(p.y);
          ctx.fillRect(px, py, bw, Math.max(1, padT + ph - py));
        }
      } else if (s.mode === 'scatter') {
        for (const p of s.points) {
          ctx.beginPath();
          ctx.arc(toX(p.x), toY(p.y), 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.lineWidth = 2;
        if (s.mode === 'dashed') ctx.setLineDash([6, 4]);
        ctx.beginPath();
        s.points.forEach((p, idx) => {
          const px = toX(p.x), py = toY(p.y);
          if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        // Error bars if present
        ctx.setLineDash([]);
        ctx.lineWidth = 1.2;
        for (const p of s.points) {
          if (p.yErr && p.yErr > 0) {
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

    // Axis titles
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(chart.xLabel, padL + pw / 2, H - 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(chart.title, padL, 18);

    // Crosshair on hover
    if (hoverX !== undefined && hoverX >= padL && hoverX <= padL + pw) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hoverX, padT); ctx.lineTo(hoverX, padT + ph); ctx.stroke();
      ctx.setLineDash([]);
      const xVal = xMin + ((hoverX - padL) / pw) * (xMax - xMin);
      const parts: string[] = [`x=${xVal.toFixed(3)}`];
      for (const s of chart.series) {
        if (!s.points.length) continue;
        let best = s.points[0];
        let bestD = Math.abs(best.x - xVal);
        for (const p of s.points) {
          const d = Math.abs(p.x - xVal);
          if (d < bestD) { bestD = d; best = p; }
        }
        parts.push(`${s.name}: ${best.y.toFixed(4)}`);
      }
      setHoverText(parts.join('  |  '));
    }
  };

  useEffect(() => {
    draw();
  }, [chart]);

  return (
    <div className="chart-card">
      <canvas
        ref={canvasRef}
        width={680}
        height={250}
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
            <span key={s.name} className="legend-pill">
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
        {hoverText && <span className="hover-readout">{hoverText}</span>}
      </div>
    </div>
  );
}

function HeatmapCanvas({ heatmap }: { heatmap: HeatmapSpec }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const { nx, ny, values, minVal, maxVal } = heatmap;
    const off = document.createElement('canvas');
    off.width = nx;
    off.height = ny;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(nx, ny);
    const range = Math.max(1e-9, maxVal - minVal);

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = Math.max(0, Math.min(1, (values[j * nx + i] - minVal) / range));
        const p = ((ny - 1 - j) * nx + i) * 4;
        // Inferno-cyan scientific colormap
        img.data[p] = Math.round(15 + 240 * Math.pow(t, 0.85));
        img.data[p + 1] = Math.round(25 + 195 * Math.sin(t * Math.PI * 0.9));
        img.data[p + 2] = Math.round(60 + 195 * Math.pow(1 - t, 1.3));
        img.data[p + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, c.width, c.height);
  }, [heatmap]);

  return (
    <div className="chart-card heatmap-card">
      <div className="card-subhead">{heatmap.title}</div>
      <canvas ref={canvasRef} width={320} height={240} />
      <div className="heatmap-meta">
        <span>{heatmap.xLabel} × {heatmap.yLabel}</span>
        <span>min: {heatmap.minVal.toFixed(3)} — max: {heatmap.maxVal.toFixed(3)}</span>
      </div>
    </div>
  );
}

function HodgeDiamondView({ data }: { data: HodgeDiamondData }) {
  const { dim, h, fermatInfo } = data;
  // Rows k = 2*dim down to 0: row k displays h^{p, q} with p + q = k
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
      <div className="card-subhead">Exact Hodge Diamond h^(p,q)(X) — Complex Dimension {dim}</div>
      <div className="diamond-grid">
        {rows.map((r) => (
          <div key={r.k} className="diamond-row">
            {r.entries.map((e) => (
              <span
                key={`${e.p}-${e.q}`}
                className={`diamond-cell${e.isMiddle ? ' middle-hkk' : ''}`}
                title={`h^{${e.p},${e.q}} = ${e.val}`}
              >
                {e.val}
              </span>
            ))}
          </div>
        ))}
      </div>
      {fermatInfo && (
        <div className="fermat-box">
          <strong>Fermat X_{fermatInfo.degree} ⊂ ℂℙ^{fermatInfo.ambientDim}:</strong>{' '}
          {fermatInfo.totalHodgeTuples > 0
            ? `Shioda primitive Hodge tuples = ${fermatInfo.totalHodgeTuples} (paired linear-subspace cycles = ${fermatInfo.linearCycleRank})`
            : 'Period integral evaluated via 16-pt Gauss–Legendre quadrature'}
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
  heatmap,
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
      {heatmap && <HeatmapCanvas heatmap={heatmap} />}
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
