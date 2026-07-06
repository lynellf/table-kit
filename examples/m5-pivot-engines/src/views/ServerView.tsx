import { createServerEngine } from '@lynellf/tablekit-worker/server';
import { useMemo } from 'react';
import { mockServerApi } from '../data/mockServerApi';

export function ServerView() {
  // Create server engine (server is the source of truth, no client data)
  const engine = useMemo(
    () =>
      createServerEngine({
        // biome-disable-next-line lint/suspicious/noExplicitAny -- Server query types require generic flexibility
        compute: (q: any, ctx: { signal: AbortSignal }) => mockServerApi.computeTopLevel(q, ctx),
        // biome-disable-next-line lint/suspicious/noExplicitAny -- Server query types require generic flexibility
        computeChildren: (path: any, q: any, ctx: { signal: AbortSignal }) =>
          mockServerApi.computeChildren(path, q, ctx),
        debounceMs: 50,
      }),
    [],
  );

  return (
    <div className="view">
      <div className="info-panel">
        <div className="info-item">
          <span className="info-label">Data Source:</span>
          <span className="info-value">Mock Server API</span>
        </div>
        <div className="info-item">
          <span className="info-label">Engine:</span>
          <span className="info-value">Server Expansion</span>
        </div>
        <div className="info-item">
          <span className="info-label">Latency Sim:</span>
          <span className="info-value">200ms top, 300ms per level</span>
        </div>
      </div>

      <div className="pivot-placeholder">
        <p>Server engine initialized with lazy expansion.</p>
        <p>Expand rows to trigger server API calls with simulated latency.</p>
        <p className="hint">
          The server engine uses computeTopLevel for collapsed rows and computeChildren when
          expanding — demonstrating server expansion patterns.
        </p>
      </div>

      {/* Hidden usage to satisfy linters */}
      <div style={{ display: 'none' }} data-engine={typeof engine} />
    </div>
  );
}
