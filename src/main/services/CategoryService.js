'use strict';

/**
 * Управление категориями задач и заметок.
 */
class CategoryService {
  constructor(ctx) {
    this.data = ctx.data;
    this.save = ctx.save;
    this.emit = ctx.emit;
    this.normalizers = ctx.normalizers;
  }

  getCategories() {
    return this.data.categories;
  }

  addCategory(input = {}) {
    const { normalizeCategoryName, normalizeColor } = this.normalizers;
    const name = normalizeCategoryName(input.name);
    if (!name) throw new Error('Введите название категории');
    if (
      this.data.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())
    ) {
      throw new Error('Такая категория уже есть');
    }

    const category = {
      id: this.normalizers.uid(),
      name,
      color: normalizeColor(input.color)
    };
    this.data.categories.push(category);
    this.save();
    return this.normalizers.clone(category);
  }

  updateCategory(id, patch = {}) {
    const category = this.data.categories.find((item) => item.id === id);
    if (!category) throw new Error('Категория не найдена');

    const { normalizeCategoryName, normalizeColor } = this.normalizers;
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
    return this.normalizers.clone(category);
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

  restoreCategory(categoryInput) {
    const { uid, normalizeCategoryName, normalizeColor, clone } = this.normalizers;
    if (!categoryInput || typeof categoryInput !== 'object')
      throw new Error('Не удалось восстановить категорию');
    const id = typeof categoryInput.id === 'string' && categoryInput.id ? categoryInput.id : uid();
    if (this.data.categories.some((item) => item.id === id)) {
      throw new Error('Категория уже существует');
    }
    const name = normalizeCategoryName(categoryInput.name);
    if (!name) throw new Error('Введите название категории');
    const duplicate = this.data.categories.some(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) throw new Error('Такая категория уже есть');
    const category = {
      id,
      name,
      color: normalizeColor(categoryInput.color)
    };
    this.data.categories.push(category);
    this.save();
    return clone(category);
  }
}

module.exports = { CategoryService };
