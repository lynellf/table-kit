import type { Announcer, CellPosition, SliceChange, TabBehavior } from '@lynellf/tablekit-core';
import type { DataVersion } from '@lynellf/tablekit-core/dataSource';
import type {
  AggregationEngine,
  PivotConfig,
  PivotExpansionState,
  PivotLeafColumn,
  PivotRowNode,
  PivotSortingState,
  PivotTableState,
} from '@lynellf/tablekit-pivot';
import type { ReactNode } from 'react';
import type { MessagesMap } from './messages';

export interface PivotGridValueContext<TRow> {
  value: unknown;
  row: PivotRowNode<TRow> | null;
  leaf: PivotLeafColumn<TRow>;
  isGrandTotal: boolean;
}

export interface PivotGridProps<TRow> {
  data: TRow[];
  pivot: PivotConfig<TRow> | ((options: { data: TRow[] }) => PivotConfig<TRow>);
  engine?: AggregationEngine<TRow>;
  getRowId?: (row: TRow, index: number) => string;
  dataVersion?: DataVersion<TRow>;
  initialState?: Partial<PivotTableState>;
  state?: Partial<PivotTableState>;
  onPivotChange?: SliceChange<PivotConfig<TRow>>;
  onExpandedChange?: SliceChange<PivotExpansionState>;
  onPivotSortingChange?: SliceChange<PivotSortingState>;
  onFocusedCellChange?: SliceChange<CellPosition | null>;
  onStateChange?: SliceChange<PivotTableState>;
  announcer?: Announcer;
  messages?: Partial<MessagesMap>;
  tabBehavior?: TabBehavior;
  height?: number;
  width?: number;
  rowHeight?: number;
  rowHeaderWidth?: number;
  overscanRows?: number;
  overscanColumns?: number;
  className?: string;
  'aria-label'?: string;
  loadingContent?: ReactNode;
  emptyContent?: ReactNode;
  errorContent?: (error: Error) => ReactNode;
  renderValue?: (context: PivotGridValueContext<TRow>) => ReactNode;
}
