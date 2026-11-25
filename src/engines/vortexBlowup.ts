import type { LabResult, ProgressCallback } from './types';

export type VortexPreset = 'taylor-green' | 'anti-parallel' | 'dipole';

export interface VortexParams {
  gridN: 16 | 24 | 32;
  viscosity: number;
  amplitude: number;
  tEnd: number;
  cfl: number;
  preset: VortexPreset;
}

export const DEFAULT_VORTEX_PARAMS: VortexParams = {
  gridN: 16,
  viscosity: 0.01,
  amplitude: 1.0,
  tEnd: 1.2,
  cfl: 0.45,
  preset: 'taylor-green',
};

// Exact 1D DFT/FFT supporting powers of 2 (radix-2) and general N (e.g. 24 = 3*8 via radix-3+8 or Bluestein).
function fft1d(re: Float64Array, im: Float64Array, n: number, inverse: boolean): void {
  if ((n & (n - 1)) === 0) {
    // Radix-2 Cooley-Tukey
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (sign * 2 * Math.PI) / len;
      const wRe = Math.cos(ang);
      const wIm = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cRe = 1;
        let cIm = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k;
          const b = a + half;
          const vr = re[b] * cRe - im[b] * cIm;
          const vi = re[b] * cIm + im[b] * cRe;
          re[b] = re[a] - vr;
          im[b] = im[a] - vi;
          re[a] += vr;
          im[a] += vi;
          const nr = cRe * wRe - cIm * wIm;
          cIm = cRe * wIm + cIm * wRe;
          cRe = nr;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    }
    return;
  }

  // Exact radix-3 x radix-(n/3) decomposition (for N=24, 48)
  if (n % 3 === 0) {
    const m = n / 3;
    const subRe0 = new Float64Array(m), subIm0 = new Float64Array(m);
    const subRe1 = new Float64Array(m), subIm1 = new Float64Array(m);
    const subRe2 = new Float64Array(m), subIm2 = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      subRe0[j] = re[3 * j]; subIm0[j] = im[3 * j];
      subRe1[j] = re[3 * j + 1]; subIm1[j] = im[3 * j + 1];
      subRe2[j] = re[3 * j + 2]; subIm2[j] = im[3 * j + 2];
    }
    fft1d(subRe0, subIm0, m, inverse);
    fft1d(subRe1, subIm1, m, inverse);
    fft1d(subRe2, subIm2, m, inverse);
    const sign = inverse ? 1 : -1;
    const c3 = -0.5;
    const s3 = sign * (Math.sqrt(3) / 2);
    const scale = inverse ? 1 / 3 : 1;
    for (let k = 0; k < m; k++) {
      const a1 = (sign * 2 * Math.PI * k) / n;
      const w1r = Math.cos(a1), w1i = Math.sin(a1);
      const a2 = 2 * a1;
      const w2r = Math.cos(a2), w2i = Math.sin(a2);

      const x0r = subRe0[k], x0i = subIm0[k];
      const x1r = subRe1[k] * w1r - subIm1[k] * w1i;
      const x1i = subRe1[k] * w1i + subIm1[k] * w1r;
      const x2r = subRe2[k] * w2r - subIm2[k] * w2i;
      const x2i = subRe2[k] * w2i + subIm2[k] * w2r;

      re[k] = (x0r + x1r + x2r) * scale;
      im[k] = (x0i + x1i + x2i) * scale;

      const t1r = x1r * c3 - x1i * s3;
      const t1i = x1r * s3 + x1i * c3;
      const t2r = x2r * c3 + x2i * s3;
      const t2i = -x2r * s3 + x2i * c3;
      re[k + m] = (x0r + t1r + t2r) * scale;
      im[k + m] = (x0i + t1i + t2i) * scale;

      const u1r = x1r * c3 + x1i * s3;
      const u1i = -x1r * s3 + x1i * c3;
      const u2r = x2r * c3 - x2i * s3;
      const u2i = x2r * s3 + x2i * c3;
      re[k + 2 * m] = (x0r + u1r + u2r) * scale;
      im[k + 2 * m] = (x0i + u1i + u2i) * scale;
    }
    return;
  }

  // Fallback direct DFT
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  const sign = inverse ? 1 : -1;
  const scale = inverse ? 1 / n : 1;
  for (let k = 0; k < n; k++) {
    let sr = 0, si = 0;
    for (let j = 0; j < n; j++) {
      const ang = (sign * 2 * Math.PI * k * j) / n;
      const c = Math.cos(ang), s = Math.sin(ang);
      sr += re[j] * c - im[j] * s;
      si += re[j] * s + im[j] * c;
    }
    outRe[k] = sr * scale;
    outIm[k] = si * scale;
  }
  re.set(outRe);
  im.set(outIm);
}

