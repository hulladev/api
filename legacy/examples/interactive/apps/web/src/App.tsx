import { Flow } from './pages/Flow'

export function App() {
  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="brand" href="#top" aria-label="@hulla/api interactive example home">
          <span className="brand-mark">@</span>
          <span>
            @hulla/api
            <small>Signal desk / 2026</small>
          </span>
        </a>
        <nav aria-label="Learning path shortcuts">
          <a href="#router">Routers</a>
          <a href="#plugins">Plugins</a>
          <a href="#openapi">Existing APIs</a>
          <a href="#backend">Backend</a>
          <a href="#cache">State</a>
        </nav>
        <div className="connection-state">
          <span /> localhost:3001
        </div>
      </header>
      <Flow />
      <footer className="site-footer">
        <span>@hulla/api / interactive example</span>
        <span>Types travel. Boilerplate doesn’t.</span>
      </footer>
    </div>
  )
}
