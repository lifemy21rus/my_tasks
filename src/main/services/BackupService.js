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
    this.normalizers = ctx.normalizers;
    this.utils = ctx.utils;
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir)
      .filter((name) => name.startsWith('MyTasks-') && name.endsWith('.json'))
      .map((name) => {
        const filePath = path.join(this.backupDir, name);
        return { name, filePath, mtime: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  latestBackup() {
    const backups = this.listBackups();
    return backups.length ? backups[0].filePath : null;
  }

  timestampForFile() {
    const d = new Date();
    const {
      getFullYear, getMonth, getDate, getHours, getMinutes, getSeconds
    } = d;
    const pad2 = this.utils.pad2;
    return `${getFullYear()}-${pad2(getMonth() + 1)}-${pad2(getDate())}_${pad2(getHours())}-${pad2(getMinutes())}-${pad2(getSeconds())}`;
  }

  createBackup(kind = 'manual') {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(this.backupDir, { recursive: true });
    const safeKind =
      String(kind)
        .replace(/[^a-z0-9-]/gi, '-')
        .slice(0, 30) || 'manual';
    const target = path.join(
      this.backupDir,
      `MyTasks-${safeKind}-${this.timestampForFile()}.json`
    );

    if (fs.existsSync(this.dataFile)) {
      fs.copyFileSync(this.dataFile, target);
    } else {
      fs.writeFileSync(target, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    }

    const backups = this.listBackups();
    const { MAX_BACKUPS } = this.normalizers;
    for (let i = MAX_BACKUPS; i < backups.length; i += 1) {
      try {
        fs.unlinkSync(backups[i].filePath);
      } catch (_) {
        // ignore
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
