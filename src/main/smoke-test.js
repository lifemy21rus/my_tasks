'use strict';

const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function collectConsoleLogs(win) {
  const logs = [];
  win.webContents.on('console-message', (...args) => {
    const details = args[1];
    if (details && typeof details === 'object') {
      logs.push(`[${details.level}] ${details.message}`);
    } else {
      logs.push(`[${args[1]}] ${args[2]}`);
    }
  });
  return logs;
}

function writeReport(outputPath, payload) {
  try {
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Smoke-отчёт: ${outputPath}`);
  } catch (err) {
    console.error('Не удалось записать smoke-отчёт:', err);
  }
}

// Снимок окна для визуальной проверки интерфейса (MYTASKS_SCREENSHOT).
async function captureWindow(win, outputPath) {
  if (!win || !outputPath) return null;
  try {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(outputPath, image.toPNG());
    console.log(`Снимок окна сохранён: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error('Не удалось сделать снимок окна:', err);
    return null;
  }
}

// Авто-проверка окна мини-панели. Запускается, когда переменная MYTASKS_MINI_SMOKE задана.
// Приложение само собирает отчёт и завершается.
async function runMiniSmoke({
  miniPanel,
  mainWindow,
  store,
  outputPath,
  app,
  setQuitting,
  showMini
}) {
  const finish = (payload) => {
    writeReport(outputPath, payload);
    setQuitting(true);
    app.quit();
  };

  const miniLogs = collectConsoleLogs(miniPanel.getWindow() || { webContents: { on: () => {} } });

  const run = async (win) => {
    collectConsoleLogs(win);

    if (win.webContents.isLoading()) {
      await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    }
    await wait(900);

    let result = null;
    let mainResult = null;
    let newNoteResult = null;
    let error = null;

    try {
      result = await win.webContents.executeJavaScript(
        `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const q = (selector, root) => Array.from((root || document).querySelectorAll(selector));
        const noteList = document.getElementById('mini-note-list');
        const taskList = document.getElementById('mini-list');
        const report = {
          apiHasFocusNote: typeof window.api.focusNote === 'function',
          apiHasNewNote: typeof window.api.newNote === 'function',
          tabs: q('.mini-tab').map((tab) => tab.dataset.tab),
          tasksTabActive: document.getElementById('mini-tab-tasks').classList.contains('is-active'),
          taskListVisible: !taskList.hidden,
          noteListHiddenInitially: noteList.hidden,
          quickPlaceholderInitially: document.getElementById('mini-quick-input').placeholder,
          quickAddLabelInitially: document.getElementById('mini-quick-add').getAttribute('aria-label'),
          taskCountBadge: document.getElementById('mini-tab-tasks-count').textContent,
          noteCountBadge: document.getElementById('mini-tab-notes-count').textContent,
          taskCards: q('.mini-task', taskList).length,
          taskTitles: q('.mini-task-title', taskList).map((n) => n.textContent),
          taskGroups: q('.mini-group-title span:first-child', taskList).map((s) => s.textContent)
        };

        document.getElementById('mini-tab-notes').click();
        await wait(250);

        report.notesTabActive = document.getElementById('mini-tab-notes').classList.contains('is-active');
        report.noteListVisible = !noteList.hidden;
        report.taskListHidden = taskList.hidden;
        report.quickPlaceholderNotes = document.getElementById('mini-quick-input').placeholder;
        report.quickAddLabelNotes = document.getElementById('mini-quick-add').getAttribute('aria-label');
        report.summary = document.getElementById('mini-count').textContent;
        report.noteCards = q('.mini-note', noteList).length;
        report.noteTitles = q('.mini-note .mini-note-title', noteList).map((n) => n.textContent);
        report.noteContentBlocks = q('.mini-note .mini-note-content', noteList).length;
        report.noteAccent = (() => {
          const row = noteList.querySelector('.mini-note');
          return row ? row.style.getPropertyValue('--note-color') : null;
        })();
        report.noteGroups = q('.mini-group-title span:first-child', noteList).map((s) => s.textContent);
        report.notesTabSelected = document.getElementById('mini-tab-notes').getAttribute('aria-selected');

        const firstNote = noteList.querySelector('.mini-note');
        report.noteId = firstNote ? firstNote.dataset.id : null;

        return report;
      })()`,
        true
      );

      if (process.env.MYTASKS_MINI_SCREENSHOT) {
        try {
          const image = await win.webContents.capturePage();
          fs.writeFileSync(process.env.MYTASKS_MINI_SCREENSHOT, image.toPNG());
          console.log(`Снимок мини-панели сохранён: ${process.env.MYTASKS_MINI_SCREENSHOT}`);
        } catch (err) {
          console.error('Не удалось сделать снимок мини-панели:', err);
        }
      }

      const toggleResult = await win.webContents.executeJavaScript(
        `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const noteList = document.getElementById('mini-note-list');
        const firstNote = noteList.querySelector('.mini-note');
        if (!firstNote) return { toggledNote: false };

        const check = firstNote.querySelector('.mini-note-check');
        check.click();
        await wait(800);

        const state = await window.api.getState();
        return {
          toggledNote: state.ok
            ? Boolean(state.data.notes.find((n) => n.id === firstNote.dataset.id && n.done))
            : false,
          groupsAfterToggle: Array.from(noteList.querySelectorAll('.mini-group-title span:first-child')).map((s) => s.textContent),
          doneRowExists: Boolean(noteList.querySelector('.mini-note.is-done'))
        };
      })()`,
        true
      );

      Object.assign(result, toggleResult);

      result.storeNotesCount = store ? store.getData().notes.length : null;
      try {
        const onDisk = JSON.parse(
          fs.readFileSync(path.join(store.getDataDir(), 'data.json'), 'utf8')
        );
        result.fileNotesCount = Array.isArray(onDisk.notes) ? onDisk.notes.length : null;
        result.fileHasNotesField = Object.prototype.hasOwnProperty.call(onDisk, 'notes');
      } catch (err) {
        result.fileNotesCount = null;
        result.fileError = String(err && err.message ? err.message : err);
      }

      const quickAddTitle = `Заметка из мини smoke ${Date.now()}`;
      const quickAddResult = await win.webContents.executeJavaScript(
        `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const noteList = document.getElementById('mini-note-list');
        const input = document.getElementById('mini-quick-input');
        const title = ${JSON.stringify(quickAddTitle)};
        const before = noteList.querySelectorAll('.mini-note').length;

        input.value = title;
        document.getElementById('mini-quick-add').click();
        await wait(600);

        const state = await window.api.getState();
        return {
          beforeCount: before,
          afterCount: noteList.querySelectorAll('.mini-note').length,
          inputCleared: input.value === '',
          titleShown: Array.from(noteList.querySelectorAll('.mini-note-title')).some((n) => n.textContent === title),
          storedAsNote: state.ok ? state.data.notes.some((n) => n.title === title) : false,
          storedAsTask: state.ok ? state.data.tasks.some((t) => t.title === title) : false,
          summaryAfterAdd: document.getElementById('mini-count').textContent,
          noteCountBadge: document.getElementById('mini-tab-notes-count').textContent
        };
      })()`,
        true
      );

      Object.assign(result, { quickAdd: quickAddResult });

      const clickTarget = await win.webContents.executeJavaScript(
        `(() => {
        const row = document.querySelector('#mini-note-list .mini-note');
        if (!row) return null;
        row.click();
        return row.dataset.id;
      })()`,
        true
      );

      if (clickTarget) {
        await wait(1200);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainResult = await mainWindow.webContents.executeJavaScript(
            `(() => {
            const modal = document.getElementById('note-modal');
            const title = document.getElementById('note-modal-title');
            const view = document.getElementById('view-title');
            return {
              modalVisible: Boolean(modal) && !modal.hidden,
              modalTitle: title ? title.textContent : '',
              viewTitle: view ? view.textContent : ''
            };
          })()`,
            true
          );
        }
      }

      await win.webContents.executeJavaScript(
        `(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
        return true;
      })()`,
        true
      );

      await wait(1200);
      if (mainWindow && !mainWindow.isDestroyed()) {
        newNoteResult = await mainWindow.webContents.executeJavaScript(
          `(() => {
          const modal = document.getElementById('note-modal');
          const title = document.getElementById('note-modal-title');
          const input = document.getElementById('note-title-input');
          return {
            modalVisible: Boolean(modal) && !modal.hidden,
            modalTitle: title ? title.textContent : '',
            titleInputEmpty: input ? input.value === '' : false
          };
        })()`,
          true
        );
      }
    } catch (err) {
      error = err && err.stack ? err.stack : String(err);
    }

    finish({ ok: !error, error, logs: miniLogs, result, mainResult, newNoteResult });
  };

  showMini();

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const win = miniPanel ? miniPanel.getWindow() : null;
    if (win) {
      clearInterval(timer);
      run(win).catch((err) => {
        finish({
          ok: false,
          error: err && err.stack ? err.stack : String(err),
          logs: miniLogs,
          result: null,
          mainResult: null
        });
      });
    } else if (attempts > 50) {
      clearInterval(timer);
      finish({
        ok: false,
        error: 'Мини-панель не появилась',
        logs: miniLogs,
        result: null,
        mainResult: null
      });
    }
  }, 100);
}

