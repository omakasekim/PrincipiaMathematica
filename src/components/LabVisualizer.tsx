import React, { useEffect, useRef, useState } from 'react';
import type { HeatmapSpec, LabId, LabResult } from '../engines/types';
import { sievePrimes } from '../engines/goldbachSieves';
import { solveCdcl } from '../engines/pVsNpWitness';

// ---------- 1. VortexBlowup: Interactive Vorticity Field + Advected Fluid Tracers ----------
function VortexInteractive({ heatmap }: { heatmap?: HeatmapSpec }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [palette, setPalette] = useState<'inferno' | 'plasma' | 'cyan'>('inferno');
  const [animate, setAnimate] = useState(true);
  const [probe, setProbe] = useState<string>('Hover field to probe |ω(x,y)|');

  useEffect(() => {
    if (!heatmap) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const { nx, ny, values, minVal, maxVal } = heatmap;
    const range = Math.max(1e-9, maxVal - minVal);

    // Build colormap background once per palette/heatmap
    const off = document.createElement('canvas');
    off.width = nx;
    off.height = ny;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = Math.max(0, Math.min(1, (values[j * nx + i] - minVal) / range));
        const p = ((ny - 1 - j) * nx + i) * 4;
        if (palette === 'inferno') {
          img.data[p] = Math.round(12 + 243 * Math.pow(t, 0.72));
          img.data[p + 1] = Math.round(14 + 195 * Math.pow(t, 1.35));
          img.data[p + 2] = Math.round(42 + 170 * Math.sin(t * Math.PI));
        } else if (palette === 'plasma') {
          img.data[p] = Math.round(30 + 225 * Math.pow(t, 0.65));
          img.data[p + 1] = Math.round(20 + 220 * Math.pow(t, 1.6));
          img.data[p + 2] = Math.round(140 + 115 * Math.cos(t * Math.PI * 0.8));
        } else {
          img.data[p] = Math.round(10 + 190 * Math.pow(t, 1.4));
          img.data[p + 1] = Math.round(35 + 215 * Math.pow(t, 0.8));
          img.data[p + 2] = Math.round(70 + 185 * Math.pow(t, 0.5));
        }
        img.data[p + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    // Seed tracer particles advected along local vorticity-gradient tangent (iso-vorticity swirls)
    const particles = Array.from({ length: 140 }, (_, k) => ({
      x: ((k * 0.6180339) % 1) * c.width,
      y: ((k * 0.381966 + 0.17) % 1) * c.height,
      life: Math.random() * 100,
    }));

    let raf = 0;
    const renderFrame = () => {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, c.width, c.height);

      // Overlay glowing advected vortex tracers
      ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
      for (const pt of particles) {
        const gx = Math.min(nx - 2, Math.max(1, Math.floor((pt.x / c.width) * nx)));
        const gy = Math.min(ny - 2, Math.max(1, Math.floor(((c.height - pt.y) / c.height) * ny)));
        const dwdx = values[gy * nx + (gx + 1)] - values[gy * nx + (gx - 1)];
        const dwdy = values[(gy + 1) * nx + gx] - values[(gy - 1) * nx + gx];
        const mag = Math.hypot(dwdx, dwdy) + 1e-4;
        const speed = 1.4 + 2.4 * ((values[gy * nx + gx] - minVal) / range);
        // Perpendicular tangent vector swirls around vorticity cores
        const vx = (-dwdy / mag) * speed;
        const vy = (-dwdx / mag) * speed;
        if (animate) {
          pt.x = (pt.x + vx + c.width) % c.width;
          pt.y = (pt.y + vy + c.height) % c.height;
        }
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      if (animate) raf = requestAnimationFrame(renderFrame);
    };
    renderFrame();
    return () => cancelAnimationFrame(raf);
  }, [heatmap, palette, animate]);

  if (!heatmap) return null;
  return (
    <div className="viz-hero-card">
      <div className="viz-hero-head">
        <strong>Interactive 3D Mid-Plane Vorticity &amp; Swirl Tracer Field</strong>
        <div className="viz-hero-tools">
          <select value={palette} onChange={(e) => setPalette(e.target.value as 'inferno' | 'plasma' | 'cyan')}>
            <option value="inferno">Inferno</option>
            <option value="plasma">Plasma</option>
            <option value="cyan">Cyan Glow</option>
          </select>
          <button onClick={() => setAnimate((v) => !v)}>{animate ? 'Pause Flow' : 'Play Flow'}</button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={680}
        height={250}
        className="hero-canvas"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ix = Math.min(heatmap.nx - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * heatmap.nx)));
          const iy = Math.min(heatmap.ny - 1, Math.max(0, Math.floor((1 - (e.clientY - rect.top) / rect.height) * heatmap.ny)));
          const val = heatmap.values[iy * heatmap.nx + ix];
          setProbe(`x=${((ix / heatmap.nx) * 2 * Math.PI).toFixed(2)}, y=${((iy / heatmap.ny) * 2 * Math.PI).toFixed(2)}  →  |ω| = ${val.toFixed(4)}`);
        }}
      />
      <div className="viz-hero-foot">{probe}</div>
    </div>
  );
}

