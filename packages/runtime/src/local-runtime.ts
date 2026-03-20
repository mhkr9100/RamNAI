import { createHash, randomUUID } from 'node:crypto';
import {
  AgentMode,
  AgentSpec,
  DEFAULT_MODEL_PRESETS,
  GroupSpec,
  MemoryCategory,
  MemoryFact,
  PrismReply,
  PrismRequest,
  PrismProviderOverrideSettings,
  ProviderId,
  ProviderModelPreset,
  TaskSpec,
  UserMapNode,
  UserMapState
} from '@supreme/shared';
import { RuntimeBridge, type BridgePromptResult } from './runtime-bridge.js';

const OLLAMA_API = 'http://127.0.0.1:11434/api';
const DEFAULT_REMOTE_MODEL_IDS: Record<Exclude<ProviderId, 'ollama'>, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-2.0-flash'
};
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

interface RemoteProviderAuth {
  apiKey?: string | undefined;
  token?: string | undefined;
  profileId?: string | undefined;
  label?: string | undefined;
}

interface ExecutionModelRef {
  provider: ProviderId;
  modelId: string;
  fallbackOllamaModelId?: string | undefined;
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

export interface RuntimeBridgeHooks {
  beforeInvoke?: () => Promise<void>;
  afterInvoke?: () => Promise<void>;
}

export type RemoteProviderAuthResolver = (
  provider: Exclude<ProviderId, 'ollama'>
) => Promise<RemoteProviderAuth | null>;

/** Callback invoked for each streaming token. Return false to abort. */
export type StreamTokenCallback = (token: string) => void | boolean;

export interface StreamResult {
  text: string;
  provider: ProviderId;
  modelId: string;
}

export class LocalRuntimeAdapter {
  private workspaceRoot?: string;
  private runtimeBridgeHooks: RuntimeBridgeHooks = {};
  private prismOverride: PrismProviderOverrideSettings | null = null;
  private agentMode: AgentMode = 'auto';
  private remoteProviderAuthResolver: RemoteProviderAuthResolver | null = null;
  private readonly runtimeBridge = new RuntimeBridge();

  setWorkspaceRoot(rootDir: string) {
    this.workspaceRoot = rootDir;
  }

  setRuntimeBridgeHooks(hooks: RuntimeBridgeHooks) {
    this.runtimeBridgeHooks = hooks;
  }

  setPrismProviderOverride(override: PrismProviderOverrideSettings | null) {
    this.prismOverride = override;
  }

  setAgentMode(mode: AgentMode) {
    this.agentMode = mode;
  }

  setRemoteProviderAuthResolver(resolver: RemoteProviderAuthResolver | null) {
    this.remoteProviderAuthResolver = resolver;
  }

  async getBridgeVersion(): Promise<string | null> {
    return this.runtimeBridge.getVersion();
  }

