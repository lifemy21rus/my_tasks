'use strict';

(function () {
  function createNotesModule(ctx) {
    const { els, state, visibleNotesFn, makeIconButton, onEditNote, onArchiveNote, onToggleNote } = ctx;

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
      body.addEventListener('click', () => onEditNote(note.id));

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

      const actions = document.createElement('div');
      actions.className = 'note-actions';

      const edit = makeIconButton('edit-note', 'Редактировать заметку', 'pencil');
      edit.classList.add('small');
      edit.addEventListener('click', () => onEditNote(note.id));

      const remove = makeIconButton(
        'delete-note',
        note.archived ? 'Восстановить заметку' : 'Переместить в архив',
        'trash',
        'danger'
      );
      remove.classList.add('small');
      remove.addEventListener('click', () => onArchiveNote(note.id));

      actions.append(edit, remove);
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
