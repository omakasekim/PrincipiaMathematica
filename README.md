# PrincipiaMathematica — Unified Hard-Math Laboratories Workbench

A zero-backend, GitHub-Pages-ready computational mathematics laboratory uniting six Millennium-Prize-inspired and open-problem workbenches behind a single **Problem Selector Dropdown**, with all solvers executing client-side in a dedicated **Web Worker**.

## Six Laboratories

1. **`VortexBlowup`** — 3D incompressible Navier–Stokes & Euler pseudo-spectral FFT solver ($2/3$ dealiasing, RK4, adaptive CFL, Taylor–Green / anti-parallel tubes / vortex dipole, energy-enstrophy balance, BKM integral, mid-plane $|\boldsymbol{\omega}|$ heatmap, strain-rate alignment).
2. **`ZetaZero`** — Riemann–Siegel $\vartheta(t)$ and Hardy $Z(t)$ evaluator with Euler–Maclaurin fallback, Gram points & Rosser blocks, Brent root refinement, Turing's zero-count audit, and GUE / Wigner nearest-neighbor spacing & pair correlation.
3. **`GoldbachSieves`** — Segmented bitset prime sieve, exact $r_2(n)$ Goldbach Comet vs. Hardy–Littlewood singular series $\mathfrak{S}(n)$, circle-method major/minor arc exponential sums $|S(\alpha; N)|$, and Selberg $\Lambda^2$ sieve parity-barrier comparison.
4. **`PvsNPWitness`** — Random $k$-SAT & $k$-XOR-SAT phase-transition explorer with a full CDCL SAT solver (watched literals, 1-UIP conflict analysis, activity branching, geometric restarts), $\mathbb{F}_2$ Gaussian elimination, exact backbone fraction, and real-time model verification.
5. **`YangMillsGap`** — Pure $\text{SU}(2)$ lattice gauge theory ($d \in \{2, 3, 4\}$) using unit-quaternion links, Creutz heat-bath + Metropolis sweeps, $\beta$-sweep plaquette vs. strong-coupling theory, Wilson loops $W(R,T)$, Creutz ratios $\chi(R,T)$, correlator effective mass $m_{\text{eff}}(\tau)$, and gauge-invariance check.
6. **`HodgeCycles`** — Exact Hodge diamonds $h^{p,q}(X)$, Betti numbers $b_k$, and Euler characteristic $\chi(X)$ for smooth hypersurfaces, complete intersections, and Künneth products, plus Shioda Fermat character-tuple enumeration and Gauss–Legendre Fermat period quadrature.

## Build, Test & Run

```sh
npm install
npm test        # Vitest mathematical invariant suite across all 6 labs
npm run dev     # Local dev server
npm run build   # Production bundle -> dist/ (base: "./" for GitHub Pages)
```
