import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { ChatsWorkspace, ChatDraftSeed, ChatTarget } from './components/ChatsWorkspace';
import { CommandPalette, buildDefaultCommands } from './components/CommandPalette';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingFlow } from './components/OnboardingFlow';
import { Sidebar, ViewId } from './components/Sidebar';
import { PrismWorkspace } from './components/PrismWorkspace';
import { SettingsView } from './components/SettingsView';
import { SpectrumView } from './components/SpectrumView';
import { UserMapPanel } from './components/UserMapPanel';
import { WorkView } from './components/WorkView';
import { RamanIcon } from './components/RamanIcon';
import { useToast } from './components/ui';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useWorkspaceStore } from './stores/workspace-store';
import { useNavigationStore } from './stores/navigation-store';
import { usePrismStore } from './stores/prism-store';
import { useChatStore } from './stores/chat-store';
import { useSettingsStore } from './stores/settings-store';
import { AgentChatInput, getDesktopApi, GroupChatInput, TaskCreateInput } from './lib/electron';
import type {
  PrismMode,
  UserMapState,
  WorkItem,
} from '@supreme/shared';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App() {
  const api = useMemo(() => {
    try { return getDesktopApi(); } catch { return null; }
  }, []);

  // -- Zustand stores --
  const { snapshot, loading, error, refreshSnapshot, setError, clearError, startPolling, stopPolling } = useWorkspaceStore();
  const { activeView, navigate } = useNavigationStore();
  const prismStore = usePrismStore();
  const chatStore = useChatStore();
  const settingsStore = useSettingsStore();
  const toast = useToast();

  // -- Local state (for operations not yet in stores) --
  const [busy, setBusy] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // -- Command palette --
  const commandItems = useMemo(() => buildDefaultCommands(navigate), [navigate]);

  // -- Keyboard shortcuts --
  useKeyboardShortcuts(
    useMemo(() => [
      { key: 'k', meta: true, handler: () => setCmdPaletteOpen(v => !v), description: 'Command palette', label: 'Command Palette' },
      { key: '0', meta: true, handler: () => navigate('home'), description: 'Dashboard', label: 'Dashboard' },
      { key: '1', meta: true, handler: () => navigate('prism'), description: 'Prism', label: 'Prism' },
      { key: '2', meta: true, handler: () => navigate('chats'), description: 'Chats', label: 'Chats' },
      { key: '3', meta: true, handler: () => navigate('usermap'), description: 'Context Brain', label: 'Context Brain' },
      { key: '4', meta: true, handler: () => navigate('spectrum'), description: 'Spectrum', label: 'Spectrum' },
      { key: '5', meta: true, handler: () => navigate('work'), description: 'Work', label: 'Work' },
      { key: ',', meta: true, handler: () => navigate('settings'), description: 'Settings', label: 'Settings' },
    ], [navigate]),
  );

  // -- Bootstrap --
  useEffect(() => {
    if (!api) {
      setError('Desktop bridge unavailable. Launch via `npm run desktop:dev`.');
      return;
    }
    void (async () => {
      try {
        await Promise.all([refreshSnapshot(), settingsStore.refreshSettings()]);
      } catch (e) {
        setError(getErrorMessage(e));
      }
    })();
  }, [api, refreshSnapshot, settingsStore.refreshSettings, setError]);

  useEffect(() => {
    if (!snapshot?.profile) return;
    startPolling();
    return () => stopPolling();
  }, [snapshot?.profile, startPolling, stopPolling]);

  // Detect first-run
  useEffect(() => {
    if (!loading && api && !snapshot?.profile) {
      setShowOnboarding(true);
    }
  }, [loading, api, snapshot?.profile]);

  // -- Wrapped API helpers --
  const withBusy = useCallback(
    async (fn: () => Promise<void>, successMsg?: string) => {
      setBusy(true);
      clearError();
      try {
        await fn();
        await refreshSnapshot();
        if (successMsg) toast.success(successMsg);
      } catch (e) {
        const msg = getErrorMessage(e);
        setError(msg);
        toast.error(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [clearError, refreshSnapshot, setError, toast],
  );

  // -- Profile --
  const handleSaveProfile = useCallback(
    async (profile: { name: string; email: string }) => {
      if (!api) throw new Error('Desktop bridge unavailable.');
      setSavingProfile(true);
      clearError();
      try {
        await api.profile.save(profile);
        await refreshSnapshot();
        setShowOnboarding(false);
        toast.success('Welcome to RamN AI!');
      } catch (e) {
        setError(getErrorMessage(e));
        throw e;
      } finally {
        setSavingProfile(false);
      }
    },
    [api, clearError, refreshSnapshot, setError, toast],
  );

  // -- Prism --
  const handlePrismSend = useCallback(
    async (mode: PrismMode, message: string) => {
      if (!snapshot) return;
      await prismStore.sendMessage(mode, message, snapshot);
      await refreshSnapshot();
      const msgs = usePrismStore.getState().messages;
      const last = msgs[msgs.length - 1];
      if (last?.mode === 'create' && last.role === 'assistant') {
        navigate('chats');
      }
    },
    [snapshot, prismStore, refreshSnapshot, navigate],
  );

  // -- Tasks --
  const handleTaskCreate = useCallback(
    (input: TaskCreateInput) =>
      withBusy(async () => {
        if (!api) throw new Error('Desktop bridge unavailable.');
        await api.tasks.create(input);
        navigate('work');
      }, `Scheduled ${input.title}.`),
    [api, withBusy, navigate],
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.tasks.delete(taskId); }, 'Task deleted.'),
    [api, withBusy],
  );

  const handleDuplicateTask = useCallback(
    (taskId: string) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.tasks.duplicate(taskId); }, 'Task duplicated.'),
    [api, withBusy],
  );

  const handleRerunTask = useCallback(
    (taskId: string) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.tasks.rerun(taskId); }, 'Task queued for rerun.'),
    [api, withBusy],
  );

  // -- Groups --
  const handleUpsertGroup = useCallback(
    (group: { id?: string; name: string; description?: string; memberAgentIds: string[]; routingMode: 'auto' | 'manual'; autoRouteThreshold: number; defaultResponderAgentId?: string }) =>
      withBusy(async () => {
        if (!api) throw new Error('Desktop bridge unavailable.');
        const payload = {
          id: group.id ?? crypto.randomUUID(),
          name: group.name,
          memberAgentIds: group.memberAgentIds,
          routingMode: group.routingMode,
          autoRouteThreshold: group.autoRouteThreshold,
          ...(group.defaultResponderAgentId ? { defaultResponderAgentId: group.defaultResponderAgentId } : {}),
        } as const;
        await api.groups.upsert(group.description ? { ...payload, description: group.description } : payload);
      }, `Saved group ${group.name}.`),
    [api, withBusy],
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.groups.delete(groupId); }, 'Group deleted.'),
    [api, withBusy],
  );

  // -- Chat --
  const handleSendAgentMessage = useCallback(
    (input: AgentChatInput) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.chat.sendAgentMessage(input); }),
    [api, withBusy],
  );

  const handleSendGroupMessage = useCallback(
    (input: GroupChatInput) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.chat.sendGroupMessage(input); }),
    [api, withBusy],
  );

  const handleDeleteThread = useCallback(
    (threadId: string) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.chat.deleteThread(threadId); }, 'Thread reset.'),
    [api, withBusy],
  );

  // -- Work --
  const handleDeleteWorkItem = useCallback(
    (workItemId: string) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.work.delete(workItemId); }, 'Work item deleted.'),
    [api, withBusy],
  );

  const handleOpenArtifact = useCallback(
    async (artifactId: string) => {
      if (!api) throw new Error('Desktop bridge unavailable.');
      try { await api.work.openArtifact(artifactId); } catch (e) { setError(getErrorMessage(e)); }
    },
    [api, setError],
  );

  const handleSendWorkToChat = useCallback(
    (item: WorkItem) => {
      if (item.sourceAgentId && snapshot?.agents.some(a => a.id === item.sourceAgentId)) {
        const target: ChatTarget = { type: 'agent', id: item.sourceAgentId };
        chatStore.selectTarget(target);
        chatStore.setDraftSeed({
          target,
          token: crypto.randomUUID(),
          text: `From Work — ${item.title}\n\n${item.summary ?? item.lastError ?? 'No saved body.'}`,
        });
        navigate('chats');
        toast.info('Loaded Work result into chat composer.');
        return;
      }
      prismStore.injectWorkMessage(item);
      navigate('prism');
    },
    [snapshot?.agents, chatStore, prismStore, navigate, toast],
  );

  const handleOpenChatTarget = useCallback(
    (target: ChatTarget) => { chatStore.selectTarget(target); chatStore.clearDraftSeed(); navigate('chats'); },
    [chatStore, navigate],
  );

  const handleOpenChatDestination = useCallback(
    (target: ChatTarget | 'prism') => {
      if (target === 'prism') { navigate('prism'); return; }
      chatStore.selectTarget(target); chatStore.clearDraftSeed(); navigate('chats');
    },
    [chatStore, navigate],
  );

  const handleSelectChatTarget = useCallback(
    (target: ChatTarget | null) => { target ? chatStore.selectTarget(target) : chatStore.clearTarget(); },
    [chatStore],
  );

  // -- UserMap --
  const handleSaveUserMap = useCallback(
    (tree: UserMapState) => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.userMap.save(tree); }, 'UserMap saved.'),
    [api, withBusy],
  );

  const handleSyncUserMap = useCallback(
    () => withBusy(async () => { if (!api) throw new Error('Desktop bridge unavailable.'); await api.userMap.syncMemories(); }, 'UserMap synced with memory.'),
    [api, withBusy],
  );

  // -- Settings (delegated to store, kept for props compat) --
  const handleClearPrismTranscript = useCallback(() => {
    prismStore.clearTranscript();
    toast.info('Prism history cleared.');
  }, [prismStore, toast]);

  // -- Render --

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 text-white">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-5">
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
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-lg rounded-2xl border border-white/[0.08] bg-surface-3 p-8 text-center shadow-elevated">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]"><RamanIcon size={24} /></div>
          <h1 className="text-xl font-semibold text-white">Desktop bridge not detected</h1>
          <p className="mt-3 text-sm leading-6 text-white/50">Launch via Electron, not the browser.</p>
          <div className="mt-5 rounded-xl border border-white/[0.08] bg-surface-1 px-4 py-3 text-left">
            <code className="font-mono text-sm text-brand-light">npm run desktop:dev</code>
          </div>
        </motion.div>
      </div>
    );
  }

  if (showOnboarding || !snapshot?.profile) {
    return (
      <OnboardingFlow
        onComplete={handleSaveProfile}
        runtimeAvailable={snapshot?.runtime?.available}
      />
    );
  }

  const viewTitles: Record<ViewId, string> = { home: 'Dashboard', prism: 'PRISM CORE', chats: 'LIVE CHATS', usermap: 'CONTEXT BRAIN', spectrum: 'SPECTRUM', work: 'Work', settings: 'Settings' };
  const viewDescriptions: Record<ViewId, string> = { home: 'Overview', prism: 'META ARCHITECT', chats: 'Conversations', usermap: 'NEURAL MAP', spectrum: 'Management Layer', work: 'Tasks & results', settings: 'Configuration' };

  return (
    <div className="flex min-h-screen bg-surface-0 text-white">
      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} items={commandItems} />
      <Sidebar activeView={activeView} onSelect={navigate} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-2">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-surface-1/95 px-5 backdrop-blur-xl">
          <div>
            <h1 className="text-[15px] font-semibold text-white">{viewTitles[activeView]}</h1>
            <p className="text-[10px] font-medium text-white/30">{viewDescriptions[activeView]}</p>
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

        <AnimatePresence>
          {error && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-b border-[#f87171]/10">
              <div className="flex items-center gap-2.5 bg-[#f87171]/[0.06] px-5 py-2.5">
                <AlertTriangle size={14} className="shrink-0 text-[#f87171]" />
                <p className="flex-1 text-xs text-[#fca5a5]">{error}</p>
                <button type="button" onClick={clearError} className="text-[10px] font-medium text-white/40 hover:text-white/60 transition-colors">Dismiss</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.section key={activeView} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] as const }} className="mx-auto min-w-0 w-full max-w-[1360px] px-5 py-4">
              {activeView === 'home' && (
                <ErrorBoundary viewName="Dashboard">
                  <DashboardView snapshot={snapshot} onNavigate={navigate} />
                </ErrorBoundary>
              )}
              {activeView === 'prism' && (
                <ErrorBoundary viewName="Prism">
                  <PrismWorkspace snapshot={snapshot} messages={prismStore.messages} busy={prismStore.busy} onSend={handlePrismSend} onCreateTask={handleTaskCreate} onClearTranscript={handleClearPrismTranscript} prismOverride={settingsStore.prismOverride} onSavePrismOverride={settingsStore.savePrismOverride} />
                </ErrorBoundary>
              )}
              {activeView === 'chats' && (
                <ErrorBoundary viewName="Chats">
                  <ChatsWorkspace snapshot={snapshot} busy={busy} selectedTarget={chatStore.selectedTarget} draftSeed={chatStore.draftSeed} onSelectTarget={handleSelectChatTarget} onSendAgentMessage={handleSendAgentMessage} onSendGroupMessage={handleSendGroupMessage} onCreateTask={handleTaskCreate} onDeleteThread={handleDeleteThread} />
                </ErrorBoundary>
              )}
              {activeView === 'spectrum' && (
                <ErrorBoundary viewName="Spectrum">
                  <SpectrumView snapshot={snapshot} busy={busy} onCreateAgentTask={handleTaskCreate} onUpsertGroup={handleUpsertGroup} onDeleteGroup={handleDeleteGroup} onOpenChat={handleOpenChatTarget} />
                </ErrorBoundary>
              )}
              {activeView === 'work' && (
                <ErrorBoundary viewName="Work">
                  <WorkView snapshot={snapshot} busy={busy} onDeleteTask={handleDeleteTask} onDuplicateTask={handleDuplicateTask} onRerunTask={handleRerunTask} onDeleteWorkItem={handleDeleteWorkItem} onSendToChat={handleSendWorkToChat} onOpenChat={handleOpenChatDestination} onOpenArtifact={handleOpenArtifact} />
                </ErrorBoundary>
              )}
              {activeView === 'usermap' && (
                <ErrorBoundary viewName="UserMap">
                  <UserMapPanel tree={snapshot.userMap} facts={snapshot.memoryFacts} busy={busy} onSave={handleSaveUserMap} onSync={handleSyncUserMap} />
                </ErrorBoundary>
              )}
              {activeView === 'settings' && (
                <ErrorBoundary viewName="Settings">
                  <SettingsView
                    activeSection={settingsStore.activeSection} onSelectSection={settingsStore.setActiveSection}
                    runtimeReady={snapshot.runtime.available} providerProfiles={settingsStore.providerProfiles}
                    providerSelections={settingsStore.providerSelections} prismOverride={settingsStore.prismOverride}
                    ollamaStatus={settingsStore.ollamaStatus} models={snapshot.models}
                    busy={busy} loading={settingsStore.loading}
                    onRefresh={settingsStore.refreshSettings} onInstallDefaults={settingsStore.installDefaultModels}
                    onSaveProfile={settingsStore.saveProviderProfile} onDeleteProfile={settingsStore.deleteProviderProfile}
                    onTestProfile={settingsStore.testProviderProfile} onSetProviderSelection={settingsStore.setProviderSelection}
                    onSavePrismOverride={settingsStore.savePrismOverride}
                  />
                </ErrorBoundary>
              )}
            </motion.section>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
