import { contextBridge, ipcRenderer } from 'electron';
import { channels } from './preload-api.js';

contextBridge.exposeInMainWorld('supreme', {
  profile: {
    get: () => ipcRenderer.invoke(channels.profileGet),
    save: (profile: unknown) => ipcRenderer.invoke(channels.profileSave, profile)
  },
  workspace: {
    getSnapshot: () => ipcRenderer.invoke(channels.workspaceSnapshot),
    createBackupExport: () => ipcRenderer.invoke(channels.workspaceBackupExport)
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
    getOllamaStatus: () => ipcRenderer.invoke(channels.ollamaStatus),
    installDefaultModels: () => ipcRenderer.invoke(channels.ollamaInstallDefaults)
  },
  app: {
    checkForUpdates: () => ipcRenderer.invoke(channels.checkForUpdates)
  },
  support: {
    createBundle: () => ipcRenderer.invoke(channels.supportBundleCreate)
  }
});
