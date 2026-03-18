import { randomUUID } from 'node:crypto';
import type { TaskSpec } from '@supreme/shared';

export interface TaskCreateInput {
  title: string;
  objective: string;
  mode: TaskSpec['mode'];
  target: TaskSpec['target'];
  schedule: {
    kind: TaskSpec['schedule']['kind'];
    runAtLocal?: string;
    preset?: 'daily' | 'weekly' | 'monthly';
    time?: string;
    expression?: string;
  };
  output?: {
    artifactMode?: TaskSpec['outputPolicy']['artifactMode'];
    notificationMode?: TaskSpec['outputPolicy']['notificationMode'];
    defaultSendToChat?: boolean;
  };
  modelOverrideId?: string;
  council?: {
    workerModelIds?: string[];
    judgeModelId?: string;
  };
}

export interface BuildTaskSpecOptions {
  now?: Date;
  timezone?: string;
  installedModelIds?: string[];
  taskId?: string;
}

function parseHourMinute(value: string) {
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value "${value}".`);
  }
  return { hour, minute };
}

function getZonedParts(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false
  });

  const parts = formatter.formatToParts(value);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.get('year'));
  const month = Number(lookup.get('month'));
  const day = Number(lookup.get('day'));
  const hour = Number(lookup.get('hour'));
  const minute = Number(lookup.get('minute'));
  const weekdayRaw = lookup.get('weekday') ?? '';
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(weekdayRaw.toLowerCase().slice(0, 3));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    weekday < 0
  ) {
    throw new Error(`Could not resolve zoned date parts for timezone "${timeZone}".`);
  }

  return { year, month, day, hour, minute, weekday };
}

function zonedDateTimeToUtc(input: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string): Date {
  const initialGuessUtcMs = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0);
  let guess = new Date(initialGuessUtcMs);

  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(guess, timeZone);
    const deltaMinutes =
      (input.year - parts.year) * 525600 +
      (input.month - parts.month) * 43200 +
      (input.day - parts.day) * 1440 +
      (input.hour - parts.hour) * 60 +
      (input.minute - parts.minute);

    if (deltaMinutes === 0) {
      return guess;
    }
    guess = new Date(guess.getTime() + deltaMinutes * 60000);
  }

  return guess;
}

function parseRunAt(runAt: string, timeZone: string): Date {
  const parsed = new Date(runAt);
  if (!Number.isNaN(parsed.getTime()) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(runAt.trim())) {
    return parsed;
  }

  const match = runAt.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) {
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid runAt value "${runAt}".`);
    }
    return parsed;
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  return zonedDateTimeToUtc({
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: Number(hourRaw),
    minute: Number(minuteRaw)
  }, timeZone);
}

function matchesCronField(value: number, field: string, min: number, max: number) {
  if (field === '*') return true;

  return field.split(',').some((part) => {
    if (part.includes('/')) {
      const [base = '*', stepRaw = '0'] = part.split('/');
      const step = Number(stepRaw);
      if (!Number.isInteger(step) || step <= 0) return false;
      if (base === '*') {
        return (value - min) % step === 0;
      }
      if (base.includes('-')) {
        const [rangeStartRaw = '', rangeEndRaw = ''] = base.split('-');
        const rangeStart = Number(rangeStartRaw);
        const rangeEnd = Number(rangeEndRaw);
        if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) return false;
        return value >= rangeStart && value <= rangeEnd && (value - rangeStart) % step === 0;
      }
      const baseValue = Number(base);
      return value === baseValue;
    }

    if (part.includes('-')) {
      const [rangeStartRaw = '', rangeEndRaw = ''] = part.split('-');
      const rangeStart = Number(rangeStartRaw);
      const rangeEnd = Number(rangeEndRaw);
      if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) return false;
      return value >= rangeStart && value <= rangeEnd;
    }

    const numeric = Number(part);
    return Number.isInteger(numeric) && numeric >= min && numeric <= max && value === numeric;
  });
}

function nextCronRun(expression: string, from: Date, timeZone: string): Date {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('Cron schedule must use the standard 5-field format.');
  }

  const [
    minuteField = '*',
    hourField = '*',
    dayField = '*',
    monthField = '*',
    weekdayField = '*'
  ] = fields;
  const start = new Date(from);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  for (let i = 0; i < 525600; i += 1) {
    const candidate = new Date(start.getTime() + i * 60000);
    const zoned = getZonedParts(candidate, timeZone);
    if (
      matchesCronField(zoned.minute, minuteField, 0, 59) &&
      matchesCronField(zoned.hour, hourField, 0, 23) &&
      matchesCronField(zoned.day, dayField, 1, 31) &&
      matchesCronField(zoned.month, monthField, 1, 12) &&
      matchesCronField(zoned.weekday, weekdayField, 0, 6)
    ) {
      return candidate;
    }
  }

  throw new Error('Could not compute the next cron run within one year.');
}

