import { runVortexBlowup, type VortexParams } from '../engines/vortexBlowup';
import { runZetaZero, type ZetaParams } from '../engines/zetaZero';
import { runGoldbachSieves, type GoldbachParams } from '../engines/goldbachSieves';
import { runPvsNPWitness, type SatParams } from '../engines/pVsNpWitness';
import { runYangMillsGap, type YangMillsParams } from '../engines/yangMillsGap';
import { runHodgeCycles, type HodgeParams } from '../engines/hodgeCycles';
import type { LabId, LabResult } from '../engines/types';

export interface WorkerRequest {
  runId: number;
  labId: LabId;
  params: unknown;
}

export type WorkerResponse =
  | { type: 'progress'; runId: number; fraction: number; status: string }
  | { type: 'result'; runId: number; result: LabResult }
  | { type: 'error'; runId: number; message: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { runId, labId, params } = event.data;
  const onProgress = (fraction: number, status: string) => {
    const msg: WorkerResponse = { type: 'progress', runId, fraction, status };
    self.postMessage(msg);
  };

  try {
    let result: LabResult;
    switch (labId) {
      case 'VortexBlowup':
        result = runVortexBlowup(params as VortexParams, onProgress);
        break;
      case 'ZetaZero':
        result = runZetaZero(params as ZetaParams, onProgress);
        break;
      case 'GoldbachSieves':
        result = runGoldbachSieves(params as GoldbachParams, onProgress);
        break;
      case 'PvsNPWitness':
        result = runPvsNPWitness(params as SatParams, onProgress);
        break;
      case 'YangMillsGap':
        result = runYangMillsGap(params as YangMillsParams, onProgress);
        break;
      case 'HodgeCycles':
        result = runHodgeCycles(params as HodgeParams, onProgress);
        break;
      default:
        throw new Error(`Unknown lab: ${String(labId)}`);
    }
    const msg: WorkerResponse = { type: 'result', runId, result };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerResponse = {
      type: 'error',
      runId,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
