'use strict';

/**
 * Автосъёмка скриншотов интерфейса в docs/screenshots.
 *
 * Запуск: npm run shots
 * Создаёт временный профиль с демо-данными, запускает приложение в режиме
 * съёмки (MYTASKS_SHOTS_DIR) и копирует готовые PNG в docs/screenshots.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'screenshots');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-shots-profile-'));
const shotsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-shots-out-'));

function cleanup() {
  for (const dir of [profileDir, shotsDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {
      // ignore
    }
  }
}

console.log('Готовим демо-профиль…');
const seed = spawnSync(process.execPath, [path.join(root, 'scripts', 'seed-demo.js'), profileDir], {
  stdio: 'inherit'
});
if (seed.status !== 0) {
  cleanup();
  process.exit(seed.status || 1);
}

const electronBinary = require('electron');
console.log('Запускаем приложение для съёмки…');
const run = spawnSync(electronBinary, [root], {
  env: {
    ...process.env,
    MYTASKS_DATA_DIR: profileDir,
    MYTASKS_SHOTS_DIR: shotsDir
  },
  stdio: 'inherit'
});

const files = fs.existsSync(shotsDir)
  ? fs.readdirSync(shotsDir).filter((f) => f.endsWith('.png'))
  : [];

if (!files.length) {
  console.error('Снимки не получены.');
  cleanup();
  process.exit(run.status || 1);
}

fs.mkdirSync(outDir, { recursive: true });
for (const file of files) {
  const target = path.join(outDir, file);
  fs.copyFileSync(path.join(shotsDir, file), target);
  console.log(`Скопировано: ${path.relative(root, target)}`);
}

console.log(`Готово: ${files.length} снимков в ${path.relative(root, outDir)}`);
cleanup();
