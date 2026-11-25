import React from 'react';
import type { LabResult } from '../engines/types';

export function TelemetryPanel({
  result,
  onExportJson,
  onExportCsv,
  onCopyUrl,
}: {
  result: LabResult | null;
  onExportJson: () => void;
  onExportCsv: () => void;
  onCopyUrl: () => void;
}) {
  if (!result) {
    return (
      <aside className="telemetry-panel">
        <h2>Telemetry &amp; Invariants</h2>
        <p className="muted">Run a laboratory to inspect live numerical invariants and verification checks.</p>
      </aside>
    );
  }

  return (
    <aside className="telemetry-panel">
      <div className="panel-section">
        <h2>Mathematical Invariants</h2>
        <div className="inv-list">
          {result.invariants.map((inv) => (
            <div key={inv.name} className={`inv-row ${inv.passed ? 'pass' : 'warn'}`}>
              <div className="inv-head">
                <span className="inv-badge">{inv.passed ? 'PASS' : 'CHECK'}</span>
                <span className="inv-name">{inv.name}</span>
              </div>
              <div className="inv-vals">
                <code>{inv.value}</code>
                <span className="muted">target: {inv.target}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <h2>Live Telemetry ({result.elapsedMs.toFixed(1)} ms)</h2>
        <table className="kv-table">
          <tbody>
            {Object.entries(result.summary).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel-section">
        <h2>Export &amp; Reproducibility</h2>
        <div className="btn-row">
          <button onClick={onExportJson}>Export JSON</button>
          <button onClick={onExportCsv}>Export CSV</button>
          <button onClick={onCopyUrl}>Share URL</button>
        </div>
      </div>

      <div className="panel-section">
        <h2>Mathematical Notes</h2>
        <ul className="notes-list">
          {result.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </div>
    </aside>
  );
}
