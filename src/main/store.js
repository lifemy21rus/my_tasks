'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const utils = require('../shared/utils');

const MAX_BACKUPS = 5;
const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return crypto.randomUUID();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTitle(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function normalizeDescription(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 10000);
}

function normalizeNoteContent(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 5000);
}

function normalizeCategoryName(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function normalizeColor(value) {
  const str = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(str) ? str.toLowerCase() : utils.CATEGORY_COLORS[0];
}

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizePriority(value) {
  return utils.PRIORITIES.includes(value) ? value : 'normal';
}

const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly'];

function normalizeReminder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const offset = normalizeReminderOffset(raw.offset);
  if (offset === null) return null;
  const type = raw.type === 'due' ? 'due' : 'before';
  return { offset, type };
}

function normalizeReminders(raw) {
  if (!Array.isArray(raw)) return null;
  const items = raw.map(normalizeReminder).filter(Boolean);
  return items.length > 0 ? items : null;
}

function normalizeRecurrence(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!RECURRENCE_TYPES.includes(raw.type)) return null;
  const interval = Number.isFinite(Number(raw.interval)) && Number(raw.interval) >= 1
    ? Math.floor(Number(raw.interval))
    : 1;
  const endDate = raw.endDate ? normalizeDate(raw.endDate) : null;
  let daysOfWeek = null;
  if (raw.type === 'weekly' && Array.isArray(raw.daysOfWeek)) {
    daysOfWeek = raw.daysOfWeek
      .filter((d) => Number.isFinite(Number(d)) && Number(d) >= 0 && Number(d) <= 6)
      .map((d) => Number(d));
    if (daysOfWeek.length === 0) daysOfWeek = null;
  }
  return { type: raw.type, interval, endDate, daysOfWeek };
}

function computeNextDueAt(currentDue, recurrence) {
  if (!currentDue || !recurrence) return null;
  const d = new Date(currentDue);
  if (recurrence.endDate) {
    const end = new Date(recurrence.endDate);
    if (d >= end) return null;
  }
  const result = new Date(d);
  switch (recurrence.type) {
    case 'daily':
      result.setDate(d.getDate() + recurrence.interval);
      break;
    case 'weekly':
      if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
        const currentDay = d.getDay();
        let nextDay = null;
        for (const day of recurrence.daysOfWeek.sort((a, b) => a - b)) {
          let daysAhead = day - currentDay;
          if (daysAhead <= 0) daysAhead += 7;
          if (nextDay === null || daysAhead < nextDay) nextDay = daysAhead;
        }
        if (nextDay !== null) {
          result.setDate(d.getDate() + nextDay);
        } else {
          result.setDate(d.getDate() + 7 * recurrence.interval);
        }
      } else {
        result.setDate(d.getDate() + 7 * recurrence.interval);
      }
      break;
    case 'monthly':
      result.setMonth(d.getMonth() + recurrence.interval);
      break;
  }
  return result.toISOString();
}

function remindersFromLegacy(task) {
  const reminders = [];
  if (task.remindAtDue !== false) {
    reminders.push({ offset: 0, type: 'due' });
  }
  const before = Number.isFinite(task.remindBefore) && task.remindBefore >= 0 ? task.remindBefore : null;
  if (before !== null) {
    reminders.push({ offset: before, type: 'before' });
  }
  return reminders.length > 0 ? reminders : null;
}

function normalizeReminderOffset(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (n === -1) return -1;
  if (Number.isFinite(n) && n >= 0 && n <= 10080) return Math.round(n);
  return null;
}

function normalizeMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n <= 999999) return Math.round(n);
  return null;
}

