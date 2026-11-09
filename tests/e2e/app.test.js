'use strict';

const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const APP_ROOT = path.join(__dirname, '..', '..');
const ELECTRON = require.resolve('electron');

function envWithTmpData() {
  const env = { ...process.env };
  env.MYTASKS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-e2e-'));
  env.MYTASKS_SMOKE = path.join(env.MYTASKS_DATA_DIR, 'smoke-test.json');
  return env;
}

test('приложение запускается и не падает при старте', async () => {
  test.skip(process.platform !== 'win32', 'E2E тест рассчитан на Windows');

  const env = envWithTmpData();
  const electron = spawn(ELECTRON, [APP_ROOT], {
    env,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  electron.stdout.on('data', () => {});
  electron.stderr.on('data', () => {});

  try {
    // Даем процессу время запуститься и создать smoke-отчёт (если переменная задана)
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // Процесс должен ещё работать (не упал при старте)
    expect(electron.exitCode).toBeNull();

    const smokePath = env.MYTASKS_SMOKE;
    if (fs.existsSync(smokePath)) {
      const report = JSON.parse(fs.readFileSync(smokePath, 'utf8'));
      expect(report.ok).toBe(true);
      expect(report.result.addedTask).toBe(true);
      expect(report.result.addedNote).toBe(true);
      expect(report.result.settingsValues.themeOptions).toBeGreaterThan(0);
    }
  } finally {
    try {
      electron.kill('SIGTERM');
    } catch (_) {}
    try {
      fs.rmSync(env.MYTASKS_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
});
