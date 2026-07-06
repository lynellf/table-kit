import { useState } from 'react';
import { ServerView } from './views/ServerView';
import { WorkerView } from './views/WorkerView';

type Tab = 'worker' | 'server';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('worker');

  return (
    <div className="app">
      <header>
        <h1>M5 Pivot Engines</h1>
        <nav className="tabs">
          <button
            type="button"
            className={`tab ${activeTab === 'worker' ? 'active' : ''}`}
            onClick={() => setActiveTab('worker')}
          >
            Worker Engine
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'server' ? 'active' : ''}`}
            onClick={() => setActiveTab('server')}
          >
            Server Engine
          </button>
        </nav>
      </header>
      <main>{activeTab === 'worker' ? <WorkerView /> : <ServerView />}</main>
    </div>
  );
}
