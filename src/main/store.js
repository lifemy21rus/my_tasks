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
  normalizeData,
  migrateData
} = N;

const { SettingsService } = require('./services/SettingsService');
const { TaskService } = require('./services/TaskService');
const { CategoryService } = require('./services/CategoryService');
const { NoteService } = require('./services/NoteService');
const { TemplateService } = require('./services/TemplateService');
const { BackupService } = require('./services/BackupService');
const { ImportExportService } = require('./services/ImportExportService');
const { TagService } = require('./services/TagService');
const { SmartListService } = require('./services/SmartListService');
const { ActivityService } = require('./services/ActivityService');
const { AttachmentService } = require('./services/AttachmentService');

class Store extends EventEmitter {
  constructor(dataDir, options = {}) {
    super();
    this.dataDir = dataDir;
    this.dataFile = path.join(dataDir, 'data.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.isPackaged = Boolean(options.isPackaged);
    this.notice = null;
    this.data = defaultData(this.isPackaged);

    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });

    // BackupService нужен уже на этапе load() (recovery/daily), поэтому создаём заранее.
    this.backups = new BackupService({
      dataDir: this.dataDir,
      dataFile: this.dataFile,
      backupDir: this.backupDir,
      save: (opts) => this.save(opts),
      getData: () => this.data,
      utils,
      normalizers: N
    });

    this.load();

    // Контекст для сервисов (стабильная ссылка на store для актуальных данных)
    const ctx = {
      store: this,
      get data() {
        return this.store.data;
      },
      set data(value) {
        this.store.data = value;
      },
      dataDir: this.dataDir,
      dataFile: this.dataFile,
      backupDir: this.backupDir,
      isPackaged: this.isPackaged,
      save: (opts) => this.save(opts),
      emit: (event, payload) => this.emit(event, payload),
      replaceData: (next) => this.replaceData(next),
      utils,
      normalizers: N
    };

    this.settings = new SettingsService(ctx);
    this.tasks = new TaskService(ctx);
    this.categories = new CategoryService(ctx);
    this.notes = new NoteService(ctx);
    this.templates = new TemplateService(ctx);
    this.tags = new TagService(ctx);
    this.smartLists = new SmartListService(ctx);
    this.activity = new ActivityService(ctx);
    ctx.activity = this.activity;
    this.attachments = new AttachmentService(ctx);
    this.importExport = new ImportExportService({
      ...ctx,
      createBackup: (kind) => this.backups.createBackup(kind)
    });