  async getStatus(): Promise<RuntimeStatus> {
    const [ollamaReady, runtimeBridgeReady] = await Promise.all([
      this.isOllamaReachable(),
      this.isBridgeAvailable()
    ]);

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
    const configured = new Map<string, ProviderModelPreset>();
    const [ollamaModels, bridgeModels] = await Promise.all([
      this.listOllamaModels(),
      this.listBridgeModels()
    ]);

    for (const model of [...ollamaModels, ...bridgeModels]) {
      configured.set(`${model.provider}:${model.id}`, model);
    }

    return [...configured.values()].sort((left, right) => {
      if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
      if (left.installed !== right.installed) return left.installed ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
  }

  async sendPrismRequest(input: PrismRequest): Promise<PrismReply> {
    const ollamaModels = await this.listOllamaModels();
    const prismExecution = this.resolvePrismExecutionModel(ollamaModels);
    if (prismExecution.provider !== 'ollama') {
      try {
        if (input.mode === 'create') {
          const response = await this.generateWithFallback({
            execution: prismExecution,
            system: this.buildPrismCreateSystemPrompt(),
            prompt: this.buildPrismCreatePrompt(input),
            format: 'json'
          });
          const parsed = this.parseJsonObject<Record<string, unknown>>(response.text);
          const createdAgent = this.normalizeAgentSpec(parsed, input.message, ollamaModels);

          return {
            id: randomUUID(),
            text: `Created ${createdAgent.name}. Prism designed this chatbot for local execution with ${createdAgent.providerStrategy.mode.replaceAll('_', ' ')} strategy.`,
            provider: response.provider,
            modelId: response.modelId,
            createdAgent
          };
        }

        const response = await this.generateWithFallback({
          execution: prismExecution,
          system: this.buildPrismAskSystemPrompt(),
          prompt: this.buildPrismAskPrompt(input)
        });

        return {
          id: randomUUID(),
          text: response.text,
          provider: response.provider,
          modelId: response.modelId
        };
      } catch (error) {
        console.warn(
          `[runtime] ${prismExecution.provider} Prism execution failed, falling back to Ollama: ${this.redactSensitiveText(error instanceof Error ? error.message : String(error))}`
        );
      }
    }

    if (prismExecution.provider === 'ollama' && this.agentMode !== 'ollama') {
      const bridgeReply = await this.tryBridgePrism(input);
      if (bridgeReply) {
        return bridgeReply;
      }
    }

    const overrideModelId = this.prismOverride?.provider === 'ollama' ? this.prismOverride.modelId : null;
    const modelId = overrideModelId && ollamaModels.some((model) => model.installed && model.id === overrideModelId)
      ? overrideModelId
      : this.pickModelId(ollamaModels);

    if (input.mode === 'create') {
      const jsonText = await this.generateText({
        modelId,
        system: this.buildPrismCreateSystemPrompt(),
        prompt: this.buildPrismCreatePrompt(input),
        format: 'json'
      });

      const parsed = this.parseJsonObject<Record<string, unknown>>(jsonText);
      const createdAgent = this.normalizeAgentSpec(parsed, input.message, ollamaModels);

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
    const ollamaModels = await this.listOllamaModels();
    if (task.mode === 'council') {
      return this.executeCouncilDirect(task, context, ollamaModels);
    }

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

    const execution = this.resolveTaskExecutionModel(task, context, ollamaModels);
    if (execution.provider !== 'ollama') {
      try {
        const response = await this.generateWithFallback({
          execution,
          system: 'Complete the scheduled task thoroughly. Return the finished output directly with no preamble.',
          prompt
        });

        return {
          text: response.text,
          provider: response.provider,
          modelId: response.modelId
        };
      } catch (error) {
        console.warn(
          `[runtime] ${execution.provider} task execution failed, falling back to Ollama: ${this.redactSensitiveText(error instanceof Error ? error.message : String(error))}`
        );
      }
    }

    if (execution.provider === 'ollama' && this.agentMode !== 'ollama') {
      const bridgeResult = await this.tryBridgeTask(task, context);
      if (bridgeResult) {
        return bridgeResult;
      }
    }

    const text = await this.generateText({
      modelId: execution.provider === 'ollama'
        ? execution.modelId
        : (execution.fallbackOllamaModelId ?? this.pickTaskModel(task, ollamaModels)),
      system: 'Complete the scheduled task thoroughly. Return the finished output directly with no preamble.',
      prompt
    });

    return {
      text,
      provider: 'ollama',
      modelId: execution.provider === 'ollama'
        ? execution.modelId
        : (execution.fallbackOllamaModelId ?? this.pickTaskModel(task, ollamaModels))
    };
  }

  private resolvePrismExecutionModel(ollamaModels: ProviderModelPreset[]): ExecutionModelRef {
    if (this.prismOverride) {
      if (this.prismOverride.provider === 'ollama') {
        return {
          provider: 'ollama',
          modelId: this.resolveSupportedModel(
            'ollama',
            this.stripProviderPrefix('ollama', this.prismOverride.modelId),
            ollamaModels.filter((model) => model.installed).map((model) => model.id)
          )
        };
      }

      return {
        provider: this.prismOverride.provider,
        modelId: this.stripProviderPrefix(this.prismOverride.provider, this.prismOverride.modelId),
        ...(this.safePickOllamaModelId(ollamaModels) ? { fallbackOllamaModelId: this.safePickOllamaModelId(ollamaModels) } : {})
      };
    }

    return {
      provider: 'ollama',
      modelId: this.pickModelId(ollamaModels)
    };
  }

  private resolveTaskExecutionModel(
    task: TaskSpec,
    context: TaskExecutionContext,
    ollamaModels: ProviderModelPreset[]
  ): ExecutionModelRef {
    const target = task.target;
    const targetAgent = target.type === 'agent'
      ? context.agents.find((agent) => agent.id === target.agentId) ?? null
      : null;
    const fallbackOllamaModelId = this.pickFallbackOllamaModelId(targetAgent, ollamaModels);
    const installedOllamaIds = ollamaModels.filter((model) => model.installed).map((model) => model.id);

    if (task.providerOverride) {
      if (task.providerOverride.provider === 'ollama') {
        return {
          provider: 'ollama',
          modelId: this.resolveSupportedModel(
            'ollama',
            this.stripProviderPrefix('ollama', task.providerOverride.modelId),
            installedOllamaIds
          )
        };
      }

      return {
        provider: task.providerOverride.provider,
        modelId: this.stripProviderPrefix(task.providerOverride.provider, task.providerOverride.modelId),
        ...(fallbackOllamaModelId ? { fallbackOllamaModelId } : {})
      };
    }

    if (targetAgent) {
      return this.resolveAgentExecutionModel(targetAgent, ollamaModels, fallbackOllamaModelId);
    }

    return {
      provider: 'ollama',
      modelId: this.pickTaskModel(task, ollamaModels)
    };
  }

  private resolveAgentExecutionModel(
    agent: AgentSpec,
    ollamaModels: ProviderModelPreset[],
    fallbackOllamaModelId?: string
  ): ExecutionModelRef {
    const installedOllamaIds = ollamaModels.filter((model) => model.installed).map((model) => model.id);
    if (agent.providerStrategy.mode === 'fixed') {
      if (agent.providerStrategy.provider === 'ollama') {
        return {
          provider: 'ollama',
          modelId: this.resolveSupportedModel(
            'ollama',
            this.stripProviderPrefix('ollama', agent.providerStrategy.modelId),
            installedOllamaIds
          )
        };
      }

      return {
        provider: agent.providerStrategy.provider,
        modelId: this.stripProviderPrefix(agent.providerStrategy.provider, agent.providerStrategy.modelId),
        ...(fallbackOllamaModelId ? { fallbackOllamaModelId } : {})
      };
    }

    if (agent.providerStrategy.mode === 'user_override') {
      if (agent.providerStrategy.defaultProvider === 'ollama') {
        return {
          provider: 'ollama',
          modelId: this.resolveSupportedModel(
            'ollama',
            this.stripProviderPrefix('ollama', agent.providerStrategy.defaultModelId),
            installedOllamaIds
          )
        };
      }

      return {
        provider: agent.providerStrategy.defaultProvider,
        modelId: this.stripProviderPrefix(agent.providerStrategy.defaultProvider, agent.providerStrategy.defaultModelId),
        ...(fallbackOllamaModelId ? { fallbackOllamaModelId } : {})
      };
    }

    const localModelId = agent.providerStrategy.preferredLocalModelIds
      .map((modelId) => this.stripProviderPrefix('ollama', modelId))
      .find((modelId) => installedOllamaIds.includes(modelId));
    if (localModelId) {
      return {
        provider: 'ollama',
        modelId: localModelId
      };
    }

    const remoteFallbackProvider = agent.providerStrategy.fallbackProviders.find((provider) => provider !== 'ollama');
    if (remoteFallbackProvider) {
      return {
        provider: remoteFallbackProvider,
        modelId: DEFAULT_REMOTE_MODEL_IDS[remoteFallbackProvider],
        ...(fallbackOllamaModelId ? { fallbackOllamaModelId } : {})
      };
    }

    return {
      provider: 'ollama',
      modelId: this.pickModelId(ollamaModels)
    };
  }

  private pickFallbackOllamaModelId(agent: AgentSpec | null, ollamaModels: ProviderModelPreset[]): string | undefined {
    const installedOllamaIds = ollamaModels.filter((model) => model.installed).map((model) => model.id);
    if (agent?.providerStrategy.mode === 'local_first') {
      const preferred = agent.providerStrategy.preferredLocalModelIds
        .map((modelId) => this.stripProviderPrefix('ollama', modelId))
        .find((modelId) => installedOllamaIds.includes(modelId));
      if (preferred) {
        return preferred;
      }
    }

    return this.safePickOllamaModelId(ollamaModels);
  }

  private safePickOllamaModelId(ollamaModels: ProviderModelPreset[]): string | undefined {
    try {
      return this.pickModelId(ollamaModels);
    } catch {
      return undefined;
    }
  }

  private stripProviderPrefix(provider: ProviderId, modelId: string): string {
    return modelId.startsWith(`${provider}/`) ? modelId.slice(provider.length + 1) : modelId;
  }

  private async generateWithFallback(input: {
    execution: ExecutionModelRef;
    system: string;
    prompt: string;
    format?: 'json';
  }): Promise<{ text: string; provider: ProviderId; modelId: string }> {
    if (input.execution.provider === 'ollama') {
      return {
        text: await this.generateText({
          modelId: input.execution.modelId,
          system: input.system,
          prompt: input.prompt,
          ...(input.format ? { format: input.format } : {})
        }),
        provider: 'ollama',
        modelId: input.execution.modelId
      };
    }

    try {
      return {
        text: await this.generateByProvider({
          provider: input.execution.provider,
          modelId: input.execution.modelId,
          system: input.system,
          prompt: input.prompt,
          ...(input.format ? { format: input.format } : {})
        }),
        provider: input.execution.provider,
        modelId: input.execution.modelId
      };
    } catch (error) {
      if (!input.execution.fallbackOllamaModelId) {
        throw error;
      }

      console.warn(
        `[runtime] ${input.execution.provider} request failed, falling back to Ollama: ${this.redactSensitiveText(error instanceof Error ? error.message : String(error))}`
      );

      return {
        text: await this.generateText({
          modelId: input.execution.fallbackOllamaModelId,
          system: input.system,
          prompt: input.prompt,
          ...(input.format ? { format: input.format } : {})
        }),
        provider: 'ollama',
        modelId: input.execution.fallbackOllamaModelId
      };
    }
  }

  private async generateByProvider(input: {
    provider: Exclude<ProviderId, 'ollama'>;
    modelId: string;
    system: string;
    prompt: string;
    format?: 'json';
  }): Promise<string> {
    if (input.provider === 'openai') {
      return this.generateOpenAIText(input);
    }

    if (input.provider === 'anthropic') {
      return this.generateAnthropicText(input);
    }

    return this.generateGoogleText(input);
  }

  private async resolveRemoteProviderAuth(provider: Exclude<ProviderId, 'ollama'>): Promise<RemoteProviderAuth> {
    const resolved = await this.remoteProviderAuthResolver?.(provider);
    if (!resolved || (!resolved.apiKey && !resolved.token)) {
      throw new Error(`No active ${provider} credential profile is available.`);
    }

    return resolved;
  }

  private async generateOpenAIText(input: {
    modelId: string;
    system: string;
    prompt: string;
    format?: 'json';
  }): Promise<string> {
    const auth = await this.resolveRemoteProviderAuth('openai');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.apiKey ?? auth.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.prompt }
        ],
        temperature: input.format === 'json' ? 0.15 : 0.35,
        ...(input.format === 'json' ? { response_format: { type: 'json_object' } } : {})
      })
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new Error(this.extractProviderErrorMessage('openai', response.status, response.statusText, payload));
    }

