'use strict';

(function () {
  function createNotesModule(ctx) {
    const {
      els,
      state,
      visibleNotesFn,
      makeIconButton,
      onEditNote,
      onArchiveNote,
      onDeleteNote,
      onToggleNote
    } = ctx;

    function renderNoteCard(note) {
      const card = document.createElement('article');
      card.className = `note-card${note.done ? ' is-done' : ''}`;
      card.dataset.id = note.id;
      card.style.setProperty('--note-color', note.color);

      const main = document.createElement('div');
      main.className = 'note-main';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'task-check note-check';
      check.checked = Boolean(note.done);
      check.title = note.done ? 'Вернуть заметку в работу' : 'Отметить заметку выполненной';
      check.setAttribute('aria-label', `Выполнить заметку ${note.title}`);
      check.addEventListener('change', () => {
        onToggleNote(note.id, check.checked);
      });

      const body = document.createElement('button');
      body.type = 'button';
      body.className = 'note-body';
      body.title = 'Редактировать заметку';
      body.addEventListener('click', (event) => {
        const attBtn = event.target.closest('[data-action="open-attachment"]');
        if (attBtn) {
          event.preventDefault();
          event.stopPropagation();
          if (ctx.onOpenAttachment) ctx.onOpenAttachment(attBtn.dataset.id || '');
          return;
        }
        const tagBtn = event.target.closest('[data-action="filter-tag"]');
        if (tagBtn) {
          event.preventDefault();
          event.stopPropagation();
          if (ctx.onFilterTag) ctx.onFilterTag(tagBtn.dataset.tag || '', 'note');
          return;
        }
        onEditNote(note.id);
      });

      const title = document.createElement('span');
      title.className = 'note-card-title';
      title.textContent = note.title;
      body.appendChild(title);

      if (note.content) {
        const content = document.createElement('span');
        content.className = 'note-card-content';
        content.textContent = note.content;
        body.appendChild(content);
      }

      if (
        (Array.isArray(note.attachments) && note.attachments.length > 0) ||
        (Array.isArray(note.tags) && note.tags.length > 0)
      ) {
        const metaRow = document.createElement('span');
        metaRow.className = 'note-card-tags';
        if (Array.isArray(note.attachments) && note.attachments.length > 0) {
          const items = window.AppAttachments.collectAttachments(state, note.attachments);
          if (items.length === 0) {
            const att = document.createElement('span');
            att.className = 'meta-attachments';
            att.title = `Вложений: ${note.attachments.length}`;
            att.textContent = `📎 ${note.attachments.length}`;
            metaRow.appendChild(att);
          } else {
            const [first, ...rest] = items;
            metaRow.appendChild(
              window.AppAttachments.createLink(first, {
                label: `📎 ${first.name || first.id}`
              })
            );
            if (rest.length > 0) {
              const more = document.createElement('span');
              more.className = 'meta-attachments';
              more.title = rest.map((item) => item.name || item.id).join('\n');
              more.textContent = `+${rest.length}`;
              metaRow.appendChild(more);
            }
          }
        }
        if (Array.isArray(note.tags) && note.tags.length > 0) {
          for (const tag of note.tags) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'tag-chip';
            chip.dataset.action = 'filter-tag';
            chip.dataset.tag = String(tag);
            chip.textContent = String(tag);
            chip.title = `Фильтр по тегу: ${String(tag)}`;
            metaRow.appendChild(chip);
          }
        }
        body.appendChild(metaRow);
      }

      const actions = document.createElement('div');
      actions.className = 'note-actions';

      const edit = makeIconButton('edit-note', 'Редактировать заметку', 'pencil');
      edit.classList.add('small');
      edit.addEventListener('click', () => onEditNote(note.id));

      const isArchived = Boolean(note.archived);
      if (isArchived) {
        const restore = makeIconButton('restore-note', 'Восстановить из архива', 'undo');
        restore.classList.add('small');
        restore.addEventListener('click', () => onArchiveNote(note.id));

        const remove = makeIconButton('delete-note', 'Удалить заметку навсегда', 'trash', 'danger');
        remove.classList.add('small');
        remove.addEventListener('click', () => onDeleteNote(note.id));

        actions.append(edit, restore, remove);
      } else {
        const archive = makeIconButton('archive-note', 'Переместить в архив', 'trash', 'danger');
        archive.classList.add('small');
        archive.addEventListener('click', () => onArchiveNote(note.id));

        actions.append(edit, archive);
      }
      main.append(check, body, actions);
      card.appendChild(main);

      return card;
    }

    function renderNotes() {
      const notes = visibleNotesFn();
      const hasSearch = Boolean(state.search.trim());

      if ((state.view === 'all' || state.view === 'category') && !hasSearch) {
        els.notesSection.hidden = true;
        return;
      }

      if (state.view === 'notes') {
        els.notesSectionHead.hidden = true;
        els.notesSection.hidden = false;
        els.notesSection.classList.add('notes-section-full');
        els.noteList.textContent = '';
        const fragment = document.createDocumentFragment();
        for (const note of notes) fragment.appendChild(renderNoteCard(note));
        els.noteList.appendChild(fragment);
        return;
      }

      els.notesSection.classList.remove('notes-section-full');
      els.notesSectionHead.hidden = false;
      els.noteList.textContent = '';

      if (notes.length === 0) {
        els.notesSection.hidden = true;
        return;
      }

      els.notesSection.hidden = false;
      els.notesSectionCount.textContent = String(notes.length);

      const fragment = document.createDocumentFragment();
      for (const note of notes) fragment.appendChild(renderNoteCard(note));
      els.noteList.appendChild(fragment);
    }

    return {
      renderNoteCard,
      renderNotes
    };
  }

  window.AppNotes = { create: createNotesModule };
})();