function fft3d(re: Float64Array, im: Float64Array, n: number, inverse: boolean): void {
  const lineRe = new Float64Array(n);
  const lineIm = new Float64Array(n);
  const n2 = n * n;
  // X-lines
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      const base = z * n2 + y * n;
      for (let x = 0; x < n; x++) { lineRe[x] = re[base + x]; lineIm[x] = im[base + x]; }
      fft1d(lineRe, lineIm, n, inverse);
      for (let x = 0; x < n; x++) { re[base + x] = lineRe[x]; im[base + x] = lineIm[x]; }
    }
  }
  // Y-lines
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const base = z * n2 + x;
      for (let y = 0; y < n; y++) { lineRe[y] = re[base + y * n]; lineIm[y] = im[base + y * n]; }
      fft1d(lineRe, lineIm, n, inverse);
      for (let y = 0; y < n; y++) { re[base + y * n] = lineRe[y]; im[base + y * n] = lineIm[y]; }
    }
  }
  // Z-lines
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const base = y * n + x;
      for (let z = 0; z < n; z++) { lineRe[z] = re[base + z * n2]; lineIm[z] = im[base + z * n2]; }
      fft1d(lineRe, lineIm, n, inverse);
      for (let z = 0; z < n; z++) { re[base + z * n2] = lineRe[z]; im[base + z * n2] = lineIm[z]; }
    }
  }
}

interface SpectralVec {
  xr: Float64Array; xi: Float64Array;
  yr: Float64Array; yi: Float64Array;
  zr: Float64Array; zi: Float64Array;
}

function allocVec(len: number): SpectralVec {
  return {
    xr: new Float64Array(len), xi: new Float64Array(len),
    yr: new Float64Array(len), yi: new Float64Array(len),
    zr: new Float64Array(len), zi: new Float64Array(len),
  };
}

function waveNum(i: number, n: number): number {
  return i <= n / 2 ? i : i - n;
}

// Compute velocity u_hat = (i k x omega_hat) / |k|^2 in Fourier space (solenoidal)
function velocityFromVorticity(w: SpectralVec, u: SpectralVec, n: number): void {
  const n2 = n * n;
  for (let kz = 0; kz < n; kz++) {
    const gz = waveNum(kz, n);
    for (let ky = 0; ky < n; ky++) {
      const gy = waveNum(ky, n);
      for (let kx = 0; kx < n; kx++) {
        const gx = waveNum(kx, n);
        const idx = kz * n2 + ky * n + kx;
        const k2 = gx * gx + gy * gy + gz * gz;
        if (k2 === 0) {
          u.xr[idx] = u.xi[idx] = u.yr[idx] = u.yi[idx] = u.zr[idx] = u.zi[idx] = 0;
          continue;
        }
        const inv = 1 / k2;
        // k x w: (gy*wz - gz*wy, gz*wx - gx*wz, gx*wy - gy*wx), then multiply by i: (a + i b)*i = -b + i a
        const cxr = gy * w.zr[idx] - gz * w.yr[idx];
        const cxi = gy * w.zi[idx] - gz * w.yi[idx];
        const cyr = gz * w.xr[idx] - gx * w.zr[idx];
        const cyi = gz * w.xi[idx] - gx * w.zi[idx];
        const czr = gx * w.yr[idx] - gy * w.xr[idx];
        const czi = gx * w.yi[idx] - gy * w.xi[idx];
        u.xr[idx] = -cxi * inv; u.xi[idx] = cxr * inv;
        u.yr[idx] = -cyi * inv; u.yi[idx] = cyr * inv;
        u.zr[idx] = -czi * inv; u.zi[idx] = czr * inv;
      }
    }
  }
}

