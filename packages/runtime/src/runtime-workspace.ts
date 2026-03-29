import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import type {
  AgentSpec,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  ContextTreeNode,
  ContextTreeState
} from '@raman-ai/shared';
import { EXTERNAL_WORKSPACE_MANIFEST_FILENAME } from './runtime-compat.js';

export interface RuntimeWorkspaceSource {
  profile: LocalProfile | null;
  contextTree: ContextTreeState;
  agents: AgentSpec[];
  groups: GroupSpec[];
  memoryFacts: MemoryFact[];
  publicMemoryFacts?: MemoryFact[];
  privateMemoryFacts?: MemoryFact[];
  generatedAt?: string;
}

export interface RuntimeWorkspaceManagerOptions {
  workspaceName?: string;
  assistantWorkspaceName?: string;
}

export interface RuntimeWorkspaceFile {
  path: string;
  content: string;
}

export interface RuntimeWorkspaceSubjectManifest {
  kind: 'assistant' | 'agent';
  name: string;
  slug: string;
  workspacePath: string;
  skillsPaths: string[];
  tools: string[];
  workspacePaths: string[];
  contextPaths: string[];
  memoryNamespaces: string[];
}

export interface RuntimeWorkspaceManifest {
  workspaceName: string;
  generatedAt: string;
  profile: LocalProfile | null;
  assistant: RuntimeWorkspaceSubjectManifest;
  agents: RuntimeWorkspaceSubjectManifest[];
    groups: Array<{
      id: string;
      name: string;
      description?: string;
      memberAgentIds: string[];
      routingMode: GroupSpec['routingMode'];
      autoRouteThreshold: GroupSpec['autoRouteThreshold'];
      defaultResponderAgentId?: GroupSpec['defaultResponderAgentId'];
      autoRouting?: GroupSpec['autoRouting'];
    }>;
  memoryDays: string[];
  publicMemoryDays: string[];
  privateMemoryDays: string[];
  skillsWorkspaceRoot: string;
}

export interface RuntimeWorkspacePlan {
  rootDir: string;
  manifestPath: string;
  manifest: RuntimeWorkspaceManifest;
  files: RuntimeWorkspaceFile[];
}

export interface RuntimeWorkspaceSyncResult {
  rootDir: string;
  manifestPath: string;
  writtenFiles: string[];
}

const PRIMARY_MANIFEST_FILENAME = 'runtime.workspace.json';
// Compatibility mirror for the external runtime bridge while we transition away from vendor naming.

const CONTEXT_CATEGORY_ORDER: ContextTreeNode['nodeType'][] = ['root', 'category', 'cluster', 'fact'];
const CONTEXT_CATEGORY_LABEL_ORDER = [
  'Identity',
  'Preferences',
  'Career',
  'Education',
  'Projects',
  'Operations',
  'Marketing & Communications',
  'Technical Stack',
  'Business Goals',
  'Instructions',
  'General Context'
];
const CONTEXT_VISIBILITY_ORDER: Array<ContextTreeNode['visibility']> = ['public', 'private'];

function asUtcDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function slugify(value: string, fallback = 'item'): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

function compareContextTreeNodes(left: ContextTreeNode, right: ContextTreeNode) {
  const leftType = CONTEXT_CATEGORY_ORDER.indexOf(left.nodeType);
  const rightType = CONTEXT_CATEGORY_ORDER.indexOf(right.nodeType);
  if (leftType !== rightType) {
    return leftType - rightType;
  }

  if (left.nodeType === 'root' && right.nodeType === 'root') {
    const leftVisibility = CONTEXT_VISIBILITY_ORDER.indexOf((left.visibility ?? '') as ContextTreeNode['visibility']);
    const rightVisibility = CONTEXT_VISIBILITY_ORDER.indexOf((right.visibility ?? '') as ContextTreeNode['visibility']);
    if (leftVisibility !== rightVisibility) {
      return (leftVisibility === -1 ? CONTEXT_VISIBILITY_ORDER.length : leftVisibility)
        - (rightVisibility === -1 ? CONTEXT_VISIBILITY_ORDER.length : rightVisibility);
    }
  }

  if (left.nodeType === 'category' && right.nodeType === 'category') {
    const leftCategory = CONTEXT_CATEGORY_LABEL_ORDER.indexOf(left.label);
    const rightCategory = CONTEXT_CATEGORY_LABEL_ORDER.indexOf(right.label);
    if (leftCategory !== rightCategory) {
      return (leftCategory === -1 ? CONTEXT_CATEGORY_LABEL_ORDER.length : leftCategory)
        - (rightCategory === -1 ? CONTEXT_CATEGORY_LABEL_ORDER.length : rightCategory);
    }
  }

  return left.label.localeCompare(right.label);
}

