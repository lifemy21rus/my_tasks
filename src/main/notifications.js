'use strict';

const { Notification } = require('electron');
const utils = require('../shared/utils');

function shortTitle(title) {
  return utils.truncate(title, 80);
}

class Notifications {
  constructor(options = {}) {
    this.onClickTask = options.onClickTask || (() => {});
    this.onTaskAction = options.onTaskAction || (() => {});
    this.onOpenOverdue = options.onOpenOverdue || (() => {});
    this.onClickApp = options.onClickApp || (() => {});
    this.active = new Set();
  }

  isSupported() {
    return Notification.isSupported();
  }

  show({ title = 'Планировщик', body, taskId = null, action = null, actions = [] }) {
    if (!this.isSupported()) return false;

    const actionIds = actions.map((item) => item && item.action).filter(Boolean);
    const electronActions = actions.map((item) => ({ type: item.type || 'button', text: item.text }));

    let notification;
    try {
      notification = new Notification({ title, body, silent: false, actions: electronActions });
    } catch (err) {
      console.error('Не удалось создать уведомление:', err);
      return false;
    }

    notification.on('click', () => {
      try {
        if (taskId) this.onClickTask(taskId);
        else if (action === 'overdue') this.onOpenOverdue();
        else this.onClickApp();
      } catch (err) {
        console.error('Ошибка обработки клика по уведомлению:', err);
      }
    });

    notification.on('action', (event, index) => {
      try {
        if (!taskId) return;
        const actionId =
          (event && typeof event.action === 'string' && event.action) ||
          (Number.isInteger(index) ? actionIds[index] : null) ||
          (Number.isInteger(event) ? actionIds[event] : null);

        if (actionId === 'complete') {
          this.onTaskAction({ taskId, type: 'complete' });
        } else if (actionId === 'snooze10') {
          this.onTaskAction({ taskId, type: 'snooze', until: Date.now() + 10 * 60000 });
        } else if (actionId === 'snooze60') {
          this.onTaskAction({ taskId, type: 'snooze', until: Date.now() + 60 * 60000 });
        } else if (actionId === 'snoozeTomorrow') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          this.onTaskAction({ taskId, type: 'snooze', until: tomorrow.getTime() });
        }
      } catch (err) {
        console.error('Ошибка обработки действия уведомления:', err);
      }
    });

    notification.on('close', () => this.active.delete(notification));
    this.active.add(notification);

    try {
      notification.show();
    } catch (err) {
      console.error('Не удалось показать уведомление:', err);
      this.active.delete(notification);
      return false;
    }
    return true;
  }

  showBefore(task, offsetMinutes) {
    const due = utils.formatDueChip(task.dueAt);
    const when = Number.isFinite(offsetMinutes) && offsetMinutes >= 0
      ? `через ${utils.formatDuration(offsetMinutes)}`
      : 'скоро';
    return this.show({
      body: `«${shortTitle(task.title)}» — срок ${when}. ${due.text}.`,
      taskId: task.id,
      actions: [
        { type: 'button', text: 'Выполнено', action: 'complete' },
        { type: 'button', text: 'Отложить 10 мин', action: 'snooze10' },
        { type: 'button', text: 'Отложить 1 час', action: 'snooze60' }
      ]
    });
  }

  showDue(task) {
    const due = utils.formatDueChip(task.dueAt);
    return this.show({
      body: `Срок наступил: «${shortTitle(task.title)}» — ${due.text}.`,
      taskId: task.id,
      actions: [
        { type: 'button', text: 'Выполнено', action: 'complete' },
        { type: 'button', text: 'Отложить 10 мин', action: 'snooze10' },
        { type: 'button', text: 'Отложить 1 час', action: 'snooze60' },
        { type: 'button', text: 'Завтра в 09:00', action: 'snoozeTomorrow' }
      ]
    });
  }

  showSnooze(task) {
    const due = utils.formatDueChip(task.dueAt);
    return this.show({
      body: `Напоминание: «${shortTitle(task.title)}» — ${due.text}.`,
      taskId: task.id,
      actions: [
        { type: 'button', text: 'Выполнено', action: 'complete' },
        { type: 'button', text: 'Отложить 10 мин', action: 'snooze10' },
        { type: 'button', text: 'Отложить 1 час', action: 'snooze60' }
      ]
    });
  }

  showMissed(count) {
    const body = count === 1
      ? 'Пропущен срок одной задачи. Откройте приложение, чтобы посмотреть.'
      : `Пропущено сроков: ${count}. Откройте приложение, чтобы посмотреть.`;
    return this.show({ body, action: 'overdue' });
  }

  showTest() {
    return this.show({
      title: 'Планировщик',
      body: 'Уведомления работают. Здесь будут напоминания о сроках.'
    });
  }

  closeAll() {
    for (const notification of this.active) {
      try {
        notification.close();
      } catch (_) {
        // ignore
      }
    }
    this.active.clear();
  }
}

module.exports = { Notifications };
