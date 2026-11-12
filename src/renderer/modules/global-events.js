'use strict';

(function () {
  function bindGlobalEvents(ctx) {
    const {
      els,
      state,
      closeConfirm,
      closePrompt,
      submitPrompt,
      closeTaskModal,
      closeCategoryModal,
      closeSettings,
      closeNoteModal,
      closeSnoozeMenu,
      openTaskModal,
      saveTask,
      addDraftSubtask
    } = ctx;

    // confirm modal
    els.confirmOk.addEventListener('click', () => closeConfirm(true));
    els.confirmCancel.addEventListener('click', () => closeConfirm(false));
    els.confirmClose.addEventListener('click', () => closeConfirm(false));

    // prompt modal (замена window.prompt, который не работает в Electron)
    if (els.promptOk) {
      els.promptOk.addEventListener('click', submitPrompt);
      els.promptCancel.addEventListener('click', () => closePrompt(null));
      els.promptClose.addEventListener('click', () => closePrompt(null));
      els.promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitPrompt();
        }
      });
    }

    els.modalBackdrop.addEventListener('mousedown', (event) => {
      if (event.target !== els.modalBackdrop) return;
      if (!els.promptModal.hidden) closePrompt(null);
      else if (!els.confirmModal.hidden) closeConfirm(false);
      else if (!els.taskModal.hidden) closeTaskModal();
      else if (!els.categoryModal.hidden) closeCategoryModal();
      else if (!els.settingsModal.hidden) closeSettings();
      else if (!els.noteModal.hidden) closeNoteModal();
    });

    document.addEventListener('mousedown', (event) => {
      if (
        state.snoozeMenu &&
        !event.target.closest('.snooze-menu') &&
        !event.target.closest('[data-action="snooze"]')
      ) {
        closeSnoozeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (state.snoozeMenu) {
          closeSnoozeMenu();
          return;
        }
        if (!els.promptModal.hidden) closePrompt(null);
        else if (!els.confirmModal.hidden) closeConfirm(false);
        else if (!els.taskModal.hidden) closeTaskModal();
        else if (!els.categoryModal.hidden) closeCategoryModal();
        else if (!els.settingsModal.hidden) closeSettings();
        else if (!els.noteModal.hidden) closeNoteModal();
        return;
      }

      const modalOpen = !els.modalBackdrop.hidden;
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.code === 'KeyN' || event.key.toLowerCase() === 'n')
      ) {
        event.preventDefault();
        if (!modalOpen) openTaskModal(null);
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.code === 'KeyF' || event.key.toLowerCase() === 'f')
      ) {
        event.preventDefault();
        if (!modalOpen) els.searchInput.focus();
        return;
      }
      if (
        modalOpen &&
        !els.taskModal.hidden &&
        (event.ctrlKey || event.metaKey) &&
        event.key === 'Enter'
      ) {
        event.preventDefault();
        saveTask();
        return;
      }
      if (
        event.key === 'Enter' &&
        document.activeElement === els.subtaskInput &&
        !els.taskModal.hidden
      ) {
        event.preventDefault();
        addDraftSubtask();
      }
    });
  }

  window.AppGlobalEvents = { bind: bindGlobalEvents };
})();
