'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const { autoUpdater } = require('electron-updater');

const { Store } = require('./store');
const { Notifications } = require('./notifications');
const { Scheduler } = require('./scheduler');
const autostart = require('./autostart');
const { registerIpc } = require('./ipc');
const { MiniPanel } = require('./mini-window');
const { runMainSmoke, runMiniSmoke } = require('./smoke-test');

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
    try {
      tray.destroy();
    } catch (_) {}
  }

  const icon = loadIcon(process.platform === 'win32' ? 'tray.png' : 'icon.png');
  tray = new Tray(icon);
  tray.setToolTip('Планировщик');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Показать', click: showWindow },
    {
      label: 'Мини-панель',
      click: () => {
        if (miniPanel && miniPanel.isVisible()) hideMini();
        else showMini();
      }
    },
    { label: 'Новая задача', click: createNewTask },
    { label: 'Настройки', click: openSettings },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

function registerHotkey(hotkey, enabled) {
  try {
    if (registeredHotkey) {
      try {
        globalShortcut.unregister(registeredHotkey);
      } catch (_) {}
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
    title: 'Планировщик',
    icon: loadIcon(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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
  const testMode =
    process.env.MYTASKS_SCREENSHOT || process.env.MYTASKS_SMOKE || process.env.MYTASKS_MINI_SMOKE;

  if (shouldHide && !testMode) {
    mainWindow.once('ready-to-show', () => {
      showMini();
    });
  } else {
    mainWindow.once('ready-to-show', () => {
      showWindow();
      if (settings.miniPanelAtStart) showMini();
    });
  }

  if (process.env.MYTASKS_SMOKE) {
    runMainSmoke({
      mainWindow,
      store,
      outputPath: process.env.MYTASKS_SMOKE,
      app,
      setQuitting: (value) => {
        isQuitting = value;
      },
      showWindow
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
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
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
    try {
      autostart.setStartMenuShortcut(settings.startMenuShortcut);
    } catch (err) {
      console.error('Ошибка создания ярлыка в меню «Пуск»:', err);
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
          mainWindow.webContents.send('update:available', {
            version: info.version,
            files: info.files
          });
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
      icon: loadIcon(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      getTheme: () => store.getSettings().theme,
      getBounds: () => store.getSettings().miniX,
      onMove: (x) => {
        try {
          store.updateSettings({ miniX: x });
        } catch (_) {}
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
      runMiniSmoke({
        miniPanel,
        mainWindow,
        store,
        outputPath: process.env.MYTASKS_MINI_SMOKE,
        app,
        setQuitting: (value) => {
          isQuitting = value;
        },
        showMini
      });
    }
  } catch (err) {
    console.error('Критическая ошибка запуска:', err);
    app.quit();
  }
});

