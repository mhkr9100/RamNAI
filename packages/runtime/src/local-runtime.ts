import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  AgentSpec,
  DEFAULT_MODEL_PRESETS,
  GroupSpec,
  MemoryCategory,
  MemoryFact,
  PrismReply,
  PrismRequest,
  ProviderId,
  ProviderModelPreset,
  TaskSpec,
  UserMapNode,
  UserMapState
} from '@supreme/shared';
import { EXTERNAL_RUNTIME_CLI } from './runtime-compat.js';

const execFileAsync = promisify(execFile);
const OLLAMA_API = 'http://127.0.0.1:11434/api';
// External runtime bridge binary (kept vendor-neutral at call sites).
const RUNTIME_BRIDGE_MODEL_ID = 'runtime-bridge';
const ALLOWED_MEMORY_CATEGORIES: MemoryCategory[] = [
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

interface OllamaTagResponse {
  models?: Array<{ name: string; model?: string }>;
}

interface OllamaGenerateResponse {
  response?: string;
}

export interface RuntimeStatus {
  available: boolean;
  ollamaReady: boolean;
  runtimeBridgeReady: boolean;
  message?: string;
}

export interface TaskExecutionResult {
  text: string;
  provider: ProviderId;
  modelId: string;
  councilTrace?: Array<{ modelId: string; stage: 'worker' | 'revision' | 'judge'; output: string }>;
}

export interface TaskExecutionContext {
  userMap: UserMapState;
  agents: AgentSpec[];
  groups: GroupSpec[];
}

interface RuntimeBridgePrismReply {
  id: string;
  text: string;
  provider?: ProviderId;
  modelId?: string;
  createdAgent?: AgentSpec;
}

interface RuntimeBridgeTaskResult {
  text: string;
  provider?: ProviderId;
  modelId?: string;
  councilTrace?: Array<{ modelId: string; stage: 'worker' | 'revision' | 'judge'; output: string }>;
}

export interface RuntimeBridgeHooks {
  beforeInvoke?: () => Promise<void>;
  afterInvoke?: () => Promise<void>;
}

export class LocalRuntimeAdapter {
  private workspaceRoot?: string;
  private runtimeBridgeAvailable: boolean | null = null;
  private runtimeBridgeHooks: RuntimeBridgeHooks = {};

  setWorkspaceRoot(rootDir: string) {
    this.workspaceRoot = rootDir;
  }

  setRuntimeBridgeHooks(hooks: RuntimeBridgeHooks) {
    this.runtimeBridgeHooks = hooks;
  }

  async getStatus(): Promise<RuntimeStatus> {
    const ollamaReady = await this.isOllamaReachable();
    const runtimeBridgeReady = await this.isRuntimeBridgeAvailable();

    return {
      available: ollamaReady || runtimeBridgeReady,
      ollamaReady,
      runtimeBridgeReady,
      message: !ollamaReady
        ? 'Ollama runtime is not available yet. Install or bundle setup is still required.'
        : runtimeBridgeReady
          ? 'Local Ollama and the external runtime bridge are reachable.'
          : 'Local Ollama runtime is reachable. The external runtime bridge is still being wired.'
    };
  }

  async listModels(): Promise<ProviderModelPreset[]> {
    const configured = new Map<string, ProviderModelPreset>(
      DEFAULT_MODEL_PRESETS.map((model) => [model.id, { ...model } satisfies ProviderModelPreset])
    );
    const tags = await this.fetchTags();

    for (const tag of tags) {
      const existing = configured.get(tag);
      if (existing) {
        existing.installed = true;
        configured.set(tag, existing);
        continue;
      }

      configured.set(tag, {
        id: tag,
        provider: 'ollama',
        label: this.humanizeModelName(tag),
        recommended: false,
        installed: true
      });
    }

    return [...configured.values()].sort((left, right) => {
      if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
      if (left.installed !== right.installed) return left.installed ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
  }

  async sendPrismRequest(input: PrismRequest): Promise<PrismReply> {
    const runtimeBridgeReply = await this.tryRuntimeBridgePrism(input);
    if (runtimeBridgeReply) {
      return runtimeBridgeReply;
    }

    const models = await this.listModels();
    const modelId = this.pickModelId(models);

    if (input.mode === 'create') {
      const jsonText = await this.generateText({
        modelId,
        system: this.buildPrismCreateSystemPrompt(),
        prompt: this.buildPrismCreatePrompt(input),
        format: 'json'
      });

      const parsed = this.parseJsonObject<Record<string, unknown>>(jsonText);
      const createdAgent = this.normalizeAgentSpec(parsed, input.message, models);

      return {
        id: randomUUID(),
        text: `Created ${createdAgent.name}. Prism designed this chatbot for local execution with ${createdAgent.providerStrategy.mode.replaceAll('_', ' ')} strategy.`,
        provider: 'ollama',
        modelId,
        createdAgent
      };
    }

    const text = await this.generateText({
      modelId,
      system: this.buildPrismAskSystemPrompt(),
      prompt: this.buildPrismAskPrompt(input)
    });

    return {
      id: randomUUID(),
      text,
      provider: 'ollama',
      modelId
    };
  }

  async executeTask(task: TaskSpec, context: TaskExecutionContext): Promise<TaskExecutionResult> {
    const runtimeBridgeResult = await this.tryRuntimeBridgeTask(task, context);
    if (runtimeBridgeResult) {
      return runtimeBridgeResult;
    }

    if (task.mode === 'council') {
      return this.executeCouncil(task, context);
    }

    const models = await this.listModels();
    const modelId = this.pickTaskModel(task, models);
    let targetAgent: AgentSpec | null = null;
    const taskTarget = task.target;
    if (taskTarget.type === 'agent') {
      targetAgent = context.agents.find((agent) => agent.id === taskTarget.agentId) ?? null;
    }

    const prompt = [
      task.target.type === 'prism'
        ? 'You are Prism in Supreme Raman AI. Execute the following scheduled autonomous task.'
        : `You are executing a scheduled task for the chatbot "${targetAgent?.name ?? 'Unknown Chatbot'}". Respect its role and instructions.`,
      targetAgent ? `Role: ${targetAgent.persona.role}\nMission: ${targetAgent.persona.mission}\nInstructions: ${targetAgent.persona.systemInstructions}` : '',
      this.formatUserMapSummary(context.userMap),
      `Task Objective:\n${task.objective}`
    ].filter(Boolean).join('\n\n');

    const text = await this.generateText({
      modelId,
      system: 'Complete the scheduled task thoroughly. Return the finished output directly with no preamble.',
      prompt
    });

    return {
      text,
      provider: 'ollama',
      modelId
    };
  }

  private async tryRuntimeBridgePrism(input: PrismRequest): Promise<PrismReply | null> {
    const payload = {
      kind: 'prism',
      request: input
    };

    const response = await this.invokeRuntimeBridge<RuntimeBridgePrismReply>(payload);
    if (!response) return null;

    return {
      id: response.id ?? randomUUID(),
      text: response.text,
      provider: response.provider ?? 'ollama',
      modelId: response.modelId ?? RUNTIME_BRIDGE_MODEL_ID,
      ...(response.createdAgent ? { createdAgent: response.createdAgent } : {})
    };
  }

  private async tryRuntimeBridgeTask(task: TaskSpec, context: TaskExecutionContext): Promise<TaskExecutionResult | null> {
    const payload = {
      kind: 'task',
      task,
      context
    };

    const response = await this.invokeRuntimeBridge<RuntimeBridgeTaskResult>(payload);
    if (!response) return null;

    const result: TaskExecutionResult = {
      text: response.text,
      provider: response.provider ?? 'ollama',
      modelId: response.modelId ?? RUNTIME_BRIDGE_MODEL_ID
    };

    if (response.councilTrace) {
      result.councilTrace = response.councilTrace;
    }

    return result;
  }

  private async invokeRuntimeBridge<T>(payload: unknown): Promise<T | null> {
    if (!this.workspaceRoot) {
      return null;
    }

    const hasRuntimeBridge = await this.isRuntimeBridgeAvailable();
    if (!hasRuntimeBridge) {
      return null;
    }

    try {
      await this.runtimeBridgeHooks.beforeInvoke?.();
      const { stdout, stderr } = await execFileAsync(EXTERNAL_RUNTIME_CLI, [
        'run',
        '--workspace',
        this.workspaceRoot,
        '--request',
        JSON.stringify(payload)
      ]);
      const combined = `${stdout ?? ''}\n${stderr ?? ''}`.trim();
      const trimmed = combined.trim();
      if (!trimmed) {
        return null;
      }

      const parsed = this.parseJsonObject<T>(trimmed);
      return parsed;
    } catch (error) {
      // If the external runtime bridge fails for any reason, fall back to the current Ollama path.
      // eslint-disable-next-line no-console
      console.warn('[runtime] External runtime bridge failed, falling back to Ollama path:', error);
      return null;
    } finally {
      await this.runtimeBridgeHooks.afterInvoke?.();
    }
  }

  private async isRuntimeBridgeAvailable(): Promise<boolean> {
    if (this.runtimeBridgeAvailable !== null) {
      return this.runtimeBridgeAvailable;
    }
    const available = await this.hasBinary(EXTERNAL_RUNTIME_CLI, ['--version']);
    this.runtimeBridgeAvailable = available;
    return available;
  }

  async extractMemoryFacts(source: MemoryFact['source'], sourceRef: string, text: string, existingFacts: MemoryFact[]): Promise<MemoryFact[]> {
    if (!text.trim()) return [];

    const models = await this.listModels();
    const modelId = this.pickModelId(models);
    const responseText = await this.generateText({
      modelId,
      system: [
        'Extract only durable user memory facts from the supplied content.',
        'Return JSON only with the shape {"facts":[{"category":"Preferences","label":"Response Style","value":"Concise","confidence":0.82}]}',
        'Never include secrets, API keys, greetings, or one-off chatter.',
        'Use only these categories:',
        ALLOWED_MEMORY_CATEGORIES.join(', ')
      ].join(' '),
      prompt: `Existing facts:\n${JSON.stringify(existingFacts.slice(0, 25), null, 2)}\n\nSource text:\n${text}`,
      format: 'json'
    });

    const parsed = this.parseJsonObject<{ facts?: Array<{ category?: string; label?: string; value?: string; confidence?: number }> }>(responseText);
    const now = new Date().toISOString();
    const merged = new Map(existingFacts.map((fact) => [this.factKey(fact.category, fact.label, fact.value), fact]));

    for (const candidate of parsed.facts ?? []) {
      const category = ALLOWED_MEMORY_CATEGORIES.find((value) => value === candidate.category);
      const label = candidate.label?.trim();
      const value = candidate.value?.trim();
      if (!category || !label || !value) continue;
      if (this.looksSensitive(value)) continue;

      const key = this.factKey(category, label, value);
      const existing = merged.get(key);
      const confidence = Math.max(0, Math.min(1, Number(candidate.confidence ?? 0.72)));
      merged.set(key, {
        id: existing?.id ?? this.makeStableId(`${category}:${label}:${value}`),
        category,
        label,
        value,
        confidence,
        visibility: existing?.visibility ?? 'private',
        source,
        sourceRef,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    }

    return [...merged.values()].sort((left, right) => left.category.localeCompare(right.category) || left.label.localeCompare(right.label));
  }

  private async executeCouncil(task: TaskSpec, context: TaskExecutionContext): Promise<TaskExecutionResult> {
    const models = await this.listModels();
    const availableModelIds = models.filter((model) => model.installed).map((model) => model.id);
    const workers = task.council?.workerModels.length
      ? task.council.workerModels.map((worker) => this.resolveSupportedModel(worker.provider, worker.modelId, availableModelIds))
      : [this.pickModelId(models)];
    const judge = task.council?.judgeModel
      ? this.resolveSupportedModel(task.council.judgeModel.provider, task.council.judgeModel.modelId, availableModelIds)
      : (workers[0] ?? this.pickModelId(models));

    const sharedBrief = [
      'You are part of a council run in Supreme Raman AI.',
      'Produce a strong answer to the task objective using the supplied context.',
      this.formatUserMapSummary(context.userMap),
      `Objective:\n${task.objective}`
    ].join('\n\n');

    const trace: Array<{ modelId: string; stage: 'worker' | 'revision' | 'judge'; output: string }> = [];
    const workerDrafts: Array<{ modelId: string; output: string }> = [];

    for (const workerModelId of workers) {
      const output = await this.generateText({
        modelId: workerModelId,
        system: 'You are a council worker. Produce a concrete first-pass answer.',
        prompt: sharedBrief
      });
      trace.push({ modelId: workerModelId, stage: 'worker', output });
      workerDrafts.push({ modelId: workerModelId, output });
    }

    const revisedDrafts: Array<{ modelId: string; output: string }> = [];
    for (const draft of workerDrafts) {
      const peerOutputs = workerDrafts
        .filter((candidate) => candidate.modelId !== draft.modelId)
        .map((candidate) => `Peer (${candidate.modelId}):\n${candidate.output}`)
        .join('\n\n');

      const output = await this.generateText({
        modelId: draft.modelId,
        system: 'Revise your answer after considering peer outputs. Keep the best parts and improve weaknesses.',
        prompt: `${sharedBrief}\n\nYour original draft:\n${draft.output}\n\nPeer outputs:\n${peerOutputs}`
      });
      trace.push({ modelId: draft.modelId, stage: 'revision', output });
      revisedDrafts.push({ modelId: draft.modelId, output });
    }

    const judgePrompt = revisedDrafts
      .map((draft) => `Revised worker output (${draft.modelId}):\n${draft.output}`)
      .join('\n\n');

    const text = await this.generateText({
      modelId: judge,
      system: 'You are the council judge. Synthesize the strongest final answer from the revised worker outputs.',
      prompt: `${sharedBrief}\n\n${judgePrompt}`
    });

    trace.push({ modelId: judge, stage: 'judge', output: text });

    return {
      text,
      provider: 'ollama',
      modelId: judge,
      councilTrace: trace
    };
  }

  private buildPrismAskSystemPrompt() {
    return [
      'You are Prism inside Supreme Raman AI.',
      'You are a prompt, context, and execution architect for a local-first AI workspace.',
      'Be concise, practical, and specific.',
      'Ground your answer in the user context provided. If local runtime limitations matter, say so plainly.'
    ].join(' ');
  }

  private buildPrismAskPrompt(input: PrismRequest) {
    return [
      `User objective:\n${input.message}`,
      this.formatUserMapSummary(input.userMap),
      input.existingAgents.length ? `Existing chatbots:\n${input.existingAgents.map((agent) => `- ${agent.name}: ${agent.description}`).join('\n')}` : 'Existing chatbots:\n- none yet',
      input.existingGroups.length ? `Existing groups:\n${input.existingGroups.map((group) => `- ${group.name}`).join('\n')}` : 'Existing groups:\n- none yet'
    ].join('\n\n');
  }

  private buildPrismCreateSystemPrompt() {
    return [
      'You are Prism inside Supreme Raman AI.',
      'Create a single JSON object representing a local-execution chatbot spec.',
      'Return JSON only. No markdown. No prose.',
      'Respect these runtime rules: local-first, Ollama-first, group chats may auto-route by default, explicit @mentions pin routing, scheduled tasks supported, recurring tasks supported, council eligible when useful.'
    ].join(' ');
  }

  private buildPrismCreatePrompt(input: PrismRequest) {
    return [
      'Design one persistent chatbot from the following user objective.',
      `Objective:\n${input.message}`,
      this.formatUserMapSummary(input.userMap),
      'Schema requirements:',
      JSON.stringify({
        name: 'string',
        description: 'string',
        persona: {
          role: 'string',
          mission: 'string',
          systemInstructions: 'string'
        },
        providerStrategy: {
          mode: 'local_first',
          preferredLocalModelIds: ['qwen3:8b', 'mistral-small:24b-instruct-2501-q4_K_M', 'deepseek-r1:8b'],
          fallbackProviders: ['openai', 'anthropic', 'google']
        },
        tools: ['list of tool ids'],
        skills: ['list of skill ids'],
        context: {
          userMapPaths: ['user/preferences', 'user/projects'],
          workspacePaths: ['artifacts'],
          memoryNamespaces: ['global'],
          canReadArtifacts: true,
          canWriteArtifacts: true
        },
        runtime: {
          supportsChat: true,
          supportsTask: true,
          supportsRecurringTask: true,
          supportsMentions: true,
          groupEligible: true,
          councilEligible: true
        },
        safety: {
          allowExternalNetwork: false,
          allowFileWrites: true,
          allowShell: false,
          approvalMode: 'ask'
        }
      }, null, 2)
    ].join('\n\n');
  }

  private normalizeAgentSpec(parsed: Record<string, unknown>, objective: string, models: ProviderModelPreset[]): AgentSpec {
    const now = new Date().toISOString();
    const defaultModelIds = models.filter((model) => model.installed).slice(0, 3).map((model) => model.id);
    const name = this.asString(parsed.name) || 'Prism Chatbot';
    const providerStrategy: AgentSpec['providerStrategy'] = typeof parsed.providerStrategy === 'object' && parsed.providerStrategy
      ? parsed.providerStrategy as AgentSpec['providerStrategy']
      : {
          mode: 'local_first',
          preferredLocalModelIds: defaultModelIds.length ? defaultModelIds : DEFAULT_MODEL_PRESETS.map((model) => model.id),
          fallbackProviders: ['openai', 'anthropic', 'google']
        };
    const persona = typeof parsed.persona === 'object' && parsed.persona
      ? parsed.persona as AgentSpec['persona']
      : {
          role: 'Specialist chatbot',
          mission: objective,
          systemInstructions: objective
        };
    const context = typeof parsed.context === 'object' && parsed.context
      ? parsed.context as AgentSpec['context']
      : {
          userMapPaths: ['user/preferences', 'user/projects'],
          workspacePaths: ['artifacts'],
          memoryNamespaces: ['global'],
          canReadArtifacts: true,
          canWriteArtifacts: true
        };
    const runtime = typeof parsed.runtime === 'object' && parsed.runtime
      ? parsed.runtime as AgentSpec['runtime']
      : {
          supportsChat: true,
          supportsTask: true,
          supportsRecurringTask: true,
          supportsMentions: true,
          groupEligible: true,
          councilEligible: true
        };
    const safety = typeof parsed.safety === 'object' && parsed.safety
      ? parsed.safety as AgentSpec['safety']
      : {
          allowExternalNetwork: false,
          allowFileWrites: true,
          allowShell: false,
          approvalMode: 'ask'
        };

    return {
      id: randomUUID(),
      slug: this.slugify(name),
      name,
      description: this.asString(parsed.description) || objective,
      createdBy: 'prism',
      originObjective: objective,
      persona: {
        role: this.asString(persona.role) || 'Specialist chatbot',
        mission: this.asString(persona.mission) || objective,
        systemInstructions: this.asString(persona.systemInstructions) || objective
      },
      providerStrategy: this.normalizeProviderStrategy(providerStrategy, defaultModelIds),
      tools: this.asStringArray(parsed.tools),
      skills: this.asStringArray(parsed.skills),
      context: {
        userMapPaths: this.asStringArray(context.userMapPaths) || ['user/preferences', 'user/projects'],
        workspacePaths: this.asStringArray(context.workspacePaths) || ['artifacts'],
        memoryNamespaces: this.asStringArray(context.memoryNamespaces) || ['global'],
        canReadArtifacts: Boolean(context.canReadArtifacts ?? true),
        canWriteArtifacts: Boolean(context.canWriteArtifacts ?? true)
      },
      runtime: {
        supportsChat: true,
        supportsTask: Boolean(runtime.supportsTask ?? true),
        supportsRecurringTask: Boolean(runtime.supportsRecurringTask ?? true),
        supportsMentions: Boolean(runtime.supportsMentions ?? true),
        groupEligible: Boolean(runtime.groupEligible ?? true),
        councilEligible: Boolean(runtime.councilEligible ?? true)
      },
      safety: {
        allowExternalNetwork: Boolean(safety.allowExternalNetwork ?? false),
        allowFileWrites: Boolean(safety.allowFileWrites ?? true),
        allowShell: Boolean(safety.allowShell ?? false),
        approvalMode: safety.approvalMode === 'never' ? 'never' : 'ask'
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
        version: 1,
        source: 'prism-create'
      }
    };
  }

  private normalizeProviderStrategy(strategy: AgentSpec['providerStrategy'], defaultModelIds: string[]): AgentSpec['providerStrategy'] {
    if (strategy.mode === 'fixed') {
      return {
        mode: 'fixed',
        provider: strategy.provider,
        modelId: strategy.modelId
      };
    }

    if (strategy.mode === 'user_override') {
      return {
        mode: 'user_override',
        defaultProvider: strategy.defaultProvider,
        defaultModelId: strategy.defaultModelId
      };
    }

    return {
      mode: 'local_first',
      preferredLocalModelIds: strategy.preferredLocalModelIds?.length ? strategy.preferredLocalModelIds : defaultModelIds,
      fallbackProviders: strategy.fallbackProviders?.length ? strategy.fallbackProviders : ['openai', 'anthropic', 'google']
    };
  }

  private async generateText(input: { modelId: string; system: string; prompt: string; format?: 'json' }) {
    const response = await fetch(`${OLLAMA_API}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.modelId,
        system: input.system,
        prompt: input.prompt,
        stream: false,
        format: input.format,
        options: {
          temperature: input.format === 'json' ? 0.15 : 0.35
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as OllamaGenerateResponse;
    const text = payload.response?.trim();
    if (!text) {
      throw new Error('Ollama returned an empty response.');
    }

    return text;
  }

  private async fetchTags(): Promise<string[]> {
    try {
      const response = await fetch(`${OLLAMA_API}/tags`);
      if (!response.ok) return [];
      const payload = await response.json() as OllamaTagResponse;
      return (payload.models ?? []).map((model) => model.name || model.model || '').filter(Boolean);
    } catch {
      return [];
    }
  }

  private async isOllamaReachable(): Promise<boolean> {
    try {
      const response = await fetch(`${OLLAMA_API}/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private pickModelId(models: ProviderModelPreset[]): string {
    const installed = models.filter((model) => model.installed);
    const preferred = DEFAULT_MODEL_PRESETS.find((preset) => installed.some((model) => model.id === preset.id));
    if (preferred) return preferred.id;
    const firstInstalled = installed[0];
    if (firstInstalled) return firstInstalled.id;
    throw new Error('No local Ollama models are installed yet. Install one to continue.');
  }

  private pickTaskModel(task: TaskSpec, models: ProviderModelPreset[]): string {
    if (task.providerOverride) {
      return this.resolveSupportedModel(task.providerOverride.provider, task.providerOverride.modelId, models.filter((model) => model.installed).map((model) => model.id));
    }

    return this.pickModelId(models);
  }

  private resolveSupportedModel(provider: ProviderId, modelId: string, installedModelIds: string[]): string {
    if (provider !== 'ollama') {
      throw new Error(`Provider "${provider}" is not configured in this local build yet.`);
    }
    if (!installedModelIds.includes(modelId)) {
      throw new Error(`Model "${modelId}" is not installed in the local Ollama runtime.`);
    }
    return modelId;
  }

  private async hasBinary(command: string, args: string[]): Promise<boolean> {
    try {
      await execFileAsync(command, args);
      return true;
    } catch {
      return false;
    }
  }

  private humanizeModelName(modelId: string) {
    const [baseName, variant] = modelId.split(':');
    return (baseName ?? modelId)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()) + (variant ? ` ${variant}` : '');
  }

  private formatUserMapTree(root: UserMapNode) {
    const lines: string[] = [];
    const visit = (node: UserMapNode, depth: number) => {
      const prefix = '  '.repeat(depth);
      const descriptor = node.value ? `${node.label}: ${node.value}` : node.label;
      lines.push(`${prefix}- ${descriptor}`);
      for (const child of node.children) {
        visit(child, depth + 1);
      }
    };

    visit(root, 0);
    return lines.join('\n');
  }

  private formatUserMapSummary(userMap: UserMapState) {
    const sections = [
      'UserMap:',
      '',
      'Public:',
      this.formatUserMapTree(userMap.publicTree),
      '',
      'Private:',
      this.formatUserMapTree(userMap.privateTree)
    ];
    return sections.join('\n');
  }

  private parseJsonObject<T>(value: string): T {
    const cleaned = value
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const candidate = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
    return JSON.parse(candidate) as T;
  }

  private asString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private asStringArray(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'chatbot';
  }

  private factKey(category: string, label: string, value: string) {
    return `${category.toLowerCase()}::${label.toLowerCase()}::${value.toLowerCase()}`;
  }

  private makeStableId(input: string) {
    return createHash('sha1').update(input).digest('hex');
  }

  private looksSensitive(value: string) {
    return /(api[_-]?key|secret|token|password|sk-)/i.test(value);
  }
}
