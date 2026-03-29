import { createHash, randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import {
  AgentMode,
  AgentSpec,
  DEFAULT_MODEL_PRESETS,
  GroupSpec,
  MemoryCategory,
  MemoryFact,
  AssistantReply,
  AssistantRequest,
  AssistantProviderOverrideSettings,
  ProviderId,
  ProviderModelPreset,
  TaskSpec,
  ContextTreeNode,
  ContextTreeState
} from '@raman-ai/shared';
import OpenAI from 'openai';
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

interface GenerationInput {
  provider?: ProviderId;
  modelId: string;
  system: string;
  prompt: string;
  format?: 'json';
}

interface RemoteGenerationInput extends GenerationInput {
  provider: Exclude<ProviderId, 'ollama'>;
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
  contextTree: ContextTreeState;
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
  private assistantOverride: AssistantProviderOverrideSettings | null = null;
  private agentMode: AgentMode = 'auto';
  private remoteProviderAuthResolver: RemoteProviderAuthResolver | null = null;
  private readonly runtimeBridge = new RuntimeBridge();

  setWorkspaceRoot(rootDir: string) {
    this.workspaceRoot = rootDir;
  }

  setRuntimeBridgeHooks(hooks: RuntimeBridgeHooks) {
    this.runtimeBridgeHooks = hooks;
  }

  setAssistantProviderOverride(override: AssistantProviderOverrideSettings | null) {
    this.assistantOverride = override;
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

  async sendAssistantRequest(input: AssistantRequest): Promise<AssistantReply> {
    const ollamaModels = await this.listOllamaModels();
    const assistantExecution = this.resolveAssistantExecutionModel(ollamaModels);
    if (assistantExecution.provider !== 'ollama') {
      try {
        if (input.mode === 'create') {
          const response = await this.generateWithFallback({
            execution: assistantExecution,
            system: this.buildAssistantCreateSystemPrompt(),
            prompt: this.buildAssistantCreatePrompt(input),
            format: 'json'
          });
          const parsed = this.parseJsonObject<Record<string, unknown>>(response.text);
          const createdAgent = this.normalizeAgentSpec(parsed, input.message, ollamaModels);

          return {
            id: randomUUID(),
            text: `Created ${createdAgent.name}. Assistant designed this chatbot for local execution with ${createdAgent.providerStrategy.mode.replaceAll('_', ' ')} strategy.`,
            provider: response.provider,
            modelId: response.modelId,
            createdAgent
          };
        }

        const response = await this.generateWithFallback({
          execution: assistantExecution,
          system: this.buildAssistantAskSystemPrompt(),
          prompt: this.buildAssistantAskPrompt(input)
        });

        return {
          id: randomUUID(),
          text: response.text,
          provider: response.provider,
          modelId: response.modelId
        };
      } catch (error) {
        console.warn(
          `[runtime] ${assistantExecution.provider} Assistant execution failed, falling back to Ollama: ${this.redactSensitiveText(error instanceof Error ? error.message : String(error))}`
        );
      }
    }

    if (assistantExecution.provider === 'ollama' && this.agentMode !== 'ollama') {
      const bridgeReply = await this.tryBridgeAssistant(input);
      if (bridgeReply) {
        return bridgeReply;
      }
    }

    const overrideModelId = this.assistantOverride?.provider === 'ollama' ? this.assistantOverride.modelId : null;
    const modelId = overrideModelId && ollamaModels.some((model) => model.installed && model.id === overrideModelId)
      ? overrideModelId
      : this.pickModelId(ollamaModels);

    if (input.mode === 'create') {
      const jsonText = await this.generateText({
        modelId,
        system: this.buildAssistantCreateSystemPrompt(),
        prompt: this.buildAssistantCreatePrompt(input),
        format: 'json'
      });

      const parsed = this.parseJsonObject<Record<string, unknown>>(jsonText);
      const createdAgent = this.normalizeAgentSpec(parsed, input.message, ollamaModels);

      return {
        id: randomUUID(),
        text: `Created ${createdAgent.name}. Assistant designed this chatbot for local execution with ${createdAgent.providerStrategy.mode.replaceAll('_', ' ')} strategy.`,
        provider: 'ollama',
        modelId,
        createdAgent
      };
    }

    const text = await this.generateText({
      modelId,
      system: this.buildAssistantAskSystemPrompt(),
      prompt: this.buildAssistantAskPrompt(input)
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
      task.target.type === 'assistant'
        ? 'You are Raman AI. Execute the following scheduled autonomous task.'
        : `You are executing a scheduled task for the chatbot "${targetAgent?.name ?? 'Unknown Chatbot'}". Respect its role and instructions.`,
      targetAgent ? `Role: ${targetAgent.persona.role}\nMission: ${targetAgent.persona.mission}\nInstructions: ${targetAgent.persona.systemInstructions}` : '',
      this.formatContextTreeSummary(context.contextTree),
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

  private resolveAssistantExecutionModel(ollamaModels: ProviderModelPreset[]): ExecutionModelRef {
    if (this.assistantOverride) {
      if (this.assistantOverride.provider === 'ollama') {
        return {
          provider: 'ollama',
          modelId: this.resolveSupportedModel(
            'ollama',
            this.stripProviderPrefix('ollama', this.assistantOverride.modelId),
            ollamaModels.filter((model) => model.installed).map((model) => model.id)
          )
        };
      }

      return {
        provider: this.assistantOverride.provider,
        modelId: this.stripProviderPrefix(this.assistantOverride.provider, this.assistantOverride.modelId),
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
          provider: 'ollama',
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
        text: await this.generateText({
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
          provider: 'ollama',
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

  private async generateByProvider(input: RemoteGenerationInput): Promise<string> {
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

  private temperatureForFormat(format?: 'json'): number {
    return format === 'json' ? 0.15 : 0.35;
  }

  private buildOpenAIMessages(input: Pick<GenerationInput, 'system' | 'prompt'>) {
    return [
      { role: 'system' as const, content: input.system },
      { role: 'user' as const, content: input.prompt }
    ];
  }

  private buildAnthropicMessages(input: Pick<GenerationInput, 'prompt'>) {
    return [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: input.prompt }]
      }
    ];
  }

  private buildGoogleContents(input: Pick<GenerationInput, 'prompt'>) {
    return [
      {
        role: 'user' as const,
        parts: [{ text: input.prompt }]
      }
    ];
  }

  private buildGoogleConfig(input: Pick<GenerationInput, 'system' | 'format'>) {
    return {
      systemInstruction: input.system,
      temperature: this.temperatureForFormat(input.format),
      maxOutputTokens: 4096,
      ...(input.format === 'json' ? { responseMimeType: 'application/json' } : {})
    };
  }

  private async generateOpenAIText(input: RemoteGenerationInput): Promise<string> {
    const auth = await this.resolveRemoteProviderAuth('openai');
    const client = new OpenAI({
      apiKey: auth.apiKey ?? auth.token
    });
    const completion = await client.chat.completions.create({
      model: input.modelId,
      messages: this.buildOpenAIMessages(input),
      temperature: this.temperatureForFormat(input.format),
      ...(input.format === 'json' ? { response_format: { type: 'json_object' as const } } : {})
    });
    const text = this.extractMessageText(completion.choices[0]?.message?.content);
    if (!text) {
      throw new Error('OpenAI returned an empty response.');
    }

    return text;
  }

  private async *generateOpenAITextStream(input: RemoteGenerationInput): AsyncGenerator<string> {
    const auth = await this.resolveRemoteProviderAuth('openai');
    const client = new OpenAI({
      apiKey: auth.apiKey ?? auth.token
    });
    const stream = await client.chat.completions.create({
      model: input.modelId,
      messages: this.buildOpenAIMessages(input),
      temperature: this.temperatureForFormat(input.format),
      stream: true,
      ...(input.format === 'json' ? { response_format: { type: 'json_object' as const } } : {})
    });

    for await (const chunk of stream) {
      const text = this.extractMessageText(chunk.choices[0]?.delta?.content, { trim: false });
      if (text) {
        yield text;
      }
    }
  }

  private async generateAnthropicText(input: RemoteGenerationInput): Promise<string> {
    const auth = await this.resolveRemoteProviderAuth('anthropic');
    const client = new Anthropic({
      ...(auth.apiKey ? { apiKey: auth.apiKey } : {}),
      ...(auth.token ? { authToken: auth.token } : {})
    });
    const message = await client.messages.create({
      model: input.modelId,
      system: input.system,
      max_tokens: 4096,
      temperature: this.temperatureForFormat(input.format),
      messages: this.buildAnthropicMessages(input)
    });
    const text = message.content
      .filter((entry) => entry.type === 'text')
      .map((entry) => entry.text)
      .join('')
      .trim();
    if (!text) {
      throw new Error('Anthropic returned an empty response.');
    }

    return text;
  }

  private async *generateAnthropicTextStream(input: RemoteGenerationInput): AsyncGenerator<string> {
    const auth = await this.resolveRemoteProviderAuth('anthropic');
    const client = new Anthropic({
      ...(auth.apiKey ? { apiKey: auth.apiKey } : {}),
      ...(auth.token ? { authToken: auth.token } : {})
    });
    const stream = await client.messages.create({
      model: input.modelId,
      system: input.system,
      max_tokens: 4096,
      temperature: this.temperatureForFormat(input.format),
      messages: this.buildAnthropicMessages(input),
      stream: true
    });

    for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
      if (event.type !== 'content_block_delta') {
        continue;
      }

      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        yield delta.text;
      }
    }
  }

  private async generateGoogleText(input: RemoteGenerationInput): Promise<string> {
    const auth = await this.resolveRemoteProviderAuth('google');
    if (!auth.apiKey && auth.token) {
      return this.generateGoogleTextWithToken(input, auth.token);
    }
    if (!auth.apiKey) {
      throw new Error('No active google API key is available.');
    }

    const client = new GoogleGenAI({
      apiKey: auth.apiKey
    });
    const response = await client.models.generateContent({
      model: input.modelId,
      contents: this.buildGoogleContents(input),
      config: this.buildGoogleConfig(input)
    });
    const text = response.text?.trim();
    if (!text) {
      throw new Error('Google Gemini returned an empty response.');
    }

    return text;
  }

  private async *generateGoogleTextStream(input: RemoteGenerationInput): AsyncGenerator<string> {
    const auth = await this.resolveRemoteProviderAuth('google');
    if (!auth.apiKey && auth.token) {
      yield await this.generateGoogleTextWithToken(input, auth.token);
      return;
    }
    if (!auth.apiKey) {
      throw new Error('No active google API key is available.');
    }

    const client = new GoogleGenAI({
      apiKey: auth.apiKey
    });
    const stream = await client.models.generateContentStream({
      model: input.modelId,
      contents: this.buildGoogleContents(input),
      config: this.buildGoogleConfig(input)
    });

    for await (const chunk of stream) {
      const text = chunk.text ?? '';
      if (text) {
        yield text;
      }
    }
  }

  private async generateGoogleTextWithToken(input: RemoteGenerationInput, token: string): Promise<string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.modelId)}:generateContent`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: this.buildGoogleContents(input),
          generationConfig: {
            temperature: this.temperatureForFormat(input.format),
            maxOutputTokens: 4096,
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

  private async *generateTextStreamByProvider(input: RemoteGenerationInput): AsyncGenerator<string> {
    if (input.provider === 'openai') {
      yield* this.generateOpenAITextStream(input);
      return;
    }

    if (input.provider === 'anthropic') {
      yield* this.generateAnthropicTextStream(input);
      return;
    }

    yield* this.generateGoogleTextStream(input);
  }

  private extractMessageText(content: unknown, options?: { trim?: boolean }): string {
    const trim = options?.trim ?? true;
    if (typeof content === 'string') {
      return trim ? content.trim() : content;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object' && typeof (entry as { text?: unknown }).text === 'string') {
            return (entry as { text: string }).text;
          }
          return '';
        })
        .join('');
      return trim ? text.trim() : text;
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

  private async tryBridgeAssistant(input: AssistantRequest): Promise<AssistantReply | null> {
    const available = await this.isBridgeAvailable();
    if (!available) {
      return null;
    }

    try {
      const models = await this.listModels();
      const selectedModel = this.pickAssistantBridgeModel(models);

      if (input.mode === 'create') {
        const response = await this.sendWithBridge({
          modelRef: selectedModel,
          system: this.buildAssistantCreateSystemPrompt(),
          prompt: this.buildAssistantCreatePrompt(input)
        });
        const parsed = this.parseJsonObject<Record<string, unknown>>(response.text);
        const createdAgent = this.normalizeAgentSpec(parsed, input.message, models);

        return {
          id: randomUUID(),
          text: `Created ${createdAgent.name}. Assistant designed this chatbot through the runtime bridge with ${createdAgent.providerStrategy.mode.replaceAll('_', ' ')} strategy.`,
          provider: this.normalizeProviderId(response.provider),
          modelId: response.modelId,
          createdAgent
        };
      }

      const response = await this.sendWithBridge({
        modelRef: selectedModel,
        system: this.buildAssistantAskSystemPrompt(),
        prompt: this.buildAssistantAskPrompt(input)
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
        task.target.type === 'assistant'
          ? 'You are Assistant in Workspace. Execute the following scheduled autonomous task.'
          : `You are executing a scheduled task for the chatbot "${targetAgent?.name ?? 'Unknown Chatbot'}". Respect its role and instructions.`,
        targetAgent
          ? `Role: ${targetAgent.persona.role}\nMission: ${targetAgent.persona.mission}\nInstructions: ${targetAgent.persona.systemInstructions}`
          : '',
        this.formatContextTreeSummary(context.contextTree),
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
      'You are part of a council run in Raman AI.',
      'Produce a strong answer to the task objective using the supplied context.',
      this.formatContextTreeSummary(context.contextTree),
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
      'You are part of a council run in Raman AI.',
      'Produce a strong answer to the task objective using the supplied context.',
      this.formatContextTreeSummary(context.contextTree),
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

  private buildAssistantAskSystemPrompt() {
    return [
      'You are Raman AI, the built-in assistant.',
      'You are a prompt, context, and execution architect for a local-first AI system.',
      'If the user simply says "Hi", "Hello", or provides a casual greeting, respond warmly and conversationally without trying to build an agent.',
      'Only provide advice on setting up an agent if the user explicitly asks for it or provides an objective.',
      'Be concise, practical, and specific.',
      'Ground your answer in the user context provided. If local runtime limitations matter, say so plainly.'
    ].join(' ');
  }

  private buildAssistantAskPrompt(input: AssistantRequest) {
    return [
      `User objective:\n${input.message}`,
      this.formatContextTreeSummary(input.contextTree),
      input.existingAgents.length ? `Existing chatbots:\n${input.existingAgents.map((agent) => `- ${agent.name}: ${agent.description}`).join('\n')}` : 'Existing chatbots:\n- none yet',
      input.existingGroups.length ? `Existing groups:\n${input.existingGroups.map((group) => `- ${group.name}`).join('\n')}` : 'Existing groups:\n- none yet'
    ].join('\n\n');
  }

  private buildAssistantCreateSystemPrompt() {
    return [
      'You are Raman AI, the built-in assistant.',
      'Create a single JSON object representing a local-execution chatbot spec.',
      'Return JSON only. No markdown. No prose.',
      'Respect these runtime rules: local-first, Ollama-first, group chats may auto-route by default, explicit @mentions pin routing, scheduled tasks supported, recurring tasks supported, council eligible when useful.'
    ].join(' ');
  }

  private buildAssistantCreatePrompt(input: AssistantRequest) {
    return [
      'Design one persistent chatbot from the following user objective.',
      `Objective:\n${input.message}`,
      this.formatContextTreeSummary(input.contextTree),
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
          contextPaths: ['user/preferences', 'user/projects'],
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
    const name = this.asString(parsed.name) || 'Assistant Chatbot';
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
          contextPaths: ['user/preferences', 'user/projects'],
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
      createdBy: 'assistant',
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
        contextPaths: this.asStringArray(context.contextPaths) || ['user/preferences', 'user/projects'],
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
        source: 'assistant-create'
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

  private async generateTextNonStreaming(input: GenerationInput) {
    const provider = input.provider ?? 'ollama';
    if (provider !== 'ollama') {
      return this.generateByProvider({
        ...input,
        provider
      });
    }

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
   * Accumulate provider-native streaming output when available. Falls back to a single non-streaming request on failure.
   */
  private async generateText(input: GenerationInput) {
    const provider = input.provider ?? 'ollama';
    try {
      const chunks: string[] = [];
      for await (const chunk of this.generateTextStream(input)) {
        chunks.push(chunk);
      }
      const text = chunks.join('').trim();
      if (!text) {
        throw new Error(`${provider} returned an empty response.`);
      }
      return text;
    } catch {
      return this.generateTextNonStreaming(input);
    }
  }

  /**
   * Yields streaming text fragments from Ollama or a remote provider when native streaming is available.
   */
  async *generateTextStream(input: GenerationInput): AsyncGenerator<string> {
    const provider = input.provider ?? 'ollama';
    if (provider !== 'ollama') {
      yield* this.generateTextStreamByProvider({
        ...input,
        provider
      });
      return;
    }

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

  private async streamWithFallback(input: {
    execution: ExecutionModelRef;
    system: string;
    prompt: string;
    onToken: StreamTokenCallback;
    format?: 'json';
  }): Promise<{ text: string; provider: ProviderId; modelId: string }> {
    const streamSingleProvider = async (provider: ProviderId, modelId: string) => {
      let full = '';

      try {
        for await (const token of this.generateTextStream({
          provider,
          modelId,
          system: input.system,
          prompt: input.prompt,
          ...(input.format ? { format: input.format } : {})
        })) {
          full += token;
          if (input.onToken(token) === false) {
            break;
          }
        }
      } catch {
        if (full.trim()) {
          return full.trim();
        }
      }

      if (full.trim()) {
        return full.trim();
      }

      const text = (await this.generateTextNonStreaming({
        provider,
        modelId,
        system: input.system,
        prompt: input.prompt,
        ...(input.format ? { format: input.format } : {})
      })).trim();
      if (text) {
        input.onToken(text);
        return text;
      }

      throw new Error(`${provider} returned an empty response.`);
    };

    if (input.execution.provider === 'ollama') {
      return {
        text: await streamSingleProvider('ollama', input.execution.modelId),
        provider: 'ollama',
        modelId: input.execution.modelId
      };
    }

    try {
      return {
        text: await streamSingleProvider(input.execution.provider, input.execution.modelId),
        provider: input.execution.provider,
        modelId: input.execution.modelId
      };
    } catch (error) {
      if (!input.execution.fallbackOllamaModelId) {
        throw error;
      }

      console.warn(
        `[runtime] ${input.execution.provider} streaming request failed, falling back to Ollama: ${this.redactSensitiveText(error instanceof Error ? error.message : String(error))}`
      );

      return {
        text: await streamSingleProvider('ollama', input.execution.fallbackOllamaModelId),
        provider: 'ollama',
        modelId: input.execution.fallbackOllamaModelId
      };
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
   * Stream a chat response for an agent. Uses provider-native streaming for direct
   * remote execution when available, Ollama NDJSON for local execution, and falls
   * back to a one-shot response when only non-streaming execution is available.
   */
  async streamAgentChat(
    input: {
      agent: AgentSpec;
      objective: string;
      contextTree: ContextTreeState;
      context: TaskExecutionContext;
    },
    onToken: StreamTokenCallback
  ): Promise<StreamResult> {
    const models = await this.listOllamaModels();
    const execution = this.resolveAgentExecutionModel(
      input.agent,
      models,
      this.pickFallbackOllamaModelId(input.agent, models)
    );

    const system = [
      `You are "${input.agent.name}".`,
      `Role: ${input.agent.persona.role}`,
      `Mission: ${input.agent.persona.mission}`,
      input.agent.persona.systemInstructions
    ].filter(Boolean).join('\n');

    const prompt = [
      this.formatContextTreeSummary(input.contextTree),
      input.objective
    ].filter(Boolean).join('\n\n');

    if (execution.provider === 'ollama' && this.agentMode !== 'ollama') {
      const task = this.buildEphemeralAgentTask(input.agent.id, input.objective);
      const result = await this.executeTask(task, input.context);
      onToken(result.text);
      return {
        text: result.text.trim(),
        provider: result.provider,
        modelId: result.modelId
      };
    }

    const result = await this.streamWithFallback({
      execution,
      system,
      prompt,
      onToken
    });

    return {
      text: result.text.trim(),
      provider: result.provider,
      modelId: result.modelId
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
    if (task.providerOverride?.provider === 'ollama') {
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

  private pickAssistantBridgeModel(models: ProviderModelPreset[]): string {
    if (this.assistantOverride) {
      return this.resolveBridgeModel(this.assistantOverride.provider, this.assistantOverride.modelId, models.filter((model) => model.installed));
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

  private formatContextTreeTree(root: ContextTreeNode) {
    const lines: string[] = [];
    const visit = (node: ContextTreeNode, depth: number) => {
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

  private formatContextTreeSummary(contextTree: ContextTreeState) {
    const sections = [
      'Context:',
      '',
      'Public:',
      this.formatContextTreeTree(contextTree.publicTree),
      '',
      'Private:',
      this.formatContextTreeTree(contextTree.privateTree)
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
