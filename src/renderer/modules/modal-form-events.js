'use strict';

(function () {
  function bindModalFormEvents(ctx) {
    const {
      els,
      state,
      U,
      closeTaskModal,
      saveTask,
      deleteTaskWithConfirm,
      saveNote,
      closeNoteModal,
      addDraftSubtask,
      saveCategory,
      closeCategoryModal,
      deleteCategoryWithConfirm
    } = ctx;

    // task modal
    els.taskCancelBtn.addEventListener('click', closeTaskModal);
    els.taskModalClose.addEventListener('click', closeTaskModal);
    els.taskSaveBtn.addEventListener('click', saveTask);
    els.taskDeleteBtn.addEventListener('click', () => {
      if (state.draft && state.draft.id) deleteTaskWithConfirm(state.draft.id);
    });

    els.taskTitleInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        saveTask();
      }
    });

    // note modal
    els.noteSaveBtn.addEventListener('click', saveNote);
    els.noteCancelBtn.addEventListener('click', closeNoteModal);
    els.noteModalClose.addEventListener('click', closeNoteModal);
    els.noteTitleInput.addEventListener('input', () => {
      els.noteTitleError.hidden = true;
    });
    els.noteTitleInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveNote();
      }
    });
    els.noteContentInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveNote();
      }
    });

    els.quickDue.addEventListener('click', (event) => {
      const button = event.target.closest('[data-quick]');
      if (!button) return;
      const now = new Date();
      let date = now;
      if (button.dataset.quick === 'tomorrow') date = U.addDays(now, 1);
      else if (button.dataset.quick === 'week') date = U.addDays(now, 7);
      else if (button.dataset.quick === 'month') date = U.addMonthsClamped(now, 1);

      const split = U.splitISODateTime(date.toISOString());
      els.taskDateInput.value = split.date;
      if (!els.taskTimeInput.value) els.taskTimeInput.value = '18:00';
    });

    els.clearDueBtn.addEventListener('click', () => {
      els.taskDateInput.value = '';
      els.taskTimeInput.value = '18:00';
    });

    els.subtaskAddBtn.addEventListener('click', addDraftSubtask);
    els.subtaskInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addDraftSubtask();
      }
    });

    // category modal
    els.categorySaveBtn.addEventListener('click', saveCategory);
    els.categoryCancelBtn.addEventListener('click', closeCategoryModal);
    els.categoryModalClose.addEventListener('click', closeCategoryModal);
    els.categoryDeleteBtn.addEventListener('click', deleteCategoryWithConfirm);
    els.categoryNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveCategory();
    });
  }

  window.AppModalFormEvents = { bind: bindModalFormEvents };
})();
