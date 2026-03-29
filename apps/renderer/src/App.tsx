import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, LoaderCircle, Mic } from 'lucide-react';
import { ChatsWorkspace, ChatDraftSeed, ChatTarget, type ActiveChatStreamState } from './components/ChatsWorkspace';
import { CommandPalette, buildDefaultCommands } from './components/CommandPalette';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingFlow } from './components/OnboardingFlow';
import { Sidebar, ViewId } from './components/Sidebar';
import { AssistantWorkspace } from './components/AssistantWorkspace';
import { SettingsView } from './components/SettingsView';
import { WorkView } from './components/WorkView';
import { GroupsWorkspace } from './components/GroupsWorkspace';
import { VoicePanel } from './components/VoicePanel';
import { WorkspaceLockScreen } from './components/WorkspaceLockScreen';
import { AppLogo } from './components/AppLogo';
import { Button, Card, Input, useToast } from './components/ui';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useWorkspaceStore } from './stores/workspace-store';
import { useNavigationStore } from './stores/navigation-store';
import { useAssistantStore } from './stores/assistant-store';
import { useChatStore } from './stores/chat-store';
import { useSettingsStore } from './stores/settings-store';
import { AgentChatInput, getDesktopApi, GroupChatInput, TaskCreateInput } from './lib/electron';
import { logger } from './lib/logger';
import type {
  AssistantMode,
  WorkItem,
} from '@raman-ai/shared';
import type { WorkspaceSecurityState } from './lib/electron';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App() {
  const api = useMemo(() => {
    try { return getDesktopApi(); } catch { return null; }
  }, []);

  // -- Zustand stores --
  const { snapshot, loading, error, refreshSnapshot, loadMoreTasks, loadMoreWorkItems, setError, clearError, startPolling, stopPolling } = useWorkspaceStore();
  const { activeView, navigate } = useNavigationStore();
  const assistantStore = useAssistantStore();
  const chatStore = useChatStore();
  const settingsStore = useSettingsStore();
  const toast = useToast();

  // -- Local state (for operations not yet in stores) --
  const [busy, setBusy] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [workspaceSecurity, setWorkspaceSecurity] = useState<WorkspaceSecurityState | null>(null);
  const [chatStream, setChatStream] = useState<ActiveChatStreamState | null>(null);

  // -- Command palette --
  const commandItems = useMemo(() => buildDefaultCommands(navigate), [navigate]);

  // -- Keyboard shortcuts --
  useKeyboardShortcuts(
    useMemo(() => [
      { key: 'k', meta: true, handler: () => setCmdPaletteOpen(v => !v), description: 'Command palette', label: 'Command Palette' },
      { key: '0', meta: true, handler: () => navigate('home'), description: 'Dashboard', label: 'Dashboard' },
      { key: '1', meta: true, handler: () => navigate('assistant'), description: 'Raman AI', label: 'Raman AI' },
      { key: '2', meta: true, handler: () => navigate('chats'), description: 'Chats', label: 'Chats' },
      { key: '4', meta: true, handler: () => navigate('work'), description: 'Work', label: 'Work' },
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
        const security = await api.security.getState();
        setWorkspaceSecurity(security);
        if (security.locked) {
          return;
        }

        await Promise.all([refreshSnapshot(), settingsStore.refreshSettings()]);
      } catch (e) {
        logger.error('Bootstrap failed', { error: getErrorMessage(e) });
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
    if (!loading && api && !workspaceSecurity?.locked && !snapshot?.profile) {
      setShowOnboarding(true);
    }
  }, [loading, api, snapshot?.profile, workspaceSecurity?.locked]);

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
    async (profile: { name: string }) => {
      if (!api) throw new Error('Desktop bridge unavailable.');
      setSavingProfile(true);
      clearError();
      try {
        await api.profile.save({ ...profile, email: '' });
        await refreshSnapshot();
        setShowOnboarding(false);
        toast.success('Welcome to Raman AI!');
      } catch (e) {
        setError(getErrorMessage(e));
        throw e;
      } finally {
        setSavingProfile(false);
      }
    },
    [api, clearError, refreshSnapshot, setError, toast],
  );

  const handleSaveScheduleTimezone = useCallback(
    async (timezone: string) => {
      if (!api || !snapshot?.profile) return;
      await withBusy(
        async () => {
          const profile = {
            name: snapshot.profile!.name,
            email: snapshot.profile!.email ?? '',
            ...(timezone ? { timezone } : {}),
          };
          await api.profile.save(profile);
        },
        'Saved scheduling timezone.',
      );
    },
    [api, snapshot?.profile, withBusy],
  );

  // -- Assistant --
  const handleAssistantSend = useCallback(
    async (mode: AssistantMode, message: string) => {
      if (!snapshot) return;
      await assistantStore.sendMessage(mode, message, snapshot);
      const msgs = useAssistantStore.getState().messages;
      const last = msgs[msgs.length - 1];
      if (last?.mode === 'create' && last.role === 'assistant') {
        navigate('chats');
      }
    },
    [snapshot, assistantStore, navigate],
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

  // -- Agent deletion --
  const handleDeleteAgent = useCallback(
    (agentId: string) => withBusy(async () => {
      if (!api) throw new Error('Desktop bridge unavailable.');
      await api.agents.delete(agentId);
    }, 'Agent deleted.'),
    [api, withBusy],
  );

  // -- Chat (token streaming via IPC; persisted thread refreshes when the stream completes) --
  const handleSendAgentMessage = useCallback(
    async (input: AgentChatInput) => {
      if (!api) throw new Error('Desktop bridge unavailable.');
      setBusy(true);
      clearError();
      const streamId = crypto.randomUUID();
      api.chat.offStreamToken();
      setChatStream({
        scope: 'agent',
        targetId: input.agentId,
        streamId,
        userMessage: input.message.trim(),
        text: ''
      });
      api.chat.onStreamToken((_, data) => {
        if (data.streamId !== streamId) return;
        if (data.done) {
          if (data.error) setError(data.error);
          return;
        }
        setChatStream((prev) => {
          if (!prev || prev.streamId !== streamId) return prev;
          return {
            ...prev,
            text: prev.text + data.token,
            ...(data.assistantLabel ? { assistantLabel: data.assistantLabel } : {}),
            ...(data.routeMode ? { routeMode: data.routeMode } : {})
          };
        });
      });
      try {
        await api.chat.sendAgentMessageStream({ ...input, streamId });
        setBusy(false);
        await refreshSnapshot();
      } catch (e) {
        const msg = getErrorMessage(e);
        setError(msg);
        toast.error(msg);
        throw e;
      } finally {
        api.chat.offStreamToken();
        setChatStream(null);
        setBusy(false);
      }
    },
    [api, clearError, refreshSnapshot, setError, toast],
  );

  const handleSendGroupMessage = useCallback(
    async (input: GroupChatInput) => {
      if (!api) throw new Error('Desktop bridge unavailable.');
      setBusy(true);
      clearError();
      const streamId = crypto.randomUUID();
      api.chat.offStreamToken();
      setChatStream({
        scope: 'group',
        targetId: input.groupId,
        streamId,
        userMessage: input.message.trim(),
        text: ''
      });
      api.chat.onStreamToken((_, data) => {
        if (data.streamId !== streamId) return;
        if (data.done) {
          if (data.error) setError(data.error);
          return;
        }
        setChatStream((prev) => {
          if (!prev || prev.streamId !== streamId) return prev;
          return {
            ...prev,
            text: prev.text + data.token,
            ...(data.assistantLabel ? { assistantLabel: data.assistantLabel } : {}),
            ...(data.routeMode ? { routeMode: data.routeMode } : {})
          };
        });
      });
      try {
        await api.chat.sendGroupMessageStream({ ...input, streamId });
        setBusy(false);
        await refreshSnapshot();
      } catch (e) {
        const msg = getErrorMessage(e);
        setError(msg);
        toast.error(msg);
        throw e;
      } finally {
        api.chat.offStreamToken();
        setChatStream(null);
        setBusy(false);
      }
    },
    [api, clearError, refreshSnapshot, setError, toast],
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
      assistantStore.injectWorkMessage(item);
      navigate('assistant');
    },
    [snapshot?.agents, chatStore, assistantStore, navigate, toast],
  );  const handleUnlockWorkspace = useCallback(async (password: string) => {
    if (!api) throw new Error('Desktop bridge unavailable.');
    clearError();
    const security = await api.security.unlock(password);
    setWorkspaceSecurity(security);
    await Promise.all([refreshSnapshot(), settingsStore.refreshSettings()]);
    toast.success('Raman AI unlocked.');
  }, [api, clearError, refreshSnapshot, settingsStore, toast]);



  const handleOpenChatTarget = useCallback(
    (target: ChatTarget) => { chatStore.selectTarget(target); chatStore.clearDraftSeed(); navigate('chats'); },
    [chatStore, navigate],
  );

  const handleOpenChatDestination = useCallback(
    (target: ChatTarget | 'assistant') => {
      if (target === 'assistant') { navigate('assistant'); return; }
      chatStore.selectTarget(target); chatStore.clearDraftSeed(); navigate('chats');
    },
    [chatStore, navigate],
  );

  const handleSelectChatTarget = useCallback(
    (target: ChatTarget | null) => { target ? chatStore.selectTarget(target) : chatStore.clearTarget(); },
    [chatStore],
  );

  // -- Settings (delegated to store, kept for props compat) --
  const handleClearAssistantTranscript = useCallback(() => {
    assistantStore.clearTranscript();
    toast.info('Raman AI history cleared.');
  }, [assistantStore, toast]);

  // -- Render --

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 text-slate-900 dark:text-white">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-5">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-black/8 bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]">
            <AppLogo size={28} />
            <div className="absolute inset-0 rounded-2xl bg-brand/10 animate-pulse" />
          </div>
          <div className="flex items-center gap-2.5 text-sm text-slate-500 dark:text-white/50">
            <LoaderCircle className="animate-spin text-brand" size={16} />
            Loading Raman AI...
          </div>
        </motion.div>
      </div>
    );
  }

  if (!api) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 px-8 text-slate-900 dark:text-white">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-lg rounded-2xl border border-black/8 bg-surface-3 p-8 text-center shadow-elevated dark:border-white/[0.08]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-black/8 bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]"><AppLogo size={24} /></div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Desktop bridge not detected</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/50">Launch via Electron, not the browser.</p>
          <div className="mt-5 rounded-xl border border-black/8 bg-surface-1 px-4 py-3 text-left dark:border-white/[0.08]">
            <code className="font-mono text-sm text-brand-light">npm run desktop:dev</code>
          </div>
        </motion.div>
      </div>
    );
  }

  if (api && workspaceSecurity === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#08090a] dark:to-[#0D0D0D] px-6 text-gray-900 dark:text-white">
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-white/70">
          <LoaderCircle className="animate-spin" size={18} />
          Preparing workspace
        </div>
      </div>
    );
  }

  if (workspaceSecurity?.locked) {
    return <WorkspaceLockScreen onUnlock={handleUnlockWorkspace} />;
  }

  if (showOnboarding || !snapshot?.profile) {
    const onboardingProps = {
      onComplete: handleSaveProfile,
      isCheckingRuntime: loading,
      runtimeAvailable: snapshot?.runtime?.available,
      ...(snapshot?.runtime?.available && api
        ? { onInstallDefaults: () => api.settings.installDefaultModels() }
        : {}),
    };
    return <OnboardingFlow {...onboardingProps} />;
  }

  const viewTitles: Record<ViewId, string> = { home: 'Dashboard', assistant: 'Raman AI', chats: 'Chats', groups: 'Groups', work: 'Work', settings: 'Settings' };
  const viewDescriptions: Record<ViewId, string> = { home: '', assistant: '', chats: '', groups: '', work: '', settings: '' };

  return (
    <div className="flex h-screen overflow-hidden bg-shell-50 dark:bg-surface-0 text-slate-900 dark:text-white">
      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} items={commandItems} />
      <ErrorBoundary viewName="Voice" onDismiss={() => setVoicePanelOpen(false)}>
        <VoicePanel open={voicePanelOpen} onClose={() => setVoicePanelOpen(false)} />
      </ErrorBoundary>
      <Sidebar activeView={activeView} onSelect={navigate} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-shell-50 dark:bg-surface-0">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-black/5 dark:border-white/5 bg-shell-50/95 dark:bg-surface-1/90 px-5 backdrop-blur-xl">
          <h1 className="text-[15px] font-semibold text-slate-900 dark:text-white">{viewTitles[activeView]}</h1>
          <div className="flex items-center gap-3">
            {snapshot.runtime.available && (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] font-medium text-gray-500 dark:text-white/35">Runtime</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setVoicePanelOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white/70 transition-colors"
              title="Voice Mode (Cmd+Shift+V)"
              aria-label="Open voice mode"
            >
              <Mic size={14} />
            </button>
            <div className="h-4 w-px bg-black/10 dark:bg-white/10" />
            <div className="flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/8 bg-white/70 dark:bg-white/[0.04] px-2.5 py-1">
              <div className="h-5 w-5 rounded-md bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
                {snapshot.profile.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-gray-600 dark:text-white/60">{snapshot.profile.name}</span>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-b border-[#f87171]/10">
              <div className="flex items-center gap-2.5 bg-[#f87171]/[0.06] px-5 py-2.5">
                <AlertTriangle size={14} className="shrink-0 text-[#f87171]" />
                <p className="flex-1 text-xs text-[#fca5a5]">{error}</p>
                <button type="button" onClick={clearError} className="text-[10px] font-medium text-slate-500 hover:text-slate-700 transition-colors dark:text-white/40 dark:hover:text-white/60">Dismiss</button>
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
              {activeView === 'assistant' && (
                <ErrorBoundary viewName="Raman AI">
                  <AssistantWorkspace snapshot={snapshot} messages={assistantStore.messages} busy={assistantStore.busy} onSend={handleAssistantSend} onCreateTask={handleTaskCreate} onClearTranscript={handleClearAssistantTranscript} assistantOverride={settingsStore.assistantOverride} onSaveAssistantOverride={settingsStore.saveAssistantOverride} />
                </ErrorBoundary>
              )}
              {activeView === 'chats' && (
                <ErrorBoundary viewName="Chats">
                  <ChatsWorkspace snapshot={snapshot} busy={busy} selectedTarget={chatStore.selectedTarget} draftSeed={chatStore.draftSeed} chatStream={chatStream} onSelectTarget={handleSelectChatTarget} onSendAgentMessage={handleSendAgentMessage} onSendGroupMessage={handleSendGroupMessage} onCreateTask={handleTaskCreate} onDeleteThread={handleDeleteThread} />
                </ErrorBoundary>
              )}
              {activeView === 'groups' && (
                <ErrorBoundary viewName="Groups">
                  <GroupsWorkspace snapshot={snapshot} busy={busy} onUpsertGroup={handleUpsertGroup} onDeleteGroup={handleDeleteGroup} onOpenChat={handleOpenChatDestination} />
                </ErrorBoundary>
              )}
              {activeView === 'work' && (
                <ErrorBoundary viewName="Work">
                  <WorkView snapshot={snapshot} busy={busy} onDeleteTask={handleDeleteTask} onDuplicateTask={handleDuplicateTask} onRerunTask={handleRerunTask} onDeleteWorkItem={handleDeleteWorkItem} onSendToChat={handleSendWorkToChat} onOpenChat={handleOpenChatDestination} onOpenArtifact={handleOpenArtifact} onLoadMoreTasks={loadMoreTasks} onLoadMoreWorkItems={loadMoreWorkItems} />
                </ErrorBoundary>
              )}
              {activeView === 'settings' && (
                <ErrorBoundary viewName="Settings">
                  <SettingsView
                    activeSection={settingsStore.activeSection} onSelectSection={settingsStore.setActiveSection}
                    runtimeReady={snapshot.runtime.available} providerProfiles={settingsStore.providerProfiles}
                    providerSelections={settingsStore.providerSelections} assistantOverride={settingsStore.assistantOverride}
                    workspaceSecurity={settingsStore.workspaceSecurity}
                    agentMode={settingsStore.agentMode} onSaveAgentMode={settingsStore.saveAgentMode}
                    ollamaStatus={settingsStore.ollamaStatus} models={snapshot.models} snapshot={snapshot}
                    busy={busy} loading={settingsStore.loading}
                    onRefresh={settingsStore.refreshSettings} onInstallDefaults={settingsStore.installDefaultModels}
                    onSaveProfile={settingsStore.saveProviderProfile} onDeleteProfile={settingsStore.deleteProviderProfile}
                    onTestProfile={settingsStore.testProviderProfile} onSetProviderSelection={settingsStore.setProviderSelection}
                    onSaveAssistantOverride={settingsStore.saveAssistantOverride}
                    onEnableWorkspaceEncryption={settingsStore.enableWorkspaceEncryption}
                    onDisableWorkspaceEncryption={settingsStore.disableWorkspaceEncryption}
                    onSaveScheduleTimezone={handleSaveScheduleTimezone}
                    onCreateAgentTask={handleTaskCreate} onOpenChat={handleOpenChatTarget}
                    onDeleteAgent={handleDeleteAgent}
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