function normalizeSettings(raw, isPackaged) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const theme = utils.THEMES.includes(source.theme) ? source.theme : 'system';
  const defaultOffset = normalizeReminderOffset(source.defaultRemindBefore);
  const hotkey = String(source.hotkey || DEFAULT_HOTKEY).trim().slice(0, 100) || DEFAULT_HOTKEY;

  return {
    autostart: typeof source.autostart === 'boolean' ? source.autostart : Boolean(isPackaged),
    startMinimized: typeof source.startMinimized === 'boolean' ? source.startMinimized : true,
    theme,
    defaultRemindBefore: defaultOffset === null ? 60 : defaultOffset,
    defaultRemindAtDue: typeof source.defaultRemindAtDue === 'boolean' ? source.defaultRemindAtDue : true,
    hotkey,
    hotkeyEnabled: typeof source.hotkeyEnabled === 'boolean' ? source.hotkeyEnabled : true,
    miniPanel: typeof source.miniPanel === 'boolean' ? source.miniPanel : true,
    miniX: typeof source.miniX === 'number' && Number.isFinite(source.miniX) ? source.miniX : null,
    quitOnClose: typeof source.quitOnClose === 'boolean' ? source.quitOnClose : false,
    startMenuShortcut: typeof source.startMenuShortcut === 'boolean' ? source.startMenuShortcut : false
  };
}

function defaultData(isPackaged) {
  return {
    version: 1,
    settings: normalizeSettings({}, isPackaged),
    categories: [],
    tasks: [],
    notes: [],
    templates: [],
    taskTemplates: []
  };
}

function normalizeSubtask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeTitle(raw.title);
  if (!title) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    title,
    done: Boolean(raw.done),
    createdAt: normalizeDate(raw.createdAt) || nowIso(),
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks.map(normalizeSubtask).filter(Boolean)
      : []
  };
}

function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeTitle(raw.title);
  if (!title) return null;
  const createdAt = normalizeDate(raw.createdAt) || nowIso();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    title,
    content: normalizeNoteContent(raw.content),
    color: raw.color ? normalizeColor(raw.color) : '#ff6b6b',
    done: Boolean(raw.done),
    categoryId: raw.categoryId || null,
    createdAt,
    updatedAt: normalizeDate(raw.updatedAt) || createdAt
  };
}

function normalizeTemplate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeTitle(raw.title);
  if (!title) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    title,
    content: normalizeNoteContent(raw.content)
  };
}

function normalizeTaskTemplate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeTitle(raw.title);
  if (!title) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    title,
    description: normalizeDescription(raw.description),
    priority: normalizePriority(raw.priority),
    categoryId: raw.categoryId || null,
    color: raw.color ? normalizeColor(raw.color) : null,
    estimatedMinutes: normalizeMinutes(raw.estimatedMinutes),
    reminders: normalizeReminders(raw.reminders) || null,
    recurrence: normalizeRecurrence(raw.recurrence) || null,
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks.map((sub) => normalizeSubtask({ ...sub, done: false })).filter(Boolean)
      : []
  };
}

function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = normalizeCategoryName(raw.name);
  if (!name) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    name,
    color: normalizeColor(raw.color)
  };
}

function normalizeTask(raw, validCategoryIds) {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeTitle(raw.title);
  if (!title) return null;

  const createdAt = normalizeDate(raw.createdAt) || nowIso();
  const dueAt = normalizeDate(raw.dueAt);
  const done = Boolean(raw.done);
  const subtasks = Array.isArray(raw.subtasks)
    ? raw.subtasks.map(normalizeSubtask).filter(Boolean)
    : [];

  const task = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    title,
    description: normalizeDescription(raw.description),
    dueAt,
    priority: normalizePriority(raw.priority),
    color: normalizeColor(raw.color),
    categoryId: validCategoryIds && validCategoryIds.has(raw.categoryId) ? raw.categoryId : null,
    done,
    completedAt: done ? (normalizeDate(raw.completedAt) || nowIso()) : null,
    createdAt,
    updatedAt: normalizeDate(raw.updatedAt) || createdAt,
    reminders: normalizeReminders(raw.reminders) || remindersFromLegacy({ remindBefore: raw.remindBefore, remindAtDue: raw.remindAtDue }),
    remindBefore: normalizeReminderOffset(raw.remindBefore),
    remindAtDue: raw.remindAtDue !== false,
    recurrence: normalizeRecurrence(raw.recurrence),
    notifiedBeforeAt: normalizeDate(raw.notifiedBeforeAt),
    notifiedDueAt: normalizeDate(raw.notifiedDueAt),
    snoozedUntil: normalizeDate(raw.snoozedUntil),
    estimatedMinutes: normalizeMinutes(raw.estimatedMinutes),
    actualMinutes: normalizeMinutes(raw.actualMinutes),
    subtasks
  };

  if (!task.dueAt) {
    task.notifiedBeforeAt = null;
    task.notifiedDueAt = null;
    task.snoozedUntil = null;
  }
  if (task.done) {
    task.snoozedUntil = null;
  }

  ensureTaskInvariant(task);
  return task;
}

