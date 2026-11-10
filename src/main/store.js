'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const utils = require('../shared/utils');
const N = require('./normalizers');

const {
  DEFAULT_HOTKEY,
  ENCRYPTION_PREFIX,
  encryptData,
  decryptData,
  clone,
  normalizeTask,
  normalizeSettings,
  defaultData,
  normalizeData
} = N;

const { SettingsService } = require('./services/SettingsService');
const { TaskService } = require('./services/TaskService');
const { CategoryService } = require('./services/CategoryService');
const { NoteService } = require('./services/NoteService');
const { TemplateService } = require('./services/TemplateService');
const { BackupService } = require('./services/BackupService');
const { ImportExportService } = require('./services/ImportExportService');

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

    // Контекст для сервисов
    const ctx = {
      data: this.data,
      dataDir: this.dataDir,
      dataFile: this.dataFile,
      backupDir: this.backupDir,
      isPackaged: this.isPackaged,
      save: (options) => this.save(options),
      emit: (event, payload) => this.emit(event, payload),
      utils,
      normalizers: N
    };

    this.settings = new SettingsService(ctx);
    this.tasks = new TaskService(ctx);
    this.categories = new CategoryService(ctx);
    this.notes = new NoteService(ctx);
    this.templates = new TemplateService(ctx);
    this.backups = new BackupService(ctx);
    this.importExport = new ImportExportService({
      ...ctx,
      createBackup: (kind) => this.backups.createBackup(kind)
    });
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
        const latest = this.backups.latestBackup();
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
        this.backups.ensureDailyBackup();
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
    return this.settings.getSettings();
  }

  getTasks() {
    return this.tasks.getTasks();
  }

  getCategories() {
    return this.categories.getCategories();
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
    try {
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, this.dataFile);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        // ignore cleanup error
      }
      throw new Error(
        `Не удалось сохранить данные: ${err && err.message ? err.message : String(err)}`
      );
    }
    if (!silent) this.emit('change', { silent: false });
  }

  /* ============ Settings (делегирование) ============ */

  updateSettings(patch) {
    this.settings.updateSettings(patch);
  }

  /* ============ Tasks (делегирование) ============ */

  addTask(input = {}) {
    return this.tasks.addTask(input);
  }

  updateTask(id, patch = {}) {
    return this.tasks.updateTask(id, patch);
  }

  deleteTask(id) {
    this.tasks.deleteTask(id);
  }

  toggleTask(id, done) {
    return this.tasks.toggleTask(id, done);
  }

  addSubtask(taskId, titleValue, parentSubtaskId = null) {
    return this.tasks.addSubtask(taskId, titleValue, parentSubtaskId);
  }

  findSubtask(subtasks, id) {
    return this.tasks.findSubtask(subtasks, id);
  }

  updateSubtask(taskId, subtaskId, patch = {}, parentSubtaskId = null) {
    return this.tasks.updateSubtask(taskId, subtaskId, patch, parentSubtaskId);
  }

  toggleSubtask(taskId, subtaskId, done, parentSubtaskId = null) {
    return this.tasks.toggleSubtask(taskId, subtaskId, done, parentSubtaskId);
  }

  deleteSubtask(taskId, subtaskId, parentSubtaskId = null) {
    return this.tasks.deleteSubtask(taskId, subtaskId, parentSubtaskId);
  }

  snoozeTask(id, untilValue) {
    return this.tasks.snoozeTask(id, untilValue);
  }

  patchTaskInternal(id, patch = {}, options = {}) {
    this.tasks.patchTaskInternal(id, patch, options);
  }

  clearCompleted() {
    return this.tasks.clearCompleted();
  }

  updateManyTasks(ids, patch = {}) {
    return this.tasks.updateManyTasks(ids, patch);
  }

  deleteManyTasks(ids) {
    return this.tasks.deleteManyTasks(ids);
  }

  toggleManyTasks(ids, done) {
    return this.tasks.toggleManyTasks(ids, done);
  }

  /* ============ Categories (делегирование) ============ */

  addCategory(input = {}) {
    return this.categories.addCategory(input);
  }

  updateCategory(id, patch = {}) {
    return this.categories.updateCategory(id, patch);
  }

  deleteCategory(id) {
    this.categories.deleteCategory(id);
  }

  /* ============ Notes (делегирование) ============ */

  getNotes(includeArchived = false) {
    return this.notes.getNotes(includeArchived);
  }

  addNote(input) {
    return this.notes.addNote(input);
  }

  updateNote(id, patch = {}) {
    return this.notes.updateNote(id, patch);
  }

  toggleNote(id, done) {
    return this.notes.toggleNote(id, done);
  }

  deleteNote(id) {
    return this.notes.deleteNote(id);
  }

  archiveNote(id) {
    return this.notes.archiveNote(id);
  }

  unarchiveNote(id) {
    return this.notes.unarchiveNote(id);
  }

  /* ============ Templates (делегирование) ============ */

  getTemplates() {
    return this.templates.getTemplates();
  }

  addTemplate(input = {}) {
    return this.templates.addTemplate(input);
  }

  updateTemplate(id, patch = {}) {
    return this.templates.updateTemplate(id, patch);
  }

  deleteTemplate(id) {
    this.templates.deleteTemplate(id);
  }

  getTaskTemplates() {
    return this.templates.getTaskTemplates();
  }

  addTaskTemplate(input = {}) {
    return this.templates.addTaskTemplate(input);
  }

  updateTaskTemplate(id, patch = {}) {
    return this.templates.updateTaskTemplate(id, patch);
  }

  deleteTaskTemplate(id) {
    this.templates.deleteTaskTemplate(id);
  }

  /* ============ Import/Export (делегирование) ============ */

  exportTo(filePath) {
    this.importExport.exportTo(filePath);
  }

  exportToCsv(filePath) {
    this.importExport.exportToCsv(filePath);
  }

  importFrom(filePath) {
    return this.importExport.importFrom(filePath);
  }

  /* ============ Backups (делегирование) ============ */

  listBackups() {
    return this.backups.listBackups();
  }

  latestBackup() {
    return this.backups.latestBackup();
  }

  timestampForFile() {
    return this.backups.timestampForFile();
  }

  createBackup(kind = 'manual') {
    return this.backups.createBackup(kind);
  }

  ensureDailyBackup() {
    return this.backups.ensureDailyBackup();
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
