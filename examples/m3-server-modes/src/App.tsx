/** @jsxImportSource react */
import { useState } from 'react';
import { DemoPanel } from './DemoPanel';
import { PerfBadge } from './PerfBadge';
import './styles.css';

type Tab = 'pagination' | 'sort' | 'filter' | 'mixed' | 'perf';

export const App = () => {
  const [tab, setTab] = useState<Tab>('pagination');
  return (
    <div className="app">
      <nav>
        <button
          type="button"
          data-active={tab === 'pagination'}
          onClick={() => setTab('pagination')}
        >
          Server pagination
        </button>
        <button type="button" data-active={tab === 'sort'} onClick={() => setTab('sort')}>
          Server sort
        </button>
        <button type="button" data-active={tab === 'filter'} onClick={() => setTab('filter')}>
          Server filter
        </button>
        <button type="button" data-active={tab === 'mixed'} onClick={() => setTab('mixed')}>
          Mixed-mode trap
        </button>
        <button type="button" data-active={tab === 'perf'} onClick={() => setTab('perf')}>
          §12 perf budget
        </button>
      </nav>
      <main>
        {tab === 'pagination' && <DemoPanel scenario="pagination" />}
        {tab === 'sort' && <DemoPanel scenario="sort" />}
        {tab === 'filter' && <DemoPanel scenario="filter" />}
        {tab === 'mixed' && <DemoPanel scenario="mixed" />}
        {tab === 'perf' && <PerfBadge />}
      </main>
    </div>
  );
};
