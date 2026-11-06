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
    'MyTasks.lnk'
  );
}

function isEnabled() {
  return fs.existsSync(getShortcutPath());
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
    description: 'Мои задачи',
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

module.exports = { getShortcutPath, isEnabled, setEnabled };