function sortContextTreeChildren(node: ContextTreeNode): ContextTreeNode[] {
  return [...node.children].sort(compareContextTreeNodes);
}

function renderBullets(lines: string[]) {
  return lines.filter(Boolean).map((line) => `- ${line}`).join('\n');
}

function renderContextTreeTree(node: ContextTreeNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const suffix = node.value ? `: ${node.value}` : '';
  const flags = [
    node.protected ? 'protected' : null,
    node.visibility ? `visibility=${node.visibility}` : null,
    node.source ? `source=${node.source}` : null
  ].filter(Boolean);
  const meta = flags.length ? ` (${flags.join(', ')})` : '';
  const lines = [`${indent}- ${node.label}${suffix}${meta}`];

  for (const child of sortContextTreeChildren(node)) {
    lines.push(renderContextTreeTree(child, depth + 1));
  }

  return lines.join('\n');
}

function renderContextTreeState(contextTree: ContextTreeState) {
  return [
    'Public',
    renderContextTreeTree(contextTree.publicTree),
    '',
    'Private',
    renderContextTreeTree(contextTree.privateTree)
  ].join('\n');
}

function renderMemoryFact(fact: MemoryFact) {
  const confidence = `${Math.round(fact.confidence * 100)}%`;
  const sourceRef = fact.sourceRef ? ` | ${fact.sourceRef}` : '';
  return `- [${fact.category}] ${fact.label}: ${fact.value} (${confidence}, ${fact.source}${sourceRef})`;
}

function renderSkillPath(skillId: string) {
  return `skills/${slugify(skillId)}`;
}

function renderWorkspaceDocHeader(title: string, body: string[]) {
  return [`# ${title}`, '', ...body.filter(Boolean), ''].join('\n');
}

function memoryVisibility(fact: MemoryFact) {
  return fact.visibility ?? 'public';
}

function partitionMemoryFacts(facts: MemoryFact[]) {
  const publicMemoryFacts = facts.filter((fact) => memoryVisibility(fact) === 'public');
  const privateMemoryFacts = facts.filter((fact) => memoryVisibility(fact) === 'private');

  return {
    publicMemoryFacts,
    privateMemoryFacts,
    publicMemoryDays: [...new Set(publicMemoryFacts.map((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt)))].sort((left, right) => left.localeCompare(right)),
    privateMemoryDays: [...new Set(privateMemoryFacts.map((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt)))].sort((left, right) => left.localeCompare(right))
  };
}

function renderMemoryFactList(facts: MemoryFact[]) {
  return facts.length
    ? facts
        .slice()
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.category.localeCompare(right.category) || left.label.localeCompare(right.label))
        .map(renderMemoryFact)
    : ['- none yet.'];
}

export class RuntimeWorkspaceManager {
  constructor(private readonly options: RuntimeWorkspaceManagerOptions = {}) {}

