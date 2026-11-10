'use strict';

(function () {
  let confirmResolver = null;

  function createModalsModule(ctx) {
    const { els, state, api, invoke, toast, U, $$, stopHotkeyCapture } = ctx;
    let lastActivity = [];
    let activityFilterBound = false;

    function showToast(message, type = 'info') {
      toast({ els, state }, message, type);
    }

    /* ------------------------------- confirm -------------------------------- */

    function confirmDialog({ title, text, okText }) {
      state.confirmReturn = !els.taskModal.hidden
        ? els.taskModal
        : !els.categoryModal.hidden
          ? els.categoryModal
          : !els.settingsModal.hidden
            ? els.settingsModal
            : !els.noteModal.hidden
              ? els.noteModal
              : null;

      els.confirmTitle.textContent = title || 'Подтверждение';
      els.confirmText.textContent = text || '';
      els.confirmOk.textContent = okText || 'Удалить';
      els.modalBackdrop.hidden = false;
      els.confirmModal.hidden = false;
      els.taskModal.hidden = true;
      els.categoryModal.hidden = true;
      els.settingsModal.hidden = true;
      els.noteModal.hidden = true;

      return new Promise((resolve) => {
        confirmResolver = resolve;
      });
    }

    function closeConfirm(result) {
      els.confirmModal.hidden = true;
      if (!result && state.confirmReturn) {
        els.modalBackdrop.hidden = false;
        state.confirmReturn.hidden = false;
      } else if (
        !els.taskModal.hidden ||
        !els.categoryModal.hidden ||
        !els.settingsModal.hidden ||
        !els.noteModal.hidden
      ) {
        els.modalBackdrop.hidden = false;
      } else {
        els.modalBackdrop.hidden = true;
      }
      state.confirmReturn = null;
      if (confirmResolver) {
        const resolve = confirmResolver;
        confirmResolver = null;
        resolve(result);
      }
    }

    /* ------------------------------ settings -------------------------------- */

    function openSettings() {
      renderSettings();
      els.modalBackdrop.hidden = false;
      els.settingsModal.hidden = false;
      els.taskModal.hidden = true;
      els.confirmModal.hidden = true;
      els.categoryModal.hidden = true;
      els.noteModal.hidden = true;
    }

    function closeSettings() {
      stopHotkeyCapture();
      els.settingsModal.hidden = true;
      els.modalBackdrop.hidden = true;
    }

    async function renderBackupList() {
      if (!els.backupList) return;
      els.backupList.textContent = 'Загрузка…';
      try {
        const res = await api.listBackups();
        if (!res || !res.ok) {
          els.backupList.textContent = 'Не удалось загрузить список копий';
          return;
        }
        const items = res.result || [];
        els.backupList.textContent = '';
        if (items.length === 0) {
          els.backupList.textContent = 'Резервных копий пока нет';
          return;
        }
        for (const item of items.slice(0, 20)) {
          const row = document.createElement('div');
          row.className = 'backup-row';
          const info = document.createElement('div');
          info.className = 'backup-info';
          const name = document.createElement('div');
          name.className = 'backup-name';
          name.textContent = item.name || '';
          const meta = document.createElement('div');
          meta.className = 'backup-meta';
          const dt = item.mtime ? new Date(item.mtime).toLocaleString('ru-RU') : '';
          meta.textContent = [item.kind, dt].filter(Boolean).join(' · ');
          info.append(name, meta);

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-ghost btn-sm';
          btn.dataset.action = 'restore-backup-item';
          btn.dataset.path = item.path || '';
          btn.textContent = 'Восстановить';

          row.append(info, btn);
          els.backupList.appendChild(row);
        }
      } catch (_) {
        els.backupList.textContent = 'Не удалось загрузить список копий';
      }
    }

    function renderTagManageList() {
      if (!els.tagManageList) return;
      const tags = ((state.data && state.data.tags) || [])
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
      els.tagManageList.textContent = '';
      if (tags.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'field-hint';
        empty.textContent = 'Тегов пока нет';
        els.tagManageList.appendChild(empty);
        return;
      }
      for (const tag of tags) {
        const row = document.createElement('div');
        row.className = 'tag-manage-row';
        row.dataset.id = tag.id;
        const name = document.createElement('div');
        name.className = 'tag-manage-name';
        name.textContent = tag.name || '';
        const actions = document.createElement('div');
        actions.className = 'tag-manage-actions';
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'btn btn-ghost btn-sm';
        rename.dataset.action = 'rename-tag';
        rename.dataset.id = tag.id;
        rename.textContent = 'Переименовать';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-ghost btn-sm danger';
        del.dataset.action = 'delete-tag';
        del.dataset.id = tag.id;
        del.textContent = 'Удалить';
        actions.append(rename, del);
        row.append(name, actions);
        els.tagManageList.appendChild(row);
      }
    }

    async function renderStatsActivity() {
      if (!els.statsGrid && !els.activityList) return;
      const labels = {
        'task.add': 'Задача добавлена',
        'task.update': 'Задача изменена',
        'task.toggle': 'Статус задачи изменён',
        'task.delete': 'Задача удалена',
        'task.restore': 'Задача восстановлена',
        'task.snooze': 'Напоминание отложено',
        'task.clearCompleted': 'Очищены выполненные',
        'task.deleteMany': 'Удалено задач',
        'task.subtask.add': 'Подзадача добавлена',
        'task.subtask.update': 'Подзадача изменена',
        'task.subtask.toggle': 'Подзадача переключена',
        'task.subtask.delete': 'Подзадача удалена',
        'note.add': 'Заметка добавлена',
        'note.update': 'Заметка изменена',
        'note.toggle': 'Заметка переключена',
        'note.delete': 'Заметка удалена',
        'note.restore': 'Заметка восстановлена',
        'note.archive': 'Заметка в архиве',
        'note.unarchive': 'Заметка из архива',
        'attachment.add': 'Вложение добавлено',
        'attachment.delete': 'Вложение удалено',
        'data.import': 'Импорт данных'
      };

      function renderActivityList(filterText) {
        if (!els.activityList) return;
        const q = String(filterText || '')
          .trim()
          .toLowerCase();
        els.activityList.textContent = '';
        const source = Array.isArray(lastActivity) ? lastActivity : [];
        const filtered = q
          ? source.filter((item) => {
              const typeLabel = labels[item.type] || item.type || '';
              const p = item.payload || {};
              const hay = [
                typeLabel,
                item.type,
                p.title,
                p.name,
                p.id,
                ...(Array.isArray(p.fields) ? p.fields : [])
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
              return hay.includes(q);
            })
          : source;

        if (filtered.length === 0) {
          els.activityList.textContent =
            source.length === 0 ? 'Пока нет записей' : 'Ничего не найдено';
          return;
        }

        for (const item of filtered) {
          const row = document.createElement('div');
          row.className = 'activity-row';
          const type = document.createElement('div');
          type.className = 'activity-type';
          type.textContent = labels[item.type] || item.type || 'Событие';
          const meta = document.createElement('div');
          meta.className = 'activity-meta';
          const when = item.at ? new Date(item.at).toLocaleString('ru-RU') : '';
          const p = item.payload || {};
          const detailParts = [];
          if (p.title) detailParts.push(String(p.title));
          else if (p.name) detailParts.push(String(p.name));
          if (Array.isArray(p.fields) && p.fields.length)
            detailParts.push(`поля: ${p.fields.join(', ')}`);
          if (typeof p.done === 'boolean') detailParts.push(p.done ? 'выполнено' : 'не выполнено');
          if (Number.isFinite(p.removed)) detailParts.push(`кол-во: ${p.removed}`);
          if (Number.isFinite(p.tasks) || Number.isFinite(p.notes)) {
            const parts = [];
            if (Number.isFinite(p.tasks)) parts.push(`задач: ${p.tasks}`);
            if (Number.isFinite(p.notes)) parts.push(`заметок: ${p.notes}`);
            detailParts.push(parts.join(', '));
          }
          if (p.until) {
            const u = new Date(p.until);
            if (!Number.isNaN(u.getTime())) detailParts.push(`до ${u.toLocaleString('ru-RU')}`);
          }
          if (detailParts.length === 0 && p.id) detailParts.push(String(p.id));
          meta.textContent = [when, ...detailParts].filter(Boolean).join(' • ');
          row.append(type, meta);
          els.activityList.appendChild(row);
        }
      }

      if (els.activityFilter && !activityFilterBound) {
        els.activityFilter.addEventListener('input', () => {
          renderActivityList(els.activityFilter.value);
        });
        activityFilterBound = true;
      }

      try {
        const [statsRes, actRes] = await Promise.all([
          api.getStats ? api.getStats() : Promise.resolve(null),
          api.getActivity ? api.getActivity(50) : Promise.resolve(null)
        ]);
        if (els.statsGrid) {
          els.statsGrid.textContent = '';
          const stats = statsRes && statsRes.ok ? statsRes.result : null;
          if (!stats) {
            els.statsGrid.textContent = 'Нет данных';
          } else {
            const items = [
              ['Задач всего', stats.tasks ? stats.tasks.total : 0],
              ['Активных', stats.tasks ? stats.tasks.active : 0],
              ['Выполнено', stats.tasks ? stats.tasks.completed : 0],
              ['Просрочено', stats.tasks ? stats.tasks.overdue : 0],
              ['На сегодня', stats.tasks ? stats.tasks.dueToday : 0],
              ['Заметок', stats.notes ? stats.notes.total : 0]
            ];
            for (const [label, value] of items) {
              const card = document.createElement('div');
              card.className = 'stat-card';
              const v = document.createElement('div');
              v.className = 'stat-value';
              v.textContent = String(value);
              const l = document.createElement('div');
              l.className = 'stat-label';
              l.textContent = label;
              card.append(v, l);
              els.statsGrid.appendChild(card);
            }
          }
        }
        lastActivity = actRes && actRes.ok ? actRes.result || [] : [];
        renderActivityList(els.activityFilter ? els.activityFilter.value : '');
      } catch (_) {
        lastActivity = [];
        if (els.statsGrid) els.statsGrid.textContent = 'Не удалось загрузить статистику';
        if (els.activityList) els.activityList.textContent = '';
      }
    }

    function renderSettings() {
      const settings = state.data.settings;

      els.settingAutostart.checked = Boolean(settings.autostart);
      els.settingStartMinimized.checked = Boolean(settings.startMinimized);
      els.settingStartMenuShortcut.checked = Boolean(settings.startMenuShortcut);
      els.settingMiniPanel.checked = Boolean(settings.miniPanel);
      els.settingMiniPanelAtStart.checked = Boolean(settings.miniPanelAtStart);
      els.settingMiniPanelTabs.value = settings.miniPanelTabs || 'both';
      els.settingDataEncryption.checked = Boolean(settings.dataEncryption);
      els.settingQuitOnClose.checked = Boolean(settings.quitOnClose);
      els.settingDefaultRemind.value = String(settings.defaultRemindBefore);
      els.settingRemindAtDue.checked = Boolean(settings.defaultRemindAtDue);
      els.settingHotkeyEnabled.checked = Boolean(settings.hotkeyEnabled);
      els.settingHotkeyInput.value = U.formatHotkey(settings.hotkey);

      $$('.theme-option', els.themeGrid).forEach((button) => {
        button.classList.toggle('is-active', button.dataset.theme === settings.theme);
      });

      els.dataDirLabel.textContent = state.runtime.dataDir || '%APPDATA%\\Мои задачи';
      els.versionLabel.textContent = state.runtime.version
        ? `Версия ${state.runtime.version}.`
        : '';
      els.checkUpdatesBtn.hidden = false;
      els.installUpdateBtn.hidden = true;
      els.updateStatusNote.hidden = true;

      renderBackupList();
      renderTagManageList();
      renderStatsActivity();
    }

    async function updateSetting(patch, message) {
      const res = await invoke(api.updateSettings(patch), message);
      if (res) {
        if (res.runtime && Object.prototype.hasOwnProperty.call(res.runtime, 'hotkeyRegistered')) {
          if (state.data.settings.hotkeyEnabled && !res.runtime.hotkeyRegistered) {
            showToast(
              'Не удалось зарегистрировать горячую клавишу — возможно, она занята другой программой.',
              'error'
            );
          }
        }
      }
    }

    return {
      confirmDialog,
      closeConfirm,
      openSettings,
      closeSettings,
      renderSettings,
      renderBackupList,
      renderTagManageList,
      renderStatsActivity,
      updateSetting
    };
  }

  window.AppModals = { create: createModalsModule };
})();
