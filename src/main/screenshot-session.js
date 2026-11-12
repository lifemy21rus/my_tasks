'use strict';

const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Сценарии снимков интерфейса. Каждый шаг: подготовка состояния + имя файла.
const SHOTS = [
  {
    file: '01-list.png',
    theme: 'light',
    js: `
      document.querySelector('.nav-item[data-view="all"]').click();
      document.querySelector('.chip[data-view-mode="list"]').click();
    `
  },
  {
    file: '02-board.png',
    theme: 'light',
    js: `document.querySelector('.chip[data-view-mode="board"]').click();`
  },
  {
    file: '03-calendar-month.png',
    theme: 'light',
    js: `document.querySelector('.chip[data-view-mode="calendar"]').click();`
  },
  {
    file: '04-calendar-week.png',
    theme: 'light',
    js: `document.querySelector('[data-action="calendar-mode"][data-mode="week"]').click();`
  },
  {
    file: '05-calendar-day.png',
    theme: 'light',
    js: `document.querySelector('[data-action="calendar-mode"][data-mode="day"]').click();`
  },
  {
    file: '06-notes.png',
    theme: 'light',
    js: `
      document.querySelector('.nav-item[data-view="notes"]').click();
    `
  },
  {
    file: '07-task-modal.png',
    theme: 'light',
    js: `
      document.querySelector('.nav-item[data-view="all"]').click();
      document.querySelector('.chip[data-view-mode="list"]').click();
      document.getElementById('new-task-btn').click();
    `
  },
  {
    file: '08-settings.png',
    theme: 'light',
    js: `
      document.getElementById('task-modal-close').click();
      document.getElementById('settings-btn').click();
    `
  },
  {
    file: '09-list-dark.png',
    theme: 'dark',
    js: `
      document.getElementById('settings-done-btn').click();
      document.querySelector('.nav-item[data-view="all"]').click();
      document.querySelector('.chip[data-view-mode="list"]').click();
    `
  },
  {
    file: '10-board-dark.png',
    theme: 'dark',
    js: `document.querySelector('.chip[data-view-mode="board"]').click();`
  },
  {
    file: '11-calendar-week-dark.png',
    theme: 'dark',
    js: `
      document.querySelector('.chip[data-view-mode="calendar"]').click();
      document.querySelector('[data-action="calendar-mode"][data-mode="week"]').click();
    `
  },
  {
    file: '12-settings-dark.png',
    theme: 'dark',
    js: `
      document.querySelector('.chip[data-view-mode="list"]').click();
      document.getElementById('settings-btn').click();
    `
  }
];

async function capture(win, file) {
  try {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(file, image.toPNG());
    console.log(`Снимок сохранён: ${file}`);
    return true;
  } catch (err) {
    console.error('Не удалось сделать снимок:', err && err.message ? err.message : err);
    return false;
  }
}

// Автосъёмка интерфейса. Запускается, когда задана переменная MYTASKS_SHOTS_DIR.
async function runScreenshotSession({ mainWindow, outputDir, app, setQuitting, showWindow }) {
  const dir = path.resolve(outputDir);
  fs.mkdirSync(dir, { recursive: true });

  showWindow(mainWindow);
  if (mainWindow.webContents.isLoading()) {
    await new Promise((resolve) => mainWindow.webContents.once('did-finish-load', resolve));
  }
  await wait(1200);

  // Режим отладки: выполнить произвольный JS в рендерере и вывести результат.
  if (process.env.MYTASKS_UI_DEBUG) {
    try {
      const result = await mainWindow.webContents.executeJavaScript(
        process.env.MYTASKS_UI_DEBUG,
        true
      );
      console.log(`UI_DEBUG_RESULT:${JSON.stringify(result)}`);
    } catch (err) {
      console.error('UI_DEBUG_ERROR:', err && err.message ? err.message : err);
    }
    await wait(200);
    setQuitting(true);
    app.quit();
    return;
  }

  const results = [];

  for (const shot of SHOTS) {
    try {
      await mainWindow.webContents.executeJavaScript(
        `(async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          ${shot.js}
          // Тема задаётся последней: renderAll() переприменяет сохранённую тему.
          document.documentElement.dataset.theme = ${JSON.stringify(shot.theme || 'light')};
          await wait(450);
          return true;
        })()`,
        true
      );
    } catch (err) {
      console.error(
        `Ошибка подготовки снимка ${shot.file}:`,
        err && err.message ? err.message : err
      );
    }
    await wait(350);
    const ok = await capture(mainWindow, path.join(dir, shot.file));
    results.push({ file: shot.file, ok });
  }

  console.log(`Готово снимков: ${results.filter((r) => r.ok).length}/${results.length}`);

  await wait(300);
  setQuitting(true);
  app.quit();
}

module.exports = { runScreenshotSession };