// Авто-проверка основного окна. Запускается, когда переменная MYTASKS_SMOKE задана.
async function runMainSmoke({ mainWindow, outputPath, app, setQuitting, showWindow }) {
  const logs = collectConsoleLogs(mainWindow);

  mainWindow.webContents.once('did-finish-load', async () => {
    showWindow(mainWindow);
    await wait(900);
    let result = null;
    let error = null;
    try {
      result = await mainWindow.webContents.executeJavaScript(
        `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const q = (selector) => Array.from(document.querySelectorAll(selector));
        const report = {
          theme: document.documentElement.dataset.theme,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          viewport: [window.innerWidth, window.innerHeight],
          documentSize: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
          apiPresent: Boolean(window.api),
          cards: q('.task-card').map((card) => ({
            title: card.querySelector('.task-title')?.textContent || '',
            due: card.querySelector('.due-chip')?.textContent || '',
            hasCheckbox: Boolean(card.querySelector('.task-check')),
            width: Math.round(card.getBoundingClientRect().width),
            height: Math.round(card.getBoundingClientRect().height)
          })),
          sidebarCounts: q('.nav-item[data-view]').map((button) => [button.dataset.view, button.querySelector('.nav-count')?.textContent]),
          categories: q('.category-item').map((item) => item.textContent.trim()),
          emptyHidden: document.getElementById('empty-state').hidden,
          statusbar: document.getElementById('status-left')?.textContent || ''
        };

        document.querySelector('.task-card .subtask-progress')?.click();
        await wait(150);
        report.subtasksPanelOpened = Boolean(document.querySelector('.subtasks-panel'));

        document.getElementById('new-task-btn').click();
        await wait(150);
        report.taskModalVisible = !document.getElementById('task-modal').hidden;
        report.modalDueDefaults = {
          date: document.getElementById('task-date-input').value,
          time: document.getElementById('task-time-input').value,
          category: document.getElementById('task-category-input').value
        };

        const titleInput = document.getElementById('task-title-input');
        titleInput.value = 'Проверка из smoke-теста';
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('task-save-btn').click();
        await wait(600);

        const afterAdd = await window.api.getState();
        report.addedTask = afterAdd.ok
          ? afterAdd.data.tasks.some((task) => task.title === 'Проверка из smoke-теста')
          : false;
        report.taskModalClosedAfterAdd = document.getElementById('task-modal').hidden;
        report.cardCountAfterAdd = q('.task-card').length;

        document.getElementById('settings-btn').click();
        await wait(200);
        report.settingsVisible = !document.getElementById('settings-modal').hidden;
        report.settingsValues = {
          autostart: document.getElementById('setting-autostart').checked,
          startMinimized: document.getElementById('setting-start-minimized').checked,
          hotkey: document.getElementById('setting-hotkey-input').value,
          themeOptions: q('.theme-option').length
        };

        const darkButton = document.querySelector('.theme-option[data-theme="dark"]');
        darkButton?.click();
        await wait(400);
        report.darkApplied = document.documentElement.dataset.theme === 'dark';
        report.darkBodyBg = getComputedStyle(document.body).backgroundColor;
        const stateAfterTheme = await window.api.getState();
        report.darkStored = stateAfterTheme.ok && stateAfterTheme.data.settings.theme === 'dark';

        document.querySelector('.theme-option[data-theme="system"]')?.click();
        await wait(300);
        document.getElementById('settings-done-btn').click();
        await wait(100);
        report.backdropHidden = document.getElementById('modal-backdrop').hidden;

        document.querySelector('.nav-item[data-view="all"]').click();
        await wait(150);
        report.viewModeChips = q('.chip[data-view-mode]').map((c) => c.dataset.viewMode);
        report.statusFilterPresent = Boolean(document.getElementById('status-filter'));
        report.tagFilterPresent = Boolean(document.getElementById('tag-filter'));
        report.attachmentsFilterPresent = Boolean(document.getElementById('attachments-filter'));
        report.smartListsSectionPresent = Boolean(document.getElementById('smart-lists-section'));

        document.querySelector('.nav-item[data-view="notes"]').click();
        await wait(200);
        report.notesView = document.getElementById('view-title').textContent === 'Заметки';
        report.notesEmptyVisible = !document.getElementById('empty-state').hidden;
        report.notesEmptyDisplay = getComputedStyle(document.getElementById('empty-state')).display;

        document.getElementById('new-note-btn').click();
        await wait(150);
        report.noteModalVisible = !document.getElementById('note-modal').hidden;
        document.getElementById('note-title-input').value = 'Проверка заметки';
        document.getElementById('note-content-input').value = 'Текст проверки сохранения заметки';
        document.getElementById('note-save-btn').click();
        await wait(600);

        const afterNoteAdd = await window.api.getState();
        report.addedNote = Boolean(afterNoteAdd.ok
          && afterNoteAdd.data.notes.some((note) => note.title === 'Проверка заметки'));
        report.noteModalClosed = document.getElementById('note-modal').hidden;
        report.noteCards = q('.note-card').length;

        const noteBody = document.querySelector('.note-card .note-body');
        report.noteBodyFound = Boolean(noteBody);
        noteBody?.click();
        report.noteEditHiddenImmediately = document.getElementById('note-modal').hidden;
        report.noteEditTitleImmediately = document.getElementById('note-modal-title').textContent;
        await wait(150);
        report.noteEditHiddenAfterWait = document.getElementById('note-modal').hidden;
        report.noteEditModalVisible = !document.getElementById('note-modal').hidden;
        const notesBeforeEdit = await window.api.getState();
        report.noteTitlesBeforeEdit = notesBeforeEdit.ok
          ? notesBeforeEdit.data.notes.map((note) => note.id + ':' + note.title)
          : [];
        document.getElementById('note-title-input').value = 'Проверка заметки (изменено)';
        document.getElementById('note-save-btn').click();
        await wait(600);

        const afterNoteEdit = await window.api.getState();
        report.editedNote = Boolean(afterNoteEdit.ok
          && afterNoteEdit.data.notes.some((note) => note.title === 'Проверка заметки (изменено)'));
        report.noteTitlesAfterEdit = afterNoteEdit.ok
          ? afterNoteEdit.data.notes.map((note) => note.id + ':' + note.title)
          : [];

        const editedCard = q('.note-card').find((card) => card.querySelector('.note-card-title')?.textContent === 'Проверка заметки (изменено)');
        report.editedCardFound = Boolean(editedCard);
        editedCard?.querySelector('.note-check')?.click();
        await wait(600);
        const afterNoteToggle = await window.api.getState();
        report.noteToggled = Boolean(afterNoteToggle.ok
          && afterNoteToggle.data.notes.some((note) => note.title === 'Проверка заметки (изменено)' && note.done));
        report.notesAfterToggle = afterNoteToggle.ok
          ? afterNoteToggle.data.notes.map((note) => note.id + ':' + note.title + ':' + note.done)
          : [];

        return report;
      })()`,
        true
      );
    } catch (err) {
      error = err && err.stack ? err.stack : String(err);
    }

    await captureWindow(mainWindow, process.env.MYTASKS_SCREENSHOT);

    const payload = { ok: !error, error, logs, result };
    writeReport(outputPath, payload);
    setQuitting(true);
    app.quit();
  });

  showWindow(mainWindow);
}

module.exports = { runMainSmoke, runMiniSmoke, wait };
