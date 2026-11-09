'use strict';

/**
 * Управление настройками приложения.
 * Хранит и валидирует секцию `settings` в data.json.
 */
class SettingsService {
  constructor(ctx) {
    this.data = ctx.data;
    this.save = ctx.save;
    this.emit = ctx.emit;
    this.utils = ctx.utils;
    this.normalizers = ctx.normalizers;
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    if (!patch || typeof patch !== 'object') return;
    const current = this.data.settings;
    const next = { ...current };

    if (Object.prototype.hasOwnProperty.call(patch, 'autostart')) {
      next.autostart = Boolean(patch.autostart);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'startMinimized')) {
      next.startMinimized = Boolean(patch.startMinimized);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      if (!this.utils.THEMES.includes(patch.theme)) throw new Error('Неизвестная тема');
      next.theme = patch.theme;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'defaultRemindBefore')) {
      const value = this.normalizers.normalizeReminderOffset(patch.defaultRemindBefore);
      if (value === null) throw new Error('Некорректное время напоминания');
      next.defaultRemindBefore = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'defaultRemindAtDue')) {
      next.defaultRemindAtDue = Boolean(patch.defaultRemindAtDue);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'hotkey')) {
      const value = String(patch.hotkey || '')
        .trim()
        .slice(0, 100);
      if (!value) throw new Error('Пустая горячая клавиша');
      next.hotkey = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'hotkeyEnabled')) {
      next.hotkeyEnabled = Boolean(patch.hotkeyEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniPanel')) {
      next.miniPanel = Boolean(patch.miniPanel);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniPanelAtStart')) {
      next.miniPanelAtStart = Boolean(patch.miniPanelAtStart);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniPanelTabs')) {
      const value = String(patch.miniPanelTabs || '');
      if (this.utils.PANEL_TABS.includes(value)) next.miniPanelTabs = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'miniX')) {
      const value = patch.miniX;
      next.miniX =
        value === null || value === undefined
          ? null
          : Number.isFinite(Number(value))
            ? Number(value)
            : next.miniX;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'quitOnClose')) {
      next.quitOnClose = Boolean(patch.quitOnClose);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'startMenuShortcut')) {
      next.startMenuShortcut = Boolean(patch.startMenuShortcut);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'dataEncryption')) {
      if (patch.dataEncryption && !process.env.MYTASKS_DATA_PASSWORD) {
        throw new Error('Шифрование требует переменную окружения MYTASKS_DATA_PASSWORD');
      }
      next.dataEncryption = Boolean(patch.dataEncryption);
    }

    this.data.settings = next;
    this.save();
  }
}

module.exports = { SettingsService };
