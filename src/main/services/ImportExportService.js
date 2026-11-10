'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Импорт и экспорт данных.
 */
class ImportExportService {
  constructor(ctx) {
    this.ctx = ctx;
    this.data = ctx.data;
    this.save = ctx.save;
    this.normalizers = ctx.normalizers;
    this.isPackaged = ctx.isPackaged;
    this.createBackup = ctx.createBackup;
    this.MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 МБ
    this.MAX_IMPORT_TASKS = 10000;
    this.MAX_IMPORT_NOTES = 10000;
  }

  _sourceData() {
    if (this.ctx && this.ctx.store && this.ctx.store.data) return this.ctx.store.data;
    return this.data;
  }

  _copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) this._copyDirSync(s, d);
      else if (entry.isFile()) fs.copyFileSync(s, d);
    }
    return true;
  }

  _attachmentsDir() {
    const dataDir = (this.ctx && this.ctx.store && this.ctx.store.dataDir) || this.ctx.dataDir;
    return dataDir ? path.join(dataDir, 'attachments') : null;
  }

  exportTo(filePath) {
    fs.writeFileSync(filePath, `${JSON.stringify(this._sourceData(), null, 2)}\n`, 'utf8');
    try {
      const src = this._attachmentsDir();
      if (src && fs.existsSync(src)) {
        const dest = `${filePath}.attachments`;
        fs.rmSync(dest, { recursive: true, force: true });
        this._copyDirSync(src, dest);
      }
    } catch (_) {
      // attachments export is best-effort
    }
  }

  exportToCsv(filePath) {
    const data = this._sourceData() || { tasks: [] };
    const lines = [];
    lines.push('id,title,description,dueAt,priority,categoryId,done,status,createdAt,tags');
    for (const task of data.tasks || []) {
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
        esc(task.status || (task.done ? 'done' : 'todo')),
        esc(task.createdAt || ''),
        `"${esc(Array.isArray(task.tags) ? task.tags.join('|') : '')}"`
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

    if (this.ctx && typeof this.ctx.replaceData === 'function') {
      this.ctx.replaceData(normalized);
    } else if (this.ctx && this.ctx.store && typeof this.ctx.store.replaceData === 'function') {
      this.ctx.store.replaceData(normalized);
    } else {
      this.data = normalized;
      if (this.ctx) this.ctx.data = normalized;
    }

    this.save();

    // import attachments bundle if present next to json file
    try {
      const dest = this._attachmentsDir();
      if (dest) {
        const candidates = [
          `${filePath}.attachments`,
          filePath.replace(/\.json$/i, '.attachments'),
          path.join(
            path.dirname(filePath),
            `${path.basename(filePath, path.extname(filePath))}.attachments`
          )
        ];
        const src = candidates.find((p) => p && fs.existsSync(p) && fs.statSync(p).isDirectory());
        if (src) {
          fs.rmSync(dest, { recursive: true, force: true });
          fs.mkdirSync(dest, { recursive: true });
          this._copyDirSync(src, dest);
          if (
            this.ctx &&
            this.ctx.store &&
            this.ctx.store.attachments &&
            typeof this.ctx.store.attachments.gc === 'function'
          ) {
            try {
              this.ctx.store.attachments.gc({ save: true, silent: true });
            } catch (_) {}
          }
        }
      }
    } catch (_) {
      // attachments import is best-effort
    }

    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('data.import', {
          tasks: normalized.tasks.length,
          notes: normalized.notes.length
        });
      } catch (_) {}
    }
    const resultData = this._sourceData() || normalized;
    return {
      tasks: (resultData.tasks || []).length,
      categories: (resultData.categories || []).length,
      notes: (resultData.notes || []).length
    };
  }
}

module.exports = { ImportExportService };
