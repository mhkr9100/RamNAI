import React, { useEffect, useState } from 'react';
import { BrainCircuit, Plus, RefreshCw, Save, Shield, ShieldOff, Trash2 } from 'lucide-react';
import type { MemoryFact, UserMapNode } from '@supreme/shared';

interface UserMapPanelProps {
  tree: UserMapNode;
  facts: MemoryFact[];
  busy: boolean;
  onSave: (tree: UserMapNode) => Promise<void>;
  onSync: () => Promise<void>;
}

export function UserMapPanel({ tree, facts, busy, onSave, onSync }: UserMapPanelProps) {
  const [draft, setDraft] = useState<UserMapNode>(tree);

  useEffect(() => {
    setDraft(tree);
  }, [tree]);

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.10),transparent_30%),linear-gradient(135deg,#0c1013,#090b0d)] p-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/42">
              <BrainCircuit size={14} /> UserMap
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white">Tree-first memory editing for a local-first workspace.</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/60">
              UserMap remains a human-readable tree. Automatic memory extraction can add memory-backed nodes, while your manual edits stay in control. Protected branches are never silently overwritten.
            </p>
          </div>
          <div className="grid gap-3">
            {[
              ['Tree Nodes', countNodes(draft)],
              ['Extracted Facts', facts.length],
              ['Protected Nodes', countProtectedNodes(draft)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</div>
                <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Editable Tree</div>
              <div className="mt-2 text-2xl font-semibold text-white">Local structured context</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => setDraft(addChildNode(draft, draft.id))} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><Plus size={14} />Add Branch</button>
              <button type="button" disabled={busy} onClick={() => onSync()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><RefreshCw size={14} />Sync Memories</button>
              <button type="button" disabled={busy} onClick={() => onSave(draft)} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-black transition hover:bg-white/90 disabled:opacity-50"><Save size={14} />Save Tree</button>
            </div>
          </div>
          <div className="space-y-3">
            <TreeNodeEditor node={draft} depth={0} onChange={setDraft} isRoot />
          </div>
        </div>
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="mb-5 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Extracted Memory Facts</div>
          {facts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No memory facts have been extracted yet. Prism chats and finished tasks will start populating this list as the local runtime executes.
            </div>
          ) : (
            <div className="space-y-3">
              {facts.map((fact) => (
                <div key={fact.id} className="rounded-3xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{fact.category}</div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
                      {Math.round(fact.confidence * 100)}%
                    </div>
                  </div>
                  <div className="mt-3 text-base font-semibold text-white">{fact.label}</div>
                  <div className="mt-2 text-sm leading-7 text-white/68">{fact.value}</div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/36">Source · {fact.source}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TreeNodeEditor({ node, depth, onChange, onDelete, isRoot = false }: { node: UserMapNode; depth: number; onChange: (node: UserMapNode) => void; onDelete?: () => void; isRoot?: boolean }) {
  const updateNode = (updater: (current: UserMapNode) => UserMapNode) => {
    onChange(updater(node));
  };

  return (
    <div className="rounded-[28px] border border-white/8 bg-black/20 p-4" style={{ marginLeft: depth * 18 }}>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <input
          value={node.label}
          onChange={(event) => updateNode((current) => ({ ...current, label: event.target.value }))}
          className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
          placeholder="Node label"
        />
        <input
          value={node.value ?? ''}
          onChange={(event) => updateNode((current) => ({ ...current, value: event.target.value }))}
          className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
          placeholder="Optional value"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => updateNode((current) => addChildNode(current, current.id))} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/68 transition hover:border-white/20 hover:text-white"><Plus size={14} /></button>
          <button type="button" onClick={() => updateNode((current) => ({ ...current, protected: !current.protected }))} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/68 transition hover:border-white/20 hover:text-white">{node.protected ? <Shield size={14} /> : <ShieldOff size={14} />}</button>
          {!isRoot && onDelete ? <button type="button" onClick={onDelete} className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-red-100 transition hover:border-red-400/30"><Trash2 size={14} /></button> : null}
        </div>
      </div>
      {node.children.length > 0 ? (
        <div className="mt-4 space-y-3">
          {node.children.map((child) => (
            <TreeNodeEditor
              key={child.id}
              node={child}
              depth={depth + 1}
              onChange={(nextChild) => onChange(replaceNode(node, nextChild))}
              onDelete={() => onChange(removeNode(node, child.id))}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function addChildNode(root: UserMapNode, parentId: string): UserMapNode {
  if (root.id === parentId) {
    return {
      ...root,
      children: [
        ...root.children,
        {
          id: crypto.randomUUID(),
          label: 'New Node',
          value: '',
          nodeType: root.nodeType === 'root' ? 'category' : 'fact',
          source: 'manual',
          children: []
        }
      ]
    };
  }

  return {
    ...root,
    children: root.children.map((child) => addChildNode(child, parentId))
  };
}

function replaceNode(root: UserMapNode, replacement: UserMapNode): UserMapNode {
  if (root.id === replacement.id) {
    return replacement;
  }

  return {
    ...root,
    children: root.children.map((child) => replaceNode(child, replacement))
  };
}

function removeNode(root: UserMapNode, targetId: string): UserMapNode {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== targetId)
      .map((child) => removeNode(child, targetId))
  };
}

function countNodes(node: UserMapNode): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}

function countProtectedNodes(node: UserMapNode): number {
  return (node.protected ? 1 : 0) + node.children.reduce((total, child) => total + countProtectedNodes(child), 0);
}