  buildPlan(source: RuntimeWorkspaceSource): RuntimeWorkspacePlan {
    const generatedAt = source.generatedAt ?? new Date().toISOString();
    const workspaceName = this.options.workspaceName ?? source.profile?.name ?? 'Raman AI';
    const rootSlug = slugify(workspaceName, 'raman-ai');
    const assistantSlug = slugify(this.options.assistantWorkspaceName ?? 'Raman AI', 'raman-ai');
    const agentSubjects = source.agents
      .slice()
      .sort((left, right) => left.slug.localeCompare(right.slug) || left.id.localeCompare(right.id))
      .map((agent) => this.buildAgentSubject(agent));

    const allSkills = [...new Set(source.agents.flatMap((agent) => agent.skills).filter(Boolean))].sort((left, right) => left.localeCompare(right));
    const memorySplit = partitionMemoryFacts(source.memoryFacts);
    const memoryDays = [...new Set([...memorySplit.publicMemoryDays, ...memorySplit.privateMemoryDays])].sort((left, right) => left.localeCompare(right));

    const assistantSubject: RuntimeWorkspaceSubjectManifest = {
      kind: 'assistant',
      name: this.options.assistantWorkspaceName ?? 'Raman AI',
      slug: assistantSlug,
      workspacePath: 'assistant',
      skillsPaths: allSkills.map(renderSkillPath),
      tools: this.collectTools(source.agents),
      workspacePaths: this.collectWorkspacePaths(source.agents),
      contextPaths: this.collectContextTreePaths(source.agents),
      memoryNamespaces: this.collectMemoryNamespaces(source.agents)
    };

    const manifest: RuntimeWorkspaceManifest = {
      workspaceName,
      generatedAt,
      profile: source.profile,
      assistant: assistantSubject,
      agents: agentSubjects,
      groups: source.groups
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
        .map((group) => {
          const manifestGroup: {
            id: string;
            name: string;
            memberAgentIds: string[];
            description?: string;
            routingMode: GroupSpec['routingMode'];
            autoRouteThreshold: GroupSpec['autoRouteThreshold'];
            defaultResponderAgentId?: GroupSpec['defaultResponderAgentId'];
            autoRouting?: GroupSpec['autoRouting'];
          } = {
            id: group.id,
            name: group.name,
            memberAgentIds: [...group.memberAgentIds].sort((left, right) => left.localeCompare(right)),
            routingMode: group.routingMode,
            autoRouteThreshold: group.autoRouteThreshold
          };

          if (group.description) {
            manifestGroup.description = group.description;
          }

          if (group.defaultResponderAgentId) {
            manifestGroup.defaultResponderAgentId = group.defaultResponderAgentId;
          }

          if (group.autoRouting) {
            manifestGroup.autoRouting = group.autoRouting;
          }

          return manifestGroup;
        }),
      memoryDays,
      publicMemoryDays: memorySplit.publicMemoryDays,
      privateMemoryDays: memorySplit.privateMemoryDays,
      skillsWorkspaceRoot: 'skills'
    };

    const files = this.renderFiles({
      workspaceRoot: rootSlug,
      assistantWorkspacePath: assistantSubject.workspacePath,
      agents: agentSubjects,
      source,
      manifest
    });

    return {
      rootDir: rootSlug,
      manifestPath: join(rootSlug, PRIMARY_MANIFEST_FILENAME),
      manifest,
      files
    };
  }

