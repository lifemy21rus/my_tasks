'use strict';

(function () {
  let confirmResolver = null;

  function createModalsModule(ctx) {
    const { els, state, api, invoke, toast, U, $$, stopHotkeyCapture } = ctx;

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
      els.versionLabel.textContent = state.runtime.version ? `Версия ${state.runtime.version}.` : '';
      els.checkUpdatesBtn.hidden = false;
      els.installUpdateBtn.hidden = true;
      els.updateStatusNote.hidden = true;
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
      updateSetting
    };
  }

  window.AppModals = { create: createModalsModule };
})();
