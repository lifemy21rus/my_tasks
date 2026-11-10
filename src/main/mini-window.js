'use strict';

const path = require('path');
const { BrowserWindow, screen, nativeTheme } = require('electron');

const MINI_WIDTH = 320;

function backgroundColorFor(theme) {
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? '#0b1120' : '#f4f6fb';
}

class MiniPanel {
  constructor(options = {}) {
    this.preloadPath = options.preloadPath;
    this.icon = options.icon || null;
    this.getTheme = options.getTheme || (() => 'system');
    this.getBounds = options.getBounds || (() => null);
    this.onMove = options.onMove || null;
    this.onCreated = options.onCreated || null;
    this.window = null;
    this.closing = false;
    this.moveTimer = null;
  }

  _initialDisplayAndX(width) {
    const displays = screen.getAllDisplays();
    const savedX = this.getBounds();
    let display = null;
    if (Number.isFinite(savedX)) {
      display = screen.getDisplayNearestPoint({ x: savedX + Math.round(width / 2), y: 100 });
    }
    if (!display) {
      display = displays.reduce((right, d) => {
        const rightEdge = d.bounds.x + d.bounds.width;
        const currentEdge = right.bounds.x + right.bounds.width;
        return rightEdge > currentEdge ? d : right;
      }, displays[0] || screen.getPrimaryDisplay());
    }
    const area = display.workArea;
    let x = Number.isFinite(savedX) ? savedX : area.x + area.width - width;
    if (x + width > area.x + area.width || x < area.x) {
      x = area.x + area.width - width;
    }
    return { display, area, x };
  }

  create() {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const area0 = screen.getPrimaryDisplay().workArea;
    const width = Math.min(MINI_WIDTH, Math.max(260, area0.width));

    const { area, x } = this._initialDisplayAndX(width);

    this.window = new BrowserWindow({
      width,
      height: area.height,
      x,
      y: area.y,
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: false,
      hasShadow: true,
      title: 'Планировщик',
      icon: this.icon || undefined,
      backgroundColor: backgroundColorFor(this.getTheme()),
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false
      }
    });

    this.window.loadFile(path.join(__dirname, '..', 'renderer', 'mini.html'));

    this.window.on('close', (event) => {
      if (this.closing) return;
      event.preventDefault();
      this.hide();
    });

    this.window.on('moved', () => {
      if (this.moveTimer) clearTimeout(this.moveTimer);
      this.moveTimer = setTimeout(() => {
        if (!this.window || this.window.isDestroyed()) return;
        const bounds = this.window.getBounds();
        if (this.onMove) this.onMove(bounds.x);
      }, 250);
    });

    this.window.on('closed', () => {
      if (this.moveTimer) {
        clearTimeout(this.moveTimer);
        this.moveTimer = null;
      }
      this.window = null;
    });

    this.window.webContents.on('did-finish-load', () => {
      this.reposition();
      this.window.webContents.send('state:changed', { source: 'mini-ready' });
    });

    if (this.onCreated) this.onCreated(this.window);
    return this.window;
  }

  reposition() {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = this.window.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: bounds.x + Math.round(bounds.width / 2),
      y: bounds.y + Math.round(bounds.height / 2)
    });
    const area = display.workArea;
    const width = Math.min(MINI_WIDTH, Math.max(260, area.width));
    let x = bounds.x;
    if (x + width > area.x + area.width || x < area.x) {
      x = area.x + area.width - width;
    }
    this.window.setBounds({
      x,
      y: area.y,
      width,
      height: area.height
    });
  }

  show() {
    const win = this.create();
    this.reposition();
    if (!win.isVisible()) win.showInactive();
    return win;
  }

  hide() {
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  isVisible() {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible());
  }

  toggle() {
    if (this.isVisible()) this.hide();
    else this.show();
  }

  getWindow() {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  send(channel, payload) {
    const win = this.getWindow();
    if (!win) return;
    win.webContents.send(channel, payload);
  }

  destroy() {
    this.closing = true;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}

module.exports = { MiniPanel, MINI_WIDTH, backgroundColorFor };