  renderFiles(source: {
    workspaceRoot: string;
    assistantWorkspacePath: string;
    agents: RuntimeWorkspaceSubjectManifest[];
    source: RuntimeWorkspaceSource;
    manifest: RuntimeWorkspaceManifest;
  }): RuntimeWorkspaceFile[] {
    const files: RuntimeWorkspaceFile[] = [];
    const { source: input, manifest, agents } = source;
    const memorySplit = partitionMemoryFacts(input.memoryFacts);
    const publicMemoryFacts = input.publicMemoryFacts ?? memorySplit.publicMemoryFacts;
    const privateMemoryFacts = input.privateMemoryFacts ?? memorySplit.privateMemoryFacts;

    files.push({
      path: 'AGENTS.md',
      content: renderWorkspaceDocHeader('AGENTS', [
        `Raman AI: \`${manifest.workspaceName}\``,
        `Generated: \`${manifest.generatedAt}\``,
        '',
        '## Assistant',
        `- \`${source.assistantWorkspacePath}/AGENTS.md\``,
        `- \`${source.assistantWorkspacePath}/SOUL.md\``,
        `- \`${source.assistantWorkspacePath}/TOOLS.md\``,
        `- \`${source.assistantWorkspacePath}/IDENTITY.md\``,
        `- \`${source.assistantWorkspacePath}/USER.md\``,
        `- \`${source.assistantWorkspacePath}/MEMORY.md\``,
        '',
        '## Memory Mirrors',
        '- Public memory is mirrored in `MEMORY.md` and `memory/public/`.',
        '- Private memory is mirrored in `MEMORY.md` and `memory/private/`.',
        '',
        '## Persistent Chatbots',
        ...(agents.length
          ? agents.map((agent) => `- \`${agent.workspacePath}/AGENTS.md\` -> ${agent.name}`)
          : ['- none yet']),
        '',
        '## Groups',
        ...(manifest.groups.length
          ? manifest.groups.map((group) => {
              const routingMode = `${group.routingMode}, threshold ${Math.round(group.autoRouteThreshold * 100)}%`;
              return `- ${group.name} (${routingMode}; ${group.memberAgentIds.join(', ')})`;
            })
          : ['- none yet']),
        '',
        '## Skills Workspace Semantics',
        '- Skills live under `skills/<skill-id>/` and are referenced relative to each workspace subject.',
        '- Tool and context paths are deterministic and stable for sync.'
      ])
    });

    files.push({
      path: 'SOUL.md',
      content: renderWorkspaceDocHeader('SOUL', [
        `This workspace is the local Raman AI execution surface for \`${manifest.workspaceName}\`.`,
        '',
        'Raman AI is the architect. It should stay local-first, deterministic, and explicit about workspace state.',
        '',
        `Raman AI workspace: \`${source.assistantWorkspacePath}\``,
        `Profile: ${input.profile ? `${input.profile.name} <${input.profile.email}>` : 'unassigned local profile'}`,
        '',
        'The runtime bridge should preserve the existing Ollama execution path while mirroring durable state into filesystem workspace files.',
        'Public memory is shared with agents and groups. Private memory remains Raman AI-only.'
      ])
    });

    files.push({
      path: 'TOOLS.md',
      content: renderWorkspaceDocHeader('TOOLS', [
        'This file lists the runtime-relevant tool and skill paths available to Raman AI and persistent chatbots.',
        '',
        `Skill workspace root: \`${manifest.skillsWorkspaceRoot}\``,
        '',
        ...(manifest.assistant.skillsPaths.length
          ? ['## Raman AI Skills', ...manifest.assistant.skillsPaths.map((skillPath) => `- \`${skillPath}\``)]
          : ['## Raman AI Skills', '- none yet']),
        '',
        ...(agents.length
          ? agents.flatMap((agent) => [
              `## ${agent.name}`,
              ...(agent.skillsPaths.length ? agent.skillsPaths.map((skillPath) => `- \`${skillPath}\``) : ['- none yet'])
            ])
          : ['## Persistent Chatbots', '- none yet'])
      ])
    });

    files.push({
      path: 'IDENTITY.md',
      content: renderWorkspaceDocHeader('IDENTITY', [
        `Raman AI: \`${manifest.workspaceName}\``,
        `Generated: \`${manifest.generatedAt}\``,
        '',
        '## Local Profile',
        input.profile
          ? renderBullets([
              `Name: ${input.profile.name}`,
              `Email: ${input.profile.email}`
            ])
          : '- No local profile yet.',
        '',
        '## Raman AI Identity',
        renderBullets([
          `Name: ${manifest.assistant.name}`,
          `Workspace Path: ${manifest.assistant.workspacePath}`
        ]),
        '',
        '## Agents',
        ...(manifest.agents.length
          ? manifest.agents.map((agent) => `- ${agent.name} -> \`${agent.workspacePath}\``)
          : ['- none yet'])
      ])
    });

    files.push({
      path: 'USER.md',
      content: renderWorkspaceDocHeader('USER', [
        'This file mirrors the local human context that Raman AI and chatbots should respect.',
        '',
        input.profile
          ? renderBullets([
              `Name: ${input.profile.name}`,
              `Email: ${input.profile.email}`
            ])
          : '- No local profile yet.',
        '',
        '## Context',
        '```text',
        renderContextTreeState(input.contextTree),
        '```',
        '',
        '## Public Memory',
        ...(publicMemoryFacts.length ? renderMemoryFactList(publicMemoryFacts) : ['- no public memory facts yet.']),
        '',
        '## Groups',
        ...(manifest.groups.length
          ? manifest.groups.map((group) => {
              return `- ${group.name}: ${group.memberAgentIds.join(', ')} (${group.routingMode}, threshold ${group.autoRouteThreshold})`;
            })
          : ['- none yet'])
      ])
    });

    files.push({
      path: 'MEMORY.md',
      content: renderWorkspaceDocHeader('MEMORY', [
        'Durable memory facts are mirrored here and split into visibility-specific dated log files under `memory/public/YYYY-MM-DD.md` and `memory/private/YYYY-MM-DD.md`.',
        '',
        '## Public Memory',
        ...renderMemoryFactList(publicMemoryFacts),
        '',
        '## Private Memory',
        ...renderMemoryFactList(privateMemoryFacts),
        '',
        '## Public Daily Logs',
        ...(manifest.publicMemoryDays.length
          ? manifest.publicMemoryDays.map((day) => `- \`memory/public/${day}.md\``)
          : ['- none yet']),
        '',
        '## Private Daily Logs',
        ...(manifest.privateMemoryDays.length
          ? manifest.privateMemoryDays.map((day) => `- \`memory/private/${day}.md\``)
          : ['- none yet'])
      ])
    });

    files.push({
      path: PRIMARY_MANIFEST_FILENAME,
      content: JSON.stringify(manifest, null, 2) + '\n'
    });

    files.push(...this.renderSubjectFiles(source.assistantWorkspacePath, manifest.assistant, {
      profile: input.profile,
      contextTree: input.contextTree,
      memoryFacts: input.memoryFacts,
      publicMemoryFacts,
      privateMemoryFacts
    }));

    for (const subject of agents) {
      const agent = input.agents.find((candidate) => candidate.slug === subject.slug) ?? null;
      files.push(...this.renderSubjectFiles(subject.workspacePath, subject, {
        profile: input.profile,
        contextTree: input.contextTree,
        memoryFacts: input.memoryFacts,
        publicMemoryFacts,
        privateMemoryFacts,
        agent
      }));
    }

    for (const day of manifest.publicMemoryDays) {
      const factsForDay = publicMemoryFacts
        .filter((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt) === day)
        .slice()
        .sort((left, right) => left.category.localeCompare(right.category) || left.label.localeCompare(right.label) || left.value.localeCompare(right.value));

      files.push({
        path: join('memory', 'public', `${day}.md`),
        content: renderWorkspaceDocHeader(`Memory Log ${day}`, [
          `Date: \`${day}\``,
          '',
          ...(factsForDay.length ? factsForDay.map(renderMemoryFact) : ['- no facts captured on this date.'])
        ])
      });
    }

    for (const day of manifest.privateMemoryDays) {
      const factsForDay = privateMemoryFacts
        .filter((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt) === day)
        .slice()
        .sort((left, right) => left.category.localeCompare(right.category) || left.label.localeCompare(right.label) || left.value.localeCompare(right.value));

      files.push({
        path: join('memory', 'private', `${day}.md`),
        content: renderWorkspaceDocHeader(`Memory Log ${day}`, [
          `Date: \`${day}\``,
          '',
          ...(factsForDay.length ? factsForDay.map(renderMemoryFact) : ['- no facts captured on this date.'])
        ])
      });
    }

    return files;
  }

