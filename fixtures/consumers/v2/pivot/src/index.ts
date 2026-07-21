/**
 * @fixture/tablekit-pivot-consumer
 *
 * Minimal consumer fixture that verifies the pivot public surface
 * is importable from packed artifacts.
 */

import {
  VERSION,
  createPivotTable,
  getAggregator,
  registerAggregator,
  sumAggregator,
} from '@lynellf/tablekit-pivot';

import type {
  Aggregator,
  PivotConfig,
  PivotLeafColumn,
  PivotResult,
  PivotTableInstance,
  PivotTableOptions,
} from '@lynellf/tablekit-pivot';

// Verify version
const _version: string = VERSION;

interface Row {
  id: string;
  region: string;
  product: string;
  amount: number;
}

const config: PivotConfig<Row> = {
  rows: ['region'],
  columns: ['product'],
  measures: [
    {
      id: 'total',
      field: 'amount',
      aggregator: 'sum',
      label: 'Total Amount',
    },
  ],
};

const options: PivotTableOptions<Row> = {
  data: [
    { id: '1', region: 'North', product: 'A', amount: 100 },
    { id: '2', region: 'South', product: 'B', amount: 200 },
  ],
  pivot: config,
};

const table: PivotTableInstance<Row> = createPivotTable(options);
const _state = table.getState();

// Verify resize commands exist
table.startResize('column-id', 100);
table.adjustResize(50);
table.commitResize();
table.cancelResize();

// Verify result
const _result: PivotResult<Row> = table.getResult();
const _leaves: PivotLeafColumn<Row>[] = table.getLeafColumns();

// Verify aggregator registry
const _agg: Aggregator = sumAggregator;
registerAggregator('custom', sumAggregator);
const _retrieved = getAggregator('sum');

// Verify announcer
table.announce('test message');

console.log('✓ Pivot public surface verified');
console.log('✓ Resize commands (F0.3) verified');
console.log('✓ Fixture imports resolved from packed artifacts');
