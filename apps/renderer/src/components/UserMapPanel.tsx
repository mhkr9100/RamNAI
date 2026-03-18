import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, CopyPlus, Eye, EyeOff, Plus, RefreshCw, Save, Shield, ShieldOff, Trash2 } from 'lucide-react';
import type { MemoryFact, MemoryVisibility, UserMapNode, UserMapState } from '@supreme/shared';

interface UserMapPanelProps {
  tree: UserMapState;
  facts: MemoryFact[];
  busy: boolean;
  onSave: (tree: UserMapState) => Promise<void>;
  onSync: () => Promise<void>;
}

export function UserMapPanel({ tree, facts, busy, onSave, onSync }: UserMapPanelProps) {
  const [draft, setDraft] = useState<UserMapState>(tree);
  const [showFacts, setShowFacts] = useState(false);

  useEffect(() => {
    setDraft(tree);
  }, [tree]);
  const privateFacts = useMemo(() => facts.filter((fact) => fact.visibility === 'private'), [facts]);
  const publicFacts = useMemo(() => facts.filter((fact) => fact.visibility === 'public'), [facts]);

  const replaceTree = (visibility: MemoryVisibility, nextRoot: UserMapNode) => {
    setDraft((current) => ({
      ...current,
      ...(visibility === 'private' ? { privateTree: nextRoot } : { publicTree: nextRoot })
    }));
  };

  const duplicateNodeAcrossTrees = (sourceTree: MemoryVisibility, node: UserMapNode) => {
    const targetTree: MemoryVisibility = sourceTree === 'private' ? 'public' : 'private';
    const duplicated = cloneNodeForVisibility(node, targetTree);
    setDraft((current) => ({
      privateTree: targetTree === 'private' ? appendChild(current.privateTree, duplicated) : current.privateTree,
      publicTree: targetTree === 'public' ? appendChild(current.publicTree, duplicated) : current.publicTree
    }));
  };

  return (
    <div className={`grid gap-4 ${showFacts ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : ''}`}>
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d1012]">
        <header className="h-14 border-b border-white/8 px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex h-14 items-center">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">UserMap</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFacts((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] transition ${
                  showFacts
                    ? 'border-white/12 bg-white text-black'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'
                }`}
              >
                {showFacts ? <EyeOff size={14} /> : <Eye size={14} />}
                Facts
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onSync()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"
              >
                <RefreshCw size={14} />
                Sync
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onSave(draft)}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-white/90 disabled:opacity-50"
              >
                <Save size={14} />
                Save
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-4 px-4 py-4">
          <TreeSection
            title="Private"
            node={draft.privateTree}
            onAdd={() => replaceTree('private', addChildNode(draft.privateTree, draft.privateTree.id, 'New private node'))}
            onChange={(nextRoot) => replaceTree('private', nextRoot)}
            onDuplicateAcrossTrees={(node) => duplicateNodeAcrossTrees('private', node)}
          />
          <TreeSection
            title="Public"
            node={draft.publicTree}
            onAdd={() => replaceTree('public', addChildNode(draft.publicTree, draft.publicTree.id, 'New public node'))}
            onChange={(nextRoot) => replaceTree('public', nextRoot)}
            onDuplicateAcrossTrees={(node) => duplicateNodeAcrossTrees('public', node)}
          />
        </div>
      </section>

      {showFacts ? (
        <aside className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <FactColumn title="Private Facts" facts={privateFacts} />
          <div className="my-4 border-t border-white/8" />
          <FactColumn title="Public Facts" facts={publicFacts} />
        </aside>
      ) : null}
    </div>
  );
}

function TreeSection({
  title,
  node,
  onAdd,
  onChange,
  onDuplicateAcrossTrees
}: {
  title: string;
  node: UserMapNode;
  onAdd: () => void;
  onChange: (node: UserMapNode) => void;
  onDuplicateAcrossTrees: (node: UserMapNode) => void;
}) {
  return (
    <section className="rounded-[28px] border border-white/8 bg-black/20">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">
          <span>{title}</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] text-white/50">
            {countNodes(node)} nodes
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] text-white/50">
            {countProtectedNodes(node)} protected
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
        >
          <Plus size={14} />
          Add
        </button>
      </div>
      <div className="px-4 py-4">
        <TreeNodeEditor
          node={node}
          depth={0}
          onChange={onChange}
          onDuplicateAcrossTrees={onDuplicateAcrossTrees}
          isRoot
        />
      </div>
    </section>
  );
}

function FactColumn({ title, facts }: { title: string; facts: MemoryFact[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{title}</div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">{facts.length}</div>
      </div>
      {facts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-6 text-center text-sm leading-6 text-white/45">
          No facts.
        </div>
      ) : (
        <div className="space-y-2.5">
          {facts.map((fact) => (
            <div key={fact.id} className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{fact.category}</div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{Math.round(fact.confidence * 100)}%</div>
              </div>
              <div className="mt-2 text-sm font-semibold text-white">{fact.label}</div>
              <div className="mt-1 text-sm leading-5 text-white/65">{fact.value}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TreeNodeEditor({
  node,
  depth,
  onChange,
  onDelete,
  onDuplicateAcrossTrees,
  isRoot = false
}: {
  node: UserMapNode;
  depth: number;
  onChange: (node: UserMapNode) => void;
  onDelete?: () => void;
  onDuplicateAcrossTrees?: (node: UserMapNode) => void;
  isRoot?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(node.label);
  const [value, setValue] = useState(node.value ?? '');
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [newChildLabel, setNewChildLabel] = useState('');

  useEffect(() => {
    setLabel(node.label);
    setValue(node.value ?? '');
  }, [node.label, node.value]);

  const handleSave = () => {
    const { value: _discarded, ...rest } = node;
    onChange({
      ...rest,
      label: label.trim() || node.label,
      ...(value.trim() ? { value: value.trim() } : {})
    });
    setIsEditing(false);
  };

  const handleAddChild = () => {
    if (!newChildLabel.trim()) return;
    onChange(addChildNode(node, node.id, newChildLabel.trim()));
    setNewChildLabel('');
    setIsAddingChild(false);
    setIsExpanded(true);
  };

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-white/8 pl-3' : ''}>
      <div className={`group rounded-xl px-2 py-1.5 transition hover:bg-white/5 ${isRoot ? 'mb-2 bg-white/[0.03]' : ''}`}>
        <div className="flex items-start gap-2">
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              className="mt-1 flex h-5 w-5 items-center justify-center rounded-md text-white/35 transition hover:bg-white/5 hover:text-white/70"
            >
              <ChevronRight size={14} className={isExpanded ? 'rotate-90 transition-transform' : 'transition-transform'} />
            </button>
          ) : (
            <div className="mt-2 flex h-5 w-5 items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  placeholder="Label"
                />
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  placeholder="Value"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={handleSave} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLabel(node.label);
                      setValue(node.value ?? '');
                      setIsEditing(false);
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={isRoot ? 'text-sm font-black uppercase tracking-[0.16em] text-white/90' : 'text-sm font-semibold text-white/80'}>
                    {node.label}
                  </span>
                  {!isRoot ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-white/50">
                      {node.visibility}
                    </span>
                  ) : null}
                  {!isRoot && node.protected ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-white/50">
                      Protected
                    </span>
                  ) : null}
                </div>
                {node.value ? <div className="mt-1 text-xs leading-5 text-white/45">{node.value}</div> : null}
              </div>
            )}
          </div>

          {!isEditing ? (
            <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              {!isRoot ? (
                <button type="button" onClick={() => setIsEditing(true)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/60">
                  Edit
                </button>
              ) : null}
              <button type="button" onClick={() => setIsAddingChild((current) => !current)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/60">
                <Plus size={12} />
              </button>
              {!isRoot && onDuplicateAcrossTrees ? (
                <button type="button" onClick={() => onDuplicateAcrossTrees(node)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/60">
                  <CopyPlus size={12} />
                </button>
              ) : null}
              {!isRoot ? (
                <button type="button" onClick={() => onChange({ ...node, protected: !node.protected })} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/60">
                  {node.protected ? <Shield size={12} /> : <ShieldOff size={12} />}
                </button>
              ) : null}
              {!isRoot && onDelete ? (
                <button type="button" onClick={onDelete} className="rounded-lg border border-red-400/20 bg-red-400/10 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-red-100">
                  <Trash2 size={12} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isAddingChild ? (
          <div className="ml-7 mt-2.5 flex flex-wrap items-center gap-2">
            <input
              value={newChildLabel}
              onChange={(event) => setNewChildLabel(event.target.value)}
              className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              placeholder="New node"
            />
            <button type="button" onClick={handleAddChild} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/75">
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setNewChildLabel('');
                setIsAddingChild(false);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/45"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      {isExpanded && node.children.length > 0 ? (
        <div className="space-y-1">
          {node.children.map((child) => (
            <TreeNodeEditor
              key={child.id}
              node={child}
              depth={depth + 1}
              onChange={(nextChild) => onChange(replaceNode(node, nextChild))}
              onDelete={() => onChange(removeNode(node, child.id))}
              {...(onDuplicateAcrossTrees ? { onDuplicateAcrossTrees } : {})}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function addChildNode(root: UserMapNode, parentId: string, label = 'New Node'): UserMapNode {
  if (root.id === parentId) {
    return {
      ...root,
      children: [
        ...root.children,
        {
          id: crypto.randomUUID(),
          label,
          nodeType: root.nodeType === 'root' ? 'category' : 'fact',
          source: 'manual',
          visibility: root.visibility,
          children: []
        }
      ]
    };
  }

  return {
    ...root,
    children: root.children.map((child) => addChildNode(child, parentId, label))
  };
}

function appendChild(root: UserMapNode, child: UserMapNode): UserMapNode {
  return {
    ...root,
    children: [...root.children, child]
  };
}

function cloneNodeForVisibility(node: UserMapNode, visibility: MemoryVisibility): UserMapNode {
  const { protected: protectedNode, confidence, source, value } = node;
  return {
    id: crypto.randomUUID(),
    label: node.label,
    nodeType: node.nodeType,
    visibility,
    ...(value ? { value } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(protectedNode !== undefined ? { protected: protectedNode } : {}),
    ...(source ? { source } : {}),
    children: node.children.map((child) => cloneNodeForVisibility(child, visibility))
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
    children: root.children.filter((child) => child.id !== targetId).map((child) => removeNode(child, targetId))
  };
}

function countNodes(node: UserMapNode): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}

function countProtectedNodes(node: UserMapNode): number {
  return (node.protected ? 1 : 0) + node.children.reduce((total, child) => total + countProtectedNodes(child), 0);
}