// Project w_hat onto divergence-free space + apply 2/3 dealiasing mask
function projectAndDealias(w: SpectralVec, n: number): void {
  const kCut = n / 3;
  const n2 = n * n;
  for (let kz = 0; kz < n; kz++) {
    const gz = waveNum(kz, n);
    for (let ky = 0; ky < n; ky++) {
      const gy = waveNum(ky, n);
      for (let kx = 0; kx < n; kx++) {
        const gx = waveNum(kx, n);
        const idx = kz * n2 + ky * n + kx;
        if (Math.abs(gx) >= kCut || Math.abs(gy) >= kCut || Math.abs(gz) >= kCut) {
          w.xr[idx] = w.xi[idx] = w.yr[idx] = w.yi[idx] = w.zr[idx] = w.zi[idx] = 0;
          continue;
        }
        const k2 = gx * gx + gy * gy + gz * gz;
        if (k2 > 0) {
          const dotR = (gx * w.xr[idx] + gy * w.yr[idx] + gz * w.zr[idx]) / k2;
          const dotI = (gx * w.xi[idx] + gy * w.yi[idx] + gz * w.zi[idx]) / k2;
          w.xr[idx] -= gx * dotR; w.xi[idx] -= gx * dotI;
          w.yr[idx] -= gy * dotR; w.yi[idx] -= gy * dotI;
          w.zr[idx] -= gz * dotR; w.zi[idx] -= gz * dotI;
        }
      }
    }
  }
}

// RHS of vorticity eq in Fourier space: dw/dt = curl(u x w) - nu |k|^2 w
function computeRhs(wHat: SpectralVec, rhs: SpectralVec, n: number, nu: number): void {
  const len = n * n * n;
  const uHat = allocVec(len);
  velocityFromVorticity(wHat, uHat, n);

  const wPhys = {
    xr: wHat.xr.slice(), xi: wHat.xi.slice(),
    yr: wHat.yr.slice(), yi: wHat.yi.slice(),
    zr: wHat.zr.slice(), zi: wHat.zi.slice(),
  };
  const uPhys = {
    xr: uHat.xr.slice(), xi: uHat.xi.slice(),
    yr: uHat.yr.slice(), yi: uHat.yi.slice(),
    zr: uHat.zr.slice(), zi: uHat.zi.slice(),
  };

  fft3d(wPhys.xr, wPhys.xi, n, true);
  fft3d(wPhys.yr, wPhys.yi, n, true);
  fft3d(wPhys.zr, wPhys.zi, n, true);
  fft3d(uPhys.xr, uPhys.xi, n, true);
  fft3d(uPhys.yr, uPhys.yi, n, true);
  fft3d(uPhys.zr, uPhys.zi, n, true);

  // Physical space cross product f = u x w
  const f = allocVec(len);
  for (let i = 0; i < len; i++) {
    const ux = uPhys.xr[i], uy = uPhys.yr[i], uz = uPhys.zr[i];
    const wx = wPhys.xr[i], wy = wPhys.yr[i], wz = wPhys.zr[i];
    f.xr[i] = uy * wz - uz * wy;
    f.yr[i] = uz * wx - ux * wz;
    f.zr[i] = ux * wy - uy * wx;
  }

  fft3d(f.xr, f.xi, n, false);
  fft3d(f.yr, f.yi, n, false);
  fft3d(f.zr, f.zi, n, false);
  projectAndDealias(f, n);

  // curl(f) = i k x f_hat, minus nu |k|^2 w_hat
  const n2 = n * n;
  const kCut = n / 3;
  for (let kz = 0; kz < n; kz++) {
    const gz = waveNum(kz, n);
    for (let ky = 0; ky < n; ky++) {
      const gy = waveNum(ky, n);
      for (let kx = 0; kx < n; kx++) {
        const gx = waveNum(kx, n);
        const idx = kz * n2 + ky * n + kx;
        if (Math.abs(gx) >= kCut || Math.abs(gy) >= kCut || Math.abs(gz) >= kCut) {
          rhs.xr[idx] = rhs.xi[idx] = rhs.yr[idx] = rhs.yi[idx] = rhs.zr[idx] = rhs.zi[idx] = 0;
          continue;
        }
        const k2 = gx * gx + gy * gy + gz * gz;
        const cxr = gy * f.zr[idx] - gz * f.yr[idx];
        const cxi = gy * f.zi[idx] - gz * f.yi[idx];
        const cyr = gz * f.xr[idx] - gx * f.zr[idx];
        const cyi = gz * f.xi[idx] - gx * f.zi[idx];
        const czr = gx * f.yr[idx] - gy * f.xr[idx];
        const czi = gx * f.yi[idx] - gy * f.xi[idx];

        rhs.xr[idx] = -cxi - nu * k2 * wHat.xr[idx];
        rhs.xi[idx] = cxr - nu * k2 * wHat.xi[idx];
        rhs.yr[idx] = -cyi - nu * k2 * wHat.yr[idx];
        rhs.yi[idx] = cyr - nu * k2 * wHat.yi[idx];
        rhs.zr[idx] = -czi - nu * k2 * wHat.zr[idx];
        rhs.zi[idx] = czr - nu * k2 * wHat.zi[idx];
      }
    }
  }
}

