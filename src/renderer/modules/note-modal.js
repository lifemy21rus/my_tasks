'use strict';

(function () {
  const NOTE_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffe66d', '#ff8c42'];

  function createNoteModalModule(ctx) {
    const { els, state, api, invoke, confirmDialog, toast } = ctx;

    function parseTagsInput(value) {
      const seen = new Set();
      return String(value || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => {
          const key = t.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    function syncNoteTagsInput(tags) {
      if (!els.noteTagsInput) return;
      els.noteTagsInput.value = tags.join(', ');
      renderNoteTagChips();
    }

    function renderNoteTagChips() {
      if (!els.noteTagsChips || !els.noteTagsInput) return;
      const tags = parseTagsInput(els.noteTagsInput.value);
      els.noteTagsChips.textContent = '';
      for (const tag of tags) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip tag-chip-removable';
        chip.dataset.tag = tag;
        chip.title = `Удалить тег: ${tag}`;
        chip.textContent = tag;
        chip.addEventListener('click', () => {
          const next = parseTagsInput(els.noteTagsInput.value).filter((t) => t !== tag);
          syncNoteTagsInput(next);
          els.noteTagsInput.focus();
        });
        els.noteTagsChips.appendChild(chip);
      }
    }

    if (els.noteTagsInput) {
      els.noteTagsInput.addEventListener('input', renderNoteTagChips);
      els.noteTagsInput.addEventListener('change', renderNoteTagChips);
    }

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
      if (els.noteTagsInput)
        els.noteTagsInput.value = note && Array.isArray(note.tags) ? note.tags.join(', ') : '';
      renderNoteTagChips();
      els.noteTitleError.hidden = true;
      if (els.noteDeleteBtn) els.noteDeleteBtn.hidden = true;
      renderNoteColors();
      renderNoteAttachments(state.editingNoteId);

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
      const tags = els.noteTagsInput
        ? (() => {
            const seen = new Set();
            return els.noteTagsInput.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .filter((t) => {
                const key = t.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
          })()
        : [];
      const isNew = !state.editingNoteId;
      const payload = { title, content, color: state.noteColor, tags };

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
      const res = await invoke(isArchived ? api.unarchiveNote(noteId) : api.archiveNote(noteId));
      if (!res) return;
      if (!els.noteModal.hidden) closeNoteModal();
      const message = isArchived ? 'Заметка восстановлена' : 'Заметка перемещена в архив';
      if (typeof toast === 'function') {
        toast(message, 'success', {
          label: 'Отменить',
          onClick: async () => {
            await invoke(isArchived ? api.archiveNote(noteId) : api.unarchiveNote(noteId));
          }
        });
      }
    }

    function renderNoteAttachments(noteId) {
      if (!els.noteAttachmentList) return;
      els.noteAttachmentList.textContent = '';
      const canAttach = Boolean(noteId);
      if (els.noteAttachmentAddBtn) els.noteAttachmentAddBtn.disabled = !canAttach;
      if (els.noteAttachmentHint) els.noteAttachmentHint.hidden = canAttach;
      if (!canAttach) return;

      const note = state.data.notes.find((n) => n.id === noteId);
      const all = (state.data && state.data.attachments) || [];
      const ids = note && Array.isArray(note.attachments) ? note.attachments : [];
      const items = ids.map((id) => all.find((a) => a.id === id)).filter(Boolean);
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'field-hint';
        empty.textContent = 'Нет вложений';
        els.noteAttachmentList.appendChild(empty);
        return;
      }
      for (const att of items) {
        const row = document.createElement('div');
        row.className = 'attachment-row';
        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'attachment-name';
        name.dataset.action = 'open-attachment';
        name.dataset.id = att.id;
        name.textContent = att.name || att.id;
        name.title = att.name || '';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn small danger';
        del.dataset.action = 'delete-attachment';
        del.dataset.id = att.id;
        del.title = 'Удалить вложение';
        del.setAttribute('aria-label', 'Удалить вложение');
        del.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        row.append(name, del);
        els.noteAttachmentList.appendChild(row);
      }
    }

    if (els.noteAttachmentAddBtn) {
      els.noteAttachmentAddBtn.addEventListener('click', async () => {
        const noteId = state.editingNoteId;
        if (!noteId) return;
        const res = await invoke(api.addAttachmentPick({ noteId }), 'Файл прикреплён');
        if (res) renderNoteAttachments(noteId);
      });
    }

    if (els.noteAttachmentList) {
      els.noteAttachmentList.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        if (btn.dataset.action === 'open-attachment') {
          await invoke(api.openAttachment(id));
          return;
        }
        if (btn.dataset.action === 'delete-attachment') {
          const confirmed = await confirmDialog({
            title: 'Удалить вложение?',
            text: 'Файл будет удалён из заметки и хранилища вложений.',
            okText: 'Удалить'
          });
          if (!confirmed) return;
          const res = await invoke(api.deleteAttachment(id), 'Вложение удалено');
          if (res && state.editingNoteId) renderNoteAttachments(state.editingNoteId);
        }
      });
    }

    return {
      NOTE_COLORS,
      renderNoteColors,
      openNoteModal,
      closeNoteModal,
      saveNote,
      archiveNoteWithConfirm,
      renderNoteAttachments
    };
  }

  window.AppNoteModal = { create: createNoteModalModule };
})();
