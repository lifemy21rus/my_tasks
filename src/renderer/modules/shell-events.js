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
      addReminderEditor,
      toast
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
      state.activeSmartListId = null;
      renderAll();
    });

    if (els.viewModeGroup) {
      els.viewModeGroup.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-view-mode]');
        if (!chip) return;
        state.viewMode = chip.dataset.viewMode || 'list';
        state.activeSmartListId = null;
        renderAll();
      });
    }

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
      state.activeSmartListId = null;
      renderAll();
    });
    if (els.dueRangeToggle && els.dueRange) {
      els.dueRangeToggle.addEventListener('click', () => {
        state.dueRangeOpen = els.dueRange.hidden;
        els.dueRange.hidden = !state.dueRangeOpen;
        els.dueRangeToggle.setAttribute('aria-expanded', String(state.dueRangeOpen));
        els.dueRangeToggle.classList.toggle('is-active', state.dueRangeOpen);
        if (state.dueRangeOpen && els.dueFromInput) els.dueFromInput.focus();
      });
    }
    if (els.dueFromInput) {
      els.dueFromInput.addEventListener('change', () => {
        state.dueFrom = els.dueFromInput.value || '';
        state.activeSmartListId = null;
        state.dueRangeOpen = true;
        renderAll();
      });
    }
    if (els.dueToInput) {
      els.dueToInput.addEventListener('change', () => {
        state.dueTo = els.dueToInput.value || '';
        state.activeSmartListId = null;
        state.dueRangeOpen = true;
        renderAll();
      });
    }

    els.priorityFilter.addEventListener('change', () => {
      state.priorityFilter = els.priorityFilter.value;
      state.activeSmartListId = null;
      renderTaskList();
    });

    if (els.statusFilter) {
      els.statusFilter.addEventListener('change', () => {
        state.statusFilter = els.statusFilter.value;
        state.activeSmartListId = null;
        renderTaskList();
      });
    }

    if (els.tagFilter) {
      els.tagFilter.addEventListener('change', () => {
        state.tagFilter = els.tagFilter.value;
        state.activeSmartListId = null;
        renderTaskList();
      });
    }

    if (els.attachmentsFilter) {
      els.attachmentsFilter.addEventListener('change', () => {
        state.attachmentsFilter = els.attachmentsFilter.value;
        state.activeSmartListId = null;
        renderTaskList();
      });
    }

    els.sortSelect.addEventListener('change', () => {
      state.sort = els.sortSelect.value;
      state.activeSmartListId = null;
      renderTaskList();
    });

    els.searchInput.addEventListener('input', () => {
      state.search = els.searchInput.value;
      state.activeSmartListId = null;
      renderAll();
    });

    els.searchClear.addEventListener('click', () => {
      state.search = '';
      els.searchInput.value = '';
      state.activeSmartListId = null;
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

    if (els.saveSmartListBtn) {
      els.saveSmartListBtn.addEventListener('click', async () => {
        if (!ctx.currentCriteria) return;
        const criteria = ctx.currentCriteria();
        const name = window.prompt('Название списка', 'Новый список');
        if (!name) return;
        const res = await invoke(
          api.addSmartList({ name: name.trim(), criteria }),
          'Список сохранён'
        );
        if (res) {
          state.activeSmartListId = res.result && res.result.id ? res.result.id : null;
          renderAll();
        }
      });
    }

    if (els.smartListList) {
      els.smartListList.addEventListener('click', async (event) => {
        const applyBtn = event.target.closest('[data-action="apply-smart-list"]');
        if (applyBtn) {
          const id = applyBtn.dataset.smartListId;
          const list = (state.data.smartLists || []).find((l) => l.id === id);
          if (list && ctx.applyCriteria) {
            state.activeSmartListId = id;
            ctx.applyCriteria(list.criteria || {});
            renderAll();
          }
          return;
        }
        const renameBtn = event.target.closest('[data-action="rename-smart-list"]');
        if (renameBtn) {
          const id = renameBtn.dataset.smartListId;
          const list = (state.data.smartLists || []).find((l) => l.id === id);
          if (!list) return;
          const name = window.prompt('Новое название списка', list.name || '');
          if (!name || name.trim() === list.name) return;
          await invoke(api.updateSmartList(id, { name: name.trim() }), 'Список переименован');
          return;
        }
        const delBtn = event.target.closest('[data-action="delete-smart-list"]');
        if (delBtn) {
          const id = delBtn.dataset.smartListId;
          const list = (state.data.smartLists || []).find((l) => l.id === id);
          if (!list) return;
          const confirmed = await confirmDialog({
            title: 'Удалить список?',
            text: `«${list.name}» будет удалён.`,
            okText: 'Удалить'
          });
          if (!confirmed) return;
          const snapshot = JSON.parse(JSON.stringify(list));
          const wasActive = state.activeSmartListId === id;
          const res = await invoke(api.deleteSmartList(id));
          if (res) {
            if (wasActive) state.activeSmartListId = null;
            toast('Список удалён', 'success', {
              label: 'Отменить',
              onClick: async () => {
                const restored = await invoke(
                  api.restoreSmartList(snapshot),
                  'Список восстановлен'
                );
                if (restored && wasActive) {
                  state.activeSmartListId = id;
                  if (typeof renderAll === 'function') renderAll();
                }
              }
            });
          }
          return;
        }
      });
    }

    els.clearCompletedBtn.addEventListener('click', async () => {
      const doneTasks = (state.data.tasks || [])
        .filter((t) => t && t.done)
        .map((t) => JSON.parse(JSON.stringify(t)));
      if (doneTasks.length === 0) return;
      const confirmed = await confirmDialog({
        title: 'Очистить выполненные?',
        text: `Будут удалены выполненные задачи: ${doneTasks.length}.`,
        okText: 'Очистить'
      });
      if (!confirmed) return;
      const res = await invoke(api.clearCompleted());
      if (!res) return;
      if (typeof toast === 'function') {
        toast('Выполненные задачи удалены', 'success', {
          label: 'Отменить',
          onClick: async () => {
            for (const task of doneTasks) {
              try {
                await api.restoreTask(task);
              } catch (_) {
                // ignore individual restore failures
              }
            }
            const finalState = await api.getState();
            if (finalState && finalState.ok && ctx.state) {
              ctx.state.data = finalState.data;
              ctx.state.runtime = finalState.runtime;
            }
            if (typeof renderAll === 'function') renderAll();
          }
        });
      }
    });
  }

  window.AppShellEvents = { bind: bindShellEvents };
})();