function initVorticityField(n: number, preset: VortexPreset, amp: number): SpectralVec {
  const len = n * n * n;
  const u = allocVec(len);
  const dx = (2 * Math.PI) / n;
  const n2 = n * n;

  for (let iz = 0; iz < n; iz++) {
    const z = iz * dx;
    for (let iy = 0; iy < n; iy++) {
      const y = iy * dx;
      for (let ix = 0; ix < n; ix++) {
        const x = ix * dx;
        const idx = iz * n2 + iy * n + ix;
        if (preset === 'taylor-green') {
          u.xr[idx] = amp * Math.sin(x) * Math.cos(y) * Math.cos(z);
          u.yr[idx] = -amp * Math.cos(x) * Math.sin(y) * Math.cos(z);
          u.zr[idx] = 0;
        } else if (preset === 'anti-parallel') {
          // Smooth periodic anti-parallel vortex tubes along z with sinusoidal perturbation
          const y1 = y - (Math.PI - 0.85 + 0.15 * Math.cos(z));
          const y2 = y - (Math.PI + 0.85 - 0.15 * Math.cos(z));
          const xc = x - Math.PI;
          const r1 = xc * xc + y1 * y1;
          const r2 = xc * xc + y2 * y2;
          const s2 = 0.28;
          u.xr[idx] = amp * (-y1 * Math.exp(-r1 / s2) + y2 * Math.exp(-r2 / s2));
          u.yr[idx] = amp * (xc * Math.exp(-r1 / s2) - xc * Math.exp(-r2 / s2));
          u.zr[idx] = 0.25 * amp * Math.sin(z) * (Math.exp(-r1 / s2) + Math.exp(-r2 / s2));
        } else {
          // Perturbed 3D ABC / dipole vortex flow
          u.xr[idx] = amp * (Math.sin(z) + Math.cos(y) + 0.25 * Math.sin(2 * x) * Math.cos(y));
          u.yr[idx] = amp * (Math.sin(x) + Math.cos(z) - 0.25 * Math.cos(x) * Math.sin(2 * y));
          u.zr[idx] = amp * (Math.sin(y) + Math.cos(x));
        }
      }
    }
  }

  fft3d(u.xr, u.xi, n, false);
  fft3d(u.yr, u.yi, n, false);
  fft3d(u.zr, u.zi, n, false);
  projectAndDealias(u, n);

  // w_hat = i k x u_hat
  const w = allocVec(len);
  for (let kz = 0; kz < n; kz++) {
    const gz = waveNum(kz, n);
    for (let ky = 0; ky < n; ky++) {
      const gy = waveNum(ky, n);
      for (let kx = 0; kx < n; kx++) {
        const gx = waveNum(kx, n);
        const idx = kz * n2 + ky * n + kx;
        const cxr = gy * u.zr[idx] - gz * u.yr[idx];
        const cxi = gy * u.zi[idx] - gz * u.yi[idx];
        const cyr = gz * u.xr[idx] - gx * u.zr[idx];
        const cyi = gz * u.xi[idx] - gx * u.zi[idx];
        const czr = gx * u.yr[idx] - gy * u.xr[idx];
        const czi = gx * u.yi[idx] - gy * u.xi[idx];
        w.xr[idx] = -cxi; w.xi[idx] = cxr;
        w.yr[idx] = -cyi; w.yi[idx] = cyr;
        w.zr[idx] = -czi; w.zi[idx] = czr;
      }
    }
  }
  projectAndDealias(w, n);
  return w;
}

