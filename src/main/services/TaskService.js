'use strict';

/**
 * Управление задачами и подзадачами (включая рекурсивную вложенность).
 */
class TaskService {
  constructor(ctx) {
    this.data = ctx.data;
    this.save = ctx.save;
    this.emit = ctx.emit;
    this.normalizers = ctx.normalizers;
    this.utils = ctx.utils;
  }

  getTasks() {
    return this.data.tasks;
  }

  addTask(input = {}) {
    const {
      normalizeTitle,
      normalizeDescription,
      normalizeDate,
      normalizePriority,
      normalizeColor,
      normalizeReminders,
      normalizeReminderOffset,
      normalizeMinutes,
      normalizeRecurrence,
      normalizeSubtask,
      remindersFromLegacy,
      ensureTaskInvariant,
      uid,
      nowIso,
      clone
    } = this.normalizers;

    const title = normalizeTitle(input.title);
    if (!title) throw new Error('Введите название задачи');

    const categoryId = this.data.categories.some((category) => category.id === input.categoryId)
      ? input.categoryId
      : null;
    const dueAt = normalizeDate(input.dueAt);
    const createdAt = nowIso();

    const task = {
      id: uid(),
      title,
      description: normalizeDescription(input.description),
      dueAt,
      priority: normalizePriority(input.priority),
      color: normalizeColor(input.color),
      categoryId,
      status: input.status === 'in_progress' || input.status === 'inbox' ? input.status : 'todo',
      order: Number.isFinite(Number(input.order)) ? Number(input.order) : this.data.tasks.length,
      done: false,
      completedAt: null,
      createdAt,
      updatedAt: createdAt,
      reminders:
        normalizeReminders(input.reminders) ||
        remindersFromLegacy({
          remindBefore: input.remindBefore,
          remindAtDue:
            input.remindAtDue === undefined
              ? Boolean(this.data.settings.defaultRemindAtDue)
              : Boolean(input.remindAtDue)
        }),
      remindBefore: normalizeReminderOffset(input.remindBefore),
      remindAtDue:
        input.remindAtDue === undefined
          ? Boolean(this.data.settings.defaultRemindAtDue)
          : Boolean(input.remindAtDue),
      recurrence: normalizeRecurrence(input.recurrence),
      estimatedMinutes: normalizeMinutes(input.estimatedMinutes),
      actualMinutes: normalizeMinutes(input.actualMinutes),
      tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string' && t) : [],
      attachments: Array.isArray(input.attachments)
        ? input.attachments.filter((t) => typeof t === 'string' && t)
        : [],
      notifiedBeforeAt: null,
      notifiedDueAt: null,
      snoozedUntil: null,
      subtasks: Array.isArray(input.subtasks)
        ? input.subtasks.map((item) => normalizeSubtask(item)).filter(Boolean)
        : []
    };

    ensureTaskInvariant(task);
    this.data.tasks.push(task);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.add', { id: task.id, title: task.title });
      } catch (_) {}
    }
    this.save();
    return clone(task);
  }

  updateTask(id, patch = {}) {
    const task = this.data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('Задача не найдена');

    const {
      normalizeTitle,
      normalizeDescription,
      normalizeDate,
      normalizePriority,
      normalizeColor,
      normalizeReminders,
      normalizeReminderOffset,
      normalizeMinutes,
      normalizeRecurrence,
      ensureTaskInvariant,
      nowIso,
      clone
    } = this.normalizers;

    const oldDueAt = task.dueAt;
    const oldRemindBefore = task.remindBefore;
    const oldRemindAtDue = task.remindAtDue;
    const oldReminders = task.reminders ? JSON.stringify(task.reminders) : null;

    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = normalizeTitle(patch.title);
      if (!title) throw new Error('Введите название задачи');
      task.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
      task.description = normalizeDescription(patch.description);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'dueAt')) {
      task.dueAt = normalizeDate(patch.dueAt);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'priority')) {
      task.priority = normalizePriority(patch.priority);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      task.color = normalizeColor(patch.color);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'categoryId')) {
      task.categoryId = this.data.categories.some((category) => category.id === patch.categoryId)
        ? patch.categoryId
        : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'reminders')) {
      task.reminders = normalizeReminders(patch.reminders) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'remindBefore')) {
      task.remindBefore = normalizeReminderOffset(patch.remindBefore);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'remindAtDue')) {
      task.remindAtDue = Boolean(patch.remindAtDue);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'recurrence')) {
      task.recurrence = normalizeRecurrence(patch.recurrence) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'estimatedMinutes')) {
      task.estimatedMinutes = normalizeMinutes(patch.estimatedMinutes);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'actualMinutes')) {
      task.actualMinutes = normalizeMinutes(patch.actualMinutes);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
      const allowed = ['inbox', 'todo', 'in_progress', 'done'];
      if (allowed.includes(patch.status)) task.status = patch.status;
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'order') &&
      Number.isFinite(Number(patch.order))
    ) {
      task.order = Number(patch.order);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tags') && Array.isArray(patch.tags)) {
      task.tags = patch.tags.filter((t) => typeof t === 'string' && t).slice(0, 100);
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'attachments') &&
      Array.isArray(patch.attachments)
    ) {
      task.attachments = patch.attachments.filter((t) => typeof t === 'string' && t).slice(0, 200);
    }

    const newReminders = task.reminders ? JSON.stringify(task.reminders) : null;
    const remindersChanged =
      oldDueAt !== task.dueAt ||
      oldRemindBefore !== task.remindBefore ||
      oldRemindAtDue !== task.remindAtDue ||
      oldReminders !== newReminders;
    if (remindersChanged || !task.dueAt) {
      task.notifiedBeforeAt = null;
      task.notifiedDueAt = null;
      task.snoozedUntil = null;
    }

    task.updatedAt = nowIso();
    ensureTaskInvariant(task);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.update', { id: task.id, fields: Object.keys(patch || {}) });
      } catch (_) {}
    }
    this.save();
    return clone(task);
  }

  deleteTask(id) {
    const index = this.data.tasks.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Задача не найдена');
    const [removed] = this.data.tasks.splice(index, 1);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.delete', { id, title: removed && removed.title });
      } catch (_) {}
    }
    this.save();
  }

  restoreTask(task) {
    const { normalizeTask, clone } = this.normalizers;
    const normalized = normalizeTask(task, {
      categories: this.data.categories,
      isPackaged: this.ctx && this.ctx.store ? this.ctx.store.isPackaged : true
    });
    if (!normalized) throw new Error('Не удалось восстановить задачу');
    if (this.data.tasks.some((t) => t.id === normalized.id)) {
      throw new Error('Задача уже существует');
    }
    this.data.tasks.push(normalized);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.restore', { id: normalized.id, title: normalized.title });
      } catch (_) {}
    }
    this.save();
    return clone(normalized);
  }

  toggleTask(id, done) {
    const { ensureTaskInvariant, nowIso, clone } = this.normalizers;

    const task = this.data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('Задача не найдена');

    const wasDone = task.done;
    task.done = Boolean(done);
    task.completedAt = task.done ? nowIso() : null;
    task.updatedAt = nowIso();
    if (task.done) {
      task.status = 'done';
      task.snoozedUntil = null;
      this.setSubtasksDone(task.subtasks, true);
    } else {
      if (task.status === 'done' || !task.status) task.status = 'todo';
      this.setSubtasksDone(task.subtasks, false);
    }
    ensureTaskInvariant(task);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.toggle', { id: task.id, done: task.done });
      } catch (_) {}
    }
    this.save();

    // При завершении повторяющейся задачи создаётся следующая задача
    if (task.done && !wasDone && task.recurrence && task.dueAt) {
      const { computeNextDueAt } = this.normalizers;
      let nextDue = computeNextDueAt(task.dueAt, task.recurrence);
      const now = Date.now();
      let guard = 0;
      while (nextDue && Date.parse(nextDue) <= now && guard < 1000) {
        nextDue = computeNextDueAt(nextDue, task.recurrence);
        guard += 1;
      }
      if (nextDue) {
        this.addTask({
          title: task.title,
          description: task.description,
          dueAt: nextDue,
          priority: task.priority,
          color: task.color,
          categoryId: task.categoryId,
          status: 'todo',
          tags: task.tags ? clone(task.tags) : [],
          attachments: task.attachments ? clone(task.attachments) : [],
          reminders: task.reminders ? clone(task.reminders) : null,
          remindBefore: task.remindBefore,
          remindAtDue: task.remindAtDue,
          recurrence: task.recurrence ? clone(task.recurrence) : null,
          estimatedMinutes: task.estimatedMinutes
        });
      }
    }

    return clone(task);
  }

  addSubtask(taskId, titleValue, parentSubtaskId = null) {
    const { normalizeTitle, uid, nowIso, ensureTaskInvariant, clone } = this.normalizers;

    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('Задача не найдена');
    const title = normalizeTitle(titleValue);
    if (!title) throw new Error('Введите название подзадачи');

    const newSubtask = {
      id: uid(),
      title,
      done: false,
      createdAt: nowIso(),
      subtasks: []
    };

    if (parentSubtaskId) {
      const parent = this.findSubtask(task.subtasks, parentSubtaskId);
      if (!parent) throw new Error('Родительская подзадача не найдена');
      if (this.findSubtaskDepth(task.subtasks, parentSubtaskId) >= 2) {
        throw new Error('Максимум два уровня подзадач');
      }
      parent.subtasks.push(newSubtask);
    } else {
      task.subtasks.push(newSubtask);
    }

    task.done = false;
    task.completedAt = null;
    task.updatedAt = nowIso();
    ensureTaskInvariant(task);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.subtask.add', { id: task.id, subtaskId: newSubtask.id });
      } catch (_) {}
    }
    this.save();
    return clone(task);
  }

  findSubtask(subtasks, id) {
    for (const subtask of subtasks) {
      if (subtask.id === id) return subtask;
      if (subtask.subtasks) {
        const found = this.findSubtask(subtask.subtasks, id);
        if (found) return found;
      }
    }
    return null;
  }

  findSubtaskDepth(subtasks, id, depth = 1) {
    for (const subtask of subtasks) {
      if (subtask.id === id) return depth;
      if (subtask.subtasks) {
        const found = this.findSubtaskDepth(subtask.subtasks, id, depth + 1);
        if (found) return found;
      }
    }
    return 0;
  }

  setSubtasksDone(subtasks, done) {
    if (!Array.isArray(subtasks)) return;
    for (const subtask of subtasks) {
      subtask.done = Boolean(done);
      if (Array.isArray(subtask.subtasks) && subtask.subtasks.length > 0) {
        this.setSubtasksDone(subtask.subtasks, done);
      }
    }
  }

  // eslint-disable-next-line no-unused-vars
  updateSubtask(taskId, subtaskId, patch = {}, parentSubtaskId = null) {
    const { normalizeTitle, nowIso, clone } = this.normalizers;

    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('Задача не найдена');
    const subtask = this.findSubtask(task.subtasks, subtaskId);
    if (!subtask) throw new Error('Подзадача не найдена');

    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = normalizeTitle(patch.title);
      if (!title) throw new Error('Введите название подзадачи');
      subtask.title = title;
    }
    task.updatedAt = nowIso();
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.subtask.update', { id: task.id, subtaskId });
      } catch (_) {}
    }
    this.save();
    return clone(task);
  }

  // eslint-disable-next-line no-unused-vars
  toggleSubtask(taskId, subtaskId, done, parentSubtaskId = null) {
    const { ensureTaskInvariant, nowIso, clone } = this.normalizers;

    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('Задача не найдена');
    const subtask = this.findSubtask(task.subtasks, subtaskId);
    if (!subtask) throw new Error('Подзадача не найдена');

    const nextDone = Boolean(done);
    subtask.done = nextDone;
    if (Array.isArray(subtask.subtasks) && subtask.subtasks.length > 0) {
      this.setSubtasksDone(subtask.subtasks, nextDone);
    }
    task.updatedAt = nowIso();
    ensureTaskInvariant(task);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.subtask.toggle', {
          id: task.id,
          subtaskId,
          done: subtask.done
        });
      } catch (_) {}
    }
    this.save();
    return clone(task);
  }

  deleteSubtask(taskId, subtaskId, parentSubtaskId = null) {
    const { ensureTaskInvariant, nowIso, clone } = this.normalizers;

    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('Задача не найдена');

    if (parentSubtaskId) {
      const parent = this.findSubtask(task.subtasks, parentSubtaskId);
      if (!parent) throw new Error('Родительская подзадача не найдена');
      const index = parent.subtasks.findIndex((item) => item.id === subtaskId);
      if (index === -1) throw new Error('Подзадача не найдена');
      parent.subtasks.splice(index, 1);
    } else {
      const index = task.subtasks.findIndex((item) => item.id === subtaskId);
      if (index === -1) throw new Error('Подзадача не найдена');
      task.subtasks.splice(index, 1);
    }

    task.updatedAt = nowIso();
    ensureTaskInvariant(task);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.subtask.delete', { id: task.id, subtaskId });
      } catch (_) {}
    }
    this.save();
    return clone(task);
  }

  snoozeTask(id, untilValue) {
    const { normalizeDate, nowIso, clone } = this.normalizers;

    const task = this.data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('Задача не найдена');
    if (task.done) throw new Error('Задача уже выполнена');
    if (!task.dueAt) throw new Error('У задачи нет срока');

    const until = normalizeDate(untilValue);
    if (!until || Date.parse(until) <= Date.now()) {
      throw new Error('Некорректное время отложенного напоминания');
    }

    task.snoozedUntil = until;
    task.updatedAt = nowIso();
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('task.snooze', { id: task.id, until });
      } catch (_) {}
    }
    this.save();
    return clone(task);
  }

  patchTaskInternal(id, patch = {}, options = {}) {
    const { normalizeDate } = this.normalizers;

    const task = this.data.tasks.find((item) => item.id === id);
    if (!task) return;
    const silent = options.silent !== false;

    if (Object.prototype.hasOwnProperty.call(patch, 'notifiedBeforeAt')) {
      task.notifiedBeforeAt = normalizeDate(patch.notifiedBeforeAt);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'notifiedDueAt')) {
      task.notifiedDueAt = normalizeDate(patch.notifiedDueAt);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'snoozedUntil')) {
      task.snoozedUntil = normalizeDate(patch.snoozedUntil);
    }

    this.save({ silent });
  }

  clearCompleted() {
    const before = this.data.tasks.length;
    this.data.tasks = this.data.tasks.filter((task) => !task.done);
    const removed = before - this.data.tasks.length;
    if (removed > 0) {
      if (this.ctx && this.ctx.activity) {
        try {
          this.ctx.activity.log('task.clearCompleted', { removed });
        } catch (_) {}
      }
      this.save();
    }
    return removed;
  }

  updateManyTasks(ids, patch = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return { results: [], errors: [] };
    const results = [];
    const errors = [];
    for (const id of ids) {
      try {
        results.push(this.updateTask(id, patch));
      } catch (err) {
        errors.push({ id, error: err && err.message ? err.message : String(err) });
      }
    }
    return { results, errors };
  }

  deleteManyTasks(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { removed: 0, errors: [] };
    let removed = 0;
    const errors = [];
    const existingIds = new Set(ids);
    this.data.tasks = this.data.tasks.filter((task) => {
      if (existingIds.has(task.id)) {
        removed += 1;
        return false;
      }
      return true;
    });
    if (removed > 0) {
      if (this.ctx && this.ctx.activity) {
        try {
          this.ctx.activity.log('task.deleteMany', { removed });
        } catch (_) {}
      }
      this.save();
    }
    return { removed, errors };
  }

  toggleManyTasks(ids, done) {
    if (!Array.isArray(ids) || ids.length === 0) return { results: [], errors: [] };
    const results = [];
    const errors = [];
    for (const id of ids) {
      try {
        results.push(this.toggleTask(id, done));
      } catch (err) {
        errors.push({ id, error: err && err.message ? err.message : String(err) });
      }
    }
    return { results, errors };
  }
}

module.exports = { TaskService };
