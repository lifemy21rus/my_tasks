'use strict';

const fs = require('fs');
const path = require('path');

class AttachmentService {
  constructor(ctx) {
    this.ctx = ctx;
    this.store = ctx.store;
    this.dataDir = ctx.dataDir;
    this.attachmentsDir = path.join(this.dataDir, 'attachments');
    this.normalizers = ctx.normalizers;
    fs.mkdirSync(this.attachmentsDir, { recursive: true });
  }

  _data() {
    return (this.ctx && this.ctx.store && this.ctx.store.data) || this.ctx.data;
  }

  _safeName(name) {
    const base = String(name || 'file').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    return base.slice(0, 180) || 'file';
  }

  getAttachments() {
    return this.normalizers.clone(this._data().attachments || []);
  }

  addFromFile(filePath, options = {}) {
    if (!filePath || typeof filePath !== 'string') throw new Error('Не указан файл');
    if (!fs.existsSync(filePath)) throw new Error('Файл не найден');
    const data = this._data();
    if (!Array.isArray(data.attachments)) data.attachments = [];
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('Можно прикрепить только файл');
    const id = this.normalizers.uid();
    const originalName = path.basename(filePath);
    const storedName = `${id}-${this._safeName(originalName)}`;
    const dest = path.join(this.attachmentsDir, storedName);
    fs.copyFileSync(filePath, dest);
    const record = {
      id,
      name: originalName,
      storedName,
      size: stat.size,
      mime: options.mime || null,
      createdAt: this.normalizers.nowIso(),
      taskId: options.taskId || null,
      noteId: options.noteId || null
    };
    data.attachments.push(record);
    if (options.taskId) {
      const task = (data.tasks || []).find((t) => t.id === options.taskId);
      if (task) {
        if (!Array.isArray(task.attachments)) task.attachments = [];
        if (!task.attachments.includes(id)) task.attachments.push(id);
      }
    }
    if (options.noteId) {
      const note = (data.notes || []).find((n) => n.id === options.noteId);
      if (note) {
        if (!Array.isArray(note.attachments)) note.attachments = [];
        if (!note.attachments.includes(id)) note.attachments.push(id);
      }
    }
    if (this.ctx.activity) {
      try {
        this.ctx.activity.log('attachment.add', { id, name: originalName });
      } catch (_) {}
    }
    this.store.save();
    return this.normalizers.clone(record);
  }

  _resolvePath(record) {
    if (!record || !record.storedName) return null;
    const p = path.resolve(path.join(this.attachmentsDir, record.storedName));
    const root = path.resolve(this.attachmentsDir) + path.sep;
    if (!p.startsWith(root) && p !== path.resolve(this.attachmentsDir)) return null;
    return p;
  }

  getPath(id) {
    const data = this._data();
    const record = (data.attachments || []).find((a) => a.id === id);
    if (!record) throw new Error('Вложение не найдено');
    const p = this._resolvePath(record);
    if (!p || !fs.existsSync(p)) throw new Error('Файл вложения не найден');
    return p;
  }

  // Проставляет владельца вложения (задачу/заметку) для файлов, прикреплённых
  // в черновике до сохранения сущности.
  link(ids, options = {}) {
    const data = this._data();
    if (!Array.isArray(ids) || ids.length === 0) return;
    let changed = false;
    for (const id of ids) {
      const record = (data.attachments || []).find((a) => a.id === id);
      if (!record) continue;
      if (options.taskId) {
        if (record.taskId !== options.taskId) {
          record.taskId = options.taskId;
          changed = true;
        }
      }
      if (options.noteId) {
        if (record.noteId !== options.noteId) {
          record.noteId = options.noteId;
          changed = true;
        }
      }
    }
    if (changed) this.store.save({ silent: true });
  }

  // exposed via store/ipc if needed (gc already implemented)

  deleteAttachment(id) {
    const data = this._data();
    const list = data.attachments || [];
    const index = list.findIndex((a) => a.id === id);
    if (index === -1) throw new Error('Вложение не найдено');
    const [record] = list.splice(index, 1);
    for (const task of data.tasks || []) {
      if (Array.isArray(task.attachments))
        task.attachments = task.attachments.filter((x) => x !== id);
    }
    for (const note of data.notes || []) {
      if (Array.isArray(note.attachments))
        note.attachments = note.attachments.filter((x) => x !== id);
    }
    const p = this._resolvePath(record);
    if (p && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
    if (this.ctx.activity) {
      try {
        this.ctx.activity.log('attachment.delete', { id, name: record && record.name });
      } catch (_) {}
    }
    this.store.save();
  }

  gc(options = {}) {
    const data = this._data();
    if (!Array.isArray(data.attachments)) data.attachments = [];
    const save = options.save !== false;
    let changed = false;

    // drop metadata whose files are missing
    const before = data.attachments.length;
    data.attachments = data.attachments.filter((rec) => {
      const p = this._resolvePath(rec);
      return p && fs.existsSync(p);
    });
    if (data.attachments.length !== before) changed = true;

    // drop metadata not linked to any task/note (например, несохранённые черновики)
    const referenced = new Set();
    for (const task of data.tasks || []) {
      for (const id of task.attachments || []) referenced.add(id);
    }
    for (const note of data.notes || []) {
      for (const id of note.attachments || []) referenced.add(id);
    }
    const beforeLinked = data.attachments.length;
    data.attachments = data.attachments.filter((rec) => referenced.has(rec.id));
    if (data.attachments.length !== beforeLinked) changed = true;

    const validIds = new Set(data.attachments.map((a) => a.id));
    for (const task of data.tasks || []) {
      if (Array.isArray(task.attachments)) {
        const next = task.attachments.filter((id) => validIds.has(id));
        if (next.length !== task.attachments.length) {
          task.attachments = next;
          changed = true;
        }
      }
    }
    for (const note of data.notes || []) {
      if (Array.isArray(note.attachments)) {
        const next = note.attachments.filter((id) => validIds.has(id));
        if (next.length !== note.attachments.length) {
          note.attachments = next;
          changed = true;
        }
      }
    }

    // remove orphan files not referenced by metadata
    try {
      if (fs.existsSync(this.attachmentsDir)) {
        const known = new Set(data.attachments.map((a) => a.storedName).filter(Boolean));
        for (const entry of fs.readdirSync(this.attachmentsDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          if (!known.has(entry.name)) {
            try {
              fs.unlinkSync(path.join(this.attachmentsDir, entry.name));
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    if (changed && save) this.store.save({ silent: options.silent === true });
    return changed;
  }
}

module.exports = { AttachmentService };
