'use strict';

class SmartListService {
  constructor(ctx) {
    this.ctx = ctx;
    this.data = ctx.data;
    this.save = ctx.save;
    this.normalizers = ctx.normalizers;
  }

  _data() {
    return (this.ctx && this.ctx.store && this.ctx.store.data) || this.data;
  }

  getSmartLists() {
    return this.normalizers.clone(this._data().smartLists || []);
  }

  addSmartList(input = {}) {
    const data = this._data();
    const name = this.normalizers.normalizeCategoryName(input.name);
    if (!name) throw new Error('Введите название списка');
    const list = {
      id: this.normalizers.uid(),
      name,
      criteria:
        input.criteria && typeof input.criteria === 'object' && !Array.isArray(input.criteria)
          ? JSON.parse(JSON.stringify(input.criteria))
          : {},
      view:
        input.view && typeof input.view === 'object' && !Array.isArray(input.view)
          ? JSON.parse(JSON.stringify(input.view))
          : null,
      createdAt: this.normalizers.nowIso(),
      updatedAt: this.normalizers.nowIso()
    };
    if (!Array.isArray(data.smartLists)) data.smartLists = [];
    data.smartLists.push(list);
    this.save();
    return this.normalizers.clone(list);
  }

  updateSmartList(id, patch = {}) {
    const data = this._data();
    const list = (data.smartLists || []).find((item) => item.id === id);
    if (!list) throw new Error('Список не найден');
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const name = this.normalizers.normalizeCategoryName(patch.name);
      if (!name) throw new Error('Введите название списка');
      list.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'criteria')) {
      list.criteria =
        patch.criteria && typeof patch.criteria === 'object' && !Array.isArray(patch.criteria)
          ? JSON.parse(JSON.stringify(patch.criteria))
          : {};
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'view')) {
      list.view =
        patch.view && typeof patch.view === 'object' && !Array.isArray(patch.view)
          ? JSON.parse(JSON.stringify(patch.view))
          : null;
    }
    list.updatedAt = this.normalizers.nowIso();
    this.save();
    return this.normalizers.clone(list);
  }

  deleteSmartList(id) {
    const data = this._data();
    const lists = data.smartLists || [];
    const index = lists.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Список не найден');
    lists.splice(index, 1);
    this.save();
  }

  restoreSmartList(listInput) {
    const { clone, uid, nowIso, normalizeCategoryName } = this.normalizers;
    if (!listInput || typeof listInput !== 'object')
      throw new Error('Не удалось восстановить список');
    const data = this._data();
    if (!Array.isArray(data.smartLists)) data.smartLists = [];
    const id = typeof listInput.id === 'string' && listInput.id ? listInput.id : uid();
    if (data.smartLists.some((item) => item.id === id)) {
      throw new Error('Список уже существует');
    }
    const name = normalizeCategoryName(listInput.name) || 'Список';
    const list = {
      id,
      name,
      criteria:
        listInput.criteria &&
        typeof listInput.criteria === 'object' &&
        !Array.isArray(listInput.criteria)
          ? JSON.parse(JSON.stringify(listInput.criteria))
          : {},
      view:
        listInput.view && typeof listInput.view === 'object' && !Array.isArray(listInput.view)
          ? JSON.parse(JSON.stringify(listInput.view))
          : null,
      createdAt: typeof listInput.createdAt === 'string' ? listInput.createdAt : nowIso(),
      updatedAt: nowIso()
    };
    data.smartLists.push(list);
    if (this.ctx && this.ctx.activity) {
      try {
        this.ctx.activity.log('smart-list.restore', { id: list.id, name: list.name });
      } catch (_) {}
    }
    this.save();
    return clone(list);
  }
}

module.exports = { SmartListService };
