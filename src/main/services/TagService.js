'use strict';

class TagService {
  constructor(ctx) {
    this.ctx = ctx;
    this.data = ctx.data;
    this.save = ctx.save;
    this.normalizers = ctx.normalizers;
  }

  _data() {
    return (this.ctx && this.ctx.store && this.ctx.store.data) || this.data;
  }

  getTags() {
    return this.normalizers.clone(this._data().tags || []);
  }

  addTag(input = {}) {
    const data = this._data();
    const name = this.normalizers.normalizeCategoryName(input.name);
    if (!name) throw new Error('Введите название тега');
    const nameKey = name.toLowerCase();
    if ((data.tags || []).some((t) => String(t.name || '').toLowerCase() === nameKey)) {
      throw new Error('Тег с таким названием уже существует');
    }
    const tag = {
      id: this.normalizers.uid(),
      name,
      color: input.color ? this.normalizers.normalizeColor(input.color) : null
    };
    if (!Array.isArray(data.tags)) data.tags = [];
    data.tags.push(tag);
    this.save();
    return this.normalizers.clone(tag);
  }

  updateTag(id, patch = {}) {
    const data = this._data();
    const tag = (data.tags || []).find((t) => t.id === id);
    if (!tag) throw new Error('Тег не найден');
    const oldName = tag.name;
    let renamed = false;
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const name = this.normalizers.normalizeCategoryName(patch.name);
      if (!name) throw new Error('Введите название тега');
      const nameKey = name.toLowerCase();
      if (
        (data.tags || []).some((t) => t.id !== id && String(t.name || '').toLowerCase() === nameKey)
      ) {
        throw new Error('Тег с таким названием уже существует');
      }
      renamed = name !== oldName;
      tag.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      tag.color = patch.color ? this.normalizers.normalizeColor(patch.color) : null;
    }
    if (renamed && oldName) {
      for (const task of data.tasks || []) {
        if (Array.isArray(task.tags)) {
          task.tags = task.tags.map((t) => (t === oldName ? tag.name : t));
        }
      }
      for (const note of data.notes || []) {
        if (Array.isArray(note.tags)) {
          note.tags = note.tags.map((t) => (t === oldName ? tag.name : t));
        }
      }
    }
    this.save();
    return this.normalizers.clone(tag);
  }

  deleteTag(id) {
    const data = this._data();
    const tags = data.tags || [];
    const index = tags.findIndex((t) => t.id === id);
    if (index === -1) throw new Error('Тег не найден');
    const [removed] = tags.splice(index, 1);
    const name = removed && removed.name;
    for (const task of data.tasks || []) {
      if (Array.isArray(task.tags)) {
        task.tags = task.tags.filter((t) => t !== id && t !== name);
      }
    }
    for (const note of data.notes || []) {
      if (Array.isArray(note.tags)) {
        note.tags = note.tags.filter((t) => t !== id && t !== name);
      }
    }
    this.save();
  }
}

module.exports = { TagService };