// ---------- 2. ZetaZero: Animated Critical-Line Spiral zeta(1/2 + i*t) ----------
function ZetaSpiralInteractive({ result }: { result: LabResult }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectedZeros = (result.table?.rows ?? []).map((r) => Number(r[1])).filter(Number.isFinite);
  const [tVal, setTVal] = useState<number>(detectedZeros[0] ?? 14.134725);
  const [playing, setPlaying] = useState<boolean>(true);

  useEffect(() => {
    let raf = 0;
    let curT = tVal;
    const draw = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#070b13';
      ctx.fillRect(0, 0, W, H);

      // Axes & origin glow
      const cx = W * 0.5, cy = H * 0.52;
      const scale = 68;
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
      ctx.stroke();

      // Plot Dirichlet eta alternating partial sums (convergent everywhere on Re(s)=1/2!):
      // eta(1/2 + it) = sum_{n=1}^M (-1)^{n-1} n^{-1/2 - it} = (1 - 2^{1/2 - it}) zeta(1/2 + it)
      const M = 140;
      let re = 0, im = 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let n = 1; n <= M; n++) {
        const mag = Math.pow(n, -0.5) * (n % 2 === 1 ? 1 : -1);
        const ang = -curT * Math.log(n);
        re += mag * Math.cos(ang);
        im += mag * Math.sin(ang);
        ctx.lineTo(cx + re * scale, cy - im * scale);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Convert eta -> zeta by dividing by (1 - 2^{1/2 - it})
      const a = Math.SQRT2 * Math.cos(-curT * Math.LN2);
      const b = Math.SQRT2 * Math.sin(-curT * Math.LN2);
      const dr = 1 - a, di = -b;
      const d2 = dr * dr + di * di;
      const zr = (re * dr + im * di) / d2;
      const zi = (im * dr - re * di) / d2;
      const zMag = Math.hypot(zr, zi);

      // Glowing endpoint for zeta(1/2 + it)
      const px = cx + zr * scale;
      const py = cy - zi * scale;
      const nearZero = zMag < 0.18;
      ctx.save();
      ctx.shadowColor = nearZero ? '#4ade80' : '#f43f5e';
      ctx.shadowBlur = nearZero ? 22 : 12;
      ctx.fillStyle = nearZero ? '#4ade80' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(px, py, nearZero ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Origin crosshair target
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(`t = ${curT.toFixed(5)}   |ζ(1/2 + it)| ≈ ${zMag.toFixed(4)}${nearZero ? '  ★ ZERO HIT!' : ''}`, 14, 22);

      if (playing) {
        curT += 0.025;
        if (curT > 55) curT = 10;
        setTVal(curT);
        raf = requestAnimationFrame(draw);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [playing, tVal]);

  return (
    <div className="viz-hero-card">
      <div className="viz-hero-head">
        <strong>Live Complex-Plane Spiral ζ(1/2 + it) &amp; Zero-Crossing Tracker</strong>
        <div className="viz-hero-tools">
          <button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Animate t'}</button>
          {detectedZeros.slice(0, 4).map((z, i) => (
            <button key={i} onClick={() => { setPlaying(false); setTVal(z); }}>γ_{i + 1}</button>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} width={680} height={220} className="hero-canvas" />
      <div className="viz-hero-foot">
        <label className="scrub-row">
          <span>Height t = {tVal.toFixed(4)}</span>
          <input
            type="range"
            min={10}
            max={60}
            step={0.01}
            value={tVal}
            onChange={(e) => { setPlaying(false); setTVal(parseFloat(e.target.value)); }}
          />
        </label>
      </div>
    </div>
  );
}

// ---------- 3. GoldbachSieves: Interactive Goldbach Prime-Pair Chord Diagram ----------
function GoldbachChordInteractive() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [evenN, setEvenN] = useState<number>(120);
  const { isPrime, primes } = React.useMemo(() => sievePrimes(2000), []);

  const pairs = React.useMemo(() => {
    const out: [number, number][] = [];
    for (const p of primes) {
      if (p > evenN / 2) break;
      if (isPrime[evenN - p]) out.push([p, evenN - p]);
    }
    return out;
  }, [evenN, isPrime, primes]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070b13';
    ctx.fillRect(0, 0, W, H);

    const padX = 28;
    const baseY = H - 28;
    const span = W - 2 * padX;
    const toX = (v: number) => padX + (v / evenN) * span;

    // Baseline
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, baseY);
    ctx.lineTo(W - padX, baseY);
    ctx.stroke();

    // Draw glowing semicircular arcs connecting p and n - p
    pairs.forEach(([p, q], idx) => {
      const x1 = toX(p), x2 = toX(q);
      const mid = 0.5 * (x1 + x2);
      const r = Math.max(4, (x2 - x1) * 0.5);
      const hue = 190 + (idx / Math.max(1, pairs.length)) * 130;
      ctx.strokeStyle = `hsla(${hue}, 90%, 62%, 0.72)`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(mid, baseY, Math.min(r, baseY - 14), Math.PI, 0);
      ctx.stroke();

      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(x1, baseY, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x2, baseY, 2.8, 0, Math.PI * 2); ctx.fill();
    });

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(`n = ${evenN} (mod 6 ≡ ${evenN % 6})  →  ${pairs.length} exact Goldbach prime pairs`, 14, 20);
  }, [evenN, pairs]);

  return (
    <div className="viz-hero-card">
      <div className="viz-hero-head">
        <strong>Interactive Goldbach Prime-Pair Chord Explorer</strong>
        <span className="muted">{pairs.slice(0, 5).map(([p, q]) => `${p}+${q}`).join(', ')}{pairs.length > 5 ? '…' : ''}</span>
      </div>
      <canvas ref={canvasRef} width={680} height={190} className="hero-canvas" />
      <div className="viz-hero-foot">
        <label className="scrub-row">
          <span>Even integer n = {evenN}</span>
          <input type="range" min={6} max={600} step={2} value={evenN} onChange={(e) => setEvenN(+e.target.value)} />
        </label>
      </div>
    </div>
  );
}

// ---------- 4. PvsNPWitness: Interactive 3-SAT Variable-Clause Graph Playground ----------
function SatGraphInteractive() {
  const N = 8;
  const [clauses, setClauses] = useState<number[][]>([
    [0, 2, 5], [1, 4, 6], [3, 6, 8], [0, 7, 10],
    [2, 9, 12], [5, 11, 14], [1, 8, 13], [4, 10, 15],
    [7, 12, 15], [3, 9, 14], [0, 11, 13], [2, 6, 14],
  ]);
  const [assign, setAssign] = useState<boolean[]>([true, false, true, false, true, false, true, false]);
  const [status, setStatus] = useState<string>('Click any variable x_i to flip its truth value or click Solve CDCL');

  const clauseSat = clauses.map((c) =>
    c.some((lit) => assign[lit >> 1] === ((lit & 1) === 0))
  );
  const satCount = clauseSat.filter(Boolean).length;

  const randomize = () => {
    const next: number[][] = [];
    for (let i = 0; i < 14; i++) {
      const vs: number[] = [];
      while (vs.length < 3) {
        const v = Math.floor(Math.random() * N);
        if (!vs.includes(v)) vs.push(v);
      }
      next.push(vs.map((v) => v * 2 + (Math.random() < 0.5 ? 0 : 1)));
    }
    setClauses(next);
    setStatus('Generated fresh 14-clause 3-SAT instance (n=8)');
  };

  const runLiveCdcl = () => {
    const res = solveCdcl(N, clauses);
    if (res.sat && res.model) {
      setAssign(res.model);
      setStatus(`CDCL SAT ✓ (${res.decisions} decisions, ${res.conflicts} conflicts)`);
    } else {
      setStatus(`CDCL UNSAT ✗ (${res.conflicts} conflicts — provably unsatisfiable)`);
    }
  };

  return (
    <div className="viz-hero-card">
      <div className="viz-hero-head">
        <strong>Interactive 3-SAT Clause-Variable Playground ({satCount}/{clauses.length} Satisfied)</strong>
        <div className="viz-hero-tools">
          <button onClick={randomize}>New 3-SAT</button>
          <button className="btn-primary" onClick={runLiveCdcl}>Solve via CDCL</button>
        </div>
      </div>
      <div className="sat-vars-row">
        {assign.map((val, v) => (
          <button
            key={v}
            className={`sat-var-pill ${val ? 'v-true' : 'v-false'}`}
            onClick={() => setAssign((prev) => prev.map((b, i) => (i === v ? !b : b)))}
          >
            x{v} = {val ? 'T' : 'F'}
          </button>
        ))}
      </div>
      <div className="sat-clauses-grid">
        {clauses.map((c, ci) => (
          <div key={ci} className={`sat-clause-chip ${clauseSat[ci] ? 'c-ok' : 'c-bad'}`}>
            C{ci + 1}: ({c.map((l) => `${(l & 1) ? '¬' : ''}x${l >> 1}`).join(' ∨ ')})
          </div>
        ))}
      </div>
      <div className="viz-hero-foot">{status}</div>
    </div>
  );
}

// ---------- 5. YangMillsGap: Live Animated 2D SU(2) Lattice Plaquette Heat-Bath ----------
function YangMillsLatticeInteractive() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const L = 14;
  const [beta, setBeta] = useState<number>(2.0);
  const [playing, setPlaying] = useState<boolean>(true);
  const [avgP, setAvgP] = useState<number>(0);

  // Store 2D SU(2) quaternion links in ref so heat-bath sweeps run continuously at 60fps
  const linksRef = useRef<Float64Array>(new Float64Array(L * L * 2 * 4));
  const initLinks = (hot: boolean) => {
    const arr = linksRef.current;
    for (let i = 0; i < L * L * 2; i++) {
      if (hot) {
        let a = Math.random() * 2 - 1, b = Math.random() * 2 - 1, c = Math.random() * 2 - 1, d = Math.random() * 2 - 1;
        const n = Math.hypot(a, b, c, d) || 1;
        arr[4 * i] = a / n; arr[4 * i + 1] = b / n; arr[4 * i + 2] = c / n; arr[4 * i + 3] = d / n;
      } else {
        arr[4 * i] = 1; arr[4 * i + 1] = 0; arr[4 * i + 2] = 0; arr[4 * i + 3] = 0;
      }
    }
  };
  useEffect(() => { initLinks(true); }, []);

  useEffect(() => {
    const qMul = (a: number[], b: number[]) => [
      a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],
      a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],
      a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],
      a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0],
    ];
    const qDag = (a: number[]) => [a[0], -a[1], -a[2], -a[3]];
    const getL = (x: number, y: number, mu: number) => {
      const o = (((y + L) % L) * L + ((x + L) % L)) * 8 + mu * 4;
      const arr = linksRef.current;
      return [arr[o], arr[o+1], arr[o+2], arr[o+3]];
    };
    const setL = (x: number, y: number, mu: number, q: number[]) => {
      const o = (((y + L) % L) * L + ((x + L) % L)) * 8 + mu * 4;
      const arr = linksRef.current;
      const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      arr[o]=q[0]/n; arr[o+1]=q[1]/n; arr[o+2]=q[2]/n; arr[o+3]=q[3]/n;
    };

    let raf = 0;
    const sweepAndDraw = () => {
      // One Metropolis/heat-bath sweep on 2D SU(2) links
      if (playing) {
        for (let y = 0; y < L; y++) {
          for (let x = 0; x < L; x++) {
            for (let mu = 0; mu < 2; mu++) {
              const fwd = mu === 0
                ? qMul(qMul(getL(x+1, y, 1), qDag(getL(x, y+1, 0))), qDag(getL(x, y, 1)))
                : qMul(qMul(getL(x, y+1, 0), qDag(getL(x+1, y, 1))), qDag(getL(x, y, 0)));
              const bwd = mu === 0
                ? qMul(qMul(qDag(getL(x+1, y-1, 1)), qDag(getL(x, y-1, 0))), getL(x, y-1, 1))
                : qMul(qMul(qDag(getL(x-1, y+1, 0)), qDag(getL(x-1, y, 1))), getL(x-1, y, 0));
              const A = [fwd[0]+bwd[0], fwd[1]+bwd[1], fwd[2]+bwd[2], fwd[3]+bwd[3]];
              const u = getL(x, y, mu);
              const eps = 0.45;
              const cand = [u[0]+(Math.random()-0.5)*eps, u[1]+(Math.random()-0.5)*eps, u[2]+(Math.random()-0.5)*eps, u[3]+(Math.random()-0.5)*eps];
              const cn = Math.hypot(cand[0], cand[1], cand[2], cand[3]) || 1;
              const uNew = [cand[0]/cn, cand[1]/cn, cand[2]/cn, cand[3]/cn];
              const sOld = qMul(u, A)[0];
              const sNew = qMul(uNew, A)[0];
              if (sNew > sOld || Math.random() < Math.exp(beta * (sNew - sOld))) {
                setL(x, y, mu, uNew);
              }
            }
          }
        }
      }

      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d')!;
        const cw = c.width / L, ch = c.height / L;
        let sum = 0;
        for (let y = 0; y < L; y++) {
          for (let x = 0; x < L; x++) {
            const p = qMul(qMul(getL(x, y, 0), getL(x+1, y, 1)), qMul(qDag(getL(x, y+1, 0)), qDag(getL(x, y, 1))))[0];
            sum += p;
            const t = (p + 1) * 0.5; // 0..1
            ctx.fillStyle = `rgb(${Math.round(20 + (1-t)*220)}, ${Math.round(45 + t*175)}, ${Math.round(90 + t*165)})`;
            ctx.fillRect(x * cw, y * ch, cw - 1, ch - 1);
          }
        }
        setAvgP(sum / (L * L));
      }
      if (playing) raf = requestAnimationFrame(sweepAndDraw);
    };
    sweepAndDraw();
    return () => cancelAnimationFrame(raf);
  }, [beta, playing]);

  return (
    <div className="viz-hero-card">
      <div className="viz-hero-head">
        <strong>Live 2D SU(2) Gauge Plaquette Field (⟨P⟩ = {avgP.toFixed(3)})</strong>
        <div className="viz-hero-tools">
          <button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
          <button onClick={() => initLinks(true)}>Hot Start</button>
          <button onClick={() => initLinks(false)}>Cold Start</button>
        </div>
      </div>
      <canvas ref={canvasRef} width={420} height={190} className="hero-canvas" style={{ maxWidth: 420, margin: '0 auto' }} />
      <div className="viz-hero-foot">
        <label className="scrub-row">
          <span>Live Coupling β = {beta.toFixed(2)} (low β = disordered confinement, high β = ordered weak coupling)</span>
          <input type="range" min={0.2} max={6.0} step={0.1} value={beta} onChange={(e) => setBeta(+e.target.value)} />
        </label>
      </div>
    </div>
  );
}

