'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const { autoUpdater } = require('electron-updater');

const { Store } = require('./store');
const { Notifications } = require('./notifications');
const { Scheduler } = require('./scheduler');
const autostart = require('./autostart');
const { registerIpc } = require('./ipc');
const { MiniPanel } = require('./mini-window');

app.setAppUserModelId('com.mytasks.app');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let miniPanel = null;
let tray = null;
let store = null;
let notifications = null;
let scheduler = null;
let registeredHotkey = null;
let isQuitting = false;

function getDataDir() {
  if (process.env.MYTASKS_DATA_DIR) {
    return process.env.MYTASKS_DATA_DIR;
  }
  return path.join(app.getPath('appData'), 'MyTasks');
}

function getIconPath(name) {
  const candidates = [
    path.join(__dirname, '..', 'assets', name),
    path.join(__dirname, '..', '..', 'src', 'assets', name),
    path.join(app.getAppPath(), 'src', 'assets', name)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function loadIcon(name) {
  const iconPath = getIconPath(name);
  try {
    const img = nativeImage.createFromPath(iconPath);
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  } catch (err) {
    console.error('Не удалось загрузить иконку:', err);
    return nativeImage.createEmpty();
  }
}

function showWindow() {
  if (!mainWindow) return;
  if (miniPanel) miniPanel.hide();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    if (store && store.getSettings().miniPanel !== false) {
      mainWindow.hide();
      if (miniPanel) miniPanel.show();
      return;
    }
    hideWindow();
  } else {
    showWindow();
  }
}

function focusTask(taskId) {
  showWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('focus:task', { taskId });
  }
}

function focusOverdue() {
  showWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('focus:overdue', {});
  }
}

function openSettings() {
  showWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open:settings', {});
  }
}

function createNewTask() {
  showWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new:task', {});
  }
}

function createNewNote() {
  showWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new:note', {});
  }
}

function focusNote(noteId) {
  showWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('focus:note', { noteId });
  }
}

async function handleNotificationAction({ taskId, type, until }) {
  if (!store || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (type === 'complete') {
      store.toggleTask(taskId, true);
    } else if (type === 'snooze' && Number.isFinite(until)) {
      store.snoozeTask(taskId, new Date(until).toISOString());
    }
    broadcastState();
  } catch (err) {
    console.error('Ошибка обработки действия уведомления:', err);
  }
}

