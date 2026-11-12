'use strict';

const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const APP_ROOT = path.join(__dirname, '..', '..');
// require('electron') возвращает путь к исполняемому файлу,
// require.resolve('electron') — путь к JS-обёртке (запуск падает с EFTYPE).
const ELECTRON = require('electron');

function envWithTmpData() {
  const env = { ...process.env };
  env.MYTASKS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-e2e-'));
  env.MYTASKS_SMOKE = path.join(env.MYTASKS_DATA_DIR, 'smoke-test.json');
  return env;
}

test('приложение запускается и не падает при старте', async () => {
  test.skip(process.platform !== 'win32', 'E2E тест рассчитан на Windows');

  const env = envWithTmpData();
  // Отдельная папка профиля, чтобы не конфликтовать с уже запущенным экземпляром
  // (single instance lock) и не трогать пользовательские данные.
  const userDataDir = path.join(env.MYTASKS_DATA_DIR, 'userdata');
  const electron = spawn(ELECTRON, [APP_ROOT, `--user-data-dir=${userDataDir}`], {
    env,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  electron.stdout.on('data', () => {});
  electron.stderr.on('data', () => {});

  const smokePath = env.MYTASKS_SMOKE;

  try {
    // В smoke-режиме приложение само собирает отчёт и закрывается,
    // поэтому ждём появления отчёта, а не «живого» процесса.
    const deadline = Date.now() + 40000;
    while (!fs.existsSync(smokePath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(fs.existsSync(smokePath)).toBe(true);

    const report = JSON.parse(fs.readFileSync(smokePath, 'utf8'));
    expect(report.ok).toBe(true);
    expect(report.result.addedTask).toBe(true);
    expect(report.result.addedNote).toBe(true);
    expect(report.result.settingsValues.themeOptions).toBeGreaterThan(0);
    expect(report.result.smartListPromptVisible).toBe(true);
    expect(report.result.smartListSaved).toBe(true);
    expect(report.result.smartListRendered).toBe(true);
  } finally {
    try {
      electron.kill('SIGTERM');
    } catch (_) {}
    try {
      fs.rmSync(env.MYTASKS_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
});