function ensureTaskInvariant(task) {
  // Рекурсивно нормализуем вложенные подзадачи 먼저
  if (Array.isArray(task.subtasks)) {
    for (const subtask of task.subtasks) {
      ensureTaskInvariant(subtask);
    }
  }

  if (!task.subtasks || task.subtasks.length === 0) {
    if (!task.done) task.completedAt = null;
    else if (!task.completedAt) task.completedAt = nowIso();
    return;
  }

  const allDone = task.subtasks.every((subtask) => subtask.done);
  if (allDone) {
    task.done = true;
    task.completedAt = task.completedAt || nowIso();
    task.snoozedUntil = null;
  } else {
    task.done = false;
    task.completedAt = null;
  }
}

function normalizeData(raw, isPackaged) {
  if (!raw || typeof raw !== 'object') return defaultData(isPackaged);

  const settings = normalizeSettings(raw.settings, isPackaged);
  const categories = [];
  const seenNames = new Set();
  const seenCategoryIds = new Set();

  if (Array.isArray(raw.categories)) {
    for (const item of raw.categories) {
      const category = normalizeCategory(item);
      if (!category) continue;
      const nameKey = category.name.toLowerCase();
      if (seenNames.has(nameKey) || seenCategoryIds.has(category.id)) continue;
      seenNames.add(nameKey);
      seenCategoryIds.add(category.id);
      categories.push(category);
    }
  }

  const tasks = [];
  const seenTaskIds = new Set();
  if (Array.isArray(raw.tasks)) {
    for (const item of raw.tasks) {
      const task = normalizeTask(item, seenCategoryIds);
      if (!task) continue;
      let id = task.id;
      if (seenTaskIds.has(id)) id = uid();
      task.id = id;
      seenTaskIds.add(id);
      tasks.push(task);
    }
  }

  const notes = [];
  const seenNoteIds = new Set();
  if (Array.isArray(raw.notes)) {
    for (const item of raw.notes) {
      const note = normalizeNote(item);
      if (!note) continue;
      if (seenNoteIds.has(note.id)) note.id = uid();
      seenNoteIds.add(note.id);
      notes.push(note);
    }
  }

  return {
    version: 1,
    settings,
    categories,
    tasks,
    notes
  };
}

