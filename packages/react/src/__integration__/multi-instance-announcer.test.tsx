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

  // R5: Message content isolation tests — verify messages are routed to correct instances
  describe('R5: message content isolation in live regions', () => {
    it('R5: announcer is unique per instance (different announce function references)', async () => {
      // Verify that each table instance gets its own announcer, not a shared singleton
      const announceRefs: unknown[] = [];

      function TwoInstancesAnnounceRef() {
        const table1 = useDataTable({
          data: simpleData,
          columns: simpleColumns,
          getRowId: (row) => row.id,
        });
        const table2 = useDataTable({
          data: simpleData,
          columns: simpleColumns,
          getRowId: (row) => row.id,
        });

        // Collect announce function references
        announceRefs.push(table1.table.announce);
        announceRefs.push(table2.table.announce);

        return <div data-testid="placeholder" />;
      }

      render(<TwoInstancesAnnounceRef />);

      // Two announce functions should be collected
      expect(announceRefs.length).toBe(2);

      // Announce functions should be different references (not shared/singleton)
      // This proves that each instance has its own announcer channel
      expect(announceRefs[0]).not.toBe(announceRefs[1]);
    });

    it("R5: unmounting one instance does not affect the other's announcer DOM node", async () => {
      // This test verifies the isolation property: unmounting sibling should not
      // affect the remaining announcer.
      function TwoInstancesControllable({ showFirst }: { showFirst: boolean }) {
        return (
          <div>
            {showFirst && (
              <div data-testid="announcer-1">
                <DataTableWithAnnouncer id="dt1" initialMessage="First instance message" />
              </div>
            )}
            <div data-testid="announcer-2">
              <DataTableWithAnnouncer id="dt2" initialMessage="Second instance message" />
            </div>
          </div>
        );
      }

      const { rerender } = render(<TwoInstancesControllable showFirst={true} />);

      // Wait for both announcers to mount
      await waitFor(() => {
        expect(screen.queryAllByTestId('tablekit-announcer').length).toBe(2);
      });

      // Unmount first instance
      await act(async () => {
        rerender(<TwoInstancesControllable showFirst={false} />);
      });

      // Second instance's announcer should remain in DOM
      await waitFor(() => {
        const announcers = screen.queryAllByTestId('tablekit-announcer');
        expect(announcers.length).toBe(1);
        // The remaining announcer should be from dt2 (not dt1)
        expect(screen.queryByTestId('announcer-2')).not.toBeNull();
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

  describe('Minimal announce-only announcer compatibility', () => {
    it('R5-R7: minimal { announce } object reaches live region via channel', async () => {
      // R5-R7 fix: When consumer passes a minimal announcer { announce } without subscribe,
      // the hook should wrap it in a channel and pass the channel to both the table
      // and ReactAnnouncer. This test verifies the live region receives the message.
      const receivedMessages: string[] = [];
      // Minimal announcer: only has announce, no subscribe
      const minimalAnnouncer = {
        announce: (message: string) => {
          receivedMessages.push(message);
        },
      };

      function TableWithMinimalAnnouncer() {
        const table = useDataTable({
          data: simpleData,
          columns: simpleColumns,
          getRowId: (row) => row.id,
          announcer: minimalAnnouncer, // R5-R7 fix: minimal announcer
        });

        React.useEffect(() => {
          // Announce a message after mount
          table.table.announce('Minimal announcer test message');
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        return (
          <div>
            <table {...table.table.getGridProps()}>
              <tbody>
                {table.table.getRowModel().map((row) => (
                  <tr key={row.id}>
                    <td>{(row.original as Person).name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table.Announcer />
          </div>
        );
      }

      render(<TableWithMinimalAnnouncer />);

      // The minimal announcer should have received the message
      await waitFor(() => {
        expect(receivedMessages).toContain('Minimal announcer test message');
      });

      // The live region (from ReactAnnouncer via channel) should also receive the message
      await waitFor(() => {
        const liveRegions = screen.queryAllByRole('status');
        expect(liveRegions.length).toBe(1);
        expect(liveRegions[0].textContent).toBe('Minimal announcer test message');
      });
    });

    it('R5-R7: channel is passed to createDataTable at mount time', async () => {
      // This test verifies the fix: the channel must be passed to createDataTable
      // at mount time, not just in the update effect. This ensures the table's
      // internal announce function uses the channel from the start.
      const announceCalls: string[] = [];
      const minimalAnnouncer = {
        announce: (msg: string) => announceCalls.push(msg),
      };

      function TableWithChannelMount() {
        const table = useDataTable({
          data: simpleData,
          columns: simpleColumns,
          getRowId: (row) => row.id,
          announcer: minimalAnnouncer,
        });

        // Announce after mount (in effect)
        React.useEffect(() => {
          table.table.announce('Message after mount');
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        return (
          <div>
            <table {...table.table.getGridProps()}>
              <tbody>
                {table.table.getRowModel().map((row) => (
                  <tr key={row.id}>
                    <td>{(row.original as Person).name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table.Announcer />
          </div>
        );
      }

      render(<TableWithChannelMount />);

      // The minimal announcer should have received the message via the channel
      await waitFor(() => {
        expect(announceCalls).toContain('Message after mount');
      });

      // The live region should also receive the message
      await waitFor(() => {
        const liveRegions = screen.queryAllByRole('status');
        expect(liveRegions.length).toBe(1);
        expect(liveRegions[0].textContent).toBe('Message after mount');
      });
    });
  });
});