// ---------- 6. HodgeCycles: Rotating 3D Calabi-Yau / Fermat Cross-Section Projection ----------
function CalabiYauInteractive({ degree }: { degree: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rotY, setRotY] = useState(0.5);
  const [autoSpin, setAutoSpin] = useState(true);
  const d = Math.max(2, Math.min(7, degree));

  useEffect(() => {
    let raf = 0;
    let angle = rotY;
    const draw = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#070b13';
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;
      const scale = 88;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const cosB = Math.cos(0.45), sinB = Math.sin(0.45);

      const proj = (x: number, y: number, z: number): [number, number] => {
        const x1 = x * cosA - z * sinA;
        const z1 = x * sinA + z * cosA;
        const y2 = y * cosB - z1 * sinB;
        return [cx + x1 * scale, cy - y2 * scale];
      };

      // Hanson's Calabi-Yau quintic/Fermat slice: z1^d + z2^d = 1 -> k1, k2 in 0..d-1 sheets
      const steps = 16;
      for (let k1 = 0; k1 < d; k1++) {
        for (let k2 = 0; k2 < d; k2++) {
          const hue = ((k1 * d + k2) / (d * d)) * 280 + 170;
          ctx.strokeStyle = `hsla(${hue % 360}, 85%, 64%, 0.42)`;
          ctx.lineWidth = 1.1;
          for (let iv = 0; iv <= 4; iv++) {
            const v = (iv / 4) * (Math.PI / 2);
            ctx.beginPath();
            for (let iu = 0; iu <= steps; iu++) {
              const u = -0.9 + (iu / steps) * 1.8;
              // Complex cosh(u + i v)^{2/d} and sinh(u + i v)^{2/d}
              const cr = Math.cosh(u) * Math.cos(v), ci = Math.sinh(u) * Math.sin(v);
              const sr = Math.sinh(u) * Math.cos(v), si = Math.cosh(u) * Math.sin(v);
              const r1 = Math.pow(Math.hypot(cr, ci), 2 / d);
              const a1 = (Math.atan2(ci, cr) + 2 * Math.PI * k1) / d;
              const r2 = Math.pow(Math.hypot(sr, si), 2 / d);
              const a2 = (Math.atan2(si, sr) + 2 * Math.PI * k2) / d;
              const x = r1 * Math.cos(a1);
              const y = r2 * Math.cos(a2);
              const z = r1 * Math.sin(a1) * 0.7 + r2 * Math.sin(a2) * 0.7;
              const [px, py] = proj(x, y, z);
              if (iu === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(`Fermat / Calabi–Yau Projection z₁^${d} + z₂^${d} = 1 (${d * d} complex sheets)`, 14, 20);

      if (autoSpin) {
        angle += 0.012;
        raf = requestAnimationFrame(draw);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [d, rotY, autoSpin]);

  return (
    <div className="viz-hero-card">
      <div className="viz-hero-head">
        <strong>Interactive 3D Fermat / Calabi–Yau Slice (Degree d = {d})</strong>
        <div className="viz-hero-tools">
          <button onClick={() => setAutoSpin((s) => !s)}>{autoSpin ? 'Pause Spin' : 'Auto-Spin'}</button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={680}
        height={230}
        className="hero-canvas"
        onMouseMove={(e) => {
          if (e.buttons === 1) {
            setAutoSpin(false);
            setRotY((r) => r + e.movementX * 0.015);
          }
        }}
      />
      <div className="viz-hero-foot">Drag horizontally on the canvas to orbit the complex projective manifold slice.</div>
    </div>
  );
}

export function LabVisualizer({ labId, result }: { labId: LabId; result: LabResult }) {
  switch (labId) {
    case 'VortexBlowup':
      return <VortexInteractive heatmap={result.heatmap} />;
    case 'ZetaZero':
      return <ZetaSpiralInteractive result={result} />;
    case 'GoldbachSieves':
      return <GoldbachChordInteractive />;
    case 'PvsNPWitness':
      return <SatGraphInteractive />;
    case 'YangMillsGap':
      return <YangMillsLatticeInteractive />;
    case 'HodgeCycles':
      return <CalabiYauInteractive degree={result.hodgeDiamond?.fermatInfo?.degree ?? 4} />;
  }
}