  async sync(targetDir: string, source: RuntimeWorkspaceSource): Promise<RuntimeWorkspaceSyncResult> {
    const plan = this.buildPlan(source);
    const rootDir = join(targetDir, plan.rootDir);
    const writtenFiles: string[] = [];
    const skillDirs = new Set<string>([
      ...plan.manifest.assistant.skillsPaths,
      ...plan.manifest.agents.flatMap((agent) => agent.skillsPaths)
    ]);

    for (const file of plan.files) {
      const absolutePath = join(rootDir, file.path);
      await this.writeIfChanged(absolutePath, file.content);
      writtenFiles.push(relative(targetDir, absolutePath));
    }

    for (const skillDir of skillDirs) {
      await mkdir(join(rootDir, skillDir), { recursive: true });
    }

    await this.writeIfChanged(
      join(rootDir, EXTERNAL_WORKSPACE_MANIFEST_FILENAME),
      JSON.stringify(plan.manifest, null, 2) + '\n'
    );
    writtenFiles.push(relative(targetDir, join(rootDir, EXTERNAL_WORKSPACE_MANIFEST_FILENAME)));

    return {
      rootDir: relative(targetDir, rootDir),
      manifestPath: relative(targetDir, join(rootDir, PRIMARY_MANIFEST_FILENAME)),
      writtenFiles: [...new Set(writtenFiles)].sort((left, right) => left.localeCompare(right))
    };
  }

