/**
 * Pivot worker entry point.
 *
 * This file is imported via Vite's ?worker syntax.
 * The default export is required by Vite's worker handling.
 */

import { createWorkerEntry } from '@lynellf/tablekit-worker';

// Create the worker entry point
const _entry = createWorkerEntry();

// Note: The worker uses the same aggregator registry as the main thread.
// Custom aggregators should be registered via the AggregatorRegistration interface:
// entry.registerAggregators({
//   name: 'weightedAvg',
//   fn: { init(), accumulate(), merge(), finalize() }
// });

// Vite's ?worker import requires a default export
// The worker is now listening for messages from the main thread
export default {};