    this._bindServiceData();
  }

  _serviceList() {
    return [
      this.settings,
      this.tasks,
      this.categories,
      this.notes,
      this.templates,
      this.tags,
      this.smartLists,
      this.activity,
      this.attachments,
      this.backups,
      this.importExport
    ].filter(Boolean);
  }

  /* ============ Attachments (делегирование) ============ */

  getAttachments() {
    return this.attachments ? this.attachments.getAttachments() : [];
  }

  addAttachmentFromPath(filePath, options = {}) {
    return this.attachments.addAttachmentFromPath
      ? this.attachments.addAttachmentFromPath(filePath, options)
      : this.attachments.addFromFile(filePath, options);
  }

  getAttachmentPath(id) {
    return this.attachments.getPath(id);
  }

  deleteAttachment(id) {
    return this.attachments.deleteAttachment(id);
  }

  gcAttachments() {
    if (this.attachments) return this.attachments.gc({ save: true });
    return false;
  }

  /* ============ Activity (делегирование) ============ */

  getActivity(limit) {
    return this.activity ? this.activity.getActivity(limit) : [];
  }

  getStats() {
    return this.activity ? this.activity.getStats() : null;
  }

  /* ============ Tags (делегирование) ============ */

  getTags() {
    return this.tags ? this.tags.getTags() : [];
  }

  addTag(input = {}) {
    return this.tags.addTag(input);
  }

  updateTag(id, patch = {}) {
    return this.tags.updateTag(id, patch);
  }

  deleteTag(id) {
    return this.tags.deleteTag(id);
  }

  /* ============ Smart lists (делегирование) ============ */

  getSmartLists() {
    return this.smartLists ? this.smartLists.getSmartLists() : [];
  }

  addSmartList(input = {}) {
    return this.smartLists.addSmartList(input);
  }

  updateSmartList(id, patch = {}) {
    return this.smartLists.updateSmartList(id, patch);
  }

  deleteSmartList(id) {
    return this.smartLists.deleteSmartList(id);
  }

  restoreSmartList(list) {
    return this.smartLists.restoreSmartList(list);
  }

  _bindServiceData() {
    for (const svc of this._serviceList()) {
      if (!svc) continue;
      if (Object.prototype.hasOwnProperty.call(svc, 'data')) svc.data = this.data;
      if (Object.prototype.hasOwnProperty.call(svc, 'ctx')) svc.ctx.data = this.data;
      if (Object.prototype.hasOwnProperty.call(svc, 'store')) svc.store = this;
    }
  }

  replaceData(nextData) {
    this.data = nextData;
    this._bindServiceData();
  }

  load() {
    let raw = null;
    let fromBackup = false;
    let hadUsableFile = false;
    const fileExists = fs.existsSync(this.dataFile);

    if (fileExists) {
      try {
        let content = fs.readFileSync(this.dataFile, 'utf8');
        const password = process.env.MYTASKS_DATA_PASSWORD;
        if (password && content.startsWith(ENCRYPTION_PREFIX)) {
          content = decryptData(content, password);
        }
        raw = JSON.parse(content);
        hadUsableFile = true;
      } catch (err) {
        const corruptName = `data.corrupt-${this.backups.timestampForFile()}.json`;
        try {
          fs.renameSync(this.dataFile, path.join(this.dataDir, corruptName));
        } catch (_) {
          // ignore
        }
        const latest = this.backups.latestBackup();
        if (latest) {
          try {
            let backupContent = fs.readFileSync(latest, 'utf8');
            const password = process.env.MYTASKS_DATA_PASSWORD;
            if (password && backupContent.startsWith(ENCRYPTION_PREFIX)) {
              backupContent = decryptData(backupContent, password);
            }
            raw = JSON.parse(backupContent);
            fromBackup = true;
            this.notice = {
              type: 'error',
              message: 'Файл данных повреждён. Данные восстановлены из резервной копии.'
            };
          } catch (_) {
            raw = null;
          }
        }
        if (!raw) {
          this.notice = {
            type: 'error',
            message: 'Файл данных повреждён. Создан новый пустой список.'
          };
        }
      }
    }

    if (!raw) {
      raw = defaultData(this.isPackaged);
    } else {
      const sourceVersion = Number(raw && raw.version) || 1;
      let preMigrationBackup = null;
      if (sourceVersion < 2 && hadUsableFile && !fromBackup) {
        try {
          preMigrationBackup = this.backups.createBackup('pre-v2-migration');
        } catch (_) {
          // migration backup failure should not block migration attempt
        }
      }
      raw = migrateData(raw, { isPackaged: this.isPackaged });
      if (sourceVersion < 2 && hadUsableFile && !fromBackup) {
        const backupName = preMigrationBackup ? path.basename(preMigrationBackup) : null;
        this.notice = {
          type: 'success',
          message: backupName
            ? `Данные обновлены до формата 2.0. Резервная копия перед миграцией: backups/${backupName}`
            : 'Данные обновлены до формата 2.0.'
        };
      }
    }

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

  restoreTask(task) {
    return this.tasks.restoreTask(task);
  }

  addTask(input = {}) {
    const task = this.tasks.addTask(input);
    if (this.attachments && Array.isArray(task.attachments)) {
      this.attachments.link(task.attachments, { taskId: task.id });
    }
    return task;
  }

  updateTask(id, patch = {}) {
    const task = this.tasks.updateTask(id, patch);
    if (this.attachments && Array.isArray(task.attachments)) {
      this.attachments.link(task.attachments, { taskId: task.id });
    }
    return task;
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

  restoreCategory(category) {
    return this.categories.restoreCategory(category);
  }

  /* ============ Notes (делегирование) ============ */

  restoreNote(note) {
    return this.notes.restoreNote(note);
  }

  getNotes(includeArchived = false) {
    return this.notes.getNotes(includeArchived);
  }

  addNote(input) {
    const note = this.notes.addNote(input);
    if (this.attachments && Array.isArray(note.attachments)) {
      this.attachments.link(note.attachments, { noteId: note.id });
    }
    return note;
  }

  updateNote(id, patch = {}) {
    const note = this.notes.updateNote(id, patch);
    if (this.attachments && Array.isArray(note.attachments)) {
      this.attachments.link(note.attachments, { noteId: note.id });
    }
    return note;
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
    const result = this.importExport.importFrom(filePath);
    this._bindServiceData();
    return result;
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

  restoreBackup(filePath) {
    if (!filePath || typeof filePath !== 'string')
      throw new Error('Не указан файл резервной копии');
    const resolved = path.resolve(filePath);
    const backupDirResolved = path.resolve(this.backupDir);
    if (!resolved.startsWith(backupDirResolved)) {
      throw new Error('Можно восстановить только резервную копию из папки backups');
    }
    if (!fs.existsSync(resolved)) throw new Error('Файл резервной копии не найден');

    let content = fs.readFileSync(resolved, 'utf8');
    const password = process.env.MYTASKS_DATA_PASSWORD;
    if (password && content.startsWith(ENCRYPTION_PREFIX)) {
      content = decryptData(content, password);
    }
    const raw = JSON.parse(content);
    const migrated = migrateData(raw, { isPackaged: this.isPackaged });
    const normalized = normalizeData(migrated, this.isPackaged);

    try {
      this.createBackup('before-restore');
    } catch (_) {
      // ignore
    }

    this.replaceData(normalized);
    this.save();

    // restore attachments snapshot if present alongside backup json
    try {
      const attBackup = resolved.replace(/\.json$/i, '.attachments');
      const attDir = path.join(this.dataDir, 'attachments');
      if (fs.existsSync(attBackup)) {
        if (fs.existsSync(attDir)) fs.rmSync(attDir, { recursive: true, force: true });
        fs.mkdirSync(attDir, { recursive: true });
        const copyDir = (src, dest) => {
          for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            const s = path.join(src, entry.name);
            const d = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              fs.mkdirSync(d, { recursive: true });
              copyDir(s, d);
            } else if (entry.isFile()) {
              fs.copyFileSync(s, d);
            }
          }
        };
        copyDir(attBackup, attDir);
      }
    } catch (_) {
      // attachments restore is best-effort
    }

    try {
      if (this.attachments) this.attachments.gc({ save: true, silent: true });
    } catch (_) {}

    return { restored: path.basename(resolved) };
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