  private buildAgentSubject(agent: AgentSpec): RuntimeWorkspaceSubjectManifest {
    return {
      kind: 'agent',
      name: agent.name,
      slug: agent.slug || slugify(agent.name, 'agent'),
      workspacePath: join('agents', agent.slug || slugify(agent.name, 'agent')),
      skillsPaths: agent.skills.slice().sort((left, right) => left.localeCompare(right)).map(renderSkillPath),
      tools: agent.tools.slice().sort((left, right) => left.localeCompare(right)),
      workspacePaths: agent.context.workspacePaths.slice().sort((left, right) => left.localeCompare(right)),
      contextPaths: agent.context.contextPaths.slice().sort((left, right) => left.localeCompare(right)),
      memoryNamespaces: agent.context.memoryNamespaces.slice().sort((left, right) => left.localeCompare(right))
    };
  }

  private renderSubjectFiles(
    subjectPath: string,
    subject: RuntimeWorkspaceSubjectManifest,
    context?: {
      profile: LocalProfile | null;
      contextTree: ContextTreeState;
      memoryFacts: MemoryFact[];
      publicMemoryFacts: MemoryFact[];
      privateMemoryFacts: MemoryFact[];
      agent?: AgentSpec | null;
    }
  ): RuntimeWorkspaceFile[] {
    const profile = context?.profile ?? null;
    const contextTree = context?.contextTree;
    const memoryFacts = context?.memoryFacts ?? [];
    const publicMemoryFacts = context?.publicMemoryFacts ?? memoryFacts.filter((fact) => memoryVisibility(fact) === 'public');
    const privateMemoryFacts = context?.privateMemoryFacts ?? memoryFacts.filter((fact) => memoryVisibility(fact) === 'private');
    const publicMemoryDays = [...new Set(publicMemoryFacts.map((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt)))].sort((left, right) => left.localeCompare(right));
    const privateMemoryDays = [...new Set(privateMemoryFacts.map((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt)))].sort((left, right) => left.localeCompare(right));
    const agent = context?.agent ?? null;

    return [
      {
        path: join(subjectPath, 'AGENTS.md'),
        content: renderWorkspaceDocHeader(`${subject.name} AGENTS`, [
          `Workspace path: \`${subjectPath}\``,
          `Kind: \`${subject.kind}\``,
          '',
          'This workspace belongs to one persistent execution subject.',
          'Raman AI and the local runtime should read this folder as the canonical filesystem mirror for the subject.',
          '',
          `Skills workspace root: \`skills\``,
          ...(subject.skillsPaths.length ? ['## Skills', ...subject.skillsPaths.map((skillPath) => `- \`${skillPath}\``)] : ['## Skills', '- none yet']),
          '',
          ...(subject.workspacePaths.length ? ['## Project Paths', ...subject.workspacePaths.map((workspacePath) => `- \`${workspacePath}\``)] : ['## Project Paths', '- none yet'])
        ])
      },
      {
        path: join(subjectPath, 'SOUL.md'),
        content: renderWorkspaceDocHeader(`${subject.name} SOUL`, [
          `Identity: ${subject.name}`,
          `Workspace path: \`${subjectPath}\``,
          '',
          subject.kind === 'assistant'
            ? 'Raman AI is the architect and should remain the deterministic local assistant.'
            : `Role: ${agent?.persona.role ?? 'Specialist chatbot'}`,
          '',
          subject.kind === 'assistant'
            ? 'Mission: turn local user intent into durable workspace state and controlled execution.'
            : `Mission: ${agent?.persona.mission ?? ''}`,
          '',
          subject.kind === 'assistant'
            ? 'Operating stance: local-first, filesystem-backed, and compatible with the existing Ollama execution path.'
            : `Operating stance: ${agent?.persona.systemInstructions ?? ''}`
        ])
      },
      {
        path: join(subjectPath, 'TOOLS.md'),
        content: renderWorkspaceDocHeader(`${subject.name} TOOLS`, [
          `Tool IDs: ${subject.tools.length ? subject.tools.join(', ') : 'none yet'}`,
          '',
          '## Skills',
          ...(subject.skillsPaths.length ? subject.skillsPaths.map((skillPath) => `- \`${skillPath}\``) : ['- none yet']),
          '',
          '## Runtime Path Semantics',
          ...(subject.workspacePaths.length ? subject.workspacePaths.map((workspacePath) => `- \`${workspacePath}\``) : ['- none yet']),
          '',
          '## Context Paths',
          ...(subject.contextPaths.length ? subject.contextPaths.map((contextTreePath) => `- \`${contextTreePath}\``) : ['- none yet'])
        ])
      },
      {
        path: join(subjectPath, 'IDENTITY.md'),
        content: renderWorkspaceDocHeader(`${subject.name} IDENTITY`, [
          `Name: ${subject.name}`,
          `Slug: ${subject.slug}`,
          `Kind: ${subject.kind}`,
          '',
          profile
            ? renderBullets([
                `Local Profile: ${profile.name} <${profile.email}>`
              ])
            : '- No local profile available.',
          '',
          `Workspace path: \`${subjectPath}\``
        ])
      },
      {
        path: join(subjectPath, 'USER.md'),
        content: renderWorkspaceDocHeader(`${subject.name} USER`, [
          `Subject: ${subject.name}`,
          '',
          profile
            ? renderBullets([
                `Local Profile: ${profile.name}`,
                `Email: ${profile.email}`
              ])
            : '- No local profile available.',
          '',
          contextTree
            ? ['## Context', '```text', subject.kind === 'assistant' ? renderContextTreeState(contextTree) : renderContextTreeTree(contextTree.publicTree), '```'].join('\n')
            : '## Context\n- unavailable',
          '',
          ['## Public Memory', ...(publicMemoryFacts.length ? publicMemoryFacts.map(renderMemoryFact) : ['- no public memory facts yet.'])].join('\n'),
          '',
          ...(subject.kind === 'assistant'
            ? ['## Private Memory', ...(privateMemoryFacts.length ? privateMemoryFacts.map(renderMemoryFact) : ['- no private memory facts yet.'])]
            : []),
          '',
          `Workspace path: \`${subjectPath}\``
        ])
      },
      {
        path: join(subjectPath, 'MEMORY.md'),
        content: renderWorkspaceDocHeader(`${subject.name} MEMORY`, [
          'Durable memory facts mirrored for this subject.',
          '',
          ...(subject.kind === 'assistant'
            ? [
                '## Public Memory',
                ...renderMemoryFactList(publicMemoryFacts),
                '',
                '## Private Memory',
                ...renderMemoryFactList(privateMemoryFacts)
              ]
            : [
                '## Public Memory',
                ...renderMemoryFactList(publicMemoryFacts)
              ]),
          '',
          ...(context
            ? subject.kind === 'assistant'
              ? [
                  '## Public Dated Logs',
                  ...(publicMemoryDays.length ? publicMemoryDays.map((day) => `- \`memory/public/${day}.md\``) : ['- none yet']),
                  '',
                  '## Private Dated Logs',
                  ...(privateMemoryDays.length ? privateMemoryDays.map((day) => `- \`memory/private/${day}.md\``) : ['- none yet'])
                ]
              : [
                  '## Public Dated Logs',
                  ...(publicMemoryDays.length ? publicMemoryDays.map((day) => `- \`memory/public/${day}.md\``) : ['- none yet'])
                ]
            : ['## Dated Logs', '- none yet'])
        ])
      }
    ];
  }

  private collectTools(agents: AgentSpec[]) {
    return [...new Set(agents.flatMap((agent) => agent.tools))].sort((left, right) => left.localeCompare(right));
  }

  private collectWorkspacePaths(agents: AgentSpec[]) {
    return [...new Set(agents.flatMap((agent) => agent.context.workspacePaths))].sort((left, right) => left.localeCompare(right));
  }

  private collectContextTreePaths(agents: AgentSpec[]) {
    return [...new Set(agents.flatMap((agent) => agent.context.contextPaths))].sort((left, right) => left.localeCompare(right));
  }

  private collectMemoryNamespaces(agents: AgentSpec[]) {
    return [...new Set(agents.flatMap((agent) => agent.context.memoryNamespaces))].sort((left, right) => left.localeCompare(right));
  }

  private async writeIfChanged(path: string, content: string) {
    await mkdir(dirname(path), { recursive: true });

    try {
      const current = await readFile(path, 'utf8');
      if (current === content) {
        return;
      }
    } catch {
      // File does not exist yet. Continue with write.
    }

    await writeFile(path, content, 'utf8');
  }
}
