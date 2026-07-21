import type {
  Announcer,
  CellPosition,
  ColumnDef,
  ColumnFilterItem,
  ColumnPinningState,
  ColumnResizeSession,
  ColumnSizingState,
  RowSelectionState as CoreRowSelectionState,
  DataTableState,
  PaginationState,
  RowIdAccessor,
  SliceChange,
  SortItem,
  TabBehavior,
} from '@lynellf/tablekit-core';
import type { DataSource, DataVersion } from '@lynellf/tablekit-core/dataSource';
import type { ReactNode, Ref, SyntheticEvent } from 'react';
import type { MessagesMap } from './messages';

export type RowSelectionState = CoreRowSelectionState;
export type RowSelectionMode = 'none' | 'single' | 'multiple';

export interface DataGridHandle<TRow> {
  getSelectedRowIds(): string[];
  getSelectedRows(): TRow[];
}

export interface DataGridRowEvent<TRow> {
  rowId: string;
  row: TRow;
  nativeEvent: SyntheticEvent<HTMLDivElement>;
}

export interface DataGridCellEvent<TRow> extends DataGridRowEvent<TRow> {
  columnId: string;
  value: unknown;
}

interface DataGridCommonProps<TRow> {
  ref?: Ref<DataGridHandle<TRow>>;
  columns: Array<ColumnDef<TRow, unknown>>;
  getRowId?: RowIdAccessor<TRow>;
  initialState?: Partial<DataTableState>;
  state?: Partial<DataTableState>;
  onSortingChange?: SliceChange<SortItem[]>;
  onColumnFiltersChange?: SliceChange<ColumnFilterItem[]>;
  onPaginationChange?: SliceChange<PaginationState>;
  onColumnOrderChange?: SliceChange<string[]>;
  onColumnVisibilityChange?: SliceChange<Record<string, boolean>>;
  onColumnPinningChange?: SliceChange<ColumnPinningState>;
  onColumnSizingChange?: SliceChange<ColumnSizingState>;
  onColumnSizingInfoChange?: SliceChange<ColumnResizeSession | null>;
  onFocusedCellChange?: SliceChange<CellPosition | null>;
  onStateChange?: SliceChange<DataTableState>;
  dataVersion?: DataVersion<TRow>;
  announcer?: Announcer;
  messages?: Partial<MessagesMap>;
  navigationMode?: 'cell' | 'row' | 'none';
  tabBehavior?: TabBehavior;
  rowSelectionMode?: RowSelectionMode;
  rowSelection?: RowSelectionState;
  defaultRowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  onRowClick?: (event: DataGridRowEvent<TRow>) => void;
  onRowDoubleClick?: (event: DataGridRowEvent<TRow>) => void;
  onCellClick?: (event: DataGridCellEvent<TRow>) => void;
  onCellDoubleClick?: (event: DataGridCellEvent<TRow>) => void;
  height?: number;
  width?: number;
  rowHeight?: number;
  overscanRows?: number;
  overscanColumns?: number;
  pageSizeOptions?: number[];
  enableColumnResize?: boolean;
  className?: string;
  'aria-label'?: string;
  loadingContent?: ReactNode;
  emptyContent?: ReactNode;
  errorContent?: (error: Error) => ReactNode;
}

type ClientDataGridProps<TRow> = DataGridCommonProps<TRow> & {
  rows: TRow[];
  dataSource?: never;
};

type ServerDataGridProps<TRow> = DataGridCommonProps<TRow> & {
  rows?: never;
  dataSource: DataSource<TRow>;
};

export type DataGridProps<TRow> = ClientDataGridProps<TRow> | ServerDataGridProps<TRow>;
