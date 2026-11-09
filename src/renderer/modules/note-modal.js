'use strict';

(function () {
  const NOTE_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffe66d', '#ff8c42'];

  function createNoteModalModule(ctx) {
    const { els, state, api, invoke, confirmDialog } = ctx;

    function renderNoteColors() {
      els.noteColorPicker.textContent = '';
      for (const color of NOTE_COLORS) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = `color-swatch${color === state.noteColor ? ' is-active' : ''}`;
        swatch.style.background = color;
        swatch.dataset.color = color;
        swatch.title = color;
        swatch.setAttribute('aria-label', `Цвет ${color}`);
        swatch.addEventListener('click', () => {
          state.noteColor = color;
          renderNoteColors();
        });
        els.noteColorPicker.appendChild(swatch);
      }
    }

    function openNoteModal(noteId = null) {
      const note = noteId ? state.data.notes.find((n) => n.id === noteId) : null;
      state.editingNoteId = note ? note.id : null;
      state.noteColor = note && note.color ? note.color : NOTE_COLORS[0];

      els.noteModalTitle.textContent = note ? 'Редактировать заметку' : 'Новая заметка';
      els.noteTitleInput.value = note ? note.title : '';
      els.noteContentInput.value = note ? note.content || '' : '';
      els.noteTitleError.hidden = true;
      if (els.noteDeleteBtn) els.noteDeleteBtn.hidden = true;
      renderNoteColors();

      els.modalBackdrop.hidden = false;
      els.noteModal.hidden = false;
      els.taskModal.hidden = true;
      els.categoryModal.hidden = true;
      els.settingsModal.hidden = true;
      els.confirmModal.hidden = true;
      setTimeout(() => els.noteTitleInput.focus(), 30);
    }

    function closeNoteModal() {
      els.noteModal.hidden = true;
      state.editingNoteId = null;
      if (
        els.taskModal.hidden &&
        els.categoryModal.hidden &&
        els.settingsModal.hidden &&
        els.confirmModal.hidden
      ) {
        els.modalBackdrop.hidden = true;
      }
    }

    async function saveNote() {
      const title = els.noteTitleInput.value.trim();
      if (!title) {
        els.noteTitleError.textContent = 'Введите название заметки';
        els.noteTitleError.hidden = false;
        els.noteTitleInput.focus();
        return;
      }

      els.noteTitleError.hidden = true;
      const content = els.noteContentInput.value;
      const isNew = !state.editingNoteId;
      const payload = { title, content, color: state.noteColor };

      els.noteSaveBtn.disabled = true;
      try {
        const res = isNew
          ? await invoke(api.addNote(payload), 'Заметка добавлена')
          : await invoke(api.updateNote(state.editingNoteId, payload), 'Заметка обновлена');
        if (!res) return;

        closeNoteModal();
      } finally {
        els.noteSaveBtn.disabled = false;
      }
    }

    async function archiveNoteWithConfirm(noteId) {
      const note = state.data.notes.find((n) => n.id === noteId);
      if (!note) return;
      const isArchived = Boolean(note.archived);
      const confirmed = await confirmDialog({
        title: isArchived ? 'Восстановить заметку?' : 'Переместить в архив?',
        text: isArchived
          ? `«${note.title}» будет восстановлена из архива.`
          : `«${note.title}» будет перемещена в архив. Её можно восстановить в разделе «Архив».`,
        okText: isArchived ? 'Восстановить' : 'В архив'
      });
      if (!confirmed) return;
      const res = await invoke(
        isArchived ? api.unarchiveNote(noteId) : api.archiveNote(noteId),
        isArchived ? 'Заметка восстановлена' : 'Заметка перемещена в архив'
      );
      if (res && !els.noteModal.hidden) closeNoteModal();
    }

    return {
      NOTE_COLORS,
      renderNoteColors,
      openNoteModal,
      closeNoteModal,
      saveNote,
      archiveNoteWithConfirm
    };
  }

  window.AppNoteModal = { create: createNoteModalModule };
})();
