import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import type {
  AgentSpec,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  UserMapNode
} from '@supreme/shared';

export interface RuntimeWorkspaceSource {
  profile: LocalProfile | null;
  userMap: UserMapNode;
  agents: AgentSpec[];
  groups: GroupSpec[];
  memoryFacts: MemoryFact[];
  generatedAt?: string;
}

export interface RuntimeWorkspaceManagerOptions {
  workspaceName?: string;
  prismWorkspaceName?: string;
}

export interface RuntimeWorkspaceFile {
  path: string;
  content: string;
}

export interface RuntimeWorkspaceSubjectManifest {
  kind: 'prism' | 'agent';
  name: string;
  slug: string;
  workspacePath: string;
  skillsPaths: string[];
  tools: string[];
  workspacePaths: string[];
  userMapPaths: string[];
  memoryNamespaces: string[];
}

export interface RuntimeWorkspaceManifest {
  workspaceName: string;
  generatedAt: string;
  profile: LocalProfile | null;
  prism: RuntimeWorkspaceSubjectManifest;
  agents: RuntimeWorkspaceSubjectManifest[];
  groups: Array<{
    id: string;
    name: string;
    description?: string;
    memberAgentIds: string[];
  }>;
  memoryDays: string[];
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
const COMPAT_MANIFEST_FILENAME = 'openclaw.workspace.json';

const USER_MAP_CATEGORY_ORDER: UserMapNode['nodeType'][] = ['root', 'category', 'cluster', 'fact'];
const USER_MAP_CATEGORY_LABEL_ORDER = [
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

function compareUserMapNodes(left: UserMapNode, right: UserMapNode) {
  const leftType = USER_MAP_CATEGORY_ORDER.indexOf(left.nodeType);
  const rightType = USER_MAP_CATEGORY_ORDER.indexOf(right.nodeType);
  if (leftType !== rightType) {
    return leftType - rightType;
  }

  if (left.nodeType === 'category' && right.nodeType === 'category') {
    const leftCategory = USER_MAP_CATEGORY_LABEL_ORDER.indexOf(left.label);
    const rightCategory = USER_MAP_CATEGORY_LABEL_ORDER.indexOf(right.label);
    if (leftCategory !== rightCategory) {
      return (leftCategory === -1 ? USER_MAP_CATEGORY_LABEL_ORDER.length : leftCategory)
        - (rightCategory === -1 ? USER_MAP_CATEGORY_LABEL_ORDER.length : rightCategory);
    }
  }

  return left.label.localeCompare(right.label);
}

function sortUserMapChildren(node: UserMapNode): UserMapNode[] {
  return [...node.children].sort(compareUserMapNodes);
}

function renderBullets(lines: string[]) {
  return lines.filter(Boolean).map((line) => `- ${line}`).join('\n');
}

function renderUserMapTree(node: UserMapNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const suffix = node.value ? `: ${node.value}` : '';
  const flags = [
    node.protected ? 'protected' : null,
    node.source ? `source=${node.source}` : null
  ].filter(Boolean);
  const meta = flags.length ? ` (${flags.join(', ')})` : '';
  const lines = [`${indent}- ${node.label}${suffix}${meta}`];

  for (const child of sortUserMapChildren(node)) {
    lines.push(renderUserMapTree(child, depth + 1));
  }

  return lines.join('\n');
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

export class RuntimeWorkspaceManager {
  constructor(private readonly options: RuntimeWorkspaceManagerOptions = {}) {}

  buildPlan(source: RuntimeWorkspaceSource): RuntimeWorkspacePlan {
    const generatedAt = source.generatedAt ?? new Date().toISOString();
    const workspaceName = this.options.workspaceName ?? source.profile?.name ?? 'Supreme Raman AI';
    const rootSlug = slugify(workspaceName, 'supreme-raman-ai');
    const prismSlug = slugify(this.options.prismWorkspaceName ?? 'Prism', 'prism');
    const agentSubjects = source.agents
      .slice()
      .sort((left, right) => left.slug.localeCompare(right.slug) || left.id.localeCompare(right.id))
      .map((agent) => this.buildAgentSubject(agent));

    const allSkills = [...new Set(source.agents.flatMap((agent) => agent.skills).filter(Boolean))].sort((left, right) => left.localeCompare(right));
    const memoryDays = [...new Set(source.memoryFacts.map((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt)))].sort((left, right) => left.localeCompare(right));

    const prismSubject: RuntimeWorkspaceSubjectManifest = {
      kind: 'prism',
      name: this.options.prismWorkspaceName ?? 'Prism',
      slug: prismSlug,
      workspacePath: 'prism',
      skillsPaths: allSkills.map(renderSkillPath),
      tools: this.collectTools(source.agents),
      workspacePaths: this.collectWorkspacePaths(source.agents),
      userMapPaths: this.collectUserMapPaths(source.agents),
      memoryNamespaces: this.collectMemoryNamespaces(source.agents)
    };

    const manifest: RuntimeWorkspaceManifest = {
      workspaceName,
      generatedAt,
      profile: source.profile,
      prism: prismSubject,
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
          } = {
            id: group.id,
            name: group.name,
            memberAgentIds: [...group.memberAgentIds].sort((left, right) => left.localeCompare(right))
          };

          if (group.description) {
            manifestGroup.description = group.description;
          }

          return manifestGroup;
        }),
      memoryDays,
      skillsWorkspaceRoot: 'skills'
    };

    const files = this.renderFiles({
      workspaceRoot: rootSlug,
      prismWorkspacePath: prismSubject.workspacePath,
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
    prismWorkspacePath: string;
    agents: RuntimeWorkspaceSubjectManifest[];
    source: RuntimeWorkspaceSource;
    manifest: RuntimeWorkspaceManifest;
  }): RuntimeWorkspaceFile[] {
    const files: RuntimeWorkspaceFile[] = [];
    const { source: input, manifest, agents } = source;

    files.push({
      path: 'AGENTS.md',
      content: renderWorkspaceDocHeader('AGENTS', [
        `Workspace: \`${manifest.workspaceName}\``,
        `Generated: \`${manifest.generatedAt}\``,
        '',
        '## Prism',
        `- \`${source.prismWorkspacePath}/AGENTS.md\``,
        `- \`${source.prismWorkspacePath}/SOUL.md\``,
        `- \`${source.prismWorkspacePath}/TOOLS.md\``,
        `- \`${source.prismWorkspacePath}/IDENTITY.md\``,
        `- \`${source.prismWorkspacePath}/USER.md\``,
        `- \`${source.prismWorkspacePath}/MEMORY.md\``,
        '',
        '## Persistent Chatbots',
        ...(agents.length
          ? agents.map((agent) => `- \`${agent.workspacePath}/AGENTS.md\` -> ${agent.name}`)
          : ['- none yet']),
        '',
        '## Groups',
        ...(manifest.groups.length
          ? manifest.groups.map((group) => `- ${group.name} (${group.memberAgentIds.join(', ')})`)
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
        `This workspace is the local Supreme Raman AI execution surface for \`${manifest.workspaceName}\`.`,
        '',
        'Prism is the architect. It should stay local-first, deterministic, and explicit about workspace state.',
        '',
        `Prism workspace: \`${source.prismWorkspacePath}\``,
        `Profile: ${input.profile ? `${input.profile.name} <${input.profile.email}>` : 'unassigned local profile'}`,
        '',
        'The runtime bridge should preserve the existing Ollama execution path while mirroring durable state into filesystem workspace files.'
      ])
    });

    files.push({
      path: 'TOOLS.md',
      content: renderWorkspaceDocHeader('TOOLS', [
        'This file lists the runtime-relevant tool and skill paths available to Prism and persistent chatbots.',
        '',
        `Skill workspace root: \`${manifest.skillsWorkspaceRoot}\``,
        '',
        ...(manifest.prism.skillsPaths.length
          ? ['## Prism Skills', ...manifest.prism.skillsPaths.map((skillPath) => `- \`${skillPath}\``)]
          : ['## Prism Skills', '- none yet']),
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
        `Workspace: \`${manifest.workspaceName}\``,
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
        '## Prism Identity',
        renderBullets([
          `Name: ${manifest.prism.name}`,
          `Workspace Path: ${manifest.prism.workspacePath}`
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
        'This file mirrors the local human context that Prism and chatbots should respect.',
        '',
        input.profile
          ? renderBullets([
              `Name: ${input.profile.name}`,
              `Email: ${input.profile.email}`
            ])
          : '- No local profile yet.',
        '',
        '## UserMap',
        '```text',
        renderUserMapTree(input.userMap),
        '```',
        '',
        '## Groups',
        ...(manifest.groups.length
          ? manifest.groups.map((group) => `- ${group.name}: ${group.memberAgentIds.join(', ')}`)
          : ['- none yet'])
      ])
    });

    files.push({
      path: 'MEMORY.md',
      content: renderWorkspaceDocHeader('MEMORY', [
        'Durable memory facts are mirrored here and split into dated log files under `memory/YYYY-MM-DD.md`.',
        '',
        ...(input.memoryFacts.length
          ? input.memoryFacts
              .slice()
              .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.category.localeCompare(right.category) || left.label.localeCompare(right.label))
              .map(renderMemoryFact)
          : ['- no durable memory facts yet.']),
        '',
        '## Daily Logs',
        ...(manifest.memoryDays.length
          ? manifest.memoryDays.map((day) => `- \`memory/${day}.md\``)
          : ['- none yet'])
      ])
    });

    files.push({
      path: PRIMARY_MANIFEST_FILENAME,
      content: JSON.stringify(manifest, null, 2) + '\n'
    });

    files.push(...this.renderSubjectFiles(source.prismWorkspacePath, manifest.prism, {
      profile: input.profile,
      userMap: input.userMap,
      memoryFacts: input.memoryFacts
    }));

    for (const subject of agents) {
      const agent = input.agents.find((candidate) => candidate.slug === subject.slug) ?? null;
      files.push(...this.renderSubjectFiles(subject.workspacePath, subject, {
        profile: input.profile,
        userMap: input.userMap,
        memoryFacts: input.memoryFacts,
        agent
      }));
    }

    for (const day of manifest.memoryDays) {
      const factsForDay = input.memoryFacts
        .filter((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt) === day)
        .slice()
        .sort((left, right) => left.category.localeCompare(right.category) || left.label.localeCompare(right.label) || left.value.localeCompare(right.value));

      files.push({
        path: join('memory', `${day}.md`),
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
      ...plan.manifest.prism.skillsPaths,
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
      join(rootDir, COMPAT_MANIFEST_FILENAME),
      JSON.stringify(plan.manifest, null, 2) + '\n'
    );
    writtenFiles.push(relative(targetDir, join(rootDir, COMPAT_MANIFEST_FILENAME)));

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
      userMapPaths: agent.context.userMapPaths.slice().sort((left, right) => left.localeCompare(right)),
      memoryNamespaces: agent.context.memoryNamespaces.slice().sort((left, right) => left.localeCompare(right))
    };
  }

  private renderSubjectFiles(
    subjectPath: string,
    subject: RuntimeWorkspaceSubjectManifest,
    context?: {
      profile: LocalProfile | null;
      userMap: UserMapNode;
      memoryFacts: MemoryFact[];
      agent?: AgentSpec | null;
    }
  ): RuntimeWorkspaceFile[] {
    const profile = context?.profile ?? null;
    const userMap = context?.userMap;
    const memoryFacts = context?.memoryFacts ?? [];
    const agent = context?.agent ?? null;

    return [
      {
        path: join(subjectPath, 'AGENTS.md'),
        content: renderWorkspaceDocHeader(`${subject.name} AGENTS`, [
          `Workspace path: \`${subjectPath}\``,
          `Kind: \`${subject.kind}\``,
          '',
          'This workspace belongs to one persistent execution subject.',
          'Prism and the local runtime should read this folder as the canonical filesystem mirror for the subject.',
          '',
          `Skills workspace root: \`skills\``,
          ...(subject.skillsPaths.length ? ['## Skills', ...subject.skillsPaths.map((skillPath) => `- \`${skillPath}\``)] : ['## Skills', '- none yet']),
          '',
          ...(subject.workspacePaths.length ? ['## Workspace Paths', ...subject.workspacePaths.map((workspacePath) => `- \`${workspacePath}\``)] : ['## Workspace Paths', '- none yet'])
        ])
      },
      {
        path: join(subjectPath, 'SOUL.md'),
        content: renderWorkspaceDocHeader(`${subject.name} SOUL`, [
          `Identity: ${subject.name}`,
          `Workspace path: \`${subjectPath}\``,
          '',
          subject.kind === 'prism'
            ? 'Prism is the architect and should remain the deterministic local coordinator.'
            : `Role: ${agent?.persona.role ?? 'Specialist chatbot'}`,
          '',
          subject.kind === 'prism'
            ? 'Mission: turn local user intent into durable workspace state and controlled execution.'
            : `Mission: ${agent?.persona.mission ?? ''}`,
          '',
          subject.kind === 'prism'
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
          '## UserMap Paths',
          ...(subject.userMapPaths.length ? subject.userMapPaths.map((userMapPath) => `- \`${userMapPath}\``) : ['- none yet'])
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
          userMap
            ? ['## UserMap', '```text', renderUserMapTree(userMap), '```'].join('\n')
            : '## UserMap\n- unavailable',
          '',
          `Workspace path: \`${subjectPath}\``
        ])
      },
      {
        path: join(subjectPath, 'MEMORY.md'),
        content: renderWorkspaceDocHeader(`${subject.name} MEMORY`, [
          'Durable memory facts mirrored for this subject.',
          '',
          ...(memoryFacts.length
            ? memoryFacts
                .slice()
                .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.category.localeCompare(right.category) || left.label.localeCompare(right.label))
                .map(renderMemoryFact)
            : ['- no durable memory facts yet.']),
          '',
          ...(context ? ['## Dated Logs', ...context.memoryFacts
            .map((fact) => asUtcDateKey(fact.updatedAt || fact.createdAt))
            .filter((day, index, array) => array.indexOf(day) === index)
            .sort((left, right) => left.localeCompare(right))
            .map((day) => `- \`memory/${day}.md\``)] : ['## Dated Logs', '- none yet'])
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

  private collectUserMapPaths(agents: AgentSpec[]) {
    return [...new Set(agents.flatMap((agent) => agent.context.userMapPaths))].sort((left, right) => left.localeCompare(right));
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
