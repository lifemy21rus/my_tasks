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

    note.updatedAt = nowIso();
    this.data.notes[index] = note;
    this.save();
    return this.normalizers.clone(note);
  }

  toggleNote(id, done) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.done = Boolean(done);
    note.updatedAt = this.normalizers.nowIso();
    this.save();
    return this.normalizers.clone(note);
  }

  deleteNote(id) {
    const index = this.data.notes.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Заметка не найдена');
    const note = this.data.notes[index];
    this.data.notes.splice(index, 1);
    this.save();
    return this.normalizers.clone(note);
  }

  archiveNote(id) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.archived = true;
    note.updatedAt = this.normalizers.nowIso();
    this.save();
    return this.normalizers.clone(note);
  }

  unarchiveNote(id) {
    const note = this.data.notes.find((item) => item.id === id);
    if (!note) throw new Error('Заметка не найдена');
    note.archived = false;
    note.updatedAt = this.normalizers.nowIso();
    this.save();
    return this.normalizers.clone(note);
  }
}

module.exports = { NoteService };
