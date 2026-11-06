'use strict';

const { powerMonitor } = require('electron');
const { getReminderPlans, isReminderMissed } = require('./reminder-logic');

class Scheduler {
  constructor(options) {
    this.store = options.store;
    this.notifications = options.notifications;
    this.logger = options.logger || console;
    this.timer = null;
    this.running = false;
    this.resumeHandler = null;
  }

  start() {
    if (!this.notifications.isSupported()) {
      this.logger.warn('Уведомления Windows не поддерживаются на этой системе.');
      return;
    }

    this.checkMissedOnStartup();
    this.timer = setInterval(() => this.tick(), 30000);
    this.resumeHandler = () => this.tick();
    powerMonitor.on('resume', this.resumeHandler);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.resumeHandler) {
      powerMonitor.removeListener('resume', this.resumeHandler);
      this.resumeHandler = null;
    }
  }

  checkMissedOnStartup() {
    try {
      const now = Date.now();
      const settings = this.store.getSettings();
      const tasks = this.store.getTasks();
      const missed = tasks.filter((task) => isReminderMissed(task, settings, now));
      if (missed.length === 0) return;

      if (!this.notifications.showMissed(missed.length)) return;

      const iso = new Date(now).toISOString();
      for (const task of missed) {
        this.store.patchTaskInternal(task.id, {
          notifiedBeforeAt: task.notifiedBeforeAt || iso,
          notifiedDueAt: task.notifiedDueAt || iso
        });
      }
    } catch (err) {
      this.logger.error('Ошибка проверки пропущенных сроков:', err);
    }
  }

  async tick() {
    if (this.running) return;
    this.running = true;

    try {
      const now = Date.now();
      const settings = this.store.getSettings();
      const tasks = this.store.getTasks();

      for (const task of tasks) {
        if (!task.dueAt) continue;

        const plans = getReminderPlans(task, settings, now);
        if (!plans) continue;

        for (const plan of plans) {
          if (plan.snoozedUntil) {
            if (now >= plan.snoozedUntil) this.deliverSnooze(task, plan, now);
            continue;
          }

          if (plan.due > now) continue;

          if (plan.notified) continue;

          if (plan.type === 'due') {
            if (this.notifications.showDue(task)) {
              this.store.patchTaskInternal(task.id, { [plan.notifiedKey]: new Date(now).toISOString() });
            }
          } else if (plan.type === 'before') {
            if (now >= plan.before) {
              if (this.notifications.showBefore(task, plan.offset)) {
                this.store.patchTaskInternal(task.id, { [plan.notifiedKey]: new Date(now).toISOString() });
              }
            }
          }
        }
      }
    } catch (err) {
      this.logger.error('Ошибка планировщика напоминаний:', err);
    } finally {
      this.running = false;
    }
  }

  deliverSnooze(task, plan, now) {
    if (!this.notifications.showSnooze(task)) return;

    const iso = new Date(now).toISOString();
    const patch = { snoozedUntil: null };

    if (plan.hasAdvance && now >= plan.before && !plan.notifiedBefore) {
      patch.notifiedBeforeAt = iso;
    }
    if (plan.hasDue && now >= plan.due && !plan.notifiedDue) {
      patch.notifiedDueAt = iso;
    }

    this.store.patchTaskInternal(task.id, patch);
  }
}

module.exports = { Scheduler };
