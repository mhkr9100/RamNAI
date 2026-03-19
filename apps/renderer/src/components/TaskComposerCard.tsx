import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, SendHorizontal } from 'lucide-react';
import type { TaskSpec } from '@supreme/shared';
import type { TaskCreateInput } from '@/lib/electron';
import { Badge, Button, Card, CardHeader, Input, SectionLabel, Select, Textarea } from './ui';

interface TaskComposerCardProps {
  title: string;
  subtitle: string;
  target: TaskSpec['target'];
  defaultMode: TaskSpec['mode'];
  models: Array<{ id: string; label: string; installed: boolean }>;
  busy: boolean;
  onCreate: (input: TaskCreateInput) => Promise<void>;
}

export function TaskComposerCard({
  title,
  subtitle,
  target,
  defaultMode,
  models,
  busy,
  onCreate,
}: TaskComposerCardProps) {
  const installedModels = useMemo(() => models.filter((model) => model.installed), [models]);
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
  const [workerModelIds, setWorkerModelIds] = useState<string[]>(() =>
    installedModels.slice(0, 2).map((model) => model.id),
  );
  const [judgeModelId, setJudgeModelId] = useState(() => installedModels[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const modelOptions = useMemo(
    () => [
      { value: '', label: 'Automatic' },
      ...installedModels.map((model) => ({ value: model.id, label: model.label })),
    ],
    [installedModels],
  );

  const judgeOptions = useMemo(
    () => installedModels.map((model) => ({ value: model.id, label: model.label })),
    [installedModels],
  );

  const toggleWorker = (modelId: string) => {
    setWorkerModelIds((current) =>
      current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId],
    );
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
      schedule:
        scheduleKind === 'once'
          ? { kind: 'once', runAtLocal: runAt }
          : scheduleKind === 'simple'
            ? { kind: 'simple', preset, time }
            : { kind: 'cron', expression: cronExpression.trim() },
      output: {
        artifactMode,
        notificationMode,
        defaultSendToChat,
      },
      ...(selectedModelId ? { modelOverrideId: selectedModelId } : {}),
      ...(mode === 'council'
        ? {
            council: {
              workerModelIds,
              judgeModelId: resolvedJudgeModelId,
            },
          }
        : {}),
    };

    await onCreate(base);
    setTaskTitle('');
    setObjective('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
    >
      <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
        <CardHeader
          title={title}
          subtitle={subtitle || 'Configure the objective, model routing, and schedule before sending it to work.'}
          icon={<CalendarClock size={16} className="text-brand-light" />}
          action={
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand">{mode}</Badge>
              <Badge variant="info">{scheduleKind}</Badge>
            </div>
          }
        />

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <section className="space-y-4">
            <SectionLabel>Task Details</SectionLabel>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="xl:col-span-2">
                <Input
                  label="Title"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder={mode === 'council' ? 'Friday market council' : 'Morning update brief'}
                />
              </div>
              <div className="xl:col-span-2">
                <Textarea
                  label="Objective"
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  className="min-h-[132px] bg-surface-1"
                  placeholder={
                    mode === 'council'
                      ? 'Have multiple models evaluate the same brief, critique each other once, and synthesize the strongest final recommendation.'
                      : 'Tell Prism exactly what should be executed when this task runs.'
                  }
                />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">
                  Mode
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.08] bg-surface-1 p-1">
                  {(['task', 'council'] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={mode === value ? 'brand' : 'ghost'}
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => setMode(value)}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </div>
              <Select
                label="Specific Model Override"
                value={selectedModelId}
                onChange={(event) => setSelectedModelId(event.target.value)}
                options={modelOptions}
              />
            </div>
          </section>

          <section className="space-y-4">
            <SectionLabel>Scheduling</SectionLabel>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="xl:col-span-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">
                    Schedule Type
                  </span>
                  <Badge variant="info">{scheduleKind}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/[0.08] bg-surface-1 p-1">
                  {(['once', 'simple', 'cron'] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={scheduleKind === value ? 'brand' : 'ghost'}
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => setScheduleKind(value)}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </div>

              {scheduleKind === 'once' ? (
                <Input
                  label="Activation Time"
                  type="datetime-local"
                  value={runAt}
                  onChange={(event) => setRunAt(event.target.value)}
                />
              ) : null}

              {scheduleKind === 'simple' ? (
                <>
                  <Select
                    label="Recurring"
                    value={preset}
                    onChange={(event) => setPreset(event.target.value as 'daily' | 'weekly' | 'monthly')}
                    options={[
                      { value: 'daily', label: 'Daily' },
                      { value: 'weekly', label: 'Weekly' },
                      { value: 'monthly', label: 'Monthly' },
                    ]}
                  />
                  <Input
                    label="Time"
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                  />
                </>
              ) : null}

              {scheduleKind === 'cron' ? (
                <div className="xl:col-span-2">
                  <Input
                    label="Cron Expression"
                    value={cronExpression}
                    onChange={(event) => setCronExpression(event.target.value)}
                    placeholder="0 9 * * 1-5"
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-4">
            <SectionLabel>Output</SectionLabel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Select
                label="Artifact Output"
                value={artifactMode}
                onChange={(event) =>
                  setArtifactMode(event.target.value as TaskSpec['outputPolicy']['artifactMode'])
                }
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'markdown', label: 'Markdown' },
                  { value: 'json', label: 'JSON' },
                  { value: 'both', label: 'Markdown + JSON' },
                ]}
              />
              <Select
                label="Notification"
                value={notificationMode}
                onChange={(event) =>
                  setNotificationMode(event.target.value as TaskSpec['outputPolicy']['notificationMode'])
                }
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'in_app', label: 'In App' },
                  { value: 'desktop', label: 'Desktop' },
                  { value: 'both', label: 'In App + Desktop' },
                ]}
              />
              <label className="xl:col-span-2 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-surface-1 px-4 py-3 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={defaultSendToChat}
                  onChange={(event) => setDefaultSendToChat(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                />
                Ready to send back to chat.
              </label>
            </div>
          </section>

          {mode === 'council' ? (
            <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-surface-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <SectionLabel className="flex-1">Council Models</SectionLabel>
                <Badge variant="brand">Council</Badge>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div>
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">
                    Workers
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {installedModels.map((model) => (
                      <label
                        key={model.id}
                        className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-surface-2 px-4 py-3 text-sm text-white/70"
                      >
                        <input
                          type="checkbox"
                          checked={workerModelIds.includes(model.id)}
                          onChange={() => toggleWorker(model.id)}
                          className="h-4 w-4 rounded border-white/20 bg-transparent"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-white">{model.label}</div>
                          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
                            {model.id}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <Select
                  label="Judge Model"
                  value={judgeModelId}
                  onChange={(event) => setJudgeModelId(event.target.value)}
                  options={judgeOptions}
                />
              </div>
            </section>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-surface-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
                Target
              </div>
              <div className="text-sm text-white/70">
                {target.type === 'prism' ? 'Prism' : `Chatbot ${target.agentId}`}
              </div>
            </div>
            <Button
              type="submit"
              variant="brand"
              size="lg"
              loading={busy}
              iconRight={<SendHorizontal size={16} />}
            >
              {busy ? 'Scheduling...' : 'Schedule Task'}
            </Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}