// Largest eigenvector of a 3x3 symmetric matrix via Jacobi iterations
function maxEigenvector3x3(s00: number, s01: number, s02: number, s11: number, s12: number, s22: number): [number, number, number] {
  const a = [
    [s00, s01, s02],
    [s01, s11, s12],
    [s02, s12, s22],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iter = 0; iter < 8; iter++) {
    let p = 0, q = 1, maxOff = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > maxOff) { p = 0; q = 2; maxOff = Math.abs(a[0][2]); }
    if (Math.abs(a[1][2]) > maxOff) { p = 1; q = 2; maxOff = Math.abs(a[1][2]); }
    if (maxOff < 1e-12) break;
    const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(phi), s = Math.sin(phi);
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
    const r = 3 - p - q;
    const apr = a[p][r], aqr = a[q][r];
    a[p][r] = a[r][p] = c * apr - s * aqr;
    a[q][r] = a[r][q] = s * apr + c * aqr;
    for (let i = 0; i < 3; i++) {
      const vip = v[i][p], viq = v[i][q];
      v[i][p] = c * vip - s * viq;
      v[i][q] = s * vip + c * viq;
    }
  }
  let best = 0;
  if (a[1][1] > a[best][best]) best = 1;
  if (a[2][2] > a[best][best]) best = 2;
  return [v[0][best], v[1][best], v[2][best]];
}

