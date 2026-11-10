'use strict';

const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

function getShortcutPath() {
  const appData = process.env.APPDATA || app.getPath('appData');
  return path.join(
    appData,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    'Планировщик.lnk'
  );
}

function getStartMenuShortcutPath() {
  const appData = process.env.APPDATA || app.getPath('appData');
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Планировщик.lnk');
}

function isEnabled() {
  return fs.existsSync(getShortcutPath());
}

function isStartMenuShortcutEnabled() {
  return fs.existsSync(getStartMenuShortcutPath());
}

function setEnabled(enabled, startMinimized) {
  if (process.platform !== 'win32') return false;

  const shortcut = getShortcutPath();
  if (!enabled) {
    if (fs.existsSync(shortcut)) {
      try {
        fs.unlinkSync(shortcut);
      } catch (err) {
        throw new Error(`Не удалось отключить автозапуск: ${err.message}`);
      }
    }
    return true;
  }

  fs.mkdirSync(path.dirname(shortcut), { recursive: true });

  let args = '';
  let cwd = app.getAppPath();
  const icon = process.execPath;

  if (app.isPackaged) {
    args = startMinimized ? '--hidden' : '';
    cwd = path.dirname(process.execPath);
  } else {
    const appPath = app.getAppPath();
    args = `${appPath.includes(' ') ? `"${appPath}"` : appPath}${startMinimized ? ' --hidden' : ''}`;
    cwd = appPath;
  }

  const details = {
    target: process.execPath,
    args,
    cwd,
    description: 'Планировщик',
    icon,
    iconIndex: 0,
    appUserModelId: 'com.mytasks.app'
  };

  let ok = false;
  try {
    if (fs.existsSync(shortcut)) {
      ok = shell.writeShortcutLink(shortcut, 'update', details);
    }
    if (!ok) {
      ok = shell.writeShortcutLink(shortcut, 'create', details);
    }
    if (!ok && fs.existsSync(shortcut)) {
      fs.unlinkSync(shortcut);
      ok = shell.writeShortcutLink(shortcut, 'create', details);
    }
  } catch (_) {
    ok = false;
  }

  if (!ok) throw new Error('Не удалось создать ярлык автозапуска');
  return true;
}

function setStartMenuShortcut(enabled) {
  if (process.platform !== 'win32') return false;

  const shortcut = getStartMenuShortcutPath();
  if (!enabled) {
    if (fs.existsSync(shortcut)) {
      try {
        fs.unlinkSync(shortcut);
      } catch (err) {
        throw new Error(`Не удалось удалить ярлык из меню «Пуск»: ${err.message}`);
      }
    }
    return true;
  }

  fs.mkdirSync(path.dirname(shortcut), { recursive: true });

  // В dev режиме запускаем через electron с путем к приложению в аргументе
  let target;
  let args;
  if (app.isPackaged) {
    target = process.execPath;
    args = '';
  } else {
    target = process.execPath;
    args = app.getAppPath();
  }

  const details = {
    target,
    args,
    cwd: app.getAppPath(),
    description: 'Планировщик',
    icon: process.execPath,
    iconIndex: 0,
    appUserModelId: 'com.mytasks.app'
  };

  let ok = false;
  try {
    if (fs.existsSync(shortcut)) {
      ok = shell.writeShortcutLink(shortcut, 'update', details);
    }
    if (!ok) {
      ok = shell.writeShortcutLink(shortcut, 'create', details);
    }
    if (!ok && fs.existsSync(shortcut)) {
      fs.unlinkSync(shortcut);
      ok = shell.writeShortcutLink(shortcut, 'create', details);
    }

    // Проверяем, что файл реально создался
    if (ok && !fs.existsSync(shortcut)) {
      ok = false;
    }
  } catch (_) {
    ok = false;
  }

  if (!ok) throw new Error('Не удалось создать ярлык в меню «Пуск»');
  return true;
}

module.exports = {
  getShortcutPath,
  isEnabled,
  setEnabled,
  getStartMenuShortcutPath,
  isStartMenuShortcutEnabled,
  setStartMenuShortcut
};