    const choice = Array.isArray(payload?.choices) ? payload?.choices[0] as Record<string, unknown> | undefined : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const text = this.extractMessageText(message?.content);
    if (!text) {
      throw new Error('OpenAI returned an empty response.');
    }

    return text;
  }

  private async generateAnthropicText(input: {
    modelId: string;
    system: string;
    prompt: string;
    format?: 'json';
  }): Promise<string> {
    const auth = await this.resolveRemoteProviderAuth('anthropic');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': auth.apiKey ?? auth.token ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: input.modelId,
        system: input.system,
        max_tokens: 4096,
        temperature: input.format === 'json' ? 0.15 : 0.35,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: input.prompt }]
          }
        ]
      })
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new Error(this.extractProviderErrorMessage('anthropic', response.status, response.statusText, payload));
    }

    const content = Array.isArray(payload?.content) ? payload.content as Array<Record<string, unknown>> : [];
    const text = content
      .filter((entry) => entry?.type === 'text' && typeof entry.text === 'string')
      .map((entry) => entry.text as string)
      .join('')
      .trim();
    if (!text) {
      throw new Error('Anthropic returned an empty response.');
    }

    return text;
  }

  private async generateGoogleText(input: {
    modelId: string;
    system: string;
    prompt: string;
    format?: 'json';
  }): Promise<string> {
    const auth = await this.resolveRemoteProviderAuth('google');
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    const search = new URLSearchParams();
    if (auth.apiKey) {
      search.set('key', auth.apiKey);
    } else if (auth.token) {
      headers.authorization = `Bearer ${auth.token}`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.modelId)}:generateContent?${search.toString()}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemInstruction: {
            role: 'system',
            parts: [{ text: input.system }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: input.prompt }]
            }
          ],
          generationConfig: {
            temperature: input.format === 'json' ? 0.15 : 0.35,
            ...(input.format === 'json' ? { responseMimeType: 'application/json' } : {})
          }
        })
      }
    );
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new Error(this.extractProviderErrorMessage('google', response.status, response.statusText, payload));
    }

    const candidates = Array.isArray(payload?.candidates) ? payload.candidates as Array<Record<string, unknown>> : [];
    const first = candidates[0];
    const content = first?.content as Record<string, unknown> | undefined;
    const parts = Array.isArray(content?.parts) ? content.parts as Array<Record<string, unknown>> : [];
    const text = parts
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (!text) {
      throw new Error('Google Gemini returned an empty response.');
    }

    return text;
  }

  private extractMessageText(content: unknown): string {
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object' && typeof (entry as { text?: unknown }).text === 'string') {
            return (entry as { text: string }).text;
          }
          return '';
        })
        .join('')
        .trim();
    }

    return '';
  }

  private extractProviderErrorMessage(
    provider: Exclude<ProviderId, 'ollama'>,
    status: number,
    statusText: string,
    payload: Record<string, unknown> | null
  ): string {
    let detail = '';
    if (provider === 'openai') {
      const error = payload?.error as Record<string, unknown> | undefined;
      detail = typeof error?.message === 'string' ? error.message : '';
    } else if (provider === 'anthropic') {
      const error = payload?.error as Record<string, unknown> | undefined;
      detail = typeof error?.message === 'string' ? error.message : '';
    } else {
      const error = payload?.error as Record<string, unknown> | undefined;
      detail = typeof error?.message === 'string'
        ? error.message
        : typeof payload?.message === 'string'
          ? payload.message
          : '';
    }

    const base = `${provider} request failed: ${status} ${statusText}`.trim();
    return this.redactSensitiveText(detail ? `${base} - ${detail}` : base);
  }

  private async listOllamaModels(): Promise<ProviderModelPreset[]> {
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

    return [...configured.values()];
  }

  private async listBridgeModels(): Promise<ProviderModelPreset[]> {
    try {
      const available = await this.isBridgeAvailable();
      if (!available) {
        return [];
      }

      return await this.withRuntimeBridgeHooks(async () => {
        const models = await this.runtimeBridge.listModels();
        return models.map((model) => {
          const provider = this.normalizeProviderId(model.provider);
          return {
            id: this.toProviderModelId(provider, model.id),
            provider,
            label: this.humanizeModelName(model.id),
            recommended: false,
            installed: model.installed,
          };
        });
      });
    } catch (error) {
      console.warn('[runtime] Runtime bridge model listing failed, using Ollama-only catalog:', error);
      return [];
    }
  }

  private async tryBridgePrism(input: PrismRequest): Promise<PrismReply | null> {
    const available = await this.isBridgeAvailable();
    if (!available) {
      return null;
    }

    try {
      const models = await this.listModels();
      const selectedModel = this.pickPrismBridgeModel(models);

      if (input.mode === 'create') {
        const response = await this.sendWithBridge({
          modelRef: selectedModel,
          system: this.buildPrismCreateSystemPrompt(),
          prompt: this.buildPrismCreatePrompt(input)
        });
        const parsed = this.parseJsonObject<Record<string, unknown>>(response.text);
        const createdAgent = this.normalizeAgentSpec(parsed, input.message, models);

        return {
          id: randomUUID(),
          text: `Created ${createdAgent.name}. Prism designed this chatbot through the runtime bridge with ${createdAgent.providerStrategy.mode.replaceAll('_', ' ')} strategy.`,
          provider: this.normalizeProviderId(response.provider),
          modelId: response.modelId,
          createdAgent
        };
      }

      const response = await this.sendWithBridge({
        modelRef: selectedModel,
        system: this.buildPrismAskSystemPrompt(),
        prompt: this.buildPrismAskPrompt(input)
      });

      return {
        id: randomUUID(),
        text: response.text,
        provider: this.normalizeProviderId(response.provider),
        modelId: response.modelId
      };
    } catch (error) {
      console.warn('[runtime] Runtime bridge execution failed, falling back to Ollama:', error);
      return null;
    }
  }

  private async tryBridgeTask(task: TaskSpec, context: TaskExecutionContext): Promise<TaskExecutionResult | null> {
    const available = await this.isBridgeAvailable();
    if (!available) {
      return null;
    }

    try {
      if (task.mode === 'council') {
        return await this.executeCouncil(task, context, 'bridge');
      }

      const models = await this.listModels();
      const modelRef = this.pickTaskBridgeModel(task, models);
      let targetAgent: AgentSpec | null = null;
      const taskTarget = task.target;
      if (taskTarget.type === 'agent') {
        targetAgent = context.agents.find((agent) => agent.id === taskTarget.agentId) ?? null;
      }

      const prompt = [
        task.target.type === 'prism'
          ? 'You are Prism in Supreme Raman AI. Execute the following scheduled autonomous task.'
          : `You are executing a scheduled task for the chatbot "${targetAgent?.name ?? 'Unknown Chatbot'}". Respect its role and instructions.`,
        targetAgent
          ? `Role: ${targetAgent.persona.role}\nMission: ${targetAgent.persona.mission}\nInstructions: ${targetAgent.persona.systemInstructions}`
          : '',
        this.formatUserMapSummary(context.userMap),
        `Task Objective:\n${task.objective}`
      ].filter(Boolean).join('\n\n');

      const response = await this.sendWithBridge({
        modelRef,
        system: 'Complete the scheduled task thoroughly. Return the finished output directly with no preamble.',
        prompt,
        ...(targetAgent?.tools?.length ? { tools: targetAgent.tools } : {}),
      });

      return {
        text: response.text,
        provider: this.normalizeProviderId(response.provider),
        modelId: response.modelId
      };
    } catch (error) {
      console.warn('[runtime] Runtime bridge task execution failed, falling back to Ollama:', error);
      return null;
    }
  }

  private async isBridgeAvailable(): Promise<boolean> {
    return this.withRuntimeBridgeHooks(async () => this.runtimeBridge.isAvailable());
  }

  private async withRuntimeBridgeHooks<T>(action: () => Promise<T>): Promise<T> {
    await this.runtimeBridgeHooks.beforeInvoke?.();
    try {
      return await action();
    } finally {
      await this.runtimeBridgeHooks.afterInvoke?.();
    }
  }

  async extractMemoryFacts(source: MemoryFact['source'], sourceRef: string, text: string, existingFacts: MemoryFact[]): Promise<MemoryFact[]> {
    if (!text.trim()) return [];

    const models = await this.listOllamaModels();
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

  private resolveCouncilExecutionModel(
    model: { provider: ProviderId; modelId: string },
    ollamaModels: ProviderModelPreset[]
  ): ExecutionModelRef {
    if (model.provider === 'ollama') {
      return {
        provider: 'ollama',
        modelId: this.resolveSupportedModel(
          'ollama',
          this.stripProviderPrefix('ollama', model.modelId),
          ollamaModels.filter((candidate) => candidate.installed).map((candidate) => candidate.id)
        )
      };
    }

    return {
      provider: model.provider,
      modelId: this.stripProviderPrefix(model.provider, model.modelId),
      ...(this.safePickOllamaModelId(ollamaModels) ? { fallbackOllamaModelId: this.safePickOllamaModelId(ollamaModels) } : {})
    };
  }

  private async executeCouncilDirect(
    task: TaskSpec,
    context: TaskExecutionContext,
    ollamaModels: ProviderModelPreset[]
  ): Promise<TaskExecutionResult> {
    const defaultExecution = this.resolveTaskExecutionModel(task, context, ollamaModels);
    const workers = task.council?.workerModels.length
      ? task.council.workerModels.map((worker) => this.resolveCouncilExecutionModel(worker, ollamaModels))
      : [defaultExecution];
    const judge = task.council?.judgeModel
      ? this.resolveCouncilExecutionModel(task.council.judgeModel, ollamaModels)
      : (workers[0] ?? defaultExecution);

    const sharedBrief = [
      'You are part of a council run in Supreme Raman AI.',
      'Produce a strong answer to the task objective using the supplied context.',
      this.formatUserMapSummary(context.userMap),
      `Objective:\n${task.objective}`
    ].join('\n\n');

    const trace: Array<{ modelId: string; stage: 'worker' | 'revision' | 'judge'; output: string }> = [];
    const workerDrafts: Array<{ execution: ExecutionModelRef; output: string }> = [];

    for (const worker of workers) {
      const result = await this.generateWithFallback({
        execution: worker,
        system: 'You are a council worker. Produce a concrete first-pass answer.',
        prompt: sharedBrief
      });
      trace.push({ modelId: this.toProviderModelId(result.provider, result.modelId), stage: 'worker', output: result.text });
      workerDrafts.push({ execution: worker, output: result.text });
    }

    const revisedDrafts: Array<{ execution: ExecutionModelRef; output: string }> = [];
    for (const draft of workerDrafts) {
      const peerOutputs = workerDrafts
        .filter((candidate) => candidate !== draft)
        .map((candidate) => `Peer:\n${candidate.output}`)
        .join('\n\n');

      const result = await this.generateWithFallback({
        execution: draft.execution,
        system: 'Revise your answer after considering peer outputs. Keep the best parts and improve weaknesses.',
        prompt: `${sharedBrief}\n\nYour original draft:\n${draft.output}\n\nPeer outputs:\n${peerOutputs}`
      });
      trace.push({ modelId: this.toProviderModelId(result.provider, result.modelId), stage: 'revision', output: result.text });
      revisedDrafts.push({ execution: draft.execution, output: result.text });
    }

    const judgePrompt = revisedDrafts
      .map((draft, index) => `Revised worker output (${index + 1}):\n${draft.output}`)
      .join('\n\n');
    const judgeResult = await this.generateWithFallback({
      execution: judge,
      system: 'You are the council judge. Synthesize the strongest final answer from the revised worker outputs.',
      prompt: `${sharedBrief}\n\n${judgePrompt}`
    });

    trace.push({ modelId: this.toProviderModelId(judgeResult.provider, judgeResult.modelId), stage: 'judge', output: judgeResult.text });

    return {
      text: judgeResult.text,
      provider: judgeResult.provider,
      modelId: judgeResult.modelId,
      councilTrace: trace
    };
  }

  private async executeCouncil(
    task: TaskSpec,
    context: TaskExecutionContext,
    runtime: 'ollama' | 'bridge'
  ): Promise<TaskExecutionResult> {
    const models = runtime === 'bridge' ? await this.listModels() : await this.listOllamaModels();
    const installedModels = models.filter((model) => model.installed);
    const installedModelIds = installedModels.map((model) => model.id);
    const workers = task.council?.workerModels.length
      ? task.council.workerModels.map((worker) => (
        runtime === 'bridge'
          ? this.resolveBridgeModel(worker.provider, worker.modelId, installedModels)
          : this.resolveSupportedModel(worker.provider, worker.modelId, installedModelIds)
      ))
      : [runtime === 'bridge' ? this.pickBridgeModel(models) : this.pickModelId(models)];
    const judge = task.council?.judgeModel
      ? (
        runtime === 'bridge'
          ? this.resolveBridgeModel(task.council.judgeModel.provider, task.council.judgeModel.modelId, installedModels)
          : this.resolveSupportedModel(task.council.judgeModel.provider, task.council.judgeModel.modelId, installedModelIds)
      )
      : (workers[0] ?? (runtime === 'bridge' ? this.pickBridgeModel(models) : this.pickModelId(models)));

    const sharedBrief = [
      'You are part of a council run in Supreme Raman AI.',
      'Produce a strong answer to the task objective using the supplied context.',
      this.formatUserMapSummary(context.userMap),
      `Objective:\n${task.objective}`
    ].join('\n\n');

    const trace: Array<{ modelId: string; stage: 'worker' | 'revision' | 'judge'; output: string }> = [];
    const workerDrafts: Array<{ modelId: string; output: string }> = [];

    for (const workerModelId of workers) {
      const output = runtime === 'bridge'
        ? (await this.sendWithBridge({
          modelRef: workerModelId,
          system: 'You are a council worker. Produce a concrete first-pass answer.',
          prompt: sharedBrief
        })).text
        : await this.generateText({
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

      const output = runtime === 'bridge'
        ? (await this.sendWithBridge({
          modelRef: draft.modelId,
          system: 'Revise your answer after considering peer outputs. Keep the best parts and improve weaknesses.',
          prompt: `${sharedBrief}\n\nYour original draft:\n${draft.output}\n\nPeer outputs:\n${peerOutputs}`
        })).text
        : await this.generateText({
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

    const judgeResult = runtime === 'bridge'
      ? await this.sendWithBridge({
        modelRef: judge,
        system: 'You are the council judge. Synthesize the strongest final answer from the revised worker outputs.',
        prompt: `${sharedBrief}\n\n${judgePrompt}`
      })
      : {
        text: await this.generateText({
          modelId: judge,
          system: 'You are the council judge. Synthesize the strongest final answer from the revised worker outputs.',
          prompt: `${sharedBrief}\n\n${judgePrompt}`
        }),
        provider: 'ollama',
        modelId: judge
      };
    const text = judgeResult.text;

    trace.push({ modelId: judge, stage: 'judge', output: text });

    return {
      text,
      provider: runtime === 'bridge' ? this.normalizeProviderId(judgeResult.provider) : 'ollama',
      modelId: runtime === 'bridge' ? judgeResult.modelId : judge,
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

  private async generateTextNonStreaming(input: { modelId: string; system: string; prompt: string; format?: 'json' }) {
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

  /**
   * Accumulate Ollama `/generate` with `stream: true` (NDJSON). Falls back to a single non-streaming request on failure.
   */
  private async generateText(input: { modelId: string; system: string; prompt: string; format?: 'json' }) {
    try {
      const chunks: string[] = [];
      for await (const chunk of this.generateTextStream(input)) {
        chunks.push(chunk);
      }
      const text = chunks.join('').trim();
      if (!text) {
        throw new Error('Ollama returned an empty response.');
      }
      return text;
    } catch {
      return this.generateTextNonStreaming(input);
    }
  }

  /**
   * Yields each `response` fragment from Ollama's streaming `/generate` API (NDJSON lines).
   */
  async *generateTextStream(input: { modelId: string; system: string; prompt: string; format?: 'json' }): AsyncGenerator<string> {
    const response = await fetch(`${OLLAMA_API}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.modelId,
        system: input.system,
        prompt: input.prompt,
        stream: true,
        format: input.format,
        options: {
          temperature: input.format === 'json' ? 0.15 : 0.35
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error('Ollama returned no response body for streaming request.');
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const parsed = JSON.parse(trimmed) as { response?: string; done?: boolean };
            if (parsed.response) {
              yield parsed.response;
            }
            if (parsed.done) {
              return;
            }
          } catch {
            // Skip malformed NDJSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildEphemeralAgentTask(agentId: string, objective: string): TaskSpec {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      title: 'Ad hoc chat execution',
      objective,
      mode: 'task',
      target: { type: 'agent', agentId },
      schedule: { kind: 'once', runAt: now, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      outputPolicy: {
        saveResult: true,
        artifactMode: 'none',
        notificationMode: 'none',
        defaultSendToChat: false
      },
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
      runCount: 0,
      artifactIds: []
    };
  }

  /**
   * Stream a chat response for an agent. Uses Ollama streaming when agent mode is `ollama`; otherwise runs the same path as `executeTask` and emits the full reply once (bridge / non-local).
   * On Ollama streaming failure, falls back to `generateTextNonStreaming` and delivers a single chunk.
   */
  async streamAgentChat(
    input: {
      agent: AgentSpec;
      objective: string;
      userMap: UserMapState;
      context: TaskExecutionContext;
    },
    onToken: StreamTokenCallback
  ): Promise<StreamResult> {
    if (this.agentMode !== 'ollama') {
      const task = this.buildEphemeralAgentTask(input.agent.id, input.objective);
      const result = await this.executeTask(task, input.context);
      onToken(result.text);
      return {
        text: result.text.trim(),
        provider: result.provider,
        modelId: result.modelId
      };
    }

    const models = await this.listOllamaModels();
    const modelId = this.pickModelId(models);

    const system = [
      `You are "${input.agent.name}".`,
      `Role: ${input.agent.persona.role}`,
      `Mission: ${input.agent.persona.mission}`,
      input.agent.persona.systemInstructions
    ].filter(Boolean).join('\n');

    const prompt = [
      this.formatUserMapSummary(input.userMap),
      input.objective
    ].filter(Boolean).join('\n\n');

    let full = '';
    try {
      for await (const token of this.generateTextStream({ modelId, system, prompt })) {
        full += token;
        if (onToken(token) === false) {
          break;
        }
      }
    } catch {
      const text = await this.generateTextNonStreaming({ modelId, system, prompt });
      full = text;
      onToken(text);
    }

    return {
      text: full.trim(),
      provider: 'ollama',
      modelId
    };
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

  private pickBridgeModel(models: ProviderModelPreset[]): string {
    const installed = models.filter((model) => model.installed);
    const preferred = DEFAULT_MODEL_PRESETS.find((preset) => installed.some((model) => model.id === preset.id));
    const selected = preferred
      ? installed.find((model) => model.id === preferred.id)
      : installed[0];
    if (!selected) {
      throw new Error('No runtime bridge-backed models are available yet.');
    }

    return this.toProviderModelId(selected.provider, selected.id);
  }

  private pickTaskModel(task: TaskSpec, models: ProviderModelPreset[]): string {
    if (task.providerOverride) {
      return this.resolveSupportedModel(task.providerOverride.provider, task.providerOverride.modelId, models.filter((model) => model.installed).map((model) => model.id));
    }

    return this.pickModelId(models);
  }

  private pickTaskBridgeModel(task: TaskSpec, models: ProviderModelPreset[]): string {
    if (task.providerOverride) {
      return this.resolveBridgeModel(task.providerOverride.provider, task.providerOverride.modelId, models.filter((model) => model.installed));
    }

    return this.pickBridgeModel(models);
  }

  private pickPrismBridgeModel(models: ProviderModelPreset[]): string {
    if (this.prismOverride) {
      return this.resolveBridgeModel(this.prismOverride.provider, this.prismOverride.modelId, models.filter((model) => model.installed));
    }

    return this.pickBridgeModel(models);
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

  private resolveBridgeModel(provider: ProviderId, modelId: string, models: ProviderModelPreset[]): string {
    const normalizedId = this.toProviderModelId(provider, modelId);
    const installed = models.some((model) => model.installed && this.toProviderModelId(model.provider, model.id) === normalizedId);
    if (!installed) {
      throw new Error(`Model "${normalizedId}" is not available through the runtime bridge.`);
    }

    return normalizedId;
  }

  private async sendWithBridge(input: { modelRef: string; system: string; prompt: string; tools?: string[] }): Promise<BridgePromptResult> {
    return this.withRuntimeBridgeHooks(async () => this.runtimeBridge.sendPrompt({
      model: input.modelRef,
      systemPrompt: input.system,
      userPrompt: input.prompt,
      ...(input.tools?.length ? { tools: input.tools } : {})
    }));
  }

  private normalizeProviderId(provider: string): ProviderId {
    if (provider === 'openai' || provider === 'anthropic' || provider === 'google' || provider === 'ollama') {
      return provider;
    }

    return 'ollama';
  }

  private toProviderModelId(provider: ProviderId, modelId: string): string {
    if (modelId.startsWith(`${provider}/`)) {
      return modelId;
    }

    return provider === 'ollama' ? modelId : `${provider}/${modelId}`;
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

  private redactSensitiveText(value: string) {
    return value
      .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_OPENAI_KEY]')
      .replace(/\bAIza[0-9A-Za-z\-_]{12,}\b/g, '[REDACTED_GOOGLE_KEY]')
      .replace(/\bBearer\s+[A-Za-z0-9._\-+/=]+\b/gi, 'Bearer [REDACTED]')
      .replace(/((?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]');
  }

  private looksSensitive(value: string) {
    return /(api[_-]?key|secret|token|password|sk-)/i.test(value);
  }
}
