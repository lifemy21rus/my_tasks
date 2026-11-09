'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const utils = require('../shared/utils');
const N = require('./normalizers');

const {
  MAX_BACKUPS,
  DEFAULT_HOTKEY,
  ENCRYPTION_PREFIX,
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
  normalizeTask,
  ensureTaskInvariant,
  normalizeSettings,
  defaultData,
  normalizeData,
  migrateData,
  timestampForFile
} = N;

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
        let content = fs.readFileSync(this.dataFile, 'utf8');
        const password = process.env.MYTASKS_DATA_PASSWORD;
        if (password && content.startsWith(ENCRYPTION_PREFIX)) {
          content = decryptData(content, password);
        }
        raw = JSON.parse(content);
      } catch (err) {
        const corruptName = `data.corrupt-${timestampForFile()}.json`;
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
    let json = `${JSON.stringify(this.data, null, 2)}\n`;
    const settings = this.data && this.data.settings ? this.data.settings : {};
    const password = process.env.MYTASKS_DATA_PASSWORD;
    if (settings.dataEncryption && password) {
      json = encryptData(json, password);
    }
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
      const value = String(patch.hotkey || '')
        .trim()
        .slice(0, 100);
      if (!value) throw new Error('Пустая горячая клавиша');
      next.hotkey = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'hotkeyEnabled')) {
      next.hotkeyEnabled = Boolean(patch.hotkeyEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniPanel')) {
      next.miniPanel = Boolean(patch.miniPanel);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniPanelAtStart')) {
      next.miniPanelAtStart = Boolean(patch.miniPanelAtStart);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniPanelTabs')) {
      const value = String(patch.miniPanelTabs || '');
      if (utils.PANEL_TABS.includes(value)) next.miniPanelTabs = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniX')) {
      const value = patch.miniX;
      next.miniX =
        value === null || value === undefined
          ? null
          : Number.isFinite(Number(value))
            ? Number(value)
            : next.miniX;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'quitOnClose')) {
      next.quitOnClose = Boolean(patch.quitOnClose);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'startMenuShortcut')) {
      next.startMenuShortcut = Boolean(patch.startMenuShortcut);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'dataEncryption')) {
      next.dataEncryption = Boolean(patch.dataEncryption);
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
    if (
      this.data.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())
    ) {
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
  getNotes(includeArchived = false) {
    const notes = includeArchived
      ? this.data.notes
      : this.data.notes.filter((note) => !note.archived);
    return clone(notes);
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

  archiveNote(id) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.archived = true;
    note.updatedAt = nowIso();
    this.save();
    return clone(note);
  }

  unarchiveNote(id) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.archived = false;
    note.updatedAt = nowIso();
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
      const esc = (value) =>
        String(value === null || value === undefined ? '' : value).replace(/"/g, '""');
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
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      throw new Error(
        `Не удалось прочитать файл импорта: ${err && err.message ? err.message : String(err)}`
      );
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Некорректная структура файла импорта: ожидался объект JSON');
    }
    const migrated = migrateData(raw);
    const normalized = normalizeData(migrated, this.isPackaged);
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
    return fs
      .readdirSync(this.backupDir)
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
    const safeKind =
      String(kind)
        .replace(/[^a-z0-9-]/gi, '-')
        .slice(0, 30) || 'manual';
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
