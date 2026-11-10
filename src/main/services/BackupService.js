'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Управление резервными копиями data.json.
 */
class BackupService {
  constructor(ctx) {
    this.dataDir = ctx.dataDir;
    this.dataFile = ctx.dataFile;
    this.backupDir = ctx.backupDir;
    this.save = ctx.save;
    this.getData = typeof ctx.getData === 'function' ? ctx.getData : null;
    this.data = ctx.data || null;
    this.normalizers = ctx.normalizers;
    this.utils = ctx.utils;
  }

  _currentData() {
    if (this.getData) return this.getData();
    if (this.data) return this.data;
    return null;
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir)
      .filter((name) => name.startsWith('MyTasks-') && name.endsWith('.json'))
      .map((name) => {
        const filePath = path.join(this.backupDir, name);
        let kind = 'manual';
        const m = /^MyTasks-(.+)-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/.exec(name);
        if (m) kind = m[1];
        return { name, filePath, mtime: fs.statSync(filePath).mtimeMs, kind };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  latestBackup() {
    const backups = this.listBackups();
    return backups.length ? backups[0].filePath : null;
  }

  timestampForFile() {
    const d = new Date();
    const pad2 = this.utils.pad2;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
  }

  _attachmentsDir() {
    return path.join(this.dataDir, 'attachments');
  }

  _attachmentsBackupPath(jsonBackupPath) {
    return String(jsonBackupPath).replace(/\.json$/i, '.attachments');
  }

  _copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) this._copyDirSync(s, d);
      else if (entry.isFile()) fs.copyFileSync(s, d);
    }
  }

  _removeDirSafe(dirPath) {
    try {
      if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (_) {
      // ignore
    }
  }

  createBackup(kind = 'manual') {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(this.backupDir, { recursive: true });
    const safeKind =
      String(kind)
        .replace(/[^a-z0-9-]/gi, '-')
        .slice(0, 30) || 'manual';
    const target = path.join(this.backupDir, `MyTasks-${safeKind}-${this.timestampForFile()}.json`);

    if (fs.existsSync(this.dataFile)) {
      fs.copyFileSync(this.dataFile, target);
    } else {
      const current = this._currentData();
      fs.writeFileSync(target, `${JSON.stringify(current || {}, null, 2)}\n`, 'utf8');
    }

    // snapshot attachments alongside json backup (best-effort)
    try {
      const attSrc = this._attachmentsDir();
      const attDest = this._attachmentsBackupPath(target);
      if (fs.existsSync(attSrc)) this._copyDirSync(attSrc, attDest);
    } catch (_) {
      // attachments snapshot failure should not fail json backup
    }

    const backups = this.listBackups();
    const { MAX_BACKUPS } = this.normalizers;
    const protectedKinds = ['pre-v2-migration', 'before-import', 'before-restore'];
    let prunableCount = 0;
    for (let i = 0; i < backups.length; i += 1) {
      const name = backups[i].name || '';
      const isProtected = protectedKinds.some((k) => name.includes(`-${k}-`));
      if (isProtected) continue;
      prunableCount += 1;
      if (prunableCount > MAX_BACKUPS) {
        try {
          fs.unlinkSync(backups[i].filePath);
        } catch (_) {
          // ignore
        }
        this._removeDirSafe(this._attachmentsBackupPath(backups[i].filePath));
      }
    }
    return target;
  }

  ensureDailyBackup() {
    if (!fs.existsSync(this.dataFile)) return null;
    const d = new Date();
    const day = `${d.getFullYear()}-${this.utils.pad2(d.getMonth() + 1)}-${this.utils.pad2(d.getDate())}`;
    const prefix = `MyTasks-daily-${day}`;
    const exists = this.listBackups().some((backup) => backup.name.startsWith(prefix));
    if (exists) return null;
    return this.createBackup('daily');
  }
}

module.exports = { BackupService };
