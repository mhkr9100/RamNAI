import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { ChatsWorkspace, ChatDraftSeed, ChatTarget } from './components/ChatsWorkspace';
import { LocalProfileScreen } from './components/LocalProfileScreen';
import { Sidebar, ViewId } from './components/Sidebar';
import { PrismWorkspace } from './components/PrismWorkspace';
import { SettingsView } from './components/SettingsView';
import { SpectrumView } from './components/SpectrumView';
import { UserMapPanel } from './components/UserMapPanel';
import { WorkView } from './components/WorkView';
import { RamanIcon } from './components/RamanIcon';
import { useToast } from './components/ui';
import { AgentChatInput, getDesktopApi, GroupChatInput, TaskCreateInput, WorkspaceSnapshot } from './lib/electron';
import type {
  OllamaRuntimeStatus,
  PrismMode,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderId,
  UserMapState,
  WorkItem
} from '@supreme/shared';

interface PrismMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: PrismMode | 'work';
}

const REMOTE_PROVIDERS = ['openai', 'anthropic', 'google'] as const;
type RemoteProviderId = typeof REMOTE_PROVIDERS[number];

export default function App() {
  const api = useMemo(() => {
    try {
      return getDesktopApi();
    } catch {
      return null;
    }
  }, []);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('prism');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prismMessages, setPrismMessages] = useState<PrismMessage[]>([]);
  const [selectedChatTarget, setSelectedChatTarget] = useState<ChatTarget | null>(null);
  const [chatDraftSeed, setChatDraftSeed] = useState<ChatDraftSeed | null>(null);
  const [selectedSettingsSection, setSelectedSettingsSection] = useState<'runtime' | 'providers' | 'prism'>('runtime');
  const [providerProfiles, setProviderProfiles] = useState<ProviderAuthProfile[]>([]);
  const [providerSelections, setProviderSelections] = useState<Record<RemoteProviderId, string | null>>({
    openai: null,
    anthropic: null,
    google: null
  });
  const [prismOverride, setPrismOverride] = useState<PrismProviderOverrideSettings | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaRuntimeStatus | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const refreshSnapshot = useCallback(async () => {
    if (!api) {
      throw new Error('Supreme Raman AI desktop bridge is unavailable.');
    }
    const next = await api.workspace.getSnapshot();
    setSnapshot(next);
    return next;
  }, [api]);

  const refreshSettings = useCallback(async () => {
    if (!api) {
      throw new Error('Supreme Raman AI desktop bridge is unavailable.');
    }
    setSettingsLoading(true);
    try {
      const [profiles, runtimeStatus, openaiSelection, anthropicSelection, googleSelection, override] = await Promise.all([
        api.settings.listProviderProfiles(),
        api.settings.getOllamaStatus(),
        api.settings.getProviderSelection('openai'),
        api.settings.getProviderSelection('anthropic'),
        api.settings.getProviderSelection('google'),
        api.settings.getPrismOverride()
      ]);
      setProviderProfiles(profiles);
      setOllamaStatus(runtimeStatus);
      setProviderSelections({
        openai: openaiSelection?.profileId ?? null,
        anthropic: anthropicSelection?.profileId ?? null,
        google: googleSelection?.profileId ?? null
      });
      setPrismOverride(override);
    } finally {
      setSettingsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let mounted = true;
    if (!api) {
      setError('Desktop bridge unavailable. Launch Supreme Raman AI through Electron with `npm run desktop:dev` instead of opening the Vite URL directly in a browser.');
      setLoading(false);
      return () => {
        mounted = false;
      };
    }
    (async () => {
      try {
        const [next] = await Promise.all([
          api.workspace.getSnapshot(),
          refreshSettings()
        ]);
        if (!mounted) return;
        setSnapshot(next);
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [api, refreshSettings]);

  useEffect(() => {
    if (!snapshot?.profile) return;

    const interval = window.setInterval(() => {
      void refreshSnapshot().catch(() => {
        // Keep the UI responsive even if a background poll fails once.
      });
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshSnapshot, snapshot?.profile]);

  const handleSaveProfile = async (profile: { name: string; email: string }) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setSavingProfile(true);
    setError(null);
    try {
      await api.profile.save(profile);
      await refreshSnapshot();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePrismSend = async (mode: PrismMode, message: string) => {
    if (!api || !snapshot) return;
    const userMessage: PrismMessage = { id: crypto.randomUUID(), role: 'user', text: message, mode };
    setPrismMessages((current) => [...current, userMessage]);
    setBusy(true);
    setError(null);

    try {
      const reply = await api.prism.sendMessage({
        mode,
        message,
        userMap: snapshot.userMap,
        existingAgents: snapshot.agents,
        existingGroups: snapshot.groups
      });
      setPrismMessages((current) => [...current, { id: reply.id, role: 'assistant', text: reply.text, mode }]);
      await refreshSnapshot();
      if (reply.createdAgent) {
        setSelectedChatTarget({ type: 'agent', id: reply.createdAgent.id });
        setNotice(`Created ${reply.createdAgent.name} and opened its chat.`);
        setActiveView('chats');
      }
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setPrismMessages((current) => [...current, { id: crypto.randomUUID(), role: 'system', text: messageText, mode }]);
      setError(messageText);
    } finally {
      setBusy(false);
    }
  };

  const handleTaskCreate = async (input: TaskCreateInput) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.tasks.create(input);
      await refreshSnapshot();
      setNotice(`Scheduled ${input.title}.`);
      setActiveView('work');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleUpsertGroup = async (group: {
    id?: string;
    name: string;
    description?: string;
    memberAgentIds: string[];
    routingMode: 'auto' | 'manual';
    autoRouteThreshold: number;
    defaultResponderAgentId?: string;
  }) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        id: group.id ?? crypto.randomUUID(),
        name: group.name,
        memberAgentIds: group.memberAgentIds,
        routingMode: group.routingMode,
        autoRouteThreshold: group.autoRouteThreshold,
        ...(group.defaultResponderAgentId ? { defaultResponderAgentId: group.defaultResponderAgentId } : {})
      } as const;
      await api.groups.upsert(group.description ? { ...payload, description: group.description } : payload);
      await refreshSnapshot();
      setNotice(`Saved group ${group.name}.`);
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.groups.delete(groupId);
      await refreshSnapshot();
      setNotice('Group deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleSendAgentMessage = async (input: AgentChatInput) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.chat.sendAgentMessage(input);
      await refreshSnapshot();
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleSendGroupMessage = async (input: GroupChatInput) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.chat.sendGroupMessage(input);
      await refreshSnapshot();
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.tasks.delete(taskId);
      await refreshSnapshot();
      setNotice('Task deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicateTask = async (taskId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.tasks.duplicate(taskId);
      await refreshSnapshot();
      setNotice('Task duplicated.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleRerunTask = async (taskId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.tasks.rerun(taskId);
      await refreshSnapshot();
      setNotice('Task queued for rerun.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWorkItem = async (workItemId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.work.delete(workItemId);
      await refreshSnapshot();
      setNotice('Work item deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenArtifact = async (artifactId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setError(null);
    try {
      await api.work.openArtifact(artifactId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const handleSendWorkToChat = (item: WorkItem) => {
    if (item.sourceAgentId && snapshot?.agents.some((agent) => agent.id === item.sourceAgentId)) {
      const target: ChatTarget = { type: 'agent', id: item.sourceAgentId };
      setSelectedChatTarget(target);
      setChatDraftSeed({
        target,
        token: crypto.randomUUID(),
        text: `From Work — ${item.title}\n\n${item.summary ?? item.lastError ?? 'No saved body.'}`
      });
      setActiveView('chats');
      setNotice('Loaded the Work result into the chatbot composer.');
      return;
    }

    setPrismMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'system',
        mode: 'work',
        text: `Injected from Work — ${item.title}\n\n${item.summary ?? item.lastError ?? 'No saved body.'}`
      }
    ]);
    setActiveView('prism');
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.chat.deleteThread(threadId);
      await refreshSnapshot();
      setNotice('Thread reset.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChatTarget = useCallback((target: ChatTarget) => {
    setSelectedChatTarget(target);
    setChatDraftSeed(null);
    setActiveView('chats');
  }, []);

  const handleOpenChatDestination = useCallback((target: ChatTarget | 'prism') => {
    if (target === 'prism') {
      setActiveView('prism');
      return;
    }

    setSelectedChatTarget(target);
    setChatDraftSeed(null);
    setActiveView('chats');
  }, []);

  const handleSelectChatTarget = useCallback((target: ChatTarget | null) => {
    setSelectedChatTarget(target);
  }, []);

  const handleSaveProviderProfile = async (input: {
    id: string;
    provider: RemoteProviderId;
    label: string;
    description?: string;
    apiKey?: string;
    token?: string;
    isDefault?: boolean;
  }) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.settings.saveProviderProfile(input);
      await refreshSettings();
      setNotice(`Saved ${input.provider} profile ${input.label}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProviderProfile = async (profile: ProviderAuthProfile) => {
    if (!api || profile.provider === 'ollama') {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.settings.deleteProviderProfile({
        provider: profile.provider,
        profileId: profile.id
      });
      await refreshSettings();
      setNotice(`Deleted ${profile.label}.`);
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleTestProviderProfile = async (
    profile: ProviderAuthProfile,
    probeWithRuntime = false
  ) => {
    if (!api || profile.provider === 'ollama') {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.settings.testProviderProfile({
        provider: profile.provider,
        profileId: profile.id,
        ...(probeWithRuntime ? { probeWithRuntime: true } : {})
      });
      if (result.ok) {
        setNotice(result.message);
      } else {
        setError(result.message);
      }
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleSetProviderSelection = async (provider: RemoteProviderId, profileId: string | null) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.settings.setProviderSelection({ provider, profileId });
      await refreshSettings();
      setNotice(profileId ? `Selected active ${provider} profile.` : `Cleared ${provider} profile selection.`);
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleSavePrismOverride = async (override: PrismProviderOverrideSettings | null) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.settings.savePrismOverride(override);
      await refreshSettings();
      setNotice(override ? 'Saved Prism settings.' : 'Cleared Prism settings.');
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleInstallDefaultModels = async () => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      const status = await api.settings.installDefaultModels();
      setOllamaStatus(status);
      await refreshSnapshot();
      setNotice('Requested installation of the default local models.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveUserMap = async (tree: UserMapState) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.userMap.save(tree);
      await refreshSnapshot();
      setNotice('UserMap saved locally.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleSyncUserMap = async () => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.userMap.syncMemories();
      await refreshSnapshot();
      setNotice('UserMap merged with extracted memory facts.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleClearPrismTranscript = () => {
    setPrismMessages([]);
    setNotice('Prism history cleared.');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 text-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-5"
        >
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
            <RamanIcon size={28} />
            <div className="absolute inset-0 rounded-2xl bg-brand/10 animate-pulse" />
          </div>
          <div className="flex items-center gap-2.5 text-sm text-white/50">
            <LoaderCircle className="animate-spin text-brand" size={16} />
            Loading RamN AI…
          </div>
        </motion.div>
      </div>
    );
  }

  if (!api) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 px-8 text-white">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-lg rounded-2xl border border-white/[0.08] bg-surface-3 p-8 text-center shadow-elevated"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
            <RamanIcon size={24} />
          </div>
          <h1 className="text-xl font-semibold text-white">Desktop bridge not detected</h1>
          <p className="mt-3 text-sm leading-6 text-white/50">
            RamN AI runs inside the Electron desktop shell. Open it with the command below instead of navigating to the Vite URL directly.
          </p>
          <div className="mt-5 rounded-xl border border-white/[0.08] bg-surface-1 px-4 py-3 text-left">
            <code className="font-mono text-sm text-brand-light">npm run desktop:dev</code>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!snapshot?.profile) {
    return <LocalProfileScreen onSave={handleSaveProfile} isSaving={savingProfile} />;
  }

  const viewTitles: Record<ViewId, string> = {
    prism: 'Prism',
    chats: 'Chats',
    usermap: 'UserMap',
    spectrum: 'Spectrum',
    work: 'Work',
    settings: 'Settings',
  };

  const viewDescriptions: Record<ViewId, string> = {
    prism: 'AI architect',
    chats: 'Conversations',
    usermap: 'Context memory',
    spectrum: 'Agent management',
    work: 'Tasks & results',
    settings: 'Configuration',
  };

  return (
    <div className="flex min-h-screen bg-surface-0 text-white">
      <Sidebar activeView={activeView} onSelect={setActiveView} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-2">
        {/* Header */}
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-surface-1/95 px-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-[15px] font-semibold text-white">{viewTitles[activeView]}</h1>
              <p className="text-[10px] font-medium text-white/30">{viewDescriptions[activeView]}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {snapshot.runtime.available && (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34d399] opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#34d399]" />
                </span>
                <span className="text-[10px] font-medium text-white/35">Runtime</span>
              </div>
            )}
            <div className="h-4 w-px bg-white/[0.06]" />
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1">
              <div className="h-5 w-5 rounded-md bg-brand/20 flex items-center justify-center text-[10px] font-bold text-brand-light">
                {snapshot.profile.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-white/60">{snapshot.profile.name}</span>
            </div>
          </div>
        </header>

        {/* Error / Notice bar */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-b border-[#f87171]/10"
            >
              <div className="flex items-center gap-2.5 bg-[#f87171]/[0.06] px-5 py-2.5">
                <AlertTriangle size={14} className="shrink-0 text-[#f87171]" />
                <p className="flex-1 text-xs text-[#fca5a5]">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-[10px] font-medium text-white/40 hover:text-white/60 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.section
              key={activeView}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="mx-auto min-w-0 w-full max-w-[1360px] px-5 py-4"
            >
              {activeView === 'prism' ? (
                <PrismWorkspace
                  snapshot={snapshot}
                  messages={prismMessages}
                  busy={busy}
                  onSend={handlePrismSend}
                  onCreateTask={handleTaskCreate}
                  onClearTranscript={handleClearPrismTranscript}
                />
              ) : null}
              {activeView === 'chats' ? (
                <ChatsWorkspace
                  snapshot={snapshot}
                  busy={busy}
                  selectedTarget={selectedChatTarget}
                  draftSeed={chatDraftSeed}
                  onSelectTarget={handleSelectChatTarget}
                  onSendAgentMessage={handleSendAgentMessage}
                  onSendGroupMessage={handleSendGroupMessage}
                  onCreateTask={handleTaskCreate}
                  onDeleteThread={handleDeleteThread}
                />
              ) : null}
              {activeView === 'spectrum' ? (
                <SpectrumView
                  snapshot={snapshot}
                  busy={busy}
                  onCreateAgentTask={handleTaskCreate}
                  onUpsertGroup={handleUpsertGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onOpenChat={handleOpenChatTarget}
                />
              ) : null}
              {activeView === 'work' ? (
                <WorkView
                  snapshot={snapshot}
                  busy={busy}
                  onDeleteTask={handleDeleteTask}
                  onDuplicateTask={handleDuplicateTask}
                  onRerunTask={handleRerunTask}
                  onDeleteWorkItem={handleDeleteWorkItem}
                  onSendToChat={handleSendWorkToChat}
                  onOpenChat={handleOpenChatDestination}
                  onOpenArtifact={handleOpenArtifact}
                />
              ) : null}
              {activeView === 'usermap' ? (
                <UserMapPanel
                  tree={snapshot.userMap}
                  facts={snapshot.memoryFacts}
                  busy={busy}
                  onSave={handleSaveUserMap}
                  onSync={handleSyncUserMap}
                />
              ) : null}
              {activeView === 'settings' ? (
                <SettingsView
                  activeSection={selectedSettingsSection}
                  onSelectSection={setSelectedSettingsSection}
                  runtimeReady={snapshot.runtime.available}
                  providerProfiles={providerProfiles}
                  providerSelections={providerSelections}
                  prismOverride={prismOverride}
                  ollamaStatus={ollamaStatus}
                  models={snapshot.models}
                  busy={busy}
                  loading={settingsLoading}
                  onRefresh={refreshSettings}
                  onInstallDefaults={handleInstallDefaultModels}
                  onSaveProfile={handleSaveProviderProfile}
                  onDeleteProfile={handleDeleteProviderProfile}
                  onTestProfile={handleTestProviderProfile}
                  onSetProviderSelection={handleSetProviderSelection}
                  onSavePrismOverride={handleSavePrismOverride}
                />
              ) : null}
            </motion.section>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
