'use strict';

const crypto = require('crypto');
const utils = require('../shared/utils');

const MAX_BACKUPS = 5;
const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';
const ENCRYPTION_PREFIX = 'MYTASKS_ENCv1:';

// Опциональное шифрование файла данных (AES-256-GCM).
// Пароль берётся из переменной окружения MYTASKS_DATA_PASSWORD, чтобы не хранить его в открытом виде.
function encryptionKey(password) {
  return crypto.scryptSync(password, 'mytasks-data-salt', 32);
}

function encryptData(jsonString, password) {
  const key = encryptionKey(password);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENCRYPTION_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptData(encryptedString, password) {
  if (!encryptedString || !encryptedString.startsWith(ENCRYPTION_PREFIX)) return encryptedString;
  const payload = Buffer.from(encryptedString.slice(ENCRYPTION_PREFIX.length), 'base64');
  const iv = payload.subarray(0, 16);
  const tag = payload.subarray(16, 32);
  const encrypted = payload.subarray(32);
  const key = encryptionKey(password);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

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

function normalizeRecurrence(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!RECURRENCE_TYPES.includes(raw.type)) return null;
  const interval =
    Number.isFinite(Number(raw.interval)) && Number(raw.interval) >= 1
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
  const before =
    Number.isFinite(task.remindBefore) && task.remindBefore >= 0 ? task.remindBefore : null;
  if (before !== null) {
    reminders.push({ offset: before, type: 'before' });
  }
  return reminders.length > 0 ? reminders : null;
}

function normalizeSettings(raw, isPackaged) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const theme = utils.THEMES.includes(source.theme) ? source.theme : 'system';
  const defaultOffset = normalizeReminderOffset(source.defaultRemindBefore);
  const hotkey =
    String(source.hotkey || DEFAULT_HOTKEY)
      .trim()
      .slice(0, 100) || DEFAULT_HOTKEY;

  return {
    autostart: typeof source.autostart === 'boolean' ? source.autostart : Boolean(isPackaged),
    startMinimized: typeof source.startMinimized === 'boolean' ? source.startMinimized : true,
    theme,
    defaultRemindBefore: defaultOffset === null ? 60 : defaultOffset,
    defaultRemindAtDue:
      typeof source.defaultRemindAtDue === 'boolean' ? source.defaultRemindAtDue : true,
    hotkey,
    hotkeyEnabled: typeof source.hotkeyEnabled === 'boolean' ? source.hotkeyEnabled : true,
    miniPanel: typeof source.miniPanel === 'boolean' ? source.miniPanel : true,
    miniPanelAtStart:
      typeof source.miniPanelAtStart === 'boolean' ? source.miniPanelAtStart : false,
    miniPanelTabs: utils.PANEL_TABS.includes(source.miniPanelTabs) ? source.miniPanelTabs : 'both',
    miniX: typeof source.miniX === 'number' && Number.isFinite(source.miniX) ? source.miniX : null,
    quitOnClose: typeof source.quitOnClose === 'boolean' ? source.quitOnClose : false,
    startMenuShortcut:
      typeof source.startMenuShortcut === 'boolean' ? source.startMenuShortcut : false,
    dataEncryption: typeof source.dataEncryption === 'boolean' ? source.dataEncryption : false
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
    subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.map(normalizeSubtask).filter(Boolean) : []
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
    archived: Boolean(raw.archived),
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
    completedAt: done ? normalizeDate(raw.completedAt) || nowIso() : null,
    createdAt,
    updatedAt: normalizeDate(raw.updatedAt) || createdAt,
    reminders:
      normalizeReminders(raw.reminders) ||
      remindersFromLegacy({ remindBefore: raw.remindBefore, remindAtDue: raw.remindAtDue }),
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
  // Рекурсивно нормализуем вложенные подзадачи сначала
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

  const templates = Array.isArray(raw.templates)
    ? raw.templates.map(normalizeTemplate).filter(Boolean)
    : [];
  const taskTemplates = Array.isArray(raw.taskTemplates)
    ? raw.taskTemplates.map(normalizeTaskTemplate).filter(Boolean)
    : [];

  return {
    version: 1,
    settings,
    categories,
    tasks,
    notes,
    templates,
    taskTemplates
  };
}

// Миграция данных между версиями структуры data.json.
// Вызывается перед нормализацией, чтобы старые файлы вели себя предсказуемо.
// Версия 2 пока не выпущена — заготовка готовит поле к будущим преобразованиям.
function migrateData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const version = Number(raw.version) || 0;
  if (version >= 2) return raw;

  const next = { ...raw, version: 2 };

  // Пример будущих преобразований (раскомментировать при выходе v2):
  // if (Array.isArray(next.notes)) {
  //   next.notes = next.notes.map((note) => ({
  //     ...note,
  //     archived: Boolean(note.archived)
  //   }));
  // }

  return next;
}

function timestampForFile() {
  const d = new Date();
  return `${d.getFullYear()}-${utils.pad2(d.getMonth() + 1)}-${utils.pad2(d.getDate())}_${utils.pad2(d.getHours())}-${utils.pad2(d.getMinutes())}-${utils.pad2(d.getSeconds())}`;
}

module.exports = {
  MAX_BACKUPS,
  DEFAULT_HOTKEY,
  ENCRYPTION_PREFIX,
  encryptionKey,
  encryptData,
  decryptData,
  nowIso,
  uid,
  clone,
  normalizeTitle,
  normalizeDescription,
  normalizeNoteContent,
  normalizeCategoryName,
  normalizeColor,
  normalizeDate,
  normalizePriority,
  RECURRENCE_TYPES,
  normalizeReminder,
  normalizeReminders,
  normalizeReminderOffset,
  normalizeMinutes,
  normalizeRecurrence,
  computeNextDueAt,
  remindersFromLegacy,
  normalizeSubtask,
  normalizeNote,
  normalizeTemplate,
  normalizeTaskTemplate,
  normalizeCategory,
  normalizeTask,
  ensureTaskInvariant,
  normalizeSettings,
  defaultData,
  normalizeData,
  migrateData,
  timestampForFile
};
