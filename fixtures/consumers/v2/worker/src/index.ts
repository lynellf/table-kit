/**
 * @fixture/tablekit-worker-consumer
 *
 * Minimal consumer fixture that verifies the worker public surface
 * is importable from packed artifacts.
 */

import { VERSION } from '@lynellf/tablekit-worker';

// Verify version
const _version: string = VERSION;

console.log('✓ Worker public surface verified');
console.log('✓ Fixture imports resolved from packed artifacts');