function measureDiagnostics(wHat: SpectralVec, n: number) {
  const len = n * n * n;
  const uHat = allocVec(len);
  velocityFromVorticity(wHat, uHat, n);

  // Energy & Enstrophy from Parseval: (1 / N^6) * sum |hat|^2 * (2pi)^3, normalized per volume (2pi)^3 => mean(0.5 |u|^2)
  const norm = 1 / (len * len);
  let energy = 0;
  let enstrophy = 0;
  let maxDivU = 0;
  const n2 = n * n;
  for (let kz = 0; kz < n; kz++) {
    const gz = waveNum(kz, n);
    for (let ky = 0; ky < n; ky++) {
      const gy = waveNum(ky, n);
      for (let kx = 0; kx < n; kx++) {
        const gx = waveNum(kx, n);
        const idx = kz * n2 + ky * n + kx;
        const u2 =
          uHat.xr[idx] ** 2 + uHat.xi[idx] ** 2 +
          uHat.yr[idx] ** 2 + uHat.yi[idx] ** 2 +
          uHat.zr[idx] ** 2 + uHat.zi[idx] ** 2;
        const w2 =
          wHat.xr[idx] ** 2 + wHat.xi[idx] ** 2 +
          wHat.yr[idx] ** 2 + wHat.yi[idx] ** 2 +
          wHat.zr[idx] ** 2 + wHat.zi[idx] ** 2;
        energy += 0.5 * u2 * norm;
        enstrophy += 0.5 * w2 * norm;
        const dr = gx * uHat.xr[idx] + gy * uHat.yr[idx] + gz * uHat.zr[idx];
        const di = gx * uHat.xi[idx] + gy * uHat.yi[idx] + gz * uHat.zi[idx];
        maxDivU = Math.max(maxDivU, Math.hypot(dr, di) / len);
      }
    }
  }

  // Physical space fields for L_inf vorticity, max |u|, and mid-plane slice
  const wPhys = {
    xr: wHat.xr.slice(), xi: wHat.xi.slice(),
    yr: wHat.yr.slice(), yi: wHat.yi.slice(),
    zr: wHat.zr.slice(), zi: wHat.zi.slice(),
  };
  const uPhys = {
    xr: uHat.xr.slice(), xi: uHat.xi.slice(),
    yr: uHat.yr.slice(), yi: uHat.yi.slice(),
    zr: uHat.zr.slice(), zi: uHat.zi.slice(),
  };
  fft3d(wPhys.xr, wPhys.xi, n, true);
  fft3d(wPhys.yr, wPhys.yi, n, true);
  fft3d(wPhys.zr, wPhys.zi, n, true);
  fft3d(uPhys.xr, uPhys.xi, n, true);
  fft3d(uPhys.yr, uPhys.yi, n, true);
  fft3d(uPhys.zr, uPhys.zi, n, true);

  let peakVort = 0;
  let maxU = 0;
  for (let i = 0; i < len; i++) {
    const wm = Math.hypot(wPhys.xr[i], wPhys.yr[i], wPhys.zr[i]);
    const um = Math.hypot(uPhys.xr[i], uPhys.yr[i], uPhys.zr[i]);
    if (wm > peakVort) peakVort = wm;
    if (um > maxU) maxU = um;
  }

  // Mid-plane z = N/2 vorticity magnitude slice + strain-rate alignment via centered finite differences
  const zMid = n >> 1;
  const slice: number[] = new Array(n * n);
  const inv2dx = n / (4 * Math.PI);
  let alignSum = 0;
  let alignCount = 0;

  for (let iy = 0; iy < n; iy++) {
    const ym = (iy - 1 + n) % n;
    const yp = (iy + 1) % n;
    for (let ix = 0; ix < n; ix++) {
      const xm = (ix - 1 + n) % n;
      const xp = (ix + 1) % n;
      const zm = (zMid - 1 + n) % n;
      const zp = (zMid + 1) % n;
      const idx = zMid * n2 + iy * n + ix;
      const wx = wPhys.xr[idx], wy = wPhys.yr[idx], wz = wPhys.zr[idx];
      const wm = Math.hypot(wx, wy, wz);
      slice[iy * n + ix] = wm;

      if (wm > 1e-6) {
        const ixp = zMid * n2 + iy * n + xp, ixm = zMid * n2 + iy * n + xm;
        const iyp = zMid * n2 + yp * n + ix, iym = zMid * n2 + ym * n + ix;
        const izp = zp * n2 + iy * n + ix, izm = zm * n2 + iy * n + ix;
        const duxdx = (uPhys.xr[ixp] - uPhys.xr[ixm]) * inv2dx;
        const duydy = (uPhys.yr[iyp] - uPhys.yr[iym]) * inv2dx;
        const duzdz = (uPhys.zr[izp] - uPhys.zr[izm]) * inv2dx;
        const s01 = 0.5 * ((uPhys.xr[iyp] - uPhys.xr[iym]) + (uPhys.yr[ixp] - uPhys.yr[ixm])) * inv2dx;
        const s02 = 0.5 * ((uPhys.xr[izp] - uPhys.xr[izm]) + (uPhys.zr[ixp] - uPhys.zr[ixm])) * inv2dx;
        const s12 = 0.5 * ((uPhys.yr[izp] - uPhys.yr[izm]) + (uPhys.zr[iyp] - uPhys.zr[iym])) * inv2dx;
        const [e1x, e1y, e1z] = maxEigenvector3x3(duxdx, s01, s02, duydy, s12, duzdz);
        const cosT = Math.abs((wx * e1x + wy * e1y + wz * e1z) / wm);
        alignSum += cosT;
        alignCount++;
      }
    }
  }

  return {
    energy,
    enstrophy,
    peakVort,
    maxU,
    maxDivU,
    slice,
    meanAlign: alignCount > 0 ? alignSum / alignCount : 0,
  };
}