function runMiniSmoke() {
  const outputPath = process.env.MYTASKS_MINI_SMOKE;
  const logs = [];

  const finish = (payload) => {
    try {
      fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      console.log(`Мини smoke-отчёт: ${outputPath}`);
    } catch (err) {
      console.error('Не удалось записать мини smoke-отчёт:', err);
    }
    isQuitting = true;
    app.quit();
  };

  const collectLogs = (win) => {
    win.webContents.on('console-message', (...args) => {
      const details = args[1];
      if (details && typeof details === 'object') {
        logs.push(`[${details.level}] ${details.message}`);
      } else {
        logs.push(`[${args[1]}] ${args[2]}`);
      }
    });
  };

  const run = async (win) => {
    collectLogs(win);

    if (win.webContents.isLoading()) {
      await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    }
    await new Promise((resolve) => setTimeout(resolve, 900));

    let result = null;
    let mainResult = null;
    let newNoteResult = null;
    let error = null;

    try {
      result = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const q = (selector, root) => Array.from((root || document).querySelectorAll(selector));
        const noteList = document.getElementById('mini-note-list');
        const taskList = document.getElementById('mini-list');
        const report = {
          apiHasFocusNote: typeof window.api.focusNote === 'function',
          apiHasNewNote: typeof window.api.newNote === 'function',
          tabs: q('.mini-tab').map((tab) => tab.dataset.tab),
          tasksTabActive: document.getElementById('mini-tab-tasks').classList.contains('is-active'),
          taskListVisible: !taskList.hidden,
          noteListHiddenInitially: noteList.hidden,
          quickPlaceholderInitially: document.getElementById('mini-quick-input').placeholder,
          quickAddLabelInitially: document.getElementById('mini-quick-add').getAttribute('aria-label'),
          taskCountBadge: document.getElementById('mini-tab-tasks-count').textContent,
          noteCountBadge: document.getElementById('mini-tab-notes-count').textContent,
          // списки должны реально отрисовываться, а не ограничиваться счётчиками на вкладках
          taskCards: q('.mini-task', taskList).length,
          taskTitles: q('.mini-task-title', taskList).map((n) => n.textContent),
          taskGroups: q('.mini-group-title span:first-child', taskList).map((s) => s.textContent)
        };

        document.getElementById('mini-tab-notes').click();
        await wait(250);

        report.notesTabActive = document.getElementById('mini-tab-notes').classList.contains('is-active');
        report.noteListVisible = !noteList.hidden;
        report.taskListHidden = taskList.hidden;
        report.quickPlaceholderNotes = document.getElementById('mini-quick-input').placeholder;
        report.quickAddLabelNotes = document.getElementById('mini-quick-add').getAttribute('aria-label');
        report.summary = document.getElementById('mini-count').textContent;
        report.noteCards = q('.mini-note', noteList).length;
        report.noteTitles = q('.mini-note .mini-note-title', noteList).map((n) => n.textContent);
        report.noteContentBlocks = q('.mini-note .mini-note-content', noteList).length;
        report.noteAccent = (() => {
          const row = noteList.querySelector('.mini-note');
          return row ? row.style.getPropertyValue('--note-color') : null;
        })();
        report.noteGroups = q('.mini-group-title span:first-child', noteList).map((s) => s.textContent);
        report.notesTabSelected = document.getElementById('mini-tab-notes').getAttribute('aria-selected');

        const firstNote = noteList.querySelector('.mini-note');
        report.noteId = firstNote ? firstNote.dataset.id : null;

        return report;
      })()`, true);

      // снимок вкладки «Заметки» — до изменения состояния
      if (process.env.MYTASKS_MINI_SCREENSHOT) {
        try {
          const image = await win.webContents.capturePage();
          fs.writeFileSync(process.env.MYTASKS_MINI_SCREENSHOT, image.toPNG());
          console.log(`Снимок мини-панели сохранён: ${process.env.MYTASKS_MINI_SCREENSHOT}`);
        } catch (err) {
          console.error('Не удалось сделать снимок мини-панели:', err);
        }
      }

      // отметка выполнения прямо в мини-панели
      const toggleResult = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const noteList = document.getElementById('mini-note-list');
        const firstNote = noteList.querySelector('.mini-note');
        if (!firstNote) return { toggledNote: false };

        const check = firstNote.querySelector('.mini-note-check');
        check.click();
        await wait(800);

        const state = await window.api.getState();
        return {
          toggledNote: state.ok
            ? Boolean(state.data.notes.find((n) => n.id === firstNote.dataset.id && n.done))
            : false,
          groupsAfterToggle: Array.from(noteList.querySelectorAll('.mini-group-title span:first-child')).map((s) => s.textContent),
          doneRowExists: Boolean(noteList.querySelector('.mini-note.is-done'))
        };
      })()`, true);

      Object.assign(result, toggleResult);

      // диагностика: что видит хранилище и что лежит в файле
      result.storeNotesCount = store ? store.getData().notes.length : null;
      try {
        const onDisk = JSON.parse(fs.readFileSync(path.join(store.getDataDir(), 'data.json'), 'utf8'));
        result.fileNotesCount = Array.isArray(onDisk.notes) ? onDisk.notes.length : null;
        result.fileHasNotesField = Object.prototype.hasOwnProperty.call(onDisk, 'notes');
      } catch (err) {
        result.fileNotesCount = null;
        result.fileError = String(err && err.message ? err.message : err);
      }

      // быстрый ввод на вкладке «Заметки» должен создавать заметку, а не задачу
      const quickAddTitle = `Заметка из мини smoke ${Date.now()}`;
      const quickAddResult = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const noteList = document.getElementById('mini-note-list');
        const input = document.getElementById('mini-quick-input');
        const title = ${JSON.stringify(quickAddTitle)};
        const before = noteList.querySelectorAll('.mini-note').length;

        input.value = title;
        document.getElementById('mini-quick-add').click();
        await wait(600);

        const state = await window.api.getState();
        return {
          beforeCount: before,
          afterCount: noteList.querySelectorAll('.mini-note').length,
          inputCleared: input.value === '',
          titleShown: Array.from(noteList.querySelectorAll('.mini-note-title')).some((n) => n.textContent === title),
          storedAsNote: state.ok ? state.data.notes.some((n) => n.title === title) : false,
          storedAsTask: state.ok ? state.data.tasks.some((t) => t.title === title) : false,
          summaryAfterAdd: document.getElementById('mini-count').textContent,
          noteCountBadge: document.getElementById('mini-tab-notes-count').textContent
        };
      })()`, true);

      Object.assign(result, { quickAdd: quickAddResult });

      // клик по заметке должен открыть её в основном окне
      const clickTarget = await win.webContents.executeJavaScript(`(() => {
        const row = document.querySelector('#mini-note-list .mini-note');
        if (!row) return null;
        row.click();
        return row.dataset.id;
      })()`, true);

      if (clickTarget) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainResult = await mainWindow.webContents.executeJavaScript(`(() => {
            const modal = document.getElementById('note-modal');
            const title = document.getElementById('note-modal-title');
            const view = document.getElementById('view-title');
            return {
              modalVisible: Boolean(modal) && !modal.hidden,
              modalTitle: title ? title.textContent : '',
              viewTitle: view ? view.textContent : ''
            };
          })()`, true);
        }
      }

      // Ctrl+N на вкладке «Заметки» должен открыть пустую заметку в основном окне
      await win.webContents.executeJavaScript(`(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
        return true;
      })()`, true);

      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (mainWindow && !mainWindow.isDestroyed()) {
        newNoteResult = await mainWindow.webContents.executeJavaScript(`(() => {
          const modal = document.getElementById('note-modal');
          const title = document.getElementById('note-modal-title');
          const input = document.getElementById('note-title-input');
          return {
            modalVisible: Boolean(modal) && !modal.hidden,
            modalTitle: title ? title.textContent : '',
            titleInputEmpty: input ? input.value === '' : false
          };
        })()`, true);
      }
    } catch (err) {
      error = err && err.stack ? err.stack : String(err);
    }

    finish({ ok: !error, error, logs, result, mainResult, newNoteResult });
  };

  showMini();

  // окно мини-панели создаётся лениво, поэтому ждём его появления
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const win = miniPanel ? miniPanel.getWindow() : null;
    if (win) {
      clearInterval(timer);
      run(win).catch((err) => {
        finish({ ok: false, error: err && err.stack ? err.stack : String(err), logs, result: null, mainResult: null });
      });
    } else if (attempts > 50) {
      clearInterval(timer);
      finish({ ok: false, error: 'Мини-панель не появилась', logs, result: null, mainResult: null });
    }
  }, 100);
}

function showMini() {
  if (!miniPanel || isQuitting) return;
  const settings = store ? store.getSettings() : { miniPanel: true };
  if (settings.miniPanel === false) return;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  miniPanel.show();
}

function hideMini() {
  if (miniPanel) miniPanel.hide();
}

function hideMainToMini() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  showMini();
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:changed', {});
  }
  if (miniPanel) miniPanel.send('state:changed', {});
}

function createTray() {
  if (tray) {
    try { tray.destroy(); } catch (_) {}
  }

  const icon = loadIcon(process.platform === 'win32' ? 'tray.png' : 'icon.png');
  tray = new Tray(icon);
  tray.setToolTip('Мои задачи');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Показать', click: showWindow },
    { label: 'Мини-панель', click: () => {
      if (miniPanel && miniPanel.isVisible()) hideMini();
      else showMini();
    }},
    { label: 'Новая задача', click: createNewTask },
    { label: 'Настройки', click: openSettings },
    { type: 'separator' },
    { label: 'Выход', click: () => {
      isQuitting = true;
      app.quit();
    }}
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

function registerHotkey(hotkey, enabled) {
  try {
    if (registeredHotkey) {
      try { globalShortcut.unregister(registeredHotkey); } catch (_) {}
      registeredHotkey = null;
    }
  } catch (err) {
    console.error('Ошибка снятия горячей клавиши:', err);
  }

  if (!enabled || !hotkey) return;

  try {
    const ok = globalShortcut.register(hotkey, toggleWindow);
    if (ok) {
      registeredHotkey = hotkey;
    } else {
      console.warn('Не удалось зарегистрировать горячую клавишу:', hotkey);
    }
  } catch (err) {
    console.error('Ошибка регистрации горячей клавиши:', err);
  }
}

function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 880,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    title: 'Мои задачи',
    icon: loadIcon('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    const settings = store ? store.getSettings() : {};
    if (settings.quitOnClose) {
      isQuitting = true;
      app.quit();
    } else {
      event.preventDefault();
      hideMainToMini();
    }
  });

  mainWindow.on('minimize', (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    hideMainToMini();
  });

  mainWindow.on('show', () => {
    if (miniPanel) miniPanel.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const settings = store ? store.getSettings() : { startMinimized: true };
  const shouldHide = settings.startMinimized || process.argv.includes('--hidden');
  const testMode = process.env.MYTASKS_SCREENSHOT || process.env.MYTASKS_SMOKE || process.env.MYTASKS_MINI_SMOKE;

  if (shouldHide && !testMode) {
    mainWindow.once('ready-to-show', () => {
      showMini();
    });
  } else {
    mainWindow.once('ready-to-show', () => {
      showWindow();
    });
  }

  if (process.env.MYTASKS_SMOKE) {
    const logs = [];
    mainWindow.webContents.on('console-message', (...args) => {
      const details = args[1];
      if (details && typeof details === 'object') {
        logs.push(`[${details.level}] ${details.message}`);
      } else {
        logs.push(`[${args[1]}] ${args[2]}`);
      }
    });

    mainWindow.webContents.once('did-finish-load', async () => {
      showWindow();
      await new Promise((resolve) => setTimeout(resolve, 900));
      let result = null;
      let error = null;
      try {
        result = await mainWindow.webContents.executeJavaScript(`(async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const q = (selector) => Array.from(document.querySelectorAll(selector));
          const report = {
            theme: document.documentElement.dataset.theme,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            viewport: [window.innerWidth, window.innerHeight],
            documentSize: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
            overflowX: document.documentElement.scrollWidth > window.innerWidth,
            apiPresent: Boolean(window.api),
            cards: q('.task-card').map((card) => ({
              title: card.querySelector('.task-title')?.textContent || '',
              due: card.querySelector('.due-chip')?.textContent || '',
              hasCheckbox: Boolean(card.querySelector('.task-check')),
              width: Math.round(card.getBoundingClientRect().width),
              height: Math.round(card.getBoundingClientRect().height)
            })),
            sidebarCounts: q('.nav-item[data-view]').map((button) => [button.dataset.view, button.querySelector('.nav-count')?.textContent]),
            categories: q('.category-item').map((item) => item.textContent.trim()),
            emptyHidden: document.getElementById('empty-state').hidden,
            statusbar: document.getElementById('status-left')?.textContent || ''
          };

          document.querySelector('.task-card .subtask-progress')?.click();
          await wait(150);
          report.subtasksPanelOpened = Boolean(document.querySelector('.subtasks-panel'));

          document.getElementById('new-task-btn').click();
          await wait(150);
          report.taskModalVisible = !document.getElementById('task-modal').hidden;
          report.modalDueDefaults = {
            date: document.getElementById('task-date-input').value,
            time: document.getElementById('task-time-input').value,
            category: document.getElementById('task-category-input').value
          };

          const titleInput = document.getElementById('task-title-input');
          titleInput.value = 'Проверка из smoke-теста';
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('task-save-btn').click();
          await wait(600);

          const afterAdd = await window.api.getState();
          report.addedTask = afterAdd.ok
            ? afterAdd.data.tasks.some((task) => task.title === 'Проверка из smoke-теста')
            : false;
          report.taskModalClosedAfterAdd = document.getElementById('task-modal').hidden;
          report.cardCountAfterAdd = q('.task-card').length;

          document.getElementById('settings-btn').click();
          await wait(200);
          report.settingsVisible = !document.getElementById('settings-modal').hidden;
          report.settingsValues = {
            autostart: document.getElementById('setting-autostart').checked,
            startMinimized: document.getElementById('setting-start-minimized').checked,
            hotkey: document.getElementById('setting-hotkey-input').value,
            themeOptions: q('.theme-option').length
          };

          const darkButton = document.querySelector('.theme-option[data-theme="dark"]');
          darkButton?.click();
          await wait(400);
          report.darkApplied = document.documentElement.dataset.theme === 'dark';
          report.darkBodyBg = getComputedStyle(document.body).backgroundColor;
          const stateAfterTheme = await window.api.getState();
          report.darkStored = stateAfterTheme.ok && stateAfterTheme.data.settings.theme === 'dark';

          document.querySelector('.theme-option[data-theme="system"]')?.click();
          await wait(300);
          document.getElementById('settings-done-btn').click();
          await wait(100);
          report.backdropHidden = document.getElementById('modal-backdrop').hidden;

          document.querySelector('.nav-item[data-view="notes"]').click();
          await wait(200);
          report.notesView = document.getElementById('view-title').textContent === 'Заметки';
          report.notesEmptyVisible = !document.getElementById('empty-state').hidden;
          report.notesEmptyDisplay = getComputedStyle(document.getElementById('empty-state')).display;

          document.getElementById('new-note-btn').click();
          await wait(150);
          report.noteModalVisible = !document.getElementById('note-modal').hidden;
          document.getElementById('note-title-input').value = 'Проверка заметки';
          document.getElementById('note-content-input').value = 'Текст проверки сохранения заметки';
          document.getElementById('note-save-btn').click();
          await wait(600);

          const afterNoteAdd = await window.api.getState();
          report.addedNote = Boolean(afterNoteAdd.ok
            && afterNoteAdd.data.notes.some((note) => note.title === 'Проверка заметки'));
          report.noteModalClosed = document.getElementById('note-modal').hidden;
          report.noteCards = q('.note-card').length;

          const noteBody = document.querySelector('.note-card .note-body');
          report.noteBodyFound = Boolean(noteBody);
          noteBody?.click();
          report.noteEditHiddenImmediately = document.getElementById('note-modal').hidden;
          report.noteEditTitleImmediately = document.getElementById('note-modal-title').textContent;
          await wait(150);
          report.noteEditHiddenAfterWait = document.getElementById('note-modal').hidden;
          report.noteEditModalVisible = !document.getElementById('note-modal').hidden;
          const notesBeforeEdit = await window.api.getState();
          report.noteTitlesBeforeEdit = notesBeforeEdit.ok
            ? notesBeforeEdit.data.notes.map((note) => note.id + ':' + note.title)
            : [];
          document.getElementById('note-title-input').value = 'Проверка заметки (изменено)';
          document.getElementById('note-save-btn').click();
          await wait(600);

          const afterNoteEdit = await window.api.getState();
          report.editedNote = Boolean(afterNoteEdit.ok
            && afterNoteEdit.data.notes.some((note) => note.title === 'Проверка заметки (изменено)'));
          report.noteTitlesAfterEdit = afterNoteEdit.ok
            ? afterNoteEdit.data.notes.map((note) => note.id + ':' + note.title)
            : [];

          const editedCard = q('.note-card').find((card) => card.querySelector('.note-card-title')?.textContent === 'Проверка заметки (изменено)');
          report.editedCardFound = Boolean(editedCard);
          editedCard?.querySelector('.note-check')?.click();
          await wait(600);
          const afterNoteToggle = await window.api.getState();
          report.noteToggled = Boolean(afterNoteToggle.ok
            && afterNoteToggle.data.notes.some((note) => note.title === 'Проверка заметки (изменено)' && note.done));
          report.notesAfterToggle = afterNoteToggle.ok
            ? afterNoteToggle.data.notes.map((note) => note.id + ':' + note.title + ':' + note.done)
            : [];

          return report;
        })()`, true);
      } catch (err) {
        error = err && err.stack ? err.stack : String(err);
      }

      const payload = { ok: !error, error, logs, result };
      try {
        fs.writeFileSync(process.env.MYTASKS_SMOKE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        console.log(`Smoke-отчёт: ${process.env.MYTASKS_SMOKE}`);
      } catch (err) {
        console.error('Не удалось записать smoke-отчёт:', err);
      }
      isQuitting = true;
      app.quit();
    });
  }

  if (process.env.MYTASKS_SCREENSHOT) {
    mainWindow.webContents.once('did-finish-load', () => {
      showWindow();
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          const target = process.env.MYTASKS_SCREENSHOT;
          if (target && target !== '1') {
            fs.writeFileSync(target, image.toPNG());
            console.log(`Снимок сохранён: ${target}`);
          }
        } catch (err) {
          console.error('Не удалось сделать снимок:', err);
        }
        isQuitting = true;
        app.quit();
      }, 1200);
    });
  }
}

app.on('second-instance', () => {
  showWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (miniPanel) miniPanel.destroy();
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showWindow();
  }
});

app.whenReady().then(() => {
  try {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });

    store = new Store(dataDir, { isPackaged: app.isPackaged });

    autoUpdater.checkForUpdatesOnStartup = true;

    const settings = store.getSettings();
    try {
      autostart.setEnabled(settings.autostart, settings.startMinimized);
    } catch (err) {
      console.error('Ошибка синхронизации автозапуска:', err);
    }

    notifications = new Notifications({
      onClickTask: focusTask,
      onTaskAction: handleNotificationAction,
      onOpenOverdue: focusOverdue,
      onClickApp: showWindow
    });

    scheduler = new Scheduler({ store, notifications });
    if (notifications.isSupported()) {
      scheduler.start();
    } else {
      console.warn('Уведомления не поддерживаются');
    }

    // Auto-update configuration
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesOnStartup = true;
      autoUpdater.on('checking-for-update', () => console.log('Проверка обновлений...'));
      autoUpdater.on('update-available', (info) => {
        console.log('Обновление найдено:', info.version);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:available', { version: info.version, files: info.files });
        }
      });
      autoUpdater.on('update-not-available', (info) => console.log('Обновлений нет'));
      autoUpdater.on('error', (err) => console.error('Ошибка обновления:', err));
      autoUpdater.on('update-downloaded', (info) => {
        // Показываем уведомление и перезапускаем приложение
        autoUpdater.quitAndInstall();
      });
    }

    miniPanel = new MiniPanel({
      preloadPath: path.join(__dirname, 'preload.js'),
      icon: loadIcon('icon.png'),
      getTheme: () => store.getSettings().theme,
      getBounds: () => store.getSettings().miniX,
      onMove: (x) => {
        try { store.updateSettings({ miniX: x }); } catch (_) {}
      }
    });

    store.on('change', broadcastState);

    const repositionMini = () => {
      if (miniPanel) miniPanel.reposition();
    };
    screen.on('display-metrics-changed', repositionMini);
    screen.on('display-added', repositionMini);
    screen.on('display-removed', repositionMini);

    registerIpc({
      store,
      notifications,
      autostart,
      updater: {
        check: () => autoUpdater.checkForUpdates(),
        install: () => autoUpdater.quitAndInstall()
      },
      hotkey: {
        apply: (hotkey, enabled) => registerHotkey(hotkey, enabled)
      },
      ui: {
        expand: (taskId) => focusTask(taskId || null),
        newTask: () => createNewTask(),
        newNote: () => createNewNote(),
        focusNote: (noteId) => focusNote(noteId || null),
        hideMini: () => hideMini(),
        showMini: () => showMini()
      },
      getRuntime: () => ({
        isPackaged: app.isPackaged,
        dataDir: store.getDataDir(),
        platform: process.platform,
        version: app.getVersion(),
        hotkeyRegistered: Boolean(registeredHotkey)
      })
    });

    registerHotkey(settings.hotkey, settings.hotkeyEnabled);

    createTray();
    createWindow();

    if (process.env.MYTASKS_MINI_SMOKE) {
      runMiniSmoke();
    }
  } catch (err) {
    console.error('Критическая ошибка запуска:', err);
    app.quit();
  }
});
