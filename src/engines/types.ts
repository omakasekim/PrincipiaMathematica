export type LabId =
  | 'VortexBlowup'
  | 'ZetaZero'
  | 'GoldbachSieves'
  | 'PvsNPWitness'
  | 'YangMillsGap'
  | 'HodgeCycles';

export interface InvariantCheck {
  name: string;
  value: string;
  target: string;
  passed: boolean;
}

export interface SeriesPoint {
  x: number;
  y: number;
  yErr?: number;
  label?: string;
}

export interface ChartSeries {
  name: string;
  color: string;
  mode: 'line' | 'scatter' | 'bar' | 'dashed';
  points: SeriesPoint[];
  yAxis?: 'left' | 'right';
}

export interface ChartSpec {
  id: string;
  title: string;
  xLabel: string;
  yLabel: string;
  yRightLabel?: string;
  yLog?: boolean;
  series: ChartSeries[];
  vLines?: { x: number; label: string; color: string }[];
}

export interface HeatmapSpec {
  title: string;
  nx: number;
  ny: number;
  values: number[];
  minVal: number;
  maxVal: number;
  xLabel: string;
  yLabel: string;
}

export interface HodgeDiamondData {
  dim: number;
  h: number[][]; // h[p][q]
  betti: number[];
  euler: number;
  hkk: number;
  fermatInfo?: {
    degree: number;
    ambientDim: number;
    totalHodgeTuples: number;
    linearCycleRank: number;
    periodIntegral?: { re: number; im: number; label: string };
  };
}

export interface LabResult {
  labId: LabId;
  summary: Record<string, string | number>;
  invariants: InvariantCheck[];
  charts: ChartSpec[];
  heatmap?: HeatmapSpec;
  hodgeDiamond?: HodgeDiamondData;
  table?: {
    title: string;
    columns: string[];
    rows: (string | number)[][];
  };
  notes: string[];
  elapsedMs: number;
}

export type ProgressCallback = (fraction: number, status: string) => void;
