'use strict';

(function () {
  function bindShellEvents(ctx) {
    const {
      $$,
      els,
      state,
      api,
      invoke,
      confirmDialog,
      setView,
      openCategoryModal,
      openTaskModal,
      openNoteModal,
      openSettings,
      renderAll,
      renderTaskList,
      addReminderEditor
    } = ctx;

    $$('.nav-item[data-view]').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.view));
    });

    els.categoryList.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-action]');
      if (!actionButton) return;
      if (actionButton.dataset.action === 'pick-category') {
        setView('category', actionButton.dataset.categoryId);
      } else if (actionButton.dataset.action === 'edit-category') {
        openCategoryModal(actionButton.dataset.categoryId);
      }
    });

    els.filterGroup.addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      if (state.view === 'done') {
        state.view = 'all';
        state.categoryId = null;
      }
      state.filter = chip.dataset.filter;
      renderAll();
    });

    els.addReminderBtn.addEventListener('click', () => {
      addReminderEditor();
    });

    els.recurrenceTypeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        const weekly = radio.value === 'weekly';
        els.recurrenceWeekdays.hidden = !weekly;
        const hasRecurrence = radio.value !== 'none';
        els.recurrenceOptions.hidden = !hasRecurrence;
      });
    });

    els.dueFilterSelect.addEventListener('change', () => {
      state.dueFilter = els.dueFilterSelect.value;
      renderAll();
    });

    els.priorityFilter.addEventListener('change', () => {
      state.priorityFilter = els.priorityFilter.value;
      renderTaskList();
    });

    els.sortSelect.addEventListener('change', () => {
      state.sort = els.sortSelect.value;
      renderTaskList();
    });

    els.searchInput.addEventListener('input', () => {
      state.search = els.searchInput.value;
      renderAll();
    });

    els.searchClear.addEventListener('click', () => {
      state.search = '';
      els.searchInput.value = '';
      els.searchInput.focus();
      renderAll();
    });

    els.newTaskBtn.addEventListener('click', () => openTaskModal(null));
    els.newNoteBtn.addEventListener('click', () => openNoteModal());
    els.notesSectionAddBtn.addEventListener('click', () => openNoteModal());

    els.notesViewActive.addEventListener('click', () => {
      state.notesArchive = false;
      renderAll();
    });
    els.notesViewArchived.addEventListener('click', () => {
      state.notesArchive = true;
      renderAll();
    });
    els.emptyAddBtn.addEventListener('click', () => {
      if (state.view === 'notes') openNoteModal();
      else openTaskModal(null);
    });
    els.settingsBtn.addEventListener('click', openSettings);
    els.addCategoryBtn.addEventListener('click', () => openCategoryModal(null));

    els.clearCompletedBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Очистить выполненные?',
        text: 'Все выполненные задачи будут удалены. Действие нельзя отменить.',
        okText: 'Очистить'
      });
      if (!confirmed) return;
      await invoke(api.clearCompleted(), 'Выполненные задачи удалены');
    });
  }

  window.AppShellEvents = { bind: bindShellEvents };
})();
