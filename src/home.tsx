import { GROUPS, TOOLS, type ToolId } from "./catalog.ts"

export function Home({ onOpen }: { onOpen: (tool: ToolId) => void }) {
  return (
    <main className="screen">
      <h1>Free tools</h1>
      <p className="lede">Your files stay in this tab.</p>
      {GROUPS.map((group) => (
        <section key={group} className="group">
          <h2>{group}</h2>
          <div className="tool-list">
            {TOOLS.filter((tool) => tool.group === group).map((tool) => (
              <button key={tool.id} type="button" className="tool-card" onClick={() => onOpen(tool.id)}>
                <strong>{tool.name}</strong>
                <span>{tool.detail}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
