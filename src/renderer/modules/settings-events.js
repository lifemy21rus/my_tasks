'use strict';

(function () {
  function bindSettingsEvents(ctx) {
    const {
      els,
      api,
      invoke,
      toast,
      confirmDialog,
      closeSettings,
      updateSetting,
      startHotkeyCapture,
      handleHotkeyKeydown
    } = ctx;

    els.settingsDoneBtn.addEventListener('click', closeSettings);
    els.settingsModalClose.addEventListener('click', closeSettings);

    els.themeGrid.addEventListener('click', (event) => {
      const button = event.target.closest('.theme-option');
      if (!button) return;
      updateSetting({ theme: button.dataset.theme });
    });

    els.settingAutostart.addEventListener('change', () => {
      updateSetting({ autostart: els.settingAutostart.checked });
    });
    els.settingStartMenuShortcut.addEventListener('change', () => {
      updateSetting({ startMenuShortcut: els.settingStartMenuShortcut.checked });
    });
    els.settingStartMinimized.addEventListener('change', () => {
      updateSetting({ startMinimized: els.settingStartMinimized.checked });
    });
    els.settingMiniPanel.addEventListener('change', () => {
      updateSetting({ miniPanel: els.settingMiniPanel.checked });
    });
    els.settingMiniPanelAtStart.addEventListener('change', () => {
      updateSetting({ miniPanelAtStart: els.settingMiniPanelAtStart.checked });
    });
    els.settingMiniPanelTabs.addEventListener('change', () => {
      updateSetting({ miniPanelTabs: els.settingMiniPanelTabs.value });
    });
    els.settingDataEncryption.addEventListener('change', () => {
      updateSetting({ dataEncryption: els.settingDataEncryption.checked });
    });
    els.settingQuitOnClose.addEventListener('change', () => {
      updateSetting({ quitOnClose: els.settingQuitOnClose.checked });
    });
    els.settingDefaultRemind.addEventListener('change', () => {
      updateSetting({ defaultRemindBefore: Number(els.settingDefaultRemind.value) });
    });
    els.settingRemindAtDue.addEventListener('change', () => {
      updateSetting({ defaultRemindAtDue: els.settingRemindAtDue.checked });
    });
    els.settingHotkeyEnabled.addEventListener('change', () => {
      updateSetting({ hotkeyEnabled: els.settingHotkeyEnabled.checked });
    });
    els.settingHotkeyCapture.addEventListener('click', startHotkeyCapture);
    els.settingHotkeyInput.addEventListener('click', startHotkeyCapture);
    els.settingHotkeyReset.addEventListener('click', () => {
      updateSetting({ hotkey: 'CommandOrControl+Shift+Space' }, 'Горячая клавиша сброшена');
    });
    document.addEventListener('keydown', handleHotkeyKeydown, true);

    els.testNotificationBtn.addEventListener('click', async () => {
      const res = await invoke(api.testNotification());
      if (res) toast('Тестовое уведомление отправлено', 'success');
    });

    els.exportBtn.addEventListener('click', async () => {
      const res = await invoke(api.exportData());
      if (res && res.result && res.result.path) toast('Данные экспортированы', 'success');
    });

    els.exportCsvBtn.addEventListener('click', async () => {
      const res = await invoke(api.exportDataCsv());
      if (res && res.result && res.result.path) toast('Задачи экспортированы в CSV', 'success');
    });

    els.importBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Импортировать данные?',
        text: 'Текущие задачи и категории будут заменены содержимым файла. Перед импортом создаётся резервная копия.',
        okText: 'Импортировать'
      });
      if (!confirmed) return;
      const res = await invoke(api.importData());
      if (res && res.result && !res.result.canceled) {
        const notesPart = Number.isFinite(res.result.notes) ? `, ${res.result.notes} заметок` : '';
        toast(
          `Импортировано: ${res.result.tasks} задач, ${res.result.categories} категорий${notesPart}`,
          'success'
        );
      }
    });

    els.backupBtn.addEventListener('click', async () => {
      const res = await invoke(api.backupNow());
      if (res) toast('Резервная копия создана', 'success');
    });

    if (els.restoreBackupBtn) {
      els.restoreBackupBtn.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: 'Восстановить из резервной копии?',
          text: 'Текущие данные будут заменены выбранной копией. Перед восстановлением будет создана резервная копия текущего состояния.',
          okText: 'Восстановить'
        });
        if (!confirmed) return;
        const res = await invoke(
          api.restoreBackupPick ? api.restoreBackupPick() : api.listBackups()
        );
        if (res && res.result && !res.result.canceled) {
          toast('Данные восстановлены из резервной копии', 'success');
        }
      });
    }

    if (els.backupList) {
      els.backupList.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-action="restore-backup-item"]');
        if (!btn) return;
        const backupPath = btn.dataset.path;
        if (!backupPath) return;
        const confirmed = await confirmDialog({
          title: 'Восстановить из резервной копии?',
          text: 'Текущие данные будут заменены выбранной копией. Перед восстановлением будет создана резервная копия текущего состояния.',
          okText: 'Восстановить'
        });
        if (!confirmed) return;
        const res = await invoke(api.restoreBackup(backupPath));
        if (res && res.result && !res.result.canceled) {
          toast('Данные восстановлены из резервной копии', 'success');
        }
      });
    }

    if (els.attachmentsGcBtn) {
      els.attachmentsGcBtn.addEventListener('click', async () => {
        const res = await invoke(api.gcAttachments());
        if (res) toast('Очистка вложений выполнена', 'success');
      });
    }

    if (els.tagAddBtn && els.tagNewName) {
      els.tagAddBtn.addEventListener('click', async () => {
        const name = els.tagNewName.value.trim();
        if (!name) return;
        const res = await invoke(api.addTag({ name }), 'Тег добавлен');
        if (res) {
          els.tagNewName.value = '';
          if (ctx.renderTagManageList) ctx.renderTagManageList();
          else if (ctx.renderSettings) ctx.renderSettings();
        }
      });
      els.tagNewName.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          els.tagAddBtn.click();
        }
      });
    }

    if (els.tagManageList) {
      els.tagManageList.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const tag = ((ctx.state && ctx.state.data && ctx.state.data.tags) || []).find(
          (t) => t.id === id
        );
        if (!tag) return;
        if (btn.dataset.action === 'rename-tag') {
          const name = window.prompt('Новое название тега', tag.name || '');
          if (!name || name.trim() === tag.name) return;
          const res = await invoke(api.updateTag(id, { name: name.trim() }), 'Тег обновлён');
          if (res && ctx.renderTagManageList) ctx.renderTagManageList();
        } else if (btn.dataset.action === 'delete-tag') {
          const confirmed = await confirmDialog({
            title: 'Удалить тег?',
            text: `Тег «${tag.name}» будет удалён из справочника и убран из задач/заметок.`,
            okText: 'Удалить'
          });
          if (!confirmed) return;
          const res = await invoke(api.deleteTag(id), 'Тег удалён');
          if (res && ctx.renderTagManageList) ctx.renderTagManageList();
        }
      });
    }

    els.openFolderBtn.addEventListener('click', async () => {
      const res = await invoke(api.openDataFolder());
      if (res) toast('Папка с данными открыта', 'success');
    });

    els.checkUpdatesBtn.addEventListener('click', async () => {
      els.checkUpdatesBtn.hidden = true;
      els.installUpdateBtn.hidden = true;
      els.updateStatusNote.hidden = true;
      els.updateStatusNote.textContent = 'Проверка обновлений…';
      els.updateStatusNote.hidden = false;
      try {
        const res = await invoke(api.checkForUpdates());
        if (res && res.result && res.result.checking) {
          els.updateStatusNote.textContent = 'Проверка завершена. Обновлений не найдено.';
          els.updateStatusNote.hidden = false;
          setTimeout(() => {
            els.updateStatusNote.hidden = true;
            els.checkUpdatesBtn.hidden = false;
          }, 3000);
        }
      } catch (err) {
        els.updateStatusNote.textContent = 'Ошибка проверки обновлений.';
        els.updateStatusNote.hidden = false;
        setTimeout(() => {
          els.updateStatusNote.hidden = true;
          els.checkUpdatesBtn.hidden = false;
        }, 3000);
      }
    });

    els.installUpdateBtn.addEventListener('click', async () => {
      await invoke(api.installUpdate());
      toast('Обновление будет установлено после перезапуска приложения', 'success');
    });
  }

  window.AppSettingsEvents = { bind: bindSettingsEvents };
})();
