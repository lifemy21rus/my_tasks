'use strict';

(function () {
  function createHotkeysModule(ctx) {
    const { state, els, U, updateSetting } = ctx;

    function startHotkeyCapture() {
      state.capturingHotkey = true;
      els.settingHotkeyInput.classList.add('is-capturing');
      els.settingHotkeyInput.value = 'Нажмите сочетание…';
      els.settingHotkeyInput.focus();
    }

    function stopHotkeyCapture() {
      state.capturingHotkey = false;
      els.settingHotkeyInput.classList.remove('is-capturing');
      const settings = state.data.settings;
      els.settingHotkeyInput.value = U.formatHotkey(settings.hotkey);
    }

    function hotkeyFromEvent(event) {
      const code = event.code;

      if (
        code === 'ControlLeft' ||
        code === 'ControlRight' ||
        code === 'ShiftLeft' ||
        code === 'ShiftRight' ||
        code === 'AltLeft' ||
        code === 'AltRight' ||
        code === 'MetaLeft' ||
        code === 'MetaRight'
      ) {
        return null;
      }

      let main = '';
      if (code === 'Space') main = 'Space';
      else if (code.startsWith('Key'))
        main = code.replace('Key', ''); // KeyT → T
      else if (code.startsWith('Digit'))
        main = code.replace('Digit', ''); // Digit5 → 5
      else if (code.startsWith('F') && code.length >= 2 && code.length <= 4)
        main = code; // F1, F12
      else return null;

      if (!main) return null;

      const parts = [];
      if (event.ctrlKey) parts.push('Ctrl');
      if (event.altKey) parts.push('Alt');
      if (event.shiftKey) parts.push('Shift');

      return [...parts, main].join('+');
    }

    async function handleHotkeyKeydown(event) {
      if (!state.capturingHotkey) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        stopHotkeyCapture();
        return;
      }

      const accelerator = hotkeyFromEvent(event);
      if (!accelerator) return;

      state.capturingHotkey = false;
      els.settingHotkeyInput.classList.remove('is-capturing');
      await updateSetting({ hotkey: accelerator }, 'Горячая клавиша сохранена');
    }

    return {
      startHotkeyCapture,
      stopHotkeyCapture,
      handleHotkeyKeydown
    };
  }

  window.AppHotkeys = { create: createHotkeysModule };
})();
