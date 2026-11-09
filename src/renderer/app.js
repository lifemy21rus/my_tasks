'use strict';

(function () {
  const U = window.AppUtils;
  const api = window.api;
  const { $$, makeIconButton, cacheElements, setSvgIcon } = window.AppDOM;
  const { getVisibleTasks, computeCounts, viewInfo } = window.AppStateHelpers;

  const state = {
    data: { settings: {}, categories: [], tasks: [], notes: [] },
    runtime: {},
    view: 'all',
    categoryId: null,
    filter: 'active',
    search: '',
    sort: 'smart',
    dueFilter: '',
    expanded: new Set(),
    expandedNestedSubtasks: new Set(),
    draft: null,
    draftSubtaskAddTarget: null,
    categoryDraft: null,
    capturingHotkey: false,
    confirmReturn: null,
    lastFocusedTask: null,
    priorityFilter: '',
    reminderEditor: [],
    taskColor: null,
    noteTemplates: [],
    taskTemplates: [],
    notesArchive: false
  };

  const els = cacheElements();

  const NOTE_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffe66d', '#ff8c42'];

  state.editingNoteId = null;
  state.noteColor = NOTE_COLORS[0];

  function noteCount(n) {
    return U.noteCount(n);
  }

  function visibleNotes() {
    const query = state.search.trim().toLowerCase();
    return state.data.notes.filter((note) => {
      if (state.notesArchive && !note.archived) return false;
      if (!state.notesArchive && note.archived) return false;
      if (!query) return true;
      return (
        note.title.toLowerCase().includes(query) ||
        (note.content || '').toLowerCase().includes(query)
      );
    });
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

  async function renderNoteTemplates() {
    const res = await invoke(api.getNoteTemplates());
    if (!res) return;
    const templates = res.result || [];
    state.noteTemplates = templates;
    els.noteTemplateSelect.textContent = '<option value="">Без шаблона</option>';
    for (const template of templates) {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.title;
      els.noteTemplateSelect.appendChild(option);
    }
    els.noteTemplateSelect.value = '';
  }

  async function renderTaskTemplates() {
    const res = await invoke(api.getTaskTemplates());
    if (!res) return;
    const templates = res.result || [];
    state.taskTemplates = templates;
    els.taskTemplateSelect.textContent = '<option value="">Без шаблона</option>';
    for (const template of templates) {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.title;
      els.taskTemplateSelect.appendChild(option);
    }
    els.taskTemplateSelect.value = '';
  }

  function openNoteModal(noteId = null) {
    const note = noteId ? state.data.notes.find((n) => n.id === noteId) : null;
    state.editingNoteId = note ? note.id : null;
    state.noteColor = note && note.color ? note.color : NOTE_COLORS[0];

    els.noteModalTitle.textContent = note ? 'Редактировать заметку' : 'Новая заметка';
    els.noteTitleInput.value = note ? note.title : '';
    els.noteContentInput.value = note ? note.content || '' : '';
    els.noteTitleError.hidden = true;
    els.noteDeleteBtn.hidden = !note;
    if (note) {
      els.noteDeleteBtn.textContent = note.archived ? 'Восстановить' : 'В архив';
      els.noteDeleteBtn.title = note.archived
        ? 'Восстановить заметку из архива'
        : 'Переместить заметку в архив';
    }
    renderNoteColors();
    renderNoteTemplates();

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


  /* ------------------------------- helpers ------------------------------- */

  function todayStart() {
    return U.startOfDay(new Date());
  }

  function formatDateTimeFull(value) {
    return U.formatDateTimeFull(value);
  }

  function currentCategory(id) {
    return state.data.categories.find((c) => c.id === id) || null;
  }

  function currentTask(id) {
    return state.data.tasks.find((t) => t.id === id) || null;
  }

  function applyTheme() {
    const theme = state.data.settings.theme || 'system';
    document.documentElement.dataset.theme = theme;
  }

  function toast(message, type = 'info') {
    if (!message) return;
    const node = document.createElement('div');
    node.className = `toast${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
    const dot = document.createElement('span');
    dot.className = 'toast-dot';
    const text = document.createElement('span');
    text.textContent = message;
    node.append(dot, text);
    els.toastStack.appendChild(node);
    setTimeout(
      () => {
        node.classList.add('is-leaving');
        setTimeout(() => node.remove(), 200);
      },
      type === 'error' ? 4800 : 2800
    );
  }

  function applyState(res) {
    if (!res) return;
    if (res.data) state.data = res.data;
    if (res.runtime) state.runtime = res.runtime;
    if (res.runtime && res.runtime.notice) toast(res.runtime.notice, 'error');
    applyTheme();
  }

  async function invoke(promise, successMessage) {
    try {
      const res = await promise;
      if (!res || !res.ok) {
        toast((res && res.error) || 'Не удалось выполнить действие', 'error');
        return null;
      }
      applyState(res);
      renderAll();
      if (successMessage) toast(successMessage, 'success');
      return res;
    } catch (err) {
      toast(err && err.message ? err.message : 'Ошибка', 'error');
      return null;
    }
  }

  const notes = window.AppNotes.create({
    els,
    state,
    visibleNotesFn: visibleNotes,
    makeIconButton,
    onEditNote: openNoteModal,
    onArchiveNote: archiveNoteWithConfirm,
    onToggleNote: (id, done) => invoke(api.toggleNote(id, done))
  });

  function renderNotes() {
    return notes.renderNotes();
  }

  const categories = window.AppCategories.create({
    els,
    state,
    U,
    setSvgIcon
  });

  // Сохраняем ссылку для обратного вызова изменения цвета
  categories._state = state;

  const hotkeys = window.AppHotkeys.create({
    els,
    state,
    U,
    updateSetting
  });

  const modals = window.AppModals.create({
    els,
    state,
    api,
    invoke,
    toast,
    renderAll,
    U,
    $$,
    stopHotkeyCapture: hotkeys.stopHotkeyCapture
  });

  const reminders = window.AppReminders.create({
    els,
    state,
    api,
    invoke,
    currentTask,
    U
  });

  const subtasks = window.AppSubtasks.create({
    els,
    state,
    makeIconButton
  });

  const taskModal = window.AppTaskModal.create({
    els,
    state,
    api,
    invoke,
    toast,
    renderAll,
    renderCategoryOptions,
    renderDraftSubtasks,
    updateSubtaskCounter,
    loadReminderEditor,
    loadRecurrenceEditor,
    currentTask,
    buildRecurrenceFromEditor,
    confirmDialog: modals.confirmDialog,
    renderTaskTemplates,
    U
  });

  function renderCategories() {
    return categories.renderCategories();
  }

  function renderCategoryOptions() {
    return categories.renderCategoryOptions();
  }

  function renderColorGrid(container, selectedColor, onSelect) {
    return categories.renderColorGrid(container, selectedColor, onSelect);
  }

  function renderCategoryColorGrid() {
    renderColorGrid(els.categoryColorGrid, state.categoryDraft.color, (color) => {
      state.categoryDraft.color = color;
      renderCategoryColorGrid();
    });
  }

  /* ------------------------------ filtering ------------------------------ */


  /* ------------------------------- render -------------------------------- */

  function renderAll() {
    renderSidebar();
    renderHeader();
    renderTaskList();
    renderNotes();
    syncFilters();
    renderHotkeyStatus();
    applyTheme();
  }

  function renderSidebar() {
    const counts = computeCounts(state, U);

    $$('.nav-item[data-view]').forEach((button) => {
      const view = button.dataset.view;
      const badge = button.querySelector('.nav-count');
      if (badge) {
        badge.textContent = String(counts[view] || 0);
        badge.dataset.zero = String(!counts[view]);
      }
      button.classList.toggle('is-active', state.view === view);
    });

    const categorySection = els.categoryList.closest('.sidebar-section');
    if (categorySection) {
      categorySection.hidden = state.view === 'notes';
    }

    const dueSection = els.dueFilterSelect.closest('.sidebar-section');
    if (dueSection) {
      dueSection.hidden = state.view === 'notes';
    }

    renderCategories();
  }


  function renderHeader() {
    const visible = getVisibleTasks(state, U);
    const info = viewInfo(state);
    els.viewTitle.textContent = info.title;

    const isNotes = state.view === 'notes';
    const hasSearch = Boolean(state.search.trim());

    let subtitle = isNotes ? noteCount(visibleNotes().length) : U.taskCount(visible.length);
    if (hasSearch) {
      const taskCount = visible.length;
      const noteCountFound = visibleNotes().length;
      const total = isNotes ? noteCountFound : taskCount;
      subtitle = `Найдено: ${total}`;
    }
    els.viewSub.textContent = subtitle;

    const doneCount = state.data.tasks.filter((task) => task.done).length;
    els.clearCompletedBtn.hidden = doneCount === 0 || isNotes;

    // Фильтры и сортировка не нужны во вкладке «Заметки»
    if (isNotes) {
      els.filterGroup.closest('.filters-row').hidden = true;
      els.sortSelect.closest('.sort-wrap').hidden = true;
      els.notesRow.hidden = false;
      els.notesViewActive.classList.toggle('is-active', !state.notesArchive);
      els.notesViewArchived.classList.toggle('is-active', state.notesArchive);
      els.notesSectionAddBtn.hidden = true;
    } else {
      els.filterGroup.closest('.filters-row').hidden = false;
      els.sortSelect.closest('.sort-wrap').hidden = false;
      els.notesRow.hidden = true;
    }

    // Фильтр по приоритету относится только к задачам, у заметок его нет
    const prioritySection = els.priorityFilter.closest('.sidebar-section');
    if (prioritySection) {
      prioritySection.hidden = isNotes;
    }

    els.searchInput.value = state.search;
    els.searchInput.placeholder = isNotes ? 'Поиск заметок…' : 'Поиск задач…';
    els.searchInput.closest('.search-wrap').classList.toggle('has-value', Boolean(state.search));
  }

  function syncFilters() {
    $$('.chip', els.filterGroup).forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.filter === state.filter);
    });
    els.sortSelect.value = state.sort;
    syncPriorityFilters();
    syncDueFilter();
  }

  function syncPriorityFilters() {
    els.priorityFilter.value = state.priorityFilter || '';
  }

  function syncDueFilter() {
    if (els.dueFilterSelect) {
      els.dueFilterSelect.value = state.dueFilter || '';
    }
  }

  function renderTaskList() {
    const tasks = getVisibleTasks(state, U);
    els.taskList.textContent = '';

    if (state.view === 'notes') {
      els.taskList.hidden = true;
      const showEmpty = visibleNotes().length === 0;
      els.emptyState.hidden = !showEmpty;
      els.emptyAddBtn.textContent = 'Добавить заметку';
      els.emptyAddBtn.hidden = false;
      if (showEmpty) renderEmptyText();
      return;
    }

    els.taskList.hidden = false;
    els.emptyAddBtn.textContent = 'Добавить задачу';

    const tasksOnlyEmpty =
      state.view === 'all' ? tasks.length === 0 : tasks.length === 0 && visibleNotes().length === 0;
    if (tasksOnlyEmpty) {
      els.emptyState.hidden = false;
      els.emptyAddBtn.hidden = Boolean(state.search.trim());
      renderEmptyText();
      return;
    }

    els.emptyState.hidden = true;
    const fragment = document.createDocumentFragment();
    for (const task of tasks) fragment.appendChild(renderTaskCard(task));
    els.taskList.appendChild(fragment);

    // set indeterminate states (cannot be done via HTML)
    for (const task of tasks) {
      const checkbox = els.taskList.querySelector(`.task-card[data-id="${task.id}"] .task-check`);
      if (!checkbox) continue;
      const subs = task.subtasks || [];
      const doneSubs = subs.filter((sub) => sub.done).length;
      if (!task.done && subs.length > 0 && doneSubs > 0) {
        checkbox.indeterminate = true;
        checkbox.classList.add('is-partial');
      }
    }
  }

  function renderEmptyText() {
    if (state.search.trim()) {
      els.emptyTitle.textContent = 'Ничего не найдено';
      els.emptyText.textContent = 'Попробуйте изменить запрос или очистить поиск.';
      return;
    }
    if (state.view === 'notes') {
      els.emptyTitle.textContent = 'Заметок пока нет';
      els.emptyText.textContent =
        'Нажмите «Заметка», чтобы сохранить первую мысль или напоминание.';
      return;
    }
    if (state.view === 'done') {
      els.emptyTitle.textContent = 'Выполненных задач нет';
      els.emptyText.textContent = 'Отметьте задачу выполненной — она окажется здесь.';
      return;
    }
    if (state.view === 'category') {
      els.emptyTitle.textContent = 'В этой категории пусто';
      els.emptyText.textContent = 'Добавьте задачу и выберите эту категорию.';
      return;
    }
    if (state.filter === 'done') {
      els.emptyTitle.textContent = 'Выполненных задач нет';
      els.emptyText.textContent = 'Здесь появятся задачи, которые вы отметите.';
      return;
    }
    if (state.view === 'overdue') {
      els.emptyTitle.textContent = 'Просроченных задач нет';
      els.emptyText.textContent = 'Отлично! Все сроки соблюдены.';
      return;
    }
    els.emptyTitle.textContent = 'Здесь пока пусто';
    els.emptyText.textContent = 'Добавьте первую задачу — и она появится в этом списке.';
  }

  function reminderHasFired(task) {
    if (!task.dueAt) return false;
    const due = Date.parse(task.dueAt);
    if (!Number.isFinite(due)) return false;

    const settings = (state.data && state.data.settings) || {};
    let reminders;
    if (Array.isArray(task.reminders) && task.reminders.length > 0) {
      reminders = task.reminders;
    } else {
      reminders = [];
      if (task.remindAtDue !== false) reminders.push({ offset: 0, type: 'due' });
      let before = task.remindBefore;
      if (before === null || before === undefined) before = settings.defaultRemindBefore;
      if (Number.isFinite(Number(before)) && Number(before) >= 0) {
        reminders.push({ offset: Number(before), type: 'before' });
      }
    }

    const now = Date.now();
    return reminders.some((reminder) => {
      const offset = Number(reminder.offset) || 0;
      const triggerAt = reminder.type === 'due' ? due : due - offset * 60000;
      return Number.isFinite(triggerAt) && triggerAt <= now;
    });
  }

  function renderTaskCard(task) {
    const card = document.createElement('article');
    card.className = `task-card${task.done ? ' is-done' : ''}`;
    card.dataset.id = task.id;
    card.setAttribute('role', 'listitem');

    if (task.recurrence) {
      const badge = document.createElement('span');
      badge.className = 'recurrence-badge';
      badge.title = 'Повторяющаяся задача';
      badge.setAttribute('aria-label', 'Повторяющаяся задача');
      badge.textContent = '⟳';
      card.insertBefore(badge, card.firstChild);
    }

    const main = document.createElement('div');
    main.className = 'task-main';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-check';
    checkbox.checked = task.done;
    checkbox.dataset.action = 'toggle-task';
    checkbox.title = task.done ? 'Вернуть в работу' : 'Отметить выполненной';
    checkbox.setAttribute('aria-label', `Выполнить задачу ${task.title}`);

    const body = document.createElement('div');
    body.className = 'task-body';

    const titleRow = document.createElement('div');
    titleRow.className = 'task-title-row';

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;
    titleRow.appendChild(title);

    if (task.priority === 'high') {
      const flag = document.createElement('span');
      flag.className = 'priority-flag high';
      flag.textContent = 'Важно';
      titleRow.appendChild(flag);
    } else if (task.priority === 'low') {
      const flag = document.createElement('span');
      flag.className = 'priority-flag low';
      flag.textContent = 'Не срочно';
      titleRow.appendChild(flag);
    }

    if (task.color) {
      card.style.setProperty('--task-color', task.color);
    }

    body.appendChild(titleRow);

    if (task.description) {
      const desc = document.createElement('div');
      desc.className = 'task-desc';
      desc.textContent = task.description;
      body.appendChild(desc);
    }

    const meta = document.createElement('div');
    meta.className = 'task-meta';

    const due = U.formatDueChip(task.dueAt);
    const dueChip = document.createElement('span');
    dueChip.className = `due-chip tone-${due.tone}`;
    dueChip.title = due.title;
    dueChip.textContent = due.text;
    if (task.snoozedUntil) {
      const note = document.createElement('span');
      note.className = 'snooze-note';
      note.textContent = `· ${U.formatSnooze(task.snoozedUntil)}`;
      dueChip.appendChild(note);
    }
    meta.appendChild(dueChip);

    const category = currentCategory(task.categoryId);
    if (category) {
      const cat = document.createElement('span');
      cat.className = 'meta-cat';
      const dot = document.createElement('span');
      dot.className = 'category-dot';
      dot.style.background = category.color;
      dot.style.color = category.color;
      const label = document.createElement('span');
      label.textContent = category.name;
      cat.append(dot, label);
      meta.appendChild(cat);
    }

    if (task.estimatedMinutes || task.actualMinutes) {
      const timeChip = document.createElement('span');
      timeChip.className = 'meta-time';
      const est = task.estimatedMinutes ? `план ${task.estimatedMinutes} мин` : '';
      const act = task.actualMinutes ? `факт ${task.actualMinutes} мин` : '';
      timeChip.textContent = [est, act].filter(Boolean).join(' · ');
      timeChip.title = 'Время задачи';
      meta.appendChild(timeChip);
    }

    const subs = task.subtasks || [];
    if (subs.length > 0) {
      const doneSubs = subs.filter((sub) => sub.done).length;
      const progress = document.createElement('button');
      progress.type = 'button';
      progress.className = 'subtask-progress';
      progress.dataset.action = 'toggle-expand';
      progress.title = state.expanded.has(task.id) ? 'Свернуть подзадачи' : 'Показать подзадачи';
      const bar = document.createElement('span');
      bar.className = 'progress-bar';
      const fill = document.createElement('span');
      fill.className = 'progress-fill';
      fill.style.width = `${Math.round((doneSubs / subs.length) * 100)}%`;
      bar.appendChild(fill);
      const text = document.createElement('span');
      text.textContent = `${doneSubs}/${subs.length}`;
      progress.append(bar, text);
      meta.appendChild(progress);
    }

    body.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    if (task.dueAt && !task.done && reminderHasFired(task)) {
      actions.appendChild(makeIconButton('snooze', 'Отложить напоминание', 'clock'));
    }
    actions.appendChild(makeIconButton('edit', 'Редактировать', 'pencil'));
    actions.appendChild(makeIconButton('delete', 'Удалить', 'trash', 'danger'));

    main.append(checkbox, body, actions);
    card.appendChild(main);

    if (state.expanded.has(task.id)) {
      card.appendChild(renderSubtasksPanel(task));
    }

    return card;
  }

  function renderSubtasksPanel(task, depth = 0) {
    const panel = document.createElement('div');
    panel.className = 'subtasks-panel';
    panel.style.paddingLeft = `${depth * 20}px`;
    const panelParentId = depth === 0 ? '' : task.id;

    const subs = task.subtasks || [];
    if (subs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtasks-empty';
      empty.textContent = 'Подзадач пока нет.';
      panel.appendChild(empty);
    }

    for (const subtask of subs) {
      const row = document.createElement('div');
      row.className = `subtask-row${subtask.done ? ' is-done' : ''}`;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'subtask-check';
      check.checked = subtask.done;
      check.dataset.action = 'toggle-subtask';
      check.dataset.subtaskId = subtask.id;
      check.dataset.parentSubtaskId = panelParentId;
      check.title = subtask.done ? 'Снять отметку' : 'Отметить выполненной';
      check.setAttribute('aria-label', `Подзадача ${subtask.title}`);

      const title = document.createElement('span');
      title.className = 'subtask-title';
      title.textContent = subtask.title;

      const rowActions = document.createElement('div');
      rowActions.className = 'row-actions';

      const children = subtask.subtasks || [];
      const collapsed = !state.expandedNestedSubtasks.has(subtask.id);

      let toggle = null;
      if (children.length > 0) {
        toggle = makeIconButton(
          'toggle-sub-subtasks',
          `${collapsed ? 'Показать' : 'Скрыть'} подзадачи (${children.length})`,
          collapsed ? 'chevron-right' : 'chevron-down'
        );
        toggle.dataset.subtaskId = subtask.id;
        toggle.classList.add('small', 'subtask-toggle');
      }

      const edit = makeIconButton('edit-subtask', 'Переименовать', 'pencil');
      edit.dataset.subtaskId = subtask.id;
      edit.dataset.parentSubtaskId = panelParentId;
      const remove = makeIconButton('delete-subtask', 'Удалить подзадачу', 'trash', 'danger');
      remove.dataset.subtaskId = subtask.id;
      remove.dataset.parentSubtaskId = panelParentId;

      const addSub = makeIconButton('add-sub-subtask', 'Добавить подзадачу', 'plus');
      addSub.dataset.subtaskId = subtask.id;
      addSub.dataset.parentSubtaskId = panelParentId;
      addSub.classList.add('small');

      rowActions.append(edit);
      if (depth === 0) rowActions.appendChild(addSub);
      rowActions.appendChild(remove);

      row.append(check);
      if (toggle) row.append(toggle);
      row.append(title, rowActions);
      panel.appendChild(row);

      // Рекурсивно рендерим вложенные подзадачи
      if (children.length > 0 && !collapsed) {
        panel.appendChild(renderSubtasksPanel(subtask, depth + 1));
      }
    }

    const form = document.createElement('form');
    form.className = 'subtask-form';
    form.dataset.form = 'add-subtask';
    form.dataset.parentSubtaskId = panelParentId;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Добавить подзадачу…';
    input.maxLength = 500;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Новая подзадача');

    const add = document.createElement('button');
    add.type = 'submit';
    add.className = 'btn btn-ghost';
    add.textContent = 'Добавить';

    form.append(input, add);
    panel.appendChild(form);

    return panel;
  }

  function openInlineSubtaskForm(card, row, parentSubtaskId) {
    if (!card || !row || !parentSubtaskId) return;

    const selector = `form[data-form="add-subtask"][data-parent-subtask-id="${parentSubtaskId}"]`;
    const existing = card.querySelector(selector);
    if (existing) {
      const input = existing.querySelector('input');
      if (input) {
        input.focus();
        existing.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    const form = document.createElement('form');
    form.className = 'subtask-form subtask-form--nested';
    form.dataset.form = 'add-subtask';
    form.dataset.parentSubtaskId = parentSubtaskId;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Добавить подзадачу…';
    input.maxLength = 500;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Новая подзадача');

    const add = document.createElement('button');
    add.type = 'submit';
    add.className = 'btn btn-ghost';
    add.textContent = 'Добавить';

    form.append(input, add);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        form.remove();
      }
    });

    row.after(form);
    input.focus();
  }

  function renderHotkeyStatus() {
    const settings = state.data.settings;
    const enabled = Boolean(settings.hotkeyEnabled);
    const registered = Boolean(state.runtime.hotkeyRegistered);
    els.hotkeyStatus.className = `statusbar-dot ${enabled && registered ? 'is-on' : 'is-off'}`;
    els.hotkeyStatus.title = !enabled
      ? 'Горячая клавиша отключена'
      : registered
        ? `Горячая клавиша: ${U.formatHotkey(settings.hotkey)}`
        : 'Не удалось зарегистрировать горячую клавишу';
    els.hotkeyHint.textContent = enabled
      ? U.formatHotkey(settings.hotkey)
      : 'Горячая клавиша отключена';

    if (state.view === 'notes') {
      els.statusLeft.textContent = noteCount(visibleNotes().length);
      return;
    }

    const visibleCount = getVisibleTasks(state, U).length;
    const total = state.data.tasks.length;
    let text = total === visibleCount ? U.taskCount(total) : `Показано ${visibleCount} из ${total}`;
    if (state.view === 'notes') {
      const notesCount = state.data.notes.length;
      if (notesCount > 0) {
        text += ` · ${noteCount(notesCount)}`;
      }
    }
    els.statusLeft.textContent = text;

    const counts = computeCounts(state, U);
    if (counts.doneActualMinutes > 0) {
      els.statusLeft.textContent += ` · Затрачено: ${counts.doneActualMinutes} мин`;
    }
  }

  /* -------------------------------- views -------------------------------- */

  function setView(view, categoryId) {
    if (view === 'category') {
      state.view = 'category';
      state.categoryId = categoryId || null;
      state.filter = 'active';
    } else {
      state.view = view;
      state.categoryId = null;
      if (view === 'notes' || view === 'inbox') {
        state.priorityFilter = '';
        state.dueFilter = '';
      }
      if (view === 'done') state.filter = 'all';
      else if (state.filter === 'done') state.filter = 'active';
    }
    renderAll();
  }

  /* ------------------------------ task modal ------------------------------ */

  function openTaskModal(taskId, options = {}) {
    try {
      taskModal.openTaskModal(taskId, options);
    } catch (err) {
      toast('Ошибка открытия модалки задачи: ' + (err && err.message ? err.message : String(err)), 'error');
    }
  }


  function renderTaskColorGrid() {
    taskModal.renderTaskColorGrid();
  }


  function renderDraftSubtasks() {
    return subtasks.renderDraftSubtasks();
  }

  function updateSubtaskCounter() {
    return subtasks.updateSubtaskCounter();
  }

  function addDraftSubtask() {
    return subtasks.addDraftSubtask();
  }

  function closeTaskModal() {
    taskModal.closeTaskModal();
  }

  function findNewSubtask(task, parentId, knownIds) {
    if (!task) return null;
    const container = parentId ? findSubtaskInTask(task, parentId) : task;
    if (!container) return null;
    return (container.subtasks || []).find((sub) => sub.id && !knownIds.has(sub.id)) || null;
  }

  async function syncSubtasks(taskId, drafts, existing, parentId = null) {
    const draftList = (drafts || []).filter((sub) => (sub.title || '').trim());
    const existingList = existing || [];
    const knownIds = new Set(existingList.map((sub) => sub.id));
    const draftIds = new Set(draftList.filter((sub) => sub.id).map((sub) => sub.id));

    for (const before of existingList) {
      if (!draftIds.has(before.id)) {
        await api.deleteSubtask(taskId, before.id, parentId);
      }
    }

    for (const sub of draftList) {
      const title = sub.title.trim();
      if (sub.id && knownIds.has(sub.id)) {
        const before = existingList.find((item) => item.id === sub.id);
        if (before.title !== title) {
          await api.updateSubtask(taskId, sub.id, { title }, parentId);
        }
        if (Boolean(before.done) !== Boolean(sub.done)) {
          await api.toggleSubtask(taskId, sub.id, Boolean(sub.done), parentId);
        }
        await syncSubtasks(taskId, sub.subtasks || [], before.subtasks || [], sub.id);
      } else {
        const res = await api.addSubtask(taskId, title, parentId);
        if (!res || !res.ok) continue;
        const added = findNewSubtask(res.result, parentId, knownIds);
        if (!added) continue;
        knownIds.add(added.id);
        if (sub.done) await api.toggleSubtask(taskId, added.id, true, parentId);
        await syncSubtasks(taskId, sub.subtasks || [], [], added.id);
      }
    }
  }

  async function saveTask() {
    const draft = state.draft;
    if (!draft) return;

    const title = els.taskTitleInput.value.trim();
    if (!title) {
      els.taskTitleError.textContent = 'Введите название задачи';
      els.taskTitleError.hidden = false;
      els.taskTitleInput.focus();
      return;
    }

    let dueAt = null;
    if (els.taskDateInput.value) {
      dueAt = U.combineDateTime(els.taskDateInput.value, els.taskTimeInput.value || '18:00');
      if (!dueAt) {
        toast('Некорректная дата или время', 'error');
        return;
      }
    }

    const patch = {
      title,
      description: els.taskDescInput.value,
      dueAt,
      priority: els.taskPriorityInput.value,
      color: state.taskColor || undefined,
      estimatedMinutes: Number(els.taskEstimatedMinutes.value) || undefined,
      actualMinutes: Number(els.taskActualMinutes.value) || undefined,
      categoryId: els.taskCategoryInput.value || null,
      reminders: state.reminderEditor.length > 0 ? [...state.reminderEditor] : null,
      recurrence: buildRecurrenceFromEditor()
    };

    els.taskSaveBtn.disabled = true;

    try {
      if (!draft.id) {
        const subtasks = (draft.subtasks || [])
          .filter((sub) => sub.title.trim())
          .map((sub) => ({
            title: sub.title.trim(),
            done: Boolean(sub.done),
            subtasks: Array.isArray(sub.subtasks)
              ? sub.subtasks
                  .filter((s) => s.title.trim())
                  .map((s) => ({
                    title: s.title.trim(),
                    done: Boolean(s.done)
                  }))
              : []
          }));
        const res = await invoke(api.addTask({ ...patch, subtasks }), 'Задача добавлена');
        if (!res) return;
        closeTaskModal();
        return;
      }

      // existing task: update fields first
      const res = await invoke(api.updateTask(draft.id, patch));
      if (!res) return;

      const existing = currentTask(draft.id);
      await syncSubtasks(
        draft.id,
        draft.subtasks || [],
        (existing && existing.subtasks) || []
      );

      const finalState = await api.getState();
      if (finalState && finalState.ok) {
        applyState(finalState);
        renderAll();
      }
      toast('Изменения сохранены', 'success');
      closeTaskModal();
    } finally {
      els.taskSaveBtn.disabled = false;
    }
  }

  async function deleteTaskWithConfirm(taskId) {
    taskModal.deleteTaskWithConfirm(taskId);
  }

  /* ----------------------------- category modal ---------------------------- */

  function openCategoryModal(categoryId) {
    const category = categoryId ? currentCategory(categoryId) : null;
    state.categoryDraft = {
      id: category ? category.id : null,
      name: category ? category.name : '',
      color: category ? category.color : U.CATEGORY_COLORS[0]
    };

    els.categoryModalTitle.textContent = category ? 'Изменить категорию' : 'Новая категория';
    els.categoryNameInput.value = state.categoryDraft.name;
    els.categoryNameError.hidden = true;
    els.categoryDeleteBtn.hidden = !category;
    renderCategoryColorGrid();

    els.modalBackdrop.hidden = false;
    els.categoryModal.hidden = false;
    els.taskModal.hidden = true;
    els.confirmModal.hidden = true;
    els.settingsModal.hidden = true;
    els.noteModal.hidden = true;
    setTimeout(() => els.categoryNameInput.focus(), 30);
  }


  function closeCategoryModal() {
    els.categoryModal.hidden = true;
    els.modalBackdrop.hidden = true;
    state.categoryDraft = null;
  }

  async function saveCategory() {
    const draft = state.categoryDraft;
    if (!draft) return;
    const name = els.categoryNameInput.value.trim();
    if (!name) {
      els.categoryNameError.textContent = 'Введите название категории';
      els.categoryNameError.hidden = false;
      els.categoryNameInput.focus();
      return;
    }

    if (draft.id) {
      const res = await invoke(
        api.updateCategory(draft.id, { name, color: draft.color }),
        'Категория обновлена'
      );
      if (res) closeCategoryModal();
    } else {
      const res = await invoke(api.addCategory({ name, color: draft.color }), 'Категория создана');
      if (res) closeCategoryModal();
    }
  }

  async function deleteCategoryWithConfirm() {
    const draft = state.categoryDraft;
    if (!draft || !draft.id) return;
    const confirmed = await confirmDialog({
      title: 'Удалить категорию?',
      text: 'Задачи останутся, но перейдут в «Без категории».',
      okText: 'Удалить'
    });
    if (!confirmed) return;
    if (state.view === 'category' && state.categoryId === draft.id) {
      state.view = 'all';
      state.categoryId = null;
    }
    const res = await invoke(api.deleteCategory(draft.id), 'Категория удалена');
    if (res) closeCategoryModal();
  }

  /* ------------------------------ settings -------------------------------- */

  function openSettings() {
    modals.openSettings();
  }

  function closeSettings() {
    modals.closeSettings();
  }

  function renderSettings() {
    modals.renderSettings();
  }

  async function updateSetting(patch, message) {
    const res = await modals.updateSetting(patch, message);
    renderSettings();
    renderHotkeyStatus();
    return res;
  }

  function startHotkeyCapture() {
    hotkeys.startHotkeyCapture();
  }

  function stopHotkeyCapture() {
    hotkeys.stopHotkeyCapture();
  }

  async function handleHotkeyKeydown(event) {
    hotkeys.handleHotkeyKeydown(event);
  }

  /* ------------------------------- confirm -------------------------------- */

  function confirmDialog({ title, text, okText }) {
    return modals.confirmDialog({ title, text, okText });
  }

  function closeConfirm(result) {
    return modals.closeConfirm(result);
  }

  /* -------------------------------- actions ------------------------------- */

  async function toggleTask(taskId, done) {
    const task = currentTask(taskId);
    if (!task) return;
    await invoke(api.toggleTask(taskId, done), done ? 'Задача выполнена' : null);
  }

  async function toggleSubtask(taskId, subtaskId, done, parentSubtaskId = null) {
    await invoke(api.toggleSubtask(taskId, subtaskId, done, parentSubtaskId));
  }

  async function deleteSubtask(taskId, subtaskId, parentSubtaskId = null) {
    await invoke(api.deleteSubtask(taskId, subtaskId, parentSubtaskId));
  }

  function openSnoozeMenu(button, taskId) {
    return reminders.openSnoozeMenu(button, taskId);
  }

  function closeSnoozeMenu() {
    return reminders.closeSnoozeMenu();
  }

  /* -------------------------------- reminder editor -------------------------------- */

  function addReminderEditor() {
    return reminders.addReminderEditor();
  }

  function loadReminderEditor(task) {
    return reminders.loadReminderEditor(task);
  }

  function loadRecurrenceEditor(task) {
    return reminders.loadRecurrenceEditor(task);
  }

  function buildRecurrenceFromEditor() {
    return reminders.buildRecurrenceFromEditor();
  }

  /* -------------------------------- events -------------------------------- */

  function bindEvents() {
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

    // task list delegation
    els.taskList.addEventListener('change', (event) => {
      const target = event.target;
      if (target.dataset.action === 'select-task') {
        toggleSelection(target.dataset.taskId);
        return;
      }
      if (target.dataset.action === 'toggle-task') {
        const card = target.closest('.task-card');
        if (card) toggleTask(card.dataset.id, target.checked);
      } else if (target.dataset.action === 'toggle-subtask') {
        const card = target.closest('.task-card');
        if (card)
          toggleSubtask(
            card.dataset.id,
            target.dataset.subtaskId,
            target.checked,
            target.dataset.parentSubtaskId || null
          );
      }
    });

    els.taskList.addEventListener('click', (event) => {
      const card = event.target.closest('.task-card');
      if (!card) return;

      // кнопки с data-action обрабатываются отдельно
      const button = event.target.closest('[data-action]');
      if (button && button.tagName !== 'INPUT') {
        const taskId = card.dataset.id;
        const action = button.dataset.action;
        if (action === 'edit') openTaskModal(taskId);
        else if (action === 'delete') deleteTaskWithConfirm(taskId);
        else if (action === 'snooze') openSnoozeMenu(button, taskId);
        else if (action === 'toggle-expand') {
          if (state.expanded.has(taskId)) state.expanded.delete(taskId);
          else state.expanded.add(taskId);
          renderTaskList();
        } else if (action === 'toggle-sub-subtasks') {
          const subtaskId = button.dataset.subtaskId;
          if (state.expandedNestedSubtasks.has(subtaskId)) state.expandedNestedSubtasks.delete(subtaskId);
          else state.expandedNestedSubtasks.add(subtaskId);
          renderTaskList();
        } else if (action === 'edit-subtask') {
          startInlineSubtaskEdit(
            card,
            button.dataset.subtaskId,
            button.dataset.parentSubtaskId || null
          );
        } else if (action === 'delete-subtask') {
          deleteSubtask(taskId, button.dataset.subtaskId, button.dataset.parentSubtaskId || null);
        } else if (action === 'add-sub-subtask') {
          openInlineSubtaskForm(card, button.closest('.subtask-row'), button.dataset.subtaskId);
        }
        return;
      }

      // клик по чекбоксу задачи — обработает событие change
      if (event.target.closest('.task-check')) return;

      // клик по подзадаче (чекбокс или строка) — не трогаем главную задачу
      if (event.target.closest('[data-action="toggle-subtask"]')) return;
      if (event.target.closest('.subtask-row')) return;

      // клик по телу карточки/заголовку — переключаем выполнение задачи
      const checkbox = card.querySelector('.task-check');
      if (checkbox) {
        //# Задача больше не переключается при клике по телу карточки/заголовку.
        //# Отмечать выполнение можно только галочкой (через событие change).
        return;
      }
    });

    els.taskList.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-form="add-subtask"]');
      if (!form) return;
      event.preventDefault();
      const card = form.closest('.task-card');
      const input = form.querySelector('input');
      const value = input.value.trim();
      if (!card || !value) return;
      const parentSubtaskId = form.dataset.parentSubtaskId || null;
      if (parentSubtaskId) state.expandedNestedSubtasks.add(parentSubtaskId);
      invoke(
        api.addSubtask(card.dataset.id, value, parentSubtaskId),
        'Подзадача добавлена'
      );
    });

    // task modal
    els.taskCancelBtn.addEventListener('click', closeTaskModal);
    els.taskModalClose.addEventListener('click', closeTaskModal);
    els.taskSaveBtn.addEventListener('click', saveTask);
    els.taskDeleteBtn.addEventListener('click', () => {
      if (state.draft && state.draft.id) deleteTaskWithConfirm(state.draft.id);
    });

    els.taskSaveAsTemplateBtn.addEventListener('click', async () => {
      if (!state.draft) return;
      const title = els.taskTitleInput.value.trim();
      if (!title) {
        els.taskTitleError.textContent = 'Введите название задачи';
        els.taskTitleError.hidden = false;
        els.taskTitleInput.focus();
        return;
      }
      const patch = {
        title,
        description: els.taskDescInput.value,
        priority: els.taskPriorityInput.value,
        categoryId: els.taskCategoryInput.value || null,
        color: state.taskColor || undefined,
        estimatedMinutes: Number(els.taskEstimatedMinutes.value) || undefined,
        actualMinutes: Number(els.taskActualMinutes.value) || undefined,
        reminders: state.reminderEditor.length > 0 ? [...state.reminderEditor] : null,
        recurrence: buildRecurrenceFromEditor(),
        subtasks: state.draft.subtasks
          .filter((sub) => sub.title.trim())
          .map((sub) => ({ title: sub.title.trim(), done: sub.done }))
      };
      const res = await invoke(api.addTaskTemplate(patch), 'Шаблон задачи сохранён');
      if (res) {
        renderTaskTemplates();
        toast('Шаблон задачи сохранён', 'success');
      }
    });

    els.taskTitleInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveTask();
      }
    });

    // note modal
    els.noteSaveBtn.addEventListener('click', saveNote);
    els.noteSaveAsTemplateBtn.addEventListener('click', async () => {
      const title = els.noteTitleInput.value.trim();
      if (!title) {
        els.noteTitleError.textContent = 'Введите название заметки';
        els.noteTitleError.hidden = false;
        els.noteTitleInput.focus();
        return;
      }
      const res = await invoke(
        api.addNoteTemplate({ title, content: els.noteContentInput.value }),
        'Шаблон заметки сохранён'
      );
      if (res) {
        renderNoteTemplates();
        toast('Шаблон заметки сохранён', 'success');
      }
    });
    els.noteCancelBtn.addEventListener('click', closeNoteModal);
    els.noteModalClose.addEventListener('click', closeNoteModal);
    els.noteDeleteBtn.addEventListener('click', () => {
      if (state.editingNoteId) archiveNoteWithConfirm(state.editingNoteId);
    });
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

    els.noteTemplateSelect.addEventListener('change', () => {
      const templateId = els.noteTemplateSelect.value;
      if (!templateId) return;
      const template = (state.data.templates || []).find((t) => t.id === templateId);
      if (template) {
        els.noteTitleInput.value = template.title;
        els.noteContentInput.value = template.content || '';
      }
    });

    els.taskTemplateSelect.addEventListener('change', () => {
      const templateId = els.taskTemplateSelect.value;
      if (!templateId || !state.draft) return;
      const template = (state.taskTemplates || []).find((t) => t.id === templateId);
      if (!template) return;
      state.draft.title = template.title || '';
      state.draft.description = template.description || '';
      state.draft.priority = template.priority || 'normal';
      state.draft.color = template.color || null;
      state.draft.categoryId = template.categoryId || '';
      state.draft.estimatedMinutes = template.estimatedMinutes || null;
      state.draft.reminders = template.reminders
        ? template.reminders.map((r) => ({ offset: r.offset, type: r.type }))
        : null;
      state.draft.recurrence = template.recurrence ? { ...template.recurrence } : null;
      state.draft.subtasks = (template.subtasks || []).map((sub) => ({
        id: null,
        title: sub.title,
        done: false
      }));

      els.taskTitleInput.value = state.draft.title;
      els.taskDescInput.value = state.draft.description;
      els.taskPriorityInput.value = state.draft.priority;
      els.taskEstimatedMinutes.value = state.draft.estimatedMinutes ?? '';
      state.taskColor = state.draft.color || null;
      renderTaskColorGrid();
      renderDraftSubtasks();
      updateSubtaskCounter();
      loadReminderEditor(state.draft);
      loadRecurrenceEditor(state.draft);
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

    // settings modal
    els.settingsDoneBtn.addEventListener('click', closeSettings);
    els.settingsModalClose.addEventListener('click', closeSettings);

    els.themeGrid.addEventListener('click', (event) => {
      const button = event.target.closest('.theme-option');
      if (!button) return;
      updateSetting({ theme: button.dataset.theme });
    });

    els.taskColorGrid.addEventListener('click', (event) => {
      const button = event.target.closest('.color-swatch');
      if (!button) return;
      state.taskColor = button.dataset.color || null;
      renderTaskColorGrid();
    });

    els.settingAutostart.addEventListener('change', () => {
      updateSetting({ autostart: els.settingAutostart.checked });
    });
    els.settingStartMenuShortcut.addEventListener('change', () => {
      updateSetting({ startMenuShortcut: els.settingStartMenuShortcut.checked });
    });
    els.settingStartMinimized.addEventListener('change', () => {
      updateSetting({ startMinimized: els.settingStartMinimized.checked });
    });
    els.settingMiniPanel.addEventListener('change', () => {
      updateSetting({ miniPanel: els.settingMiniPanel.checked });
    });
    els.settingMiniPanelAtStart.addEventListener('change', () => {
      updateSetting({ miniPanelAtStart: els.settingMiniPanelAtStart.checked });
    });
    els.settingMiniPanelTabs.addEventListener('change', () => {
      updateSetting({ miniPanelTabs: els.settingMiniPanelTabs.value });
    });
    els.settingDataEncryption.addEventListener('change', () => {
      updateSetting({ dataEncryption: els.settingDataEncryption.checked });
    });
    els.settingQuitOnClose.addEventListener('change', () => {
      updateSetting({ quitOnClose: els.settingQuitOnClose.checked });
    });
    els.settingDefaultRemind.addEventListener('change', () => {
      updateSetting({ defaultRemindBefore: Number(els.settingDefaultRemind.value) });
    });
    els.settingRemindAtDue.addEventListener('change', () => {
      updateSetting({ defaultRemindAtDue: els.settingRemindAtDue.checked });
    });
    els.settingHotkeyEnabled.addEventListener('change', () => {
      updateSetting({ hotkeyEnabled: els.settingHotkeyEnabled.checked });
    });
    els.settingHotkeyCapture.addEventListener('click', startHotkeyCapture);
    els.settingHotkeyInput.addEventListener('click', startHotkeyCapture);
    els.settingHotkeyReset.addEventListener('click', () => {
      updateSetting({ hotkey: 'CommandOrControl+Shift+Space' }, 'Горячая клавиша сброшена');
    });
    document.addEventListener('keydown', handleHotkeyKeydown, true);

    els.testNotificationBtn.addEventListener('click', async () => {
      const res = await invoke(api.testNotification());
      if (res) toast('Тестовое уведомление отправлено', 'success');
    });

    els.exportBtn.addEventListener('click', async () => {
      const res = await invoke(api.exportData());
      if (res && res.result && res.result.path) toast('Данные экспортированы', 'success');
    });

    els.exportCsvBtn.addEventListener('click', async () => {
      const res = await invoke(api.exportDataCsv());
      if (res && res.result && res.result.path) toast('Задачи экспортированы в CSV', 'success');
    });

    els.importBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Импортировать данные?',
        text: 'Текущие задачи и категории будут заменены содержимым файла. Перед импортом создаётся резервная копия.',
        okText: 'Импортировать'
      });
      if (!confirmed) return;
      const res = await invoke(api.importData());
      if (res && res.result && !res.result.canceled) {
        const notesPart = Number.isFinite(res.result.notes) ? `, ${res.result.notes} заметок` : '';
        toast(
          `Импортировано: ${res.result.tasks} задач, ${res.result.categories} категорий${notesPart}`,
          'success'
        );
      }
    });

    els.backupBtn.addEventListener('click', async () => {
      const res = await invoke(api.backupNow());
      if (res) toast('Резервная копия создана', 'success');
    });

    els.openFolderBtn.addEventListener('click', async () => {
      const res = await invoke(api.openDataFolder());
      if (res) toast('Папка с данными открыта', 'success');
    });

    els.checkUpdatesBtn.addEventListener('click', async () => {
      els.checkUpdatesBtn.hidden = true;
      els.installUpdateBtn.hidden = true;
      els.updateStatusNote.hidden = true;
      els.updateStatusNote.textContent = 'Проверка обновлений…';
      els.updateStatusNote.hidden = false;
      try {
        const res = await invoke(api.checkForUpdates());
        if (res && res.result && res.result.checking) {
          els.updateStatusNote.textContent = 'Проверка завершена. Обновлений не найдено.';
          els.updateStatusNote.hidden = false;
          setTimeout(() => {
            els.updateStatusNote.hidden = true;
            els.checkUpdatesBtn.hidden = false;
          }, 3000);
        }
      } catch (err) {
        els.updateStatusNote.textContent = 'Ошибка проверки обновлений.';
        els.updateStatusNote.hidden = false;
        setTimeout(() => {
          els.updateStatusNote.hidden = true;
          els.checkUpdatesBtn.hidden = false;
        }, 3000);
      }
    });

    els.installUpdateBtn.addEventListener('click', async () => {
      await invoke(api.installUpdate());
      toast('Обновление будет установлено после перезапуска приложения', 'success');
    });

    // confirm modal
    els.confirmOk.addEventListener('click', () => closeConfirm(true));
    els.confirmCancel.addEventListener('click', () => closeConfirm(false));
    els.confirmClose.addEventListener('click', () => closeConfirm(false));

    els.modalBackdrop.addEventListener('mousedown', (event) => {
      if (event.target !== els.modalBackdrop) return;
      if (!els.confirmModal.hidden) closeConfirm(false);
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
        if (!els.confirmModal.hidden) closeConfirm(false);
        else if (!els.taskModal.hidden) closeTaskModal();
        else if (!els.categoryModal.hidden) closeCategoryModal();
        else if (!els.settingsModal.hidden) closeSettings();
        else if (!els.noteModal.hidden) closeNoteModal();
        return;
      }

      const modalOpen = !els.modalBackdrop.hidden;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (!modalOpen) openTaskModal(null);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
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

    // main-process events
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

  function startInlineSubtaskEdit(card, subtaskId, parentSubtaskId = null) {
    const task = currentTask(card.dataset.id);
    if (!task) return;
    const subtask = findSubtaskInTask(task, subtaskId);
    if (!subtask) return;

    const row = card.querySelector(
      `[data-action="toggle-subtask"][data-subtask-id="${subtaskId}"]`
    );
    if (!row) return;
    const rowEl = row.closest('.subtask-row');
    if (!rowEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.value = subtask.title;
    input.maxLength = 500;
    input.style.padding = '3px 7px';
    input.style.fontSize = '12.5px';

    rowEl.textContent = '';
    rowEl.appendChild(input);
    input.focus();
    input.select();

    const finish = async (save) => {
      const value = input.value.trim();
      if (save && value && value !== subtask.title) {
        await invoke(
          api.updateSubtask(card.dataset.id, subtaskId, { title: value }, parentSubtaskId),
          'Подзадача обновлена'
        );
      } else {
        renderTaskList();
      }
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function findSubtaskInTask(task, subtaskId) {
    for (const sub of task.subtasks || []) {
      if (sub.id === subtaskId) return sub;
      if (sub.subtasks) {
        const found = findSubtaskInTask(sub, subtaskId);
        if (found) return found;
      }
    }
    return null;
  }

  /* --------------------------------- init --------------------------------- */

  async function init() {
    bindEvents();
    try {
      const res = await api.getState();
      if (!res || !res.ok) {
        toast((res && res.error) || 'Не удалось загрузить данные', 'error');
        return;
      }
      applyState(res);
      state.runtime.version = state.runtime.version || '1.0.0';
      renderAll();
    } catch (err) {
      console.error(err);
      toast('Не удалось загрузить данные приложения', 'error');
    }
  }

  init();
})();
