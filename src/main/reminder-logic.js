'use strict';

const DEFAULT_OFFSET = 60;

function resolveReminders(task, settings) {
  if (Array.isArray(task.reminders) && task.reminders.length > 0) {
    return task.reminders
      .map((r) => ({
        offset: Number.isFinite(Number(r.offset)) && r.offset >= 0 ? Math.floor(r.offset) : null,
        type: r.type === 'due' ? 'due' : 'before'
      }))
      .filter((r) => r.offset !== null || r.type === 'due');
  }

  const defaultOffset =
    settings && Number.isFinite(Number(settings.defaultRemindBefore))
      ? Number(settings.defaultRemindBefore)
      : DEFAULT_OFFSET;

  const reminders = [];
  if (task.remindAtDue !== false) {
    reminders.push({ offset: 0, type: 'due' });
  }
  if (Number.isFinite(task.remindBefore) && task.remindBefore >= 0) {
    reminders.push({ offset: Math.floor(task.remindBefore), type: 'before' });
  } else if (task.remindBefore === null || task.remindBefore === undefined) {
    reminders.push({ offset: defaultOffset, type: 'before' });
  }
  return reminders;
}

function buildPlan(task, due, reminder, snoozedUntil, nowValue) {
  const offset = reminder.offset;
  const hasAdvance = reminder.type === 'before' && Number.isFinite(offset) && offset >= 0;
  const before = hasAdvance ? due - offset * 60000 : null;
  const hasDue = reminder.type === 'due';

  if (!hasAdvance && !hasDue) return null;

  const notifiedKey = reminder.type === 'before' ? 'notifiedBeforeAt' : 'notifiedDueAt';

  return {
    due,
    before,
    offset,
    type: reminder.type,
    hasAdvance,
    hasDue,
    snoozedUntil,
    notified: Boolean(task[notifiedKey]),
    notifiedKey,
    now: nowValue
  };
}

function getReminderPlans(task, settings, nowValue) {
  if (!task || task.done || !task.dueAt) return null;
  const due = Date.parse(task.dueAt);
  if (!Number.isFinite(due)) return null;

  const snoozedUntilRaw = task.snoozedUntil ? Date.parse(task.snoozedUntil) : null;
  const snoozedUntil = Number.isFinite(snoozedUntilRaw) ? snoozedUntilRaw : null;

  const reminders = resolveReminders(task, settings);
  if (reminders.length === 0) return null;

  const plans = reminders
    .map((r) => buildPlan(task, due, r, snoozedUntil, nowValue))
    .filter(Boolean);
  return plans.length > 0 ? plans : null;
}

// Backward-compatible wrapper: returns the 'before' plan first (old behaviour),
// falls back to 'due' if no advance reminder is configured.
function getReminderPlan(task, settings, nowValue) {
  const plans = getReminderPlans(task, settings, nowValue);
  if (!plans || plans.length === 0) return null;
  const beforePlan = plans.find((p) => p.type === 'before');
  return beforePlan || plans[0];
}

function isReminderMissed(task, settings, nowValue) {
  const now = Number.isFinite(nowValue) ? nowValue : Date.now();
  const plans = getReminderPlans(task, settings, now);
  if (!plans) return false;

  for (const plan of plans) {
    if (plan.snoozedUntil) continue;
    if (plan.due > now) continue;
    if (!plan.notified) return true;
  }
  return false;
}

function getNextReminder(task, settings, nowValue) {
  const now = Number.isFinite(nowValue) ? nowValue : Date.now();
  const plans = getReminderPlans(task, settings, now);
  if (!plans) return null;

  let next = null;
  for (const plan of plans) {
    if (plan.snoozedUntil) continue;
    if (plan.notified) continue;
    if (plan.due <= now) continue; // already due but not missed-check handled elsewhere
    const triggerAt = plan.type === 'due' ? plan.due : plan.before;
    if (!Number.isFinite(triggerAt)) continue;
    if (triggerAt <= now) continue;
    if (!next || triggerAt < next.triggerAt) {
      next = { ...plan, triggerAt };
    }
  }
  return next;
}

module.exports = { getReminderPlan, getReminderPlans, getNextReminder, isReminderMissed };
