'use strict';

(function () {
  function bindIpcEvents(ctx) {
    const {
      api,
      state,
      els,
      renderAll,
      setView,
      openSettings,
      openTaskModal,
      openNoteModal,
      applyState,
      toast
    } = ctx;

    if (api.onFocusTask) {
      api.onFocusTask((payload) => {
        if (!payload || !payload.taskId) return;
        state.view = 'all';
        state.categoryId = null;
        state.filter = 'all';
        state.search = '';
        state.expanded.add(payload.taskId);
        renderAll();
        const card = els.taskList.querySelector(`.task-card[data-id="${payload.taskId}"]`);
        if (card) {
          card.scrollIntoView({ block: 'center', behavior: 'smooth' });
          card.classList.add('is-highlight');
          setTimeout(() => card.classList.remove('is-highlight'), 1800);
        }
      });
    }

    if (api.onFocusOverdue) {
      api.onFocusOverdue(() => setView('overdue'));
    }

    if (api.onOpenSettings) {
      api.onOpenSettings(() => openSettings());
    }

    if (api.onNewTask) {
      api.onNewTask(() => openTaskModal(null));
    }

    if (api.onNewNote) {
      api.onNewNote(() => {
        openNoteModal();
      });
    }

    if (api.onFocusNote) {
      api.onFocusNote(async (payload) => {
        if (!payload || !payload.noteId) return;

        // состояние могло устареть, пока окно было скрыто
        const res = await api.getState();
        if (res && res.ok) applyState(res);

        renderAll();
        openNoteModal(payload.noteId);
      });
    }

    // sync with mini window and other instances
    if (api.onStateChanged) {
      api.onStateChanged(async () => {
        const res = await api.getState();
        if (res && res.ok) {
          applyState(res);
          renderAll();
        }
      });
    }

    if (api.onUpdateAvailable) {
      api.onUpdateAvailable((payload) => {
        els.installUpdateBtn.hidden = false;
        els.checkUpdatesBtn.hidden = true;
        els.updateStatusNote.textContent = `Доступна версия ${payload.version}. Нажмите «Установить обновление».`;
        els.updateStatusNote.hidden = false;
        toast(`Доступно обновление ${payload.version}`, 'success');
      });
    }
  }

  window.AppIpcEvents = { bind: bindIpcEvents };
})();