class Store extends EventEmitter {
  constructor(dataDir, options = {}) {
    super();
    this.dataDir = dataDir;
    this.dataFile = path.join(dataDir, 'data.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.isPackaged = Boolean(options.isPackaged);
    this.notice = null;
    this.data = null;

    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.load();
  }

  load() {
    let raw = null;
    let fromBackup = false;
    const fileExists = fs.existsSync(this.dataFile);

    if (fileExists) {
      try {
        raw = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      } catch (err) {
        const corruptName = `data.corrupt-${this.timestampForFile()}.json`;
        try {
          fs.renameSync(this.dataFile, path.join(this.dataDir, corruptName));
        } catch (_) {
          // ignore
        }
        const latest = this.latestBackup();
        if (latest) {
          try {
            raw = JSON.parse(fs.readFileSync(latest, 'utf8'));
            fromBackup = true;
            this.notice = 'Файл данных был повреждён. Данные восстановлены из резервной копии.';
          } catch (_) {
            raw = null;
          }
        }
        if (!raw) {
          this.notice = 'Файл данных был повреждён. Создан новый пустой список.';
        }
      }
    }

    if (!raw) raw = defaultData(this.isPackaged);
    this.data = normalizeData(raw, this.isPackaged);

    if (fileExists && !fromBackup && fs.existsSync(this.dataFile)) {
      try {
        this.ensureDailyBackup();
      } catch (_) {
        // backup failure should not block startup
      }
    }

    this.save({ silent: true });
  }

  takeNotice() {
    const notice = this.notice;
    this.notice = null;
    return notice;
  }

  getData() {
    return clone(this.data);
  }

  getSettings() {
    return this.data.settings;
  }

  getTasks() {
    return this.data.tasks;
  }

  getCategories() {
    return this.data.categories;
  }

  getDataDir() {
    return this.dataDir;
  }

  save(options = {}) {
    const silent = Boolean(options.silent);
    fs.mkdirSync(this.dataDir, { recursive: true });
    const json = `${JSON.stringify(this.data, null, 2)}\n`;
    const tmp = `${this.dataFile}.tmp`;
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, this.dataFile);
    if (!silent) this.emit('change', { silent: false });
  }

