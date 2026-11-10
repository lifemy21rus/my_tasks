'use strict';

/**
 * Управление заметками (включая архив).
 */
class NoteService {
  constructor(ctx) {
    this.data = ctx.data;
    this.save = ctx.save;
    this.emit = ctx.emit;
    this.normalizers = ctx.normalizers;
  }

  getNotes(includeArchived = false) {
    const notes = includeArchived
      ? this.data.notes
      : this.data.notes.filter((note) => !note.archived);
    return this.normalizers.clone(notes);
  }

  addNote(input) {
    const { normalizeNote } = this.normalizers;
    const note = normalizeNote(input);
    if (!note) throw new Error('Неверные данные заметки');
    this.data.notes.push(note);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('note.add', { id: note.id, title: note.title });
      } catch (_) {}
    }
    this.save();
    return this.normalizers.clone(note);
  }

  updateNote(id, patch = {}) {
    const index = this.data.notes.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Заметка не найдена');
    const note = { ...this.data.notes[index] };

    const { normalizeTitle, normalizeNoteContent, normalizeColor, nowIso } = this.normalizers;
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
    if (Object.prototype.hasOwnProperty.call(patch, 'tags') && Array.isArray(patch.tags)) {
      note.tags = patch.tags.filter((t) => typeof t === 'string' && t).slice(0, 100);
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'attachments') &&
      Array.isArray(patch.attachments)
    ) {
      note.attachments = patch.attachments.filter((t) => typeof t === 'string' && t).slice(0, 200);
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'linkedTaskIds') &&
      Array.isArray(patch.linkedTaskIds)
    ) {
      note.linkedTaskIds = patch.linkedTaskIds
        .filter((t) => typeof t === 'string' && t)
        .slice(0, 200);
    }

    note.updatedAt = nowIso();
    this.data.notes[index] = note;
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('note.update', { id: note.id });
      } catch (_) {}
    }
    this.save();
    return this.normalizers.clone(note);
  }

  toggleNote(id, done) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.done = Boolean(done);
    note.updatedAt = this.normalizers.nowIso();
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('note.toggle', { id, done: note.done });
      } catch (_) {}
    }
    this.save();
    return this.normalizers.clone(note);
  }

  deleteNote(id) {
    const index = this.data.notes.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Заметка не найдена');
    const note = this.data.notes[index];
    this.data.notes.splice(index, 1);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('note.delete', { id, title: note.title });
      } catch (_) {}
    }
    this.save();
    return this.normalizers.clone(note);
  }

  restoreNote(noteInput) {
    const { normalizeNote, clone } = this.normalizers;
    const normalized = normalizeNote(noteInput);
    if (!normalized) throw new Error('Не удалось восстановить заметку');
    if (this.data.notes.some((n) => n.id === normalized.id)) {
      throw new Error('Заметка уже существует');
    }
    this.data.notes.push(normalized);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('note.restore', { id: normalized.id, title: normalized.title });
      } catch (_) {}
    }
    this.save();
    return clone(normalized);
  }

  archiveNote(id) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.archived = true;
    note.updatedAt = this.normalizers.nowIso();
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('note.archive', { id });
      } catch (_) {}
    }
    this.save();
    return this.normalizers.clone(note);
  }

  unarchiveNote(id) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.archived = false;
    note.updatedAt = this.normalizers.nowIso();
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('note.unarchive', { id });
      } catch (_) {}
    }
    this.save();
    return this.normalizers.clone(note);
  }
}

module.exports = { NoteService };
