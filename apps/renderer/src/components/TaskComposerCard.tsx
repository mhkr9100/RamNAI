import React, { useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, SendHorizontal } from 'lucide-react';
import type { TaskSpec } from '@supreme/shared';
import type { TaskCreateInput } from '@/lib/electron';

interface TaskComposerCardProps {
  title: string;
  subtitle: string;
  target: TaskSpec['target'];
  defaultMode: TaskSpec['mode'];
  models: Array<{ id: string; label: string; installed: boolean }>;
  busy: boolean;
  onCreate: (input: TaskCreateInput) => Promise<void>;
}

export function TaskComposerCard({ title, subtitle, target, defaultMode, models, busy, onCreate }: TaskComposerCardProps) {
  const installedModels = models.filter((model) => model.installed);
  const [mode, setMode] = useState<TaskSpec['mode']>(defaultMode);
  const [taskTitle, setTaskTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [scheduleKind, setScheduleKind] = useState<TaskSpec['schedule']['kind']>('once');
  const [runAt, setRunAt] = useState(() => new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16));
  const [preset, setPreset] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [time, setTime] = useState('09:00');
  const [cronExpression, setCronExpression] = useState('0 9 * * 1-5');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [artifactMode, setArtifactMode] = useState<TaskSpec['outputPolicy']['artifactMode']>('markdown');
  const [notificationMode, setNotificationMode] = useState<TaskSpec['outputPolicy']['notificationMode']>('desktop');
  const [defaultSendToChat, setDefaultSendToChat] = useState(false);
  const [workerModelIds, setWorkerModelIds] = useState<string[]>(() => installedModels.slice(0, 2).map((model) => model.id));
  const [judgeModelId, setJudgeModelId] = useState(() => installedModels[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const toggleWorker = (modelId: string) => {
    setWorkerModelIds((current) => current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskTitle.trim() || !objective.trim()) {
      setError('Title and objective are required.');
      return;
    }

    if (mode === 'council' && workerModelIds.length === 0) {
      setError('Select at least one worker model for council mode.');
      return;
    }

    const resolvedJudgeModelId = judgeModelId || workerModelIds[0] || '';
    if (mode === 'council' && !resolvedJudgeModelId) {
      setError('Select a judge model for council mode.');
      return;
    }

    setError(null);

    const base: TaskCreateInput = {
      title: taskTitle.trim(),
      objective: objective.trim(),
      mode,
      target,
      schedule: scheduleKind === 'once'
        ? { kind: 'once', runAtLocal: runAt }
        : scheduleKind === 'simple'
          ? { kind: 'simple', preset, time }
          : { kind: 'cron', expression: cronExpression.trim() },
      output: {
        artifactMode,
        notificationMode,
        defaultSendToChat
      },
      ...(selectedModelId ? { modelOverrideId: selectedModelId } : {}),
      ...(mode === 'council'
        ? {
            council: {
              workerModelIds,
              judgeModelId: resolvedJudgeModelId
            }
          }
        : {})
    };

    await onCreate(base);
    setTaskTitle('');
    setObjective('');
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0d1012] p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Task</div>
          <div className="mt-1 text-sm font-black uppercase tracking-[0.14em] text-white">{title}</div>
          {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-7 text-white/58">{subtitle}</p> : null}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/42">
          <CalendarClock size={14} className="mb-2" />
          Scheduler
        </div>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3 xl:grid-cols-2">
        <label className="space-y-2 xl:col-span-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Title</span>
          <input
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-white/25"
            placeholder={mode === 'council' ? 'Friday market council' : 'Morning update brief'}
          />
        </label>
        <label className="space-y-2 xl:col-span-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Objective</span>
          <textarea
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            className="min-h-[132px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-white/25"
            placeholder={mode === 'council' ? 'Have multiple models evaluate the same brief, critique each other once, and synthesize the strongest final recommendation.' : 'Tell Prism exactly what should be executed when this task runs.'}
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Mode</span>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
            {(['task', 'council'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] transition ${mode === value ? 'bg-white text-black' : 'text-white/48 hover:text-white'}`}
              >
                {value}
              </button>
            ))}
          </div>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Specific Model Override</span>
          <div className="relative">
            <select
              value={selectedModelId}
              onChange={(event) => setSelectedModelId(event.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 pr-11 text-sm text-white outline-none"
            >
              <option value="">Automatic</option>
              {installedModels.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/35" size={16} />
          </div>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Schedule Type</span>
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
            {(['once', 'simple', 'cron'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScheduleKind(value)}
                className={`rounded-xl px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] transition ${scheduleKind === value ? 'bg-white text-black' : 'text-white/48 hover:text-white'}`}
              >
                {value}
              </button>
            ))}
          </div>
        </label>
        {scheduleKind === 'once' ? (
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Activation Time</span>
            <input
              value={runAt}
              onChange={(event) => setRunAt(event.target.value)}
              type="datetime-local"
              className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
            />
          </label>
        ) : null}
        {scheduleKind === 'simple' ? (
          <>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Recurring</span>
              <div className="relative">
                <select value={preset} onChange={(event) => setPreset(event.target.value as 'daily' | 'weekly' | 'monthly')} className="w-full appearance-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 pr-11 text-sm text-white outline-none">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/35" size={16} />
              </div>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Time</span>
              <input value={time} onChange={(event) => setTime(event.target.value)} type="time" className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" />
            </label>
          </>
        ) : null}
        {scheduleKind === 'cron' ? (
          <label className="space-y-2 xl:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Cron Expression</span>
            <input
              value={cronExpression}
              onChange={(event) => setCronExpression(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
              placeholder="0 9 * * 1-5"
            />
          </label>
        ) : null}
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Artifact Output</span>
          <div className="relative">
              <select value={artifactMode} onChange={(event) => setArtifactMode(event.target.value as TaskSpec['outputPolicy']['artifactMode'])} className="w-full appearance-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 pr-11 text-sm text-white outline-none">
              <option value="none">None</option>
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
              <option value="both">Markdown + JSON</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/35" size={16} />
          </div>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Notification</span>
          <div className="relative">
              <select value={notificationMode} onChange={(event) => setNotificationMode(event.target.value as TaskSpec['outputPolicy']['notificationMode'])} className="w-full appearance-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 pr-11 text-sm text-white outline-none">
              <option value="none">None</option>
              <option value="in_app">In app</option>
              <option value="desktop">Desktop</option>
              <option value="both">In app + desktop</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/35" size={16} />
          </div>
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70 xl:col-span-2">
          <input type="checkbox" checked={defaultSendToChat} onChange={(event) => setDefaultSendToChat(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
          Ready to send back to chat.
        </label>
        {mode === 'council' ? (
          <div className="xl:col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/42">Council Models</div>
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div>
                <div className="mb-3 text-sm font-semibold text-white">Workers</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {installedModels.map((model) => (
                    <label key={model.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-white/70">
                      <input type="checkbox" checked={workerModelIds.includes(model.id)} onChange={() => toggleWorker(model.id)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                      <div>
                        <div className="font-semibold text-white">{model.label}</div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">{model.id}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Judge Model</span>
                <div className="relative">
                  <select value={judgeModelId} onChange={(event) => setJudgeModelId(event.target.value)} className="w-full appearance-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 pr-11 text-sm text-white outline-none">
                    {installedModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/35" size={16} />
                </div>
              </label>
            </div>
          </div>
        ) : null}
        {error ? <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100 xl:col-span-2">{error}</div> : null}
        <div className="xl:col-span-2 flex items-center justify-between gap-4">
          <div className="text-sm text-white/48">Target: {target.type === 'prism' ? 'Prism' : `Chatbot ${target.agentId}`}</div>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? 'Scheduling…' : 'Schedule Task'}
            <SendHorizontal size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}
