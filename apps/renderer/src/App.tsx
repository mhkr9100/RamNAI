import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, BrainCircuit, FolderKanban, LoaderCircle, Sparkles } from 'lucide-react';
import { LocalProfileScreen } from './components/LocalProfileScreen';
import { Sidebar, ViewId } from './components/Sidebar';
import { PrismWorkspace } from './components/PrismWorkspace';
import { SpectrumView } from './components/SpectrumView';
import { UserMapPanel } from './components/UserMapPanel';
import { WorkView } from './components/WorkView';
import { getDesktopApi, TaskCreateInput, WorkspaceSnapshot } from './lib/electron';
import type { PrismMode, UserMapNode, WorkItem } from '@supreme/shared';

interface PrismMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: PrismMode | 'work';
}

export default function App() {
  const api = useMemo(() => getDesktopApi(), []);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('prism');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prismMessages, setPrismMessages] = useState<PrismMessage[]>([]);

  const refreshSnapshot = async () => {
    const next = await api.workspace.getSnapshot();
    setSnapshot(next);
    return next;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const next = await api.workspace.getSnapshot();
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
  }, [api]);

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
  }, [snapshot?.profile]);

  const handleSaveProfile = async (profile: { name: string; email: string }) => {
    setSavingProfile(true);
    setError(null);
    try {
      await api.profile.save(profile);
      await refreshSnapshot();
      setNotice('Local profile saved.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePrismSend = async (mode: PrismMode, message: string) => {
    if (!snapshot) return;
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
        setNotice(`Created ${reply.createdAgent.name}.`);
        setActiveView('spectrum');
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

  const handleDeleteTask = async (taskId: string) => {
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
    setError(null);
    try {
      await api.work.openArtifact(artifactId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const handleSendWorkToChat = (item: WorkItem) => {
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

  const handleSaveUserMap = async (tree: UserMapNode) => {
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08090a] text-white">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
          <LoaderCircle className="animate-spin" size={18} />
          Loading Supreme Raman AI…
        </div>
      </div>
    );
  }

  if (!snapshot?.profile) {
    return <LocalProfileScreen onSave={handleSaveProfile} isSaving={savingProfile} />;
  }

  return (
    <div className="flex min-h-screen bg-[#08090a] text-white">
      <Sidebar activeView={activeView} onSelect={setActiveView} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-white/6 bg-[#0c0f11]/95 px-8 py-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Supreme Raman AI</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {activeView === 'prism' ? 'Prism Workspace' : activeView === 'usermap' ? 'UserMap' : activeView === 'spectrum' ? 'Spectrum' : 'Work'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
              <div className={`rounded-full border px-3 py-2 font-black uppercase tracking-[0.2em] ${snapshot.runtime.ollamaReady ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/25 bg-amber-400/10 text-amber-200'}`}>
                {snapshot.runtime.ollamaReady ? 'Ollama Ready' : 'Ollama Needed'}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-black uppercase tracking-[0.2em] text-white/55">
                {snapshot.models.filter((model) => model.installed).length} local models
              </div>
            </div>
          </div>
          {(error || notice || snapshot.runtime.message) ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {error ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-red-200"><AlertTriangle size={14} />Error</div>
                  {error}
                </div>
              ) : <div className="hidden lg:block" />}
              {notice ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">{notice}</div>
              ) : <div className="hidden lg:block" />}
              {snapshot.runtime.message ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">{snapshot.runtime.message}</div>
              ) : <div className="hidden lg:block" />}
            </div>
          ) : null}
        </header>
        <div className="flex min-h-0 flex-1">
          <section className="min-w-0 flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
            {activeView === 'prism' ? (
              <PrismWorkspace
                snapshot={snapshot}
                messages={prismMessages}
                busy={busy}
                onSend={handlePrismSend}
                onCreateTask={handleTaskCreate}
              />
            ) : null}
            {activeView === 'spectrum' ? (
              <SpectrumView
                snapshot={snapshot}
                busy={busy}
                onCreateAgentTask={handleTaskCreate}
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
          </section>
          <aside className="hidden w-[340px] shrink-0 border-l border-white/6 bg-[#0d1012] px-6 py-8 xl:block">
            <div className="space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Local Profile</div>
                <div className="mt-3 text-xl font-semibold text-white">{snapshot.profile.name}</div>
                <div className="mt-1 text-sm text-white/55">{snapshot.profile.email}</div>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Workspace Stats</div>
                <div className="grid gap-3">
                  {[
                    { label: 'Chatbots', value: snapshot.agents.length, icon: <Bot size={15} /> },
                    { label: 'Groups', value: snapshot.groups.length, icon: <BrainCircuit size={15} /> },
                    { label: 'Tasks', value: snapshot.tasks.length, icon: <FolderKanban size={15} /> },
                    { label: 'Prism Messages', value: prismMessages.length, icon: <Sparkles size={15} /> }
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/75">
                      <div className="flex items-center gap-3 text-white/55">{item.icon}{item.label}</div>
                      <div className="text-base font-semibold text-white">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Available Models</div>
                <div className="space-y-3">
                  {snapshot.models.map((model) => (
                    <div key={model.id} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{model.label}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">{model.provider}</div>
                        </div>
                        <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${model.installed ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/8 text-white/45'}`}>
                          {model.installed ? 'Installed' : 'Planned'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
