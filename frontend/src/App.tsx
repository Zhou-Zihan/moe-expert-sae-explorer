import { DataPanel } from './panels/DataPanel';
import { ExpertActivationPanel } from './panels/ExpertActivationPanel';
import { ExpertContextsPanel } from './panels/ExpertContextsPanel';
import { ProjectionPanel } from './panels/ProjectionPanel';
import { SaeFeaturesPanel } from './panels/SaeFeaturesPanel';

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>?</h1>
      </header>

      <div className="workspace">
        <DataPanel />

        <main className="main-area" aria-label="Analysis views">
          <div className="main-row">
            <ProjectionPanel />
            <ExpertActivationPanel />
          </div>
          <div className="main-row">
            <ExpertContextsPanel />
            <SaeFeaturesPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
