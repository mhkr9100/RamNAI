import { contextBridge, ipcRenderer } from 'electron';
import { channels } from './preload-api.js';

contextBridge.exposeInMainWorld('supreme', {
  profile: {
    get: () => ipcRenderer.invoke(channels.profileGet),
    save: (profile: unknown) => ipcRenderer.invoke(channels.profileSave, profile)
  },
  workspace: {
    getSnapshot: () => ipcRenderer.invoke(channels.workspaceSnapshot)
  },
  userMap: {
    save: (tree: unknown) => ipcRenderer.invoke(channels.userMapSave, tree),
    syncMemories: () => ipcRenderer.invoke(channels.userMapSync)
  },
  prism: {
    sendMessage: (input: unknown) => ipcRenderer.invoke(channels.prismSend, input)
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
  }
});
