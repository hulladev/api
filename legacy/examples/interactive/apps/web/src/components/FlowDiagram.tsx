export type FlowNode = {
  label: string
  detail: string
  lane: 'browser' | 'generated' | 'server' | 'data'
  tone?: 'active' | 'muted' | 'accent'
}

export type FlowLink = {
  label: string
  detail?: string
  kind?: 'forward' | 'return' | 'blocked'
}

export function FlowDiagram({
  title,
  nodes,
  links,
}: {
  title: string
  nodes: readonly FlowNode[]
  links: readonly FlowLink[]
}) {
  return (
    <figure className="flow-diagram">
      <figcaption>
        <span>Relationship view</span>
        <strong>{title}</strong>
      </figcaption>
      <div className="flow-diagram-stack">
        {nodes.map((node, index) => (
          <div className="flow-diagram-segment" key={`${node.lane}-${node.label}`}>
            <article className={`flow-node ${node.tone ?? 'active'}`}>
              <span>{node.lane}</span>
              <strong>{node.label}</strong>
              <p>{node.detail}</p>
            </article>
            {links[index] ? (
              <div className={`flow-link ${links[index].kind ?? 'forward'}`}>
                <i>{links[index].kind === 'blocked' ? '×' : links[index].kind === 'return' ? '↕' : '↓'}</i>
                <span>
                  <strong>{links[index].label}</strong>
                  {links[index].detail ? <small>{links[index].detail}</small> : null}
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </figure>
  )
}
