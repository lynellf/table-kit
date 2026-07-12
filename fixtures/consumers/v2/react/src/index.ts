import { ReactAnnouncer, getReactAnnouncer } from '@lynellf/tablekit-react';
import type { UseDataTableOptions } from '@lynellf/tablekit-react';

interface Row {
  id: string;
  name: string;
  age: number;
}

// Verify hook options type
const _options: UseDataTableOptions<Row> = {
  data: [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
  ],
  columns: [
    { id: 'name', accessor: 'name' },
    { id: 'age', accessor: 'age', enableSorting: true },
  ],
};

// Verify announcer component can be rendered
const _Announcer = () => {
  return React.createElement(ReactAnnouncer);
};

// Verify getReactAnnouncer returns an announcer interface
const announcer = getReactAnnouncer();
announcer.announce('test message');

// Note: In a real React app, useDataTable would be called inside a component.
// This fixture verifies the types resolve correctly.

console.log('✓ React public surface verified');
console.log('✓ Fixture imports resolved from packed artifacts');