export function runVortexBlowup(params: VortexParams, onProgress?: ProgressCallback): LabResult {
  const t0 = performance.now();
  const n = params.gridN;
  const len = n * n * n;
  const nu = Math.max(0, params.viscosity);
  const dx = (2 * Math.PI) / n;

  const w = initVorticityField(n, params.preset, params.amplitude);
  const k1 = allocVec(len), k2 = allocVec(len), k3 = allocVec(len), k4 = allocVec(len);
  const tmp = allocVec(len);

  const times: number[] = [];
  const energies: number[] = [];
  const enstrophies: number[] = [];
  const peaks: number[] = [];
  const bkm: number[] = [];
  const aligns: number[] = [];

  let t = 0;
  let bkmAcc = 0;
  let step = 0;
  let lastDiag = measureDiagnostics(w, n);
  let dissIntegral = 0;

  times.push(0);
  energies.push(lastDiag.energy);
  enstrophies.push(lastDiag.enstrophy);
  peaks.push(lastDiag.peakVort);
  bkm.push(0);
  aligns.push(lastDiag.meanAlign);

  const maxSteps = 45;
  while (t < params.tEnd - 1e-9 && step < maxSteps) {
    const dtAdv = (params.cfl * dx) / Math.max(0.25, lastDiag.maxU);
    const dtDiff = nu > 1e-9 ? (0.2 * dx * dx) / nu : 0.08;
    const dt = Math.min(params.tEnd - t, Math.min(dtAdv, dtDiff, 0.06));
    const prevEnst = lastDiag.enstrophy;
    const prevPeak = lastDiag.peakVort;

    // RK4 step
    computeRhs(w, k1, n, nu);
    for (let i = 0; i < len; i++) {
      tmp.xr[i] = w.xr[i] + 0.5 * dt * k1.xr[i]; tmp.xi[i] = w.xi[i] + 0.5 * dt * k1.xi[i];
      tmp.yr[i] = w.yr[i] + 0.5 * dt * k1.yr[i]; tmp.yi[i] = w.yi[i] + 0.5 * dt * k1.yi[i];
      tmp.zr[i] = w.zr[i] + 0.5 * dt * k1.zr[i]; tmp.zi[i] = w.zi[i] + 0.5 * dt * k1.zi[i];
    }
    computeRhs(tmp, k2, n, nu);
    for (let i = 0; i < len; i++) {
      tmp.xr[i] = w.xr[i] + 0.5 * dt * k2.xr[i]; tmp.xi[i] = w.xi[i] + 0.5 * dt * k2.xi[i];
      tmp.yr[i] = w.yr[i] + 0.5 * dt * k2.yr[i]; tmp.yi[i] = w.yi[i] + 0.5 * dt * k2.yi[i];
      tmp.zr[i] = w.zr[i] + 0.5 * dt * k2.zr[i]; tmp.zi[i] = w.zi[i] + 0.5 * dt * k2.zi[i];
    }
    computeRhs(tmp, k3, n, nu);
    for (let i = 0; i < len; i++) {
      tmp.xr[i] = w.xr[i] + dt * k3.xr[i]; tmp.xi[i] = w.xi[i] + dt * k3.xi[i];
      tmp.yr[i] = w.yr[i] + dt * k3.yr[i]; tmp.yi[i] = w.yi[i] + dt * k3.yi[i];
      tmp.zr[i] = w.zr[i] + dt * k3.zr[i]; tmp.zi[i] = w.zi[i] + dt * k3.zi[i];
    }
    computeRhs(tmp, k4, n, nu);

    const c = dt / 6;
    for (let i = 0; i < len; i++) {
      w.xr[i] += c * (k1.xr[i] + 2 * k2.xr[i] + 2 * k3.xr[i] + k4.xr[i]);
      w.xi[i] += c * (k1.xi[i] + 2 * k2.xi[i] + 2 * k3.xi[i] + k4.xi[i]);
      w.yr[i] += c * (k1.yr[i] + 2 * k2.yr[i] + 2 * k3.yr[i] + k4.yr[i]);
      w.yi[i] += c * (k1.yi[i] + 2 * k2.yi[i] + 2 * k3.yi[i] + k4.yi[i]);
      w.zr[i] += c * (k1.zr[i] + 2 * k2.zr[i] + 2 * k3.zr[i] + k4.zr[i]);
      w.zi[i] += c * (k1.zi[i] + 2 * k2.zi[i] + 2 * k3.zi[i] + k4.zi[i]);
    }
    projectAndDealias(w, n);
    t += dt;
    step++;

    lastDiag = measureDiagnostics(w, n);
    bkmAcc += 0.5 * (prevPeak + lastDiag.peakVort) * dt;
    dissIntegral += 2 * nu * 0.5 * (prevEnst + lastDiag.enstrophy) * dt;

    times.push(t);
    energies.push(lastDiag.energy);
    enstrophies.push(lastDiag.enstrophy);
    peaks.push(lastDiag.peakVort);
    bkm.push(bkmAcc);
    aligns.push(lastDiag.meanAlign);
    onProgress?.(Math.min(1, t / Math.max(1e-6, params.tEnd)), `RK4 step ${step} (t=${t.toFixed(2)})`);
  }

  const e0 = energies[0];
  const eEnd = energies[energies.length - 1];
  const energyResidual = Math.abs((eEnd - e0) + dissIntegral) / Math.max(1e-9, e0);
  let sliceMax = 0;
  for (const v of lastDiag.slice) if (v > sliceMax) sliceMax = v;

  return {
    labId: 'VortexBlowup',
    summary: {
      'Grid': `${n}³ (2/3 dealiased)`,
      'Final Time t': t.toFixed(3),
      'Kinetic Energy E(t)': eEnd.toFixed(5),
      'Enstrophy Ω(t)': lastDiag.enstrophy.toFixed(5),
      'Peak ||ω||∞': lastDiag.peakVort.toFixed(4),
      'BKM Integral': bkmAcc.toFixed(4),
      'Mean |cos θ(ω, e₁)|': lastDiag.meanAlign.toFixed(3),
    },
    invariants: [
      {
        name: 'Energy Balance |ΔE + 2ν∫Ωdt| / E₀',
        value: energyResidual.toExponential(2),
        target: '< 5e-2',
        passed: energyResidual < 5e-2,
      },
      {
        name: 'Incompressibility max|∇·u|',
        value: lastDiag.maxDivU.toExponential(2),
        target: '< 1e-10',
        passed: lastDiag.maxDivU < 1e-10,
      },
      {
        name: 'Monotone Energy (dE/dt ≤ 0)',
        value: `${(eEnd - e0).toExponential(2)}`,
        target: '≤ 1e-6',
        passed: eEnd - e0 <= 1e-6,
      },
    ],
    charts: [
      {
        id: 'energy-enstrophy',
        title: 'Kinetic Energy E(t) & Enstrophy Ω(t)',
        xLabel: 'Time t',
        yLabel: 'Energy E(t)',
        yRightLabel: 'Enstrophy Ω(t)',
        series: [
          { name: 'E(t)', color: '#38bdf8', mode: 'line', points: times.map((x, i) => ({ x, y: energies[i] })), yAxis: 'left' },
          { name: 'Ω(t)', color: '#f97316', mode: 'line', points: times.map((x, i) => ({ x, y: enstrophies[i] })), yAxis: 'right' },
        ],
      },
      {
        id: 'bkm-vorticity',
        title: 'Peak Vorticity ||ω(t)||∞ & BKM Integral',
        xLabel: 'Time t',
        yLabel: '||ω||∞ / BKM',
        series: [
          { name: '||ω(t)||∞', color: '#ec4899', mode: 'line', points: times.map((x, i) => ({ x, y: peaks[i] })) },
          { name: '∫||ω||∞ dτ (BKM)', color: '#a855f7', mode: 'dashed', points: times.map((x, i) => ({ x, y: bkm[i] })) },
        ],
      },
    ],
    heatmap: {
      title: `Mid-Plane Vorticity Magnitude |ω(x, y, π)| at t = ${t.toFixed(2)}`,
      nx: n,
      ny: n,
      values: lastDiag.slice,
      minVal: 0,
      maxVal: Math.max(1e-6, sliceMax),
      xLabel: 'x ∈ [0, 2π)',
      yLabel: 'y ∈ [0, 2π)',
    },
    notes: [
      '3D Fourier pseudo-spectral vorticity solver on [0,2π)³ using exact mixed-radix FFT, 2/3 dealiasing, Leray projection, and RK4 adaptive CFL stepping.',
      'Beale–Kato–Majda (1984): a smooth 3D Euler/Navier–Stokes solution blows up at T* iff ∫₀^{T*} ||ω(t)||_∞ dt = ∞.',
    ],
    elapsedMs: performance.now() - t0,
  };
}
