'use strict';

/**
 * Управление шаблонами заметок и задач.
 */
class TemplateService {
  constructor(ctx) {
    this.data = ctx.data;
    this.save = ctx.save;
    this.emit = ctx.emit;
    this.normalizers = ctx.normalizers;
  }

  /* ------------------------------- Note templates ------------------------------- */

  getTemplates() {
    return this.data.templates.map((t) => this.normalizers.clone(t));
  }

  addTemplate(input = {}) {
    const { normalizeTemplate } = this.normalizers;
    const template = normalizeTemplate(input);
    if (!template) throw new Error('Введите название шаблона');
    this.data.templates.push(template);
    this.save();
    return this.normalizers.clone(template);
  }

  updateTemplate(id, patch = {}) {
    const template = this.data.templates.find((item) => item.id === id);
    if (!template) throw new Error('Шаблон не найден');
    const { normalizeTitle, normalizeNoteContent } = this.normalizers;
    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = normalizeTitle(patch.title);
      if (!title) throw new Error('Введите название шаблона');
      template.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
      template.content = normalizeNoteContent(patch.content);
    }
    this.save();
    return this.normalizers.clone(template);
  }

  deleteTemplate(id) {
    const index = this.data.templates.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Шаблон не найден');
    this.data.templates.splice(index, 1);
    this.save();
  }

  /* ------------------------------- Task templates ------------------------------- */

  getTaskTemplates() {
    return this.data.taskTemplates.map((t) => this.normalizers.clone(t));
  }

  addTaskTemplate(input = {}) {
    const { normalizeTaskTemplate } = this.normalizers;
    const template = normalizeTaskTemplate(input);
    if (!template) throw new Error('Введите название шаблона');
    this.data.taskTemplates.push(template);
    this.save();
    return this.normalizers.clone(template);
  }

  updateTaskTemplate(id, patch = {}) {
    const template = this.data.taskTemplates.find((item) => item.id === id);
    if (!template) throw new Error('Шаблон не найден');
    const {
      normalizeTitle,
      normalizeDescription,
      normalizePriority,
      normalizeColor,
      normalizeMinutes,
      normalizeReminders,
      normalizeRecurrence,
      normalizeSubtask
    } = this.normalizers;

    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = normalizeTitle(patch.title);
      if (!title) throw new Error('Введите название шаблона');
      template.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
      template.description = normalizeDescription(patch.description);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'priority')) {
      template.priority = normalizePriority(patch.priority);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'categoryId')) {
      template.categoryId = patch.categoryId || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      template.color = patch.color ? normalizeColor(patch.color) : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'estimatedMinutes')) {
      template.estimatedMinutes = normalizeMinutes(patch.estimatedMinutes);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'reminders')) {
      template.reminders = normalizeReminders(patch.reminders) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'recurrence')) {
      template.recurrence = normalizeRecurrence(patch.recurrence) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'subtasks')) {
      template.subtasks = Array.isArray(patch.subtasks)
        ? patch.subtasks.map((sub) => normalizeSubtask({ ...sub, done: false })).filter(Boolean)
        : [];
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tags') && Array.isArray(patch.tags)) {
      template.tags = patch.tags.filter((t) => typeof t === 'string' && t).slice(0, 100);
    }
    this.save();
    return this.normalizers.clone(template);
  }

  deleteTaskTemplate(id) {
    const index = this.data.taskTemplates.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Шаблон не найден');
    this.data.taskTemplates.splice(index, 1);
    this.save();
  }
}

module.exports = { TemplateService };
