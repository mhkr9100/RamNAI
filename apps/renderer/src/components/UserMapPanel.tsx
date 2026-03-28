import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  CopyPlus,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import type { MemoryFact, MemoryVisibility, UserMapNode, UserMapState } from '@workspace/shared';
import { Badge, Button, Card, Divider, EmptyState, Input, SectionLabel } from './ui';

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
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setDraft(tree);
    }
  }, [tree, dirty]);

  const privateFacts = useMemo(() => facts.filter((fact) => fact.visibility === 'private'), [facts]);
  const publicFacts = useMemo(() => facts.filter((fact) => fact.visibility === 'public'), [facts]);

  const updateDraft = (updater: (current: UserMapState) => UserMapState) => {
    setDraft((current) => updater(current));
    setDirty(true);
  };

  const replaceTree = (visibility: MemoryVisibility, nextRoot: UserMapNode) => {
    updateDraft((current) => ({
      ...current,
      ...(visibility === 'private' ? { privateTree: nextRoot } : { publicTree: nextRoot }),
    }));
  };

  const duplicateNodeAcrossTrees = (sourceTree: MemoryVisibility, node: UserMapNode) => {
    const targetTree: MemoryVisibility = sourceTree === 'private' ? 'public' : 'private';
    const duplicated = cloneNodeForVisibility(node, targetTree);
    updateDraft((current) => ({
      privateTree:
        targetTree === 'private' ? appendChild(current.privateTree, duplicated) : current.privateTree,
      publicTree:
        targetTree === 'public' ? appendChild(current.publicTree, duplicated) : current.publicTree,
    }));
  };

  const handleSaveDraft = async () => {
    await onSave(draft);
    setDirty(false);
  };

  const handleDiscardDraft = () => {
    setDraft(tree);
    setDirty(false);
  };

  return (
    <div className={`grid gap-5 ${showFacts ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
      <Card
        variant="elevated"
        padding="none"
        animate={false}
        className="overflow-hidden bg-surface-2"
      >
        <div className="border-b border-black/8 px-5 py-4 dark:border-white/[0.08]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SectionLabel>UserMap</SectionLabel>
              {dirty ? <Badge variant="warning">Unsaved</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={showFacts ? 'secondary' : 'ghost'}
                icon={showFacts ? <EyeOff size={14} /> : <Eye size={14} />}
                onClick={() => setShowFacts((current) => !current)}
              >
                Facts
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<RefreshCw size={14} />}
                disabled={busy || dirty}
                onClick={() => onSync()}
              >
                Sync
              </Button>
              {dirty ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={handleDiscardDraft}
                >
                  Discard
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="brand"
                icon={<Save size={14} />}
                disabled={busy || !dirty}
                onClick={() => void handleSaveDraft()}
              >
                Save
              </Button>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-white/45">
            {dirty ? 'Draft changes stay local until you save or discard them.' : 'Delete branches, edit nodes, then save to persist the changes.'}
          </div>
        </div>

        <div className="space-y-4 p-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            <TreeSection
              title="Private"
              node={draft.privateTree}
              onAdd={() =>
                replaceTree('private', addChildNode(draft.privateTree, draft.privateTree.id, 'New private node'))
              }
              onChange={(nextRoot) => replaceTree('private', nextRoot)}
              onDuplicateAcrossTrees={(node) => duplicateNodeAcrossTrees('private', node)}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
          >
            <TreeSection
              title="Public"
              node={draft.publicTree}
              onAdd={() =>
                replaceTree('public', addChildNode(draft.publicTree, draft.publicTree.id, 'New public node'))
              }
              onChange={(nextRoot) => replaceTree('public', nextRoot)}
              onDuplicateAcrossTrees={(node) => duplicateNodeAcrossTrees('public', node)}
            />
          </motion.div>
        </div>
      </Card>

      {showFacts ? (
        <motion.aside
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
            <FactColumn title="Private Facts" facts={privateFacts} />
            <Divider className="my-5" />
            <FactColumn title="Public Facts" facts={publicFacts} />
          </Card>
        </motion.aside>
      ) : null}
    </div>
  );
}

function TreeSection({
  title,
  node,
  onAdd,
  onChange,
  onDuplicateAcrossTrees,
}: {
  title: string;
  node: UserMapNode;
  onAdd: () => void;
  onChange: (node: UserMapNode) => void;
  onDuplicateAcrossTrees: (node: UserMapNode) => void;
}) {
  return (
    <Card variant="default" padding="none" animate={false} className="bg-surface-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 px-4 py-3 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel>{title}</SectionLabel>
          <Badge variant="default">Nodes {countNodes(node)}</Badge>
          <Badge variant="brand">Protected {countProtectedNodes(node)}</Badge>
        </div>
        <Button type="button" size="sm" variant="secondary" icon={<Plus size={14} />} onClick={onAdd}>
          Add
        </Button>
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
    </Card>
  );
}

function FactColumn({ title, facts }: { title: string; facts: MemoryFact[] }) {
  return (
    <section>
      <SectionLabel count={facts.length}>{title}</SectionLabel>
      <div className="mt-4">
        {facts.length === 0 ? (
          <EmptyState
            icon={<Eye size={16} className="text-slate-500 dark:text-white/45" />}
            title="No facts"
            description="Sync UserMap with memories to populate this column."
            compact
          />
        ) : (
          <div className="space-y-3">
            {facts.map((fact, index) => (
              <motion.div
                key={fact.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03, ease: [0.4, 0, 0.2, 1] }}
              >
                <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/40">
                      {fact.category}
                    </div>
                    <Badge variant="outline">{Math.round(fact.confidence * 100)}%</Badge>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{fact.label}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-white/65">{fact.value}</div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TreeNodeEditor({
  node,
  depth,
  onChange,
  onDelete,
  onDuplicateAcrossTrees,
  isRoot = false,
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
      ...(value.trim() ? { value: value.trim() } : {}),
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
    <div className={depth > 0 ? 'ml-4 border-l border-black/8 pl-3 dark:border-white/[0.06]' : ''}>
      <div
        className={`group rounded-2xl px-2 py-2 transition ${
          isRoot ? 'mb-2 bg-surface-2' : 'hover:bg-surface-2'
        }`}
      >
        <div className="flex items-start gap-2">
          {node.children.length > 0 ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="mt-0.5 h-7 w-7 px-0"
              onClick={() => setIsExpanded((current) => !current)}
            >
              <ChevronRight
                size={14}
                className={isExpanded ? 'rotate-90 transition-transform' : 'transition-transform'}
              />
            </Button>
          ) : (
            <div className="mt-2 flex h-7 w-7 items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Label"
                />
                <Input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="Value"
                />
                <div className="flex flex-wrap gap-2 self-end">
                  <Button type="button" size="sm" variant="brand" onClick={handleSave}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLabel(node.label);
                      setValue(node.value ?? '');
                      setIsEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      isRoot
                        ? 'text-sm font-semibold uppercase tracking-[0.04em] text-slate-900 dark:text-white'
                        : 'text-sm font-semibold text-slate-800 dark:text-white/85'
                    }
                  >
                    {node.label}
                  </span>
                  {!isRoot ? <Badge variant="default">{node.visibility}</Badge> : null}
                  {!isRoot && node.protected ? <Badge variant="brand">Protected</Badge> : null}
                </div>
                {node.value ? <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/50">{node.value}</div> : null}
              </div>
            )}
          </div>

          {!isEditing ? (
            <div className="flex flex-wrap items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
              {!isRoot ? (
                <Button type="button" size="xs" variant="ghost" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              ) : null}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                icon={<Plus size={12} />}
                onClick={() => setIsAddingChild((current) => !current)}
              >
                Add
              </Button>
              {!isRoot && onDuplicateAcrossTrees ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  icon={<CopyPlus size={12} />}
                  onClick={() => onDuplicateAcrossTrees(node)}
                >
                  Copy
                </Button>
              ) : null}
              {!isRoot ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  icon={node.protected ? <Shield size={12} /> : <ShieldOff size={12} />}
                  onClick={() => onChange({ ...node, protected: !node.protected })}
                >
                  {node.protected ? 'Lock' : 'Protect'}
                </Button>
              ) : null}
              {!isRoot && onDelete ? (
                <Button
                  type="button"
                  size="xs"
                  variant="danger"
                  icon={<Trash2 size={12} />}
                  onClick={onDelete}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isAddingChild ? (
          <div className="ml-9 mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Input
                value={newChildLabel}
                onChange={(event) => setNewChildLabel(event.target.value)}
                placeholder="New node"
              />
            </div>
            <Button type="button" size="sm" variant="brand" onClick={handleAddChild}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setNewChildLabel('');
                setIsAddingChild(false);
              }}
            >
              Cancel
            </Button>
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
