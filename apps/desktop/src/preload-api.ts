export const channels = {
  profileGet: 'profile:get',
  profileSave: 'profile:save',
  workspaceSnapshot: 'workspace:getSnapshot',
  userMapSave: 'usermap:save',
  userMapSync: 'usermap:syncMemories',
  groupUpsert: 'group:upsert',
  groupDelete: 'group:delete',
  prismSend: 'prism:sendMessage',
  agentChat: 'chat:agent',
  groupChat: 'chat:group',
  threadDelete: 'thread:delete',
  taskCreate: 'task:create',
  taskDelete: 'task:delete',
  taskDuplicate: 'task:duplicate',
  taskRerun: 'task:rerun',
  workDelete: 'work:delete',
  artifactOpen: 'artifact:open'
} as const;