  updateSettings(patch) {
    if (!patch || typeof patch !== 'object') return;
    const current = this.data.settings;
    const next = { ...current };

    if (Object.prototype.hasOwnProperty.call(patch, 'autostart')) {
      next.autostart = Boolean(patch.autostart);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'startMinimized')) {
      next.startMinimized = Boolean(patch.startMinimized);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      if (!utils.THEMES.includes(patch.theme)) throw new Error('Неизвестная тема');
      next.theme = patch.theme;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'defaultRemindBefore')) {
      const value = normalizeReminderOffset(patch.defaultRemindBefore);
      if (value === null) throw new Error('Некорректное время напоминания');
      next.defaultRemindBefore = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'defaultRemindAtDue')) {
      next.defaultRemindAtDue = Boolean(patch.defaultRemindAtDue);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'hotkey')) {
      const value = String(patch.hotkey || '').trim().slice(0, 100);
      if (!value) throw new Error('Пустая горячая клавиша');
      next.hotkey = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'hotkeyEnabled')) {
      next.hotkeyEnabled = Boolean(patch.hotkeyEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniPanel')) {
      next.miniPanel = Boolean(patch.miniPanel);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniX')) {
      const value = patch.miniX;
      next.miniX = (value === null || value === undefined) ? null : (Number.isFinite(Number(value)) ? Number(value) : next.miniX);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'quitOnClose')) {
      next.quitOnClose = Boolean(patch.quitOnClose);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'startMenuShortcut')) {
      next.startMenuShortcut = Boolean(patch.startMenuShortcut);
    }

    this.data.settings = next;
    this.save();
  }

  addTask(input = {}) {
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
      done: false,
      completedAt: null,
      createdAt,
      updatedAt: createdAt,
      reminders: normalizeReminders(input.reminders) || remindersFromLegacy({
        remindBefore: input.remindBefore,
        remindAtDue: input.remindAtDue === undefined
          ? Boolean(this.data.settings.defaultRemindAtDue)
          : Boolean(input.remindAtDue)
      }),
      remindBefore: normalizeReminderOffset(input.remindBefore),
      remindAtDue: input.remindAtDue === undefined
        ? Boolean(this.data.settings.defaultRemindAtDue)
        : Boolean(input.remindAtDue),
      recurrence: normalizeRecurrence(input.recurrence),
      estimatedMinutes: normalizeMinutes(input.estimatedMinutes),
      actualMinutes: normalizeMinutes(input.actualMinutes),
      notifiedBeforeAt: null,
      notifiedDueAt: null,
      snoozedUntil: null,
      subtasks: Array.isArray(input.subtasks)
        ? input.subtasks.map((item) => normalizeSubtask(item)).filter(Boolean)
        : []
    };

    ensureTaskInvariant(task);
    this.data.tasks.push(task);
    this.save();
    return clone(task);
  }

  updateTask(id, patch = {}) {
    const task = this.data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('Задача не найдена');

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

    const newReminders = task.reminders ? JSON.stringify(task.reminders) : null;
    const remindersChanged = oldDueAt !== task.dueAt
      || oldRemindBefore !== task.remindBefore
      || oldRemindAtDue !== task.remindAtDue
      || oldReminders !== newReminders;
    if (remindersChanged || !task.dueAt) {
      task.notifiedBeforeAt = null;
      task.notifiedDueAt = null;
      task.snoozedUntil = null;
    }

    task.updatedAt = nowIso();
    ensureTaskInvariant(task);
    this.save();
    return clone(task);
  }

  deleteTask(id) {
    const index = this.data.tasks.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Задача не найдена');
    this.data.tasks.splice(index, 1);
    this.save();
  }

  toggleTask(id, done) {
    const task = this.data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('Задача не найдена');

    const wasDone = task.done;
    task.done = Boolean(done);
    task.completedAt = task.done ? nowIso() : null;
    task.updatedAt = nowIso();
    if (task.done) {
      task.snoozedUntil = null;
      for (const subtask of task.subtasks) subtask.done = true;
    } else {
      for (const subtask of task.subtasks) subtask.done = false;
    }
    this.save();

    // При первом завершении задачи с правилом повторения создаём следующий экземпляр
    if (task.done && !wasDone && task.recurrence && task.dueAt) {
      const nextDue = computeNextDueAt(task.dueAt, task.recurrence);
      if (nextDue) {
        this.addTask({
          title: task.title,
          description: task.description,
          dueAt: nextDue,
          priority: task.priority,
          categoryId: task.categoryId,
          reminders: task.reminders ? clone(task.reminders) : null,
          remindBefore: task.remindBefore,
          remindAtDue: task.remindAtDue,
          recurrence: task.recurrence ? clone(task.recurrence) : null
        });
      }
    }

    return clone(task);
  }

  addSubtask(taskId, titleValue, parentSubtaskId = null) {
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
      parent.subtasks.push(newSubtask);
    } else {
      task.subtasks.push(newSubtask);
    }

    task.done = false;
    task.completedAt = null;
    task.updatedAt = nowIso();
    ensureTaskInvariant(task);
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

  updateSubtask(taskId, subtaskId, patch = {}, parentSubtaskId = null) {
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
    this.save();
    return clone(task);
  }

  toggleSubtask(taskId, subtaskId, done, parentSubtaskId = null) {
    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('Задача не найдена');
    const subtask = this.findSubtask(task.subtasks, subtaskId);
    if (!subtask) throw new Error('Подзадача не найдена');

    subtask.done = Boolean(done);
    task.updatedAt = nowIso();
    ensureTaskInvariant(task);

    this.save();
    return clone(task);
  }

  deleteSubtask(taskId, subtaskId, parentSubtaskId = null) {
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

    this.save();
    return clone(task);
  }

  snoozeTask(id, untilValue) {
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
    this.save();
    return clone(task);
  }

  patchTaskInternal(id, patch = {}, options = {}) {
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

  addCategory(input = {}) {
    const name = normalizeCategoryName(input.name);
    if (!name) throw new Error('Введите название категории');
    if (this.data.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Такая категория уже есть');
    }

    const category = {
      id: uid(),
      name,
      color: normalizeColor(input.color)
    };
    this.data.categories.push(category);
    this.save();
    return clone(category);
  }

  updateCategory(id, patch = {}) {
    const category = this.data.categories.find((item) => item.id === id);
    if (!category) throw new Error('Категория не найдена');

    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const name = normalizeCategoryName(patch.name);
      if (!name) throw new Error('Введите название категории');
      const duplicate = this.data.categories.some(
        (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicate) throw new Error('Такая категория уже есть');
      category.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      category.color = normalizeColor(patch.color);
    }
    this.save();
    return clone(category);
  }

  deleteCategory(id) {
    const index = this.data.categories.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Категория не найдена');
    this.data.categories.splice(index, 1);
    for (const task of this.data.tasks) {
      if (task.categoryId === id) task.categoryId = null;
    }
    for (const note of this.data.notes) {
      if (note.categoryId === id) note.categoryId = null;
    }
    this.save();
  }

  clearCompleted() {
    const before = this.data.tasks.length;
    this.data.tasks = this.data.tasks.filter((task) => !task.done);
    const removed = before - this.data.tasks.length;
    if (removed > 0) this.save();
    return removed;
  }

  // Notes
  getNotes() {
    return clone(this.data.notes);
  }

  addNote(input) {
    const note = normalizeNote(input);
    if (!note) throw new Error('Неверные данные заметки');
    this.data.notes.push(note);
    this.save();
    return clone(note);
  }

  updateNote(id, patch = {}) {
    const index = this.data.notes.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Заметка не найдена');
    const note = { ...this.data.notes[index] };

    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = normalizeTitle(patch.title);
      if (!title) throw new Error('Введите название заметки');
      note.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
      note.content = normalizeNoteContent(patch.content);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      note.color = normalizeColor(patch.color);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'categoryId')) {
      note.categoryId = this.data.categories.some((category) => category.id === patch.categoryId)
        ? patch.categoryId
        : null;
    }

    note.updatedAt = nowIso();
    this.data.notes[index] = note;
    this.save();
    return clone(note);
  }

  toggleNote(id, done) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.done = Boolean(done);
    note.updatedAt = nowIso();
    this.save();
    return clone(note);
  }

  deleteNote(id) {
    const index = this.data.notes.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Заметка не найдена');
    const note = this.data.notes[index];
    this.data.notes.splice(index, 1);
    this.save();
    return clone(note);
  }
  // End Notes

  /* ------------------------------- Templates ------------------------------- */

  getTemplates() {
    return this.data.templates.map((t) => clone(t));
  }

  addTemplate(input = {}) {
    const template = normalizeTemplate(input);
    if (!template) throw new Error('Введите название шаблона');
    this.data.templates.push(template);
    this.save();
    return clone(template);
  }

  updateTemplate(id, patch = {}) {
    const template = this.data.templates.find((item) => item.id === id);
    if (!template) throw new Error('Шаблон не найден');
    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = normalizeTitle(patch.title);
      if (!title) throw new Error('Введите название шаблона');
      template.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
      template.content = normalizeNoteContent(patch.content);
    }
    this.save();
    return clone(template);
  }

  deleteTemplate(id) {
    const index = this.data.templates.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Шаблон не найден');
    this.data.templates.splice(index, 1);
    this.save();
  }

  /* ------------------------------- Task Templates ------------------------------- */

  getTaskTemplates() {
    return this.data.taskTemplates.map((t) => clone(t));
  }

  addTaskTemplate(input = {}) {
    const template = normalizeTaskTemplate(input);
    if (!template) throw new Error('Введите название шаблона');
    this.data.taskTemplates.push(template);
    this.save();
    return clone(template);
  }

  updateTaskTemplate(id, patch = {}) {
    const template = this.data.taskTemplates.find((item) => item.id === id);
    if (!template) throw new Error('Шаблон не найден');
    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = normalizeTitle(patch.title);
      if (!title) throw new Error('Введите название шаблона');
      template.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
      template.description = normalizeDescription(patch.description);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'priority')) {
      template.priority = normalizePriority(patch.priority);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'categoryId')) {
      template.categoryId = patch.categoryId || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      template.color = patch.color ? normalizeColor(patch.color) : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'estimatedMinutes')) {
      template.estimatedMinutes = normalizeMinutes(patch.estimatedMinutes);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'reminders')) {
      template.reminders = normalizeReminders(patch.reminders) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'recurrence')) {
      template.recurrence = normalizeRecurrence(patch.recurrence) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'subtasks')) {
      template.subtasks = Array.isArray(patch.subtasks)
        ? patch.subtasks.map((sub) => normalizeSubtask({ ...sub, done: false })).filter(Boolean)
        : [];
    }
    this.save();
    return clone(template);
  }

  deleteTaskTemplate(id) {
    const index = this.data.taskTemplates.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Шаблон не найден');
    this.data.taskTemplates.splice(index, 1);
    this.save();
  }

  exportTo(filePath) {
    fs.writeFileSync(filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
  }

  exportToCsv(filePath) {
    const lines = [];
    lines.push('id,title,description,dueAt,priority,categoryId,done,createdAt');
    for (const task of this.data.tasks) {
      const esc = (value) => String(value === null || value === undefined ? '' : value).replace(/"/g, '""');
      const row = [
        esc(task.id),
        `"${esc(task.title)}"`,
        `"${esc(task.description)}"`,
        esc(task.dueAt || ''),
        esc(task.priority || ''),
        esc(task.categoryId || ''),
        task.done ? 1 : 0,
        esc(task.createdAt || '')
      ];
      lines.push(row.join(','));
    }
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  }

  importFrom(filePath) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const normalized = normalizeData(raw, this.isPackaged);
    this.createBackup('before-import');
    this.data = normalized;
    this.save();
    return {
      tasks: this.data.tasks.length,
      categories: this.data.categories.length,
      notes: this.data.notes.length
    };
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs.readdirSync(this.backupDir)
      .filter((name) => name.startsWith('MyTasks-') && name.endsWith('.json'))
      .map((name) => {
        const filePath = path.join(this.backupDir, name);
        return { name, filePath, mtime: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  latestBackup() {
    const backups = this.listBackups();
    return backups.length ? backups[0].filePath : null;
  }

  timestampForFile() {
    const d = new Date();
    return `${d.getFullYear()}-${utils.pad2(d.getMonth() + 1)}-${utils.pad2(d.getDate())}_${utils.pad2(d.getHours())}-${utils.pad2(d.getMinutes())}-${utils.pad2(d.getSeconds())}`;
  }

  createBackup(kind = 'manual') {
    fs.mkdirSync(this.backupDir, { recursive: true });
    const safeKind = String(kind).replace(/[^a-z0-9-]/gi, '-').slice(0, 30) || 'manual';
    const target = path.join(this.backupDir, `MyTasks-${safeKind}-${this.timestampForFile()}.json`);

    if (fs.existsSync(this.dataFile)) {
      fs.copyFileSync(this.dataFile, target);
    } else {
      fs.writeFileSync(target, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    }

    const backups = this.listBackups();
    for (let i = MAX_BACKUPS; i < backups.length; i += 1) {
      try {
        fs.unlinkSync(backups[i].filePath);
      } catch (_) {
        // ignore
      }
    }
    return target;
  }

  ensureDailyBackup() {
    if (!fs.existsSync(this.dataFile)) return null;
    const d = new Date();
    const day = `${d.getFullYear()}-${utils.pad2(d.getMonth() + 1)}-${utils.pad2(d.getDate())}`;
    const prefix = `MyTasks-daily-${day}`;
    const exists = this.listBackups().some((backup) => backup.name.startsWith(prefix));
    if (exists) return null;
    return this.createBackup('daily');
  }

  updateManyTasks(ids, patch = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const results = [];
    for (const id of ids) {
      try {
        results.push(this.updateTask(id, patch));
      } catch (_) {
        // skip tasks that cannot be updated
      }
    }
    return results;
  }

  deleteManyTasks(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    let removed = 0;
    const existingIds = new Set(ids);
    this.data.tasks = this.data.tasks.filter((task) => {
      if (existingIds.has(task.id)) {
        removed += 1;
        return false;
      }
      return true;
    });
    if (removed > 0) this.save();
    return removed;
  }

  toggleManyTasks(ids, done) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const results = [];
    for (const id of ids) {
      try {
        results.push(this.toggleTask(id, done));
      } catch (_) {
        // skip tasks that cannot be toggled
      }
    }
    return results;
  }
}

module.exports = {
  Store,
  DEFAULT_HOTKEY,
  normalizeData,
  normalizeTask,
  normalizeSettings,
  defaultData
};