export function computeNextRun(schedule: TaskSpec['schedule'], from = new Date()) {
  if (schedule.kind === 'once') {
    return parseRunAt(schedule.runAt, schedule.timezone);
  }

  if (schedule.kind === 'cron') {
    return nextCronRun(schedule.expression, from, schedule.timezone);
  }

  const base = new Date(from);
  const baseZoned = getZonedParts(base, schedule.timezone);
  const { hour, minute } = parseHourMinute(schedule.time);
  let candidate = zonedDateTimeToUtc({
    year: baseZoned.year,
    month: baseZoned.month,
    day: baseZoned.day,
    hour,
    minute
  }, schedule.timezone);

  if (schedule.preset === 'daily') {
    if (candidate <= base) {
      const nextDay = getZonedParts(new Date(base.getTime() + 24 * 60 * 60000), schedule.timezone);
      candidate = zonedDateTimeToUtc({
        year: nextDay.year,
        month: nextDay.month,
        day: nextDay.day,
        hour,
        minute
      }, schedule.timezone);
    }
    return candidate;
  }

  if (schedule.preset === 'weekly') {
    if (candidate <= base) {
      const nextWeek = new Date(base.getTime() + 7 * 24 * 60 * 60000);
      const nextWeekZoned = getZonedParts(nextWeek, schedule.timezone);
      candidate = zonedDateTimeToUtc({
        year: nextWeekZoned.year,
        month: nextWeekZoned.month,
        day: nextWeekZoned.day,
        hour,
        minute
      }, schedule.timezone);
    }
    return candidate;
  }

  if (candidate <= base) {
    return zonedDateTimeToUtc({
      year: baseZoned.year,
      month: baseZoned.month + 1,
      day: baseZoned.day,
      hour,
      minute
    }, schedule.timezone);
  }

  return candidate;
}

export function isRecurring(schedule: TaskSpec['schedule']) {
  return schedule.kind !== 'once';
}

export function buildTaskSpec(input: TaskCreateInput, options: BuildTaskSpecOptions = {}): TaskSpec {
  const now = options.now ?? new Date();
  const createdAt = now.toISOString();
  const timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const installedModelIds = options.installedModelIds ?? [];

  const schedule: TaskSpec['schedule'] =
    input.schedule.kind === 'once'
      ? {
          kind: 'once',
          runAt: parseRunAt(input.schedule.runAtLocal ?? createdAt, timezone).toISOString(),
          timezone
        }
      : input.schedule.kind === 'simple'
        ? {
            kind: 'simple',
            preset: input.schedule.preset ?? 'daily',
            time: input.schedule.time ?? '09:00',
            timezone
          }
        : {
            kind: 'cron',
            expression: (input.schedule.expression ?? '0 9 * * 1-5').trim(),
            timezone
          };

  const outputPolicy: TaskSpec['outputPolicy'] = {
    saveResult: true,
    artifactMode: input.output?.artifactMode ?? 'markdown',
    notificationMode: input.output?.notificationMode ?? 'desktop',
    defaultSendToChat: Boolean(input.output?.defaultSendToChat ?? false)
  };

  const modelOverrideId = input.modelOverrideId?.trim();
  const providerOverride = modelOverrideId ? { provider: 'ollama' as const, modelId: modelOverrideId } : undefined;

  const council = input.mode === 'council'
    ? (() => {
        const workers = (input.council?.workerModelIds ?? []).filter(Boolean);
        const resolvedWorkers = workers.length ? workers : installedModelIds.slice(0, 2);
        const judge = (input.council?.judgeModelId ?? '').trim() || resolvedWorkers[0] || installedModelIds[0] || '';
        if (resolvedWorkers.length === 0 || !judge) {
          throw new Error('No installed local models available for council mode.');
        }
        return {
          workerModels: resolvedWorkers.map((modelId) => ({ provider: 'ollama' as const, modelId })),
          judgeModel: { provider: 'ollama' as const, modelId: judge }
        } satisfies TaskSpec['council'];
      })()
    : undefined;

  const firstRun = computeNextRun(schedule, now);
  return {
    id: options.taskId ?? randomUUID(),
    title: input.title.trim(),
    objective: input.objective.trim(),
    mode: input.mode,
    target: input.target,
    schedule,
    outputPolicy,
    status: firstRun <= now ? 'queued' : 'scheduled',
    createdAt,
    updatedAt: createdAt,
    nextRunAt: firstRun.toISOString(),
    runCount: 0,
    artifactIds: [],
    ...(providerOverride ? { providerOverride } : {}),
    ...(council ? { council } : {})
  };
}
