'use strict';

const fs = require('fs');

/**
 * Импорт и экспорт данных.
 */
class ImportExportService {
  constructor(ctx) {
    this.data = ctx.data;
    this.save = ctx.save;
    this.normalizers = ctx.normalizers;
    this.isPackaged = ctx.isPackaged;
    this.createBackup = ctx.createBackup;
    this.MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 МБ
    this.MAX_IMPORT_TASKS = 10000;
    this.MAX_IMPORT_NOTES = 10000;
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
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (err) {
      throw new Error(
        `Не удалось прочитать файл импорта: ${err && err.message ? err.message : String(err)}`
      );
    }
    if (stat.size > this.MAX_IMPORT_SIZE) {
      throw new Error(
        `Файл импорта слишком велик (максимум ${this.MAX_IMPORT_SIZE / 1024 / 1024} МБ)`
      );
    }

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
    const { migrateData, normalizeData } = this.normalizers;
    const migrated = migrateData(raw);
    const normalized = normalizeData(migrated, this.isPackaged);
    if (normalized.tasks.length > this.MAX_IMPORT_TASKS) {
      throw new Error(`Слишком много задач в файле импорта (максимум ${this.MAX_IMPORT_TASKS})`);
    }
    if (normalized.notes.length > this.MAX_IMPORT_NOTES) {
      throw new Error(`Слишком много заметок в файле импорта (максимум ${this.MAX_IMPORT_NOTES})`);
    }

    if (typeof this.createBackup === 'function') {
      this.createBackup('before-import');
    }

    this.data = normalized;
    this.save();
    return {
      tasks: this.data.tasks.length,
      categories: this.data.categories.length,
      notes: this.data.notes.length
    };
  }
}

module.exports = { ImportExportService };
