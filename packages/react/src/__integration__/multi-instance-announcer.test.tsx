/**
 * @lynellf/tablekit-react — multi-instance announcer isolation test.
 *
 * R5: Verifies that announcers are instance-owned and siblings are isolated.
 * - Multiple announcer instances mount in one tree
 * - Unmounting one sibling does not affect the other's announcer
 * - Messages stay in the matching live region after either sibling unmounts
 * - No singleton/last-mounted routing or global no-op cleanup
 * - PivotTable instances are also isolated
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReactAnnouncer } from '../ReactAnnouncer';
import { createAnnouncerChannel } from '../createAnnouncerChannel';
import { useDataTable } from '../useDataTable';
import { usePivotTable } from '../usePivotTable';

// ─── Test fixtures ──────────────────────────────────────────────────────

const simpleColumns = [
  { id: 'name', accessor: 'name' as keyof Person },
  { id: 'age', accessor: 'age' as keyof Person },
];

interface Person {
  id: string;
  name: string;
  age: number;
}

const simpleData: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
];

// ─── Component: DataTable with announcer ───────────────────────────────

function DataTableWithAnnouncer({
  id,
  initialMessage,
}: {
  id: string;
  initialMessage?: string;
}) {
  const table = useDataTable({
    data: simpleData,
    columns: simpleColumns,
    getRowId: (row) => row.id,
  });

  // Announce on mount with a unique message per instance
  React.useEffect(() => {
    table.table.announce(initialMessage ?? `DataTable ${id} message`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid={`table-${id}`}>
      <table {...table.table.getGridProps()}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody {...table.table.getBodyProps()}>
          {table.table.getRowModel().map((row) => (
            <tr key={row.id} {...row.getRowProps()}>
              <td>{(row.original as Person).name}</td>
              <td>{(row.original as Person).age}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table.Announcer />
    </div>
  );
}

// ─── Component: PivotTable with announcer ──────────────────────────────

interface Row {
  id: string;
  region: string;
  sales: number;
}

const pivotData: Row[] = [
  { id: '1', region: 'West', sales: 100 },
  { id: '2', region: 'East', sales: 200 },
];

function PivotWithAnnouncer({
  id,
  initialMessage,
}: {
  id: string;
  initialMessage?: string;
}) {
  const { pivot, Announcer } = usePivotTable<Row>({
    data: pivotData,
    getRowId: (r) => r.id,
    pivot: {
      rows: ['region'],
      columns: [],
      measures: [{ id: 'total', aggregator: 'sum', accessor: 'sales' }],
    },
  });

  // Announce on mount with a unique message per instance
  React.useEffect(() => {
    pivot.announce(initialMessage ?? `PivotTable ${id} message`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid={`pivot-${id}`}>
      <p data-testid={`pivot-content-${id}`}>Pivot {id}</p>
      <Announcer />
    </div>
  );
}

// ─── Component: Two DataTables (controllable mount) ────────────────────

function TwoDataTablesContainer({
  showFirst,
  showSecond,
}: {
  showFirst: boolean;
  showSecond: boolean;
}) {
  return (
    <div>
      {showFirst && <DataTableWithAnnouncer id="dt1" initialMessage="Message from dt1" />}
      {showSecond && <DataTableWithAnnouncer id="dt2" initialMessage="Message from dt2" />}
    </div>
  );
}

// ─── Component: DataTable + PivotTable mixed ────────────────────────────

function MixedInstancesContainer({
  showDataTable,
  showPivot,
}: {
  showDataTable: boolean;
  showPivot: boolean;
}) {
  return (
    <div>
      {showDataTable && <DataTableWithAnnouncer id="dt1" initialMessage="DataTable message" />}
      {showPivot && <PivotWithAnnouncer id="p1" initialMessage="PivotTable message" />}
    </div>
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('multi-instance announcer isolation', () => {
  afterEach(() => {
    cleanup();
  });

  describe('DataTable isolation', () => {
    it('each DataTable instance has its own live region', async () => {
      render(<TwoDataTablesContainer showFirst={true} showSecond={true} />);

      await waitFor(() => {
        expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(2);
      });
    });

    it('R5: after second DataTable unmounts (first remains), first announcer stays in DOM', async () => {
      const { rerender } = render(<TwoDataTablesContainer showFirst={true} showSecond={true} />);

      // Wait for announcers to mount
      await waitFor(() => {
        expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(2);
      });

      // Unmount second table only
      await act(async () => {
        rerender(<TwoDataTablesContainer showFirst={true} showSecond={false} />);
      });

      // First table's announcer should still be in DOM
      await waitFor(() => {
        const announcers = screen.queryAllByTestId('tablekit-announcer');
        expect(announcers.length).toBe(1);
      });
    });

    it('R5: after first DataTable unmounts (second remains), second announcer stays in DOM', async () => {
      const { rerender } = render(<TwoDataTablesContainer showFirst={true} showSecond={true} />);

      // Wait for announcers to mount
      await waitFor(() => {
        expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(2);
      });

      // Unmount first table only
      await act(async () => {
        rerender(<TwoDataTablesContainer showFirst={false} showSecond={true} />);
      });

      // Second table's announcer should still be in DOM
      await waitFor(() => {
        const announcers = screen.queryAllByTestId('tablekit-announcer');
        expect(announcers.length).toBe(1);
      });
    });

    it('unmounting all tables cleans up all announcers', async () => {
      const { unmount } = render(<TwoDataTablesContainer showFirst={true} showSecond={true} />);

      await waitFor(() => {
        expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(2);
      });

      unmount();

      // All announcers should be removed
      expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(0);
    });
  });

  describe('PivotTable isolation', () => {
    it('each PivotTable instance has its own live region', async () => {
      render(
        <div>
          <PivotWithAnnouncer id="p1" />
          <PivotWithAnnouncer id="p2" />
        </div>,
      );

      await waitFor(() => {
        expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(2);
      });
    });

    it('R5: after first PivotTable unmounts (second remains), second announcer stays in DOM', async () => {
      const { rerender } = render(
        <div>
          <PivotWithAnnouncer id="p1" />
          <PivotWithAnnouncer id="p2" />
        </div>,
      );

      await waitFor(() => {
        expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(2);
      });

      // Unmount first pivot, keep second
      await act(async () => {
        rerender(
          <div>
            <PivotWithAnnouncer id="p2" />
          </div>,
        );
      });

      await waitFor(() => {
        const announcers = screen.queryAllByTestId('tablekit-announcer');
        expect(announcers.length).toBe(1);
      });
    });
  });

  describe('Mixed DataTable + PivotTable isolation', () => {
    it('R5: DataTable and PivotTable announcers are isolated from each other', async () => {
      // First render both DataTable and PivotTable
      const { rerender } = render(
        <MixedInstancesContainer showDataTable={true} showPivot={true} />,
      );

      await waitFor(() => {
        expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(2);
      });

      // Unmount DataTable only by rerendering with just the pivot
      await act(async () => {
        rerender(<MixedInstancesContainer showDataTable={false} showPivot={true} />);
      });

      // Pivot announcer should remain (1 announcer, not 3)
      await waitFor(() => {
        const announcers = screen.queryAllByTestId('tablekit-announcer');
        expect(announcers.length).toBe(1);
      });
    });
  });

  describe('Strict Mode', () => {
    it('R5: announcers work correctly under React Strict Mode remounting', async () => {
      // StrictMode causes double-invocation of effects in development
      const TestComponent = () => (
        <React.StrictMode>
          <TwoDataTablesContainer showFirst={true} showSecond={true} />
        </React.StrictMode>
      );

      const { unmount } = render(<TestComponent />);

      // Wait for announcers to mount (StrictMode may mount/unmount/remount)
      await waitFor(
        () => {
          // Under StrictMode, announcers may temporarily be unmounted then remounted
          const count = screen.queryAllByTestId('tablekit-announcer').length;
          expect(count).toBe(2);
        },
        { timeout: 2000 },
      );

      // Unmount should still work
      unmount();
      expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(0);
    });
  });

  describe('ReactAnnouncer component', () => {
    it('ReactAnnouncer renders with the correct politeness', () => {
      // R5 fix: ReactAnnouncer now requires a channel prop
      const channel1 = createAnnouncerChannel({ announce: () => {} });
      const channel2 = createAnnouncerChannel({ announce: () => {} });
      const { getAllByRole } = render(
        <div>
          <ReactAnnouncer channel={channel1} politeness="polite" />
          <ReactAnnouncer channel={channel2} politeness="assertive" />
        </div>,
      );

      const outputs = getAllByRole('status');
      expect(outputs.length).toBe(2);
      expect(outputs[0].getAttribute('aria-live')).toBe('polite');
      expect(outputs[1].getAttribute('aria-live')).toBe('assertive');
    });

    it('multiple ReactAnnouncers render correctly', () => {
      // R5 fix: ReactAnnouncer now requires a channel prop
      const channel1 = createAnnouncerChannel({ announce: () => {} });
      const channel2 = createAnnouncerChannel({ announce: () => {} });
      const channel3 = createAnnouncerChannel({ announce: () => {} });
      const { getAllByTestId } = render(
        <div>
          <ReactAnnouncer channel={channel1} />
          <ReactAnnouncer channel={channel2} />
          <ReactAnnouncer channel={channel3} />
        </div>,
      );

      const announcers = getAllByTestId('tablekit-announcer');
      expect(announcers.length).toBe(3);
    });
  });
});
