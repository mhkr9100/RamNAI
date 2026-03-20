import { contextBridge, ipcRenderer } from 'electron';
import { channels } from './preload-api.js';

contextBridge.exposeInMainWorld('supreme', {
  profile: {
    get: () => ipcRenderer.invoke(channels.profileGet),
    save: (profile: unknown) => ipcRenderer.invoke(channels.profileSave, profile)
  },
  workspace: {
    getSnapshot: () => ipcRenderer.invoke(channels.workspaceSnapshot),
    createBackupExport: () => ipcRenderer.invoke(channels.workspaceBackupExport),
    listTasksPaginated: (limit: number, offset: number) =>
      ipcRenderer.invoke(channels.workspaceListTasksPaginated, limit, offset),
    listWorkItemsPaginated: (limit: number, offset: number) =>
      ipcRenderer.invoke(channels.workspaceListWorkItemsPaginated, limit, offset),
    listChatThreadsPaginated: (limit: number, offset: number) =>
      ipcRenderer.invoke(channels.workspaceListChatThreadsPaginated, limit, offset)
  },
  userMap: {
    save: (tree: unknown) => ipcRenderer.invoke(channels.userMapSave, tree),
    syncMemories: () => ipcRenderer.invoke(channels.userMapSync)
  },
  groups: {
    upsert: (group: unknown) => ipcRenderer.invoke(channels.groupUpsert, group),
    delete: (groupId: string) => ipcRenderer.invoke(channels.groupDelete, groupId)
  },
  prism: {
    sendMessage: (input: unknown) => ipcRenderer.invoke(channels.prismSend, input)
  },
  chat: {
    sendAgentMessage: (input: unknown) => ipcRenderer.invoke(channels.agentChat, input),
    sendAgentMessageStream: (input: unknown) => ipcRenderer.invoke(channels.agentChatStream, input),
    onStreamToken: (callback: (_event: unknown, data: { streamId: string; token: string; done: boolean; error?: string }) => void) => {
      ipcRenderer.on(channels.agentChatStreamToken, callback as (...args: unknown[]) => void);
    },
    offStreamToken: () => {
      ipcRenderer.removeAllListeners(channels.agentChatStreamToken);
    },
    sendGroupMessage: (input: unknown) => ipcRenderer.invoke(channels.groupChat, input),
    deleteThread: (threadId: string) => ipcRenderer.invoke(channels.threadDelete, threadId)
  },
  tasks: {
    create: (task: unknown) => ipcRenderer.invoke(channels.taskCreate, task),
    delete: (taskId: string) => ipcRenderer.invoke(channels.taskDelete, taskId),
    duplicate: (taskId: string) => ipcRenderer.invoke(channels.taskDuplicate, taskId),
    rerun: (taskId: string) => ipcRenderer.invoke(channels.taskRerun, taskId)
  },
  work: {
    delete: (workItemId: string) => ipcRenderer.invoke(channels.workDelete, workItemId),
    openArtifact: (artifactId: string) => ipcRenderer.invoke(channels.artifactOpen, artifactId)
  },
  settings: {
    listProviderProfiles: () => ipcRenderer.invoke(channels.providerAuthList),
    saveProviderProfile: (input: unknown) => ipcRenderer.invoke(channels.providerAuthUpsert, input),
    deleteProviderProfile: (input: unknown) => ipcRenderer.invoke(channels.providerAuthDelete, input),
    testProviderProfile: (input: unknown) => ipcRenderer.invoke(channels.providerAuthTest, input),
    getProviderSelection: (provider: string) => ipcRenderer.invoke(channels.providerAuthGetSelection, provider),
    setProviderSelection: (selection: unknown) => ipcRenderer.invoke(channels.providerAuthSetSelection, selection),
    getPrismOverride: () => ipcRenderer.invoke(channels.prismOverrideGet),
    savePrismOverride: (override: unknown) => ipcRenderer.invoke(channels.prismOverrideSave, override),
    getAgentMode: () => ipcRenderer.invoke(channels.agentModeGet),
    saveAgentMode: (mode: string) => ipcRenderer.invoke(channels.agentModeSave, mode),
    getOllamaStatus: () => ipcRenderer.invoke(channels.ollamaStatus),
    installDefaultModels: () => ipcRenderer.invoke(channels.ollamaInstallDefaults),
    getHealth: () => ipcRenderer.invoke(channels.healthGet)
  },
  app: {
    checkForUpdates: () => ipcRenderer.invoke(channels.checkForUpdates)
  },
  support: {
    createBundle: () => ipcRenderer.invoke(channels.supportBundleCreate),
    exportAuditLog: (format: 'json' | 'csv') => ipcRenderer.invoke(channels.auditLogExport, format)
  },
  bridge: {
    listAgents: () => ipcRenderer.invoke(channels.bridgeAgentsList),
    sendMessage: (agentId: string, message: string) => ipcRenderer.invoke(channels.bridgeAgentSend, agentId, message),
    getSessions: (agentId?: string) => ipcRenderer.invoke(channels.bridgeSessions, agentId),
    getStatus: () => ipcRenderer.invoke(channels.bridgeStatus),
    restartGateway: () => ipcRenderer.invoke(channels.bridgeGatewayRestart),
    listChannels: () => ipcRenderer.invoke(channels.bridgeChannelsList),
    addChannel: (channel: string, token: string) => ipcRenderer.invoke(channels.bridgeChannelAdd, channel, token),
    removeChannel: (channel: string) => ipcRenderer.invoke(channels.bridgeChannelRemove, channel),
    getChannelStatus: () => ipcRenderer.invoke(channels.bridgeChannelStatus)
  },
  voice: {
    getConfig: () => ipcRenderer.invoke(channels.voiceGetConfig),
    setConfig: (config: unknown) => ipcRenderer.invoke(channels.voiceSetConfig, config),
    sendTranscript: (text: string, agentId?: string) => ipcRenderer.invoke(channels.voiceStart, text, agentId)
  }
});
