'use strict';

const { ipcMain, dialog, shell, BrowserWindow } = require('electron');
const utils = require('../shared/utils');

function fail(error) {
  return { ok: false, error: error && error.message ? error.message : String(error) };
}

function registerIpc(deps) {
  const { store, notifications, autostart, updater, hotkey, getRuntime, ui } = deps;
  const windowUi = ui || {};

  function statePayload() {
    return {
      data: store.getData(),
      runtime: {
        ...getRuntime(),
        notice: store.takeNotice()
      }
    };
  }

  function ok(extra = {}) {
    return { ok: true, ...statePayload(), ...extra };
  }

  function handle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args);
      } catch (error) {
        console.error(`IPC ${channel}:`, error);
        return fail(error);
      }
    });
  }

  function parentWindow(event) {
    return BrowserWindow.fromWebContents(event.sender);
  }

  async function showSaveDialog(event, options) {
    const win = parentWindow(event);
    return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options);
  }

  async function showOpenDialog(event, options) {
    const win = parentWindow(event);
    return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
  }

  handle('state:get', async () => ok());

  handle('task:add', async (_event, input) => {
    const task = store.addTask(input);
    return ok({ result: task });
  });

  handle('task:update', async (_event, payload) => {
    const task = store.updateTask(payload.id, payload.patch || {});
    return ok({ result: task });
  });

  handle('task:delete', async (_event, id) => {
    store.deleteTask(id);
    return ok();
  });

  handle('task:toggle', async (_event, payload) => {
    const task = store.toggleTask(payload.id, payload.done);
    return ok({ result: task });
  });

  handle('task:update-many', async (_event, payload) => {
    const results = store.updateManyTasks(payload.ids || [], payload.patch || {});
    return ok({ result: results });
  });

  handle('task:delete-many', async (_event, payload) => {
    const removed = store.deleteManyTasks(payload.ids || []);
    return ok({ result: { removed } });
  });

  handle('task:toggle-many', async (_event, payload) => {
    const results = store.toggleManyTasks(payload.ids || [], payload.done);
    return ok({ result: results });
  });

  handle('subtask:add', async (_event, payload) => {
    const task = store.addSubtask(payload.taskId, payload.title, payload.parentSubtaskId || null);
    return ok({ result: task });
  });

  handle('subtask:update', async (_event, payload) => {
    const task = store.updateSubtask(payload.taskId, payload.subtaskId, payload.patch || {}, payload.parentSubtaskId || null);
    return ok({ result: task });
  });

  handle('subtask:delete', async (_event, payload) => {
    const task = store.deleteSubtask(payload.taskId, payload.subtaskId, payload.parentSubtaskId || null);
    return ok({ result: task });
  });

  handle('subtask:toggle', async (_event, payload) => {
    const task = store.toggleSubtask(payload.taskId, payload.subtaskId, payload.done, payload.parentSubtaskId || null);
    return ok({ result: task });
  });

  handle('note:add', async (_event, input) => {
    const note = store.addNote(input);
    return ok({ result: note });
  });

  handle('note:update', async (_event, payload) => {
    const note = store.updateNote(payload.id, payload.patch || {});
    return ok({ result: note });
  });

  handle('note:delete', async (_event, id) => {
    store.deleteNote(id);
    return ok();
  });

  handle('note:toggle', async (_event, payload) => {
    const note = store.toggleNote(payload.id, payload.done);
    return ok({ result: note });
  });

  handle('notes:get', async () => ok({ result: store.getNotes() }));

  handle('note-templates:get', async () => ok({ result: store.getTemplates() }));
  handle('note-templates:add', async (_event, input) => {
    const template = store.addTemplate(input);
    return ok({ result: template });
  });
  handle('note-templates:update', async (_event, payload) => {
    const template = store.updateTemplate(payload.id, payload.patch || {});
    return ok({ result: template });
  });
  handle('note-templates:delete', async (_event, id) => {
    store.deleteTemplate(id);
    return ok();
  });

  handle('task-templates:get', async () => ok({ result: store.getTaskTemplates() }));
  handle('task-templates:add', async (_event, input) => {
    const template = store.addTaskTemplate(input);
    return ok({ result: template });
  });
  handle('task-templates:update', async (_event, payload) => {
    const template = store.updateTaskTemplate(payload.id, payload.patch || {});
    return ok({ result: template });
  });
  handle('task-templates:delete', async (_event, id) => {
    store.deleteTaskTemplate(id);
    return ok();
  });

  handle('category:add', async (_event, input) => {
    const category = store.addCategory(input);
    return ok({ result: category });
  });

  handle('category:update', async (_event, payload) => {
    const category = store.updateCategory(payload.id, payload.patch || {});
    return ok({ result: category });
  });

  handle('category:delete', async (_event, id) => {
    store.deleteCategory(id);
    return ok();
  });

  handle('tasks:clear-completed', async () => {
    const removed = store.clearCompleted();
    return ok({ result: { removed } });
  });

  handle('task:snooze', async (_event, payload) => {
    const task = store.snoozeTask(payload.id, payload.until);
    return ok({ result: task });
  });

  handle('settings:update', async (_event, patch) => {
    const current = store.getSettings();
    const next = { ...current, ...(patch || {}) };

    if (
      Object.prototype.hasOwnProperty.call(patch || {}, 'autostart') ||
      Object.prototype.hasOwnProperty.call(patch || {}, 'startMinimized')
    ) {
      autostart.setEnabled(next.autostart, next.startMinimized);
    }

    if (
      Object.prototype.hasOwnProperty.call(patch || {}, 'hotkey') ||
      Object.prototype.hasOwnProperty.call(patch || {}, 'hotkeyEnabled')
    ) {
      hotkey.apply(next.hotkey, next.hotkeyEnabled);
    }

    store.updateSettings(patch || {});
    if (
      Object.prototype.hasOwnProperty.call(patch || {}, 'miniPanel') &&
      !store.getSettings().miniPanel &&
      typeof windowUi.hideMini === 'function'
    ) {
      windowUi.hideMini();
    }
    return ok();
  });

  handle('window:expand', async (_event, payload) => {
    if (typeof windowUi.expand === 'function') {
      windowUi.expand(payload && payload.taskId ? payload.taskId : null);
    }
    return { ok: true };
  });

  handle('window:new-task', async () => {
    if (typeof windowUi.newTask === 'function') windowUi.newTask();
    return { ok: true };
  });

  handle('window:new-note', async () => {
    if (typeof windowUi.newNote === 'function') windowUi.newNote();
    return { ok: true };
  });

  handle('window:focus-note', async (_event, payload) => {
    if (typeof windowUi.focusNote === 'function') {
      windowUi.focusNote(payload && payload.noteId ? payload.noteId : null);
    }
    return { ok: true };
  });

  handle('window:hide-mini', async () => {
    if (typeof windowUi.hideMini === 'function') windowUi.hideMini();
    return { ok: true };
  });

  handle('data:export', async (event) => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${utils.pad2(d.getMonth() + 1)}-${utils.pad2(d.getDate())}`;
    const result = await showSaveDialog(event, {
      title: 'Экспорт задач',
      defaultPath: `my-tasks-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return ok({ result: { canceled: true } });
    }

    store.exportTo(result.filePath);
    return ok({ result: { path: result.filePath } });
  });

  handle('data:export-csv', async (event) => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${utils.pad2(d.getMonth() + 1)}-${utils.pad2(d.getDate())}`;
    const result = await showSaveDialog(event, {
      title: 'Экспорт задач в CSV',
      defaultPath: `my-tasks-${stamp}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (result.canceled || !result.filePath) {
      return ok({ result: { canceled: true } });
    }

    store.exportToCsv(result.filePath);
    return ok({ result: { path: result.filePath } });
  });

  handle('data:import', async (event) => {
    const result = await showOpenDialog(event, {
      title: 'Импорт задач',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePaths.length) {
      return ok({ result: { canceled: true } });
    }

    const imported = store.importFrom(result.filePaths[0]);
    return ok({ result: imported });
  });

  handle('data:backup', async () => {
    const path = store.createBackup('manual');
    return ok({ result: { path } });
  });

  handle('data:open-folder', async () => {
    const error = await shell.openPath(store.getDataDir());
    if (error) throw new Error(error);
    return ok();
  });

  handle('notification:test', async () => {
    if (!notifications.showTest()) {
      throw new Error('Уведомления Windows не поддерживаются на этой системе');
    }
    return ok();
  });

  handle('app:check-for-updates', async () => {
    if (!updater) return ok({ result: { available: false, message: 'Автообновление недоступно' } });
    try {
      updater.check();
      return ok({ result: { checking: true } });
    } catch (err) {
      throw new Error(err && err.message ? err.message : 'Ошибка проверки обновлений');
    }
  });

  handle('app:install-update', async () => {
    if (!updater) throw new Error('Автообновление недоступно');
    updater.install();
    return ok();
  });
}

module.exports = { registerIpc };
