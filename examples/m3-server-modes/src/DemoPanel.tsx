/** @jsxImportSource react */
import { useDataTable } from '@lynellf/tablekit-react';
import { createFakeServer } from './fakeServer';

export const DemoPanel = ({
  scenario,
}: {
  scenario: 'pagination' | 'sort' | 'filter' | 'mixed';
}) => {
  // Each scenario configures the data source capabilities differently.
  const source = createFakeServer({ delayMs: 300 });

  // For the "mixed" scenario, we override capabilities to paginate: server + sort: client.
  const effectiveSource =
    scenario === 'mixed'
      ? {
          ...source,
          capabilities: {
            sort: 'client' as const,
            filter: 'client' as const,
            paginate: 'server' as const,
          },
        }
      : source;

  const { table, dataSourceState, Announcer } = useDataTable({
    data: [],
    columns: [
      { id: 'id', accessor: 'id' },
      { id: 'name', accessor: 'name' },
      {
        id: 'region',
        accessor: 'region',
        enableFiltering: true,
        filterFn: 'equalsString',
      },
      {
        id: 'sales',
        accessor: 'sales',
        enableSorting: true,
        enableFiltering: true,
        filterFn: 'inNumberRange',
      },
    ],
    dataSource: effectiveSource,
    allowWithinPageOperations: scenario === 'mixed' ? false : undefined,
  });

  return (
    <div>
      <Announcer />
      <p>
        Status: <strong>{dataSourceState?.status}</strong>
      </p>
      <div {...table.getGridProps()} className="grid">
        <div {...table.getHeaderGroupProps()} className="header">
          {table.getHeaderGroups()[0]?.headers.map((h) => (
            <div key={h.id} {...h.getHeaderProps()} className="cell header-cell">
              {String(h.column.def.header ?? h.id)}
            </div>
          ))}
        </div>
        <div {...table.getBodyProps()} className="body">
          {table.getRowModel().map((row) => (
            <div key={row.id} {...row.getRowProps()} className="row">
              {row.getVisibleCells().map((c) => (
                <div key={c.id} {...c.getCellProps()} className="cell">
                  {row.isPlaceholder ? <span className="skeleton" /> : String(c.getValue())}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
