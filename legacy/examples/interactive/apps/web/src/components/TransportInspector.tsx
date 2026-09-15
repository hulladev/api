import { useSyncExternalStore } from 'react'
import { getTraceSnapshot, subscribeTrace } from '../api/runtime'

export function TransportInspector({
  path,
  method,
  enabled = true,
}: {
  path?: string
  method?: string
  enabled?: boolean
}) {
  const events = useSyncExternalStore(subscribeTrace, getTraceSnapshot)
  const latest = enabled
    ? events.find((event) => (!path || event.path === path) && (!method || event.method === method))
    : undefined

  return (
    <aside className="transport-inspector">
      <header>
        <div>
          <p className="micro-label">Actual transport capture</p>
          <h2>Request / response</h2>
        </div>
        <span className={latest?.state === 'sending' ? 'status-dot hot' : 'status-dot'} />
      </header>

      {latest ? (
        <div className="transport-pair" aria-live="polite">
          <section className="transport-message request-message">
            <div className="message-label">
              <span>01 / client sends</span>
              <b>{latest.method}</b>
            </div>
            <code>{latest.path}</code>
            <div className="payload-heading">
              <span>JSON body</span>
              <small>{byteCount(latest.body)} bytes</small>
            </div>
            <pre>{pretty(latest.body) || 'No request body'}</pre>
          </section>

          <div className="transport-arrow" aria-hidden="true">
            <span>→</span>
            <small>HTTP</small>
          </div>

          <section className="transport-message response-message">
            <div className="message-label">
              <span>02 / server returns</span>
              <b>{latest.status ?? '…'}</b>
            </div>
            <code>{latest.status && latest.status < 400 ? 'Validated output' : 'Structured error'}</code>
            <div className="payload-heading">
              <span>JSON response</span>
              <small>{latest.durationMs == null ? 'in flight' : `${latest.durationMs} ms`}</small>
            </div>
            <pre>{pretty(latest.response) || 'Waiting for response…'}</pre>
          </section>
        </div>
      ) : (
        <div className="transport-empty">
          <span>↗</span>
          <strong>No exchange captured yet</strong>
          <p>Use the live demo beside this panel. The exact request and response will be held here for inspection.</p>
        </div>
      )}

      <div className="transport-legend">
        <span>
          <i className="client-legend" /> Client request sent as standard HTTP
        </span>
        <span>
          <i className="server-legend" /> Response returned after server output validation
        </span>
      </div>
    </aside>
  )
}

function pretty(value: string | null) {
  if (!value) return ''
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function byteCount(value: string | null) {
  return value ? new TextEncoder().encode(value).byteLength : 0
}
