'use strict';

(function () {
  const U = window.AppUtils;
  const api = window.api;

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
    taskTemplates: []
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const els = {
    categoryList: $('category-list'),
    viewTitle: $('view-title'),
    viewSub: $('view-sub'),
    searchInput: $('search-input'),
    searchClear: $('search-clear'),
    filterGroup: $('filter-group'),
    sortSelect: $('sort-select'),
    taskList: $('task-list'),
    emptyState: $('empty-state'),
    emptyTitle: $('empty-title'),
    emptyText: $('empty-text'),
    emptyAddBtn: $('empty-add-btn'),
    newTaskBtn: $('new-task-btn'),
    settingsBtn: $('settings-btn'),
    addCategoryBtn: $('add-category-btn'),
    clearCompletedBtn: $('clear-completed-btn'),
    statusLeft: $('status-left'),
    hotkeyStatus: $('hotkey-status'),
    hotkeyHint: $('hotkey-hint'),
    modalBackdrop: $('modal-backdrop'),
    taskModal: $('task-modal'),
    taskModalTitle: $('task-modal-title'),
    taskTitleInput: $('task-title-input'),
    taskTitleError: $('task-title-error'),
    taskDescInput: $('task-desc-input'),
    taskDateInput: $('task-date-input'),
    taskTimeInput: $('task-time-input'),
    taskPriorityInput: $('task-priority-input'),
    taskCategoryInput: $('task-category-input'),
    taskEstimatedMinutes: $('task-estimated-minutes'),
    taskActualMinutes: $('task-actual-minutes'),
    taskTemplateSelect: $('task-template-select'),
    taskSaveAsTemplateBtn: $('task-save-as-template-btn'),
    clearDueBtn: $('clear-due-btn'),
    quickDue: $('quick-due'),
    reminderList: $('reminder-list'),
    addReminderBtn: $('add-reminder-btn'),
    taskColorGrid: $('task-color-grid'),
    recurrenceTypeRadios: $$('input[name="recurrence-type"]'),
    recurrenceOptions: $('recurrence-options'),
    recurrenceInterval: $('recurrence-interval'),
    recurrenceWeekdays: $('recurrence-weekdays'),
    recurrenceWeekdayCheckboxes: $$('input[name="recurrence-weekday"]'),
    recurrenceEndDate: $('recurrence-end-date'),
    subtaskEditorList: $('subtask-editor-list'),
    subtaskInput: $('subtask-input'),
    subtaskAddBtn: $('subtask-add-btn'),
    subtaskCounter: $('subtask-counter'),
    taskSaveBtn: $('task-save-btn'),
    taskCancelBtn: $('task-cancel-btn'),
    taskDeleteBtn: $('task-delete-btn'),
    taskModalClose: $('task-modal-close'),
    newNoteBtn: $('new-note-btn'),
    noteList: $('note-list'),
    notesSection: $('notes-section'),
    notesSectionHead: $('notes-section-head'),
    notesSectionCount: $('notes-section-count'),
    notesSectionAddBtn: $('notes-section-add-btn'),
    noteModal: $('note-modal'),
    noteModalTitle: $('note-modal-title'),
    noteTitleInput: $('note-title-input'),
    noteContentInput: $('note-content-input'),
    noteTemplateSelect: $('note-template-select'),
    noteTitleError: $('note-title-error'),
    noteColorPicker: $('note-color-picker'),
    noteSaveBtn: $('note-save-btn'),
    noteSaveAsTemplateBtn: $('note-save-as-template-btn'),
    noteCancelBtn: $('note-cancel-btn'),
    noteDeleteBtn: $('note-delete-btn'),
    noteModalClose: $('note-modal-close'),
    confirmModal: $('confirm-modal'),
    confirmTitle: $('confirm-title'),
    confirmText: $('confirm-text'),
    confirmOk: $('confirm-ok'),
    confirmCancel: $('confirm-cancel'),
    confirmClose: $('confirm-close'),
    categoryModal: $('category-modal'),
    categoryModalTitle: $('category-modal-title'),
    categoryNameInput: $('category-name-input'),
    categoryNameError: $('category-name-error'),
    categoryColorGrid: $('category-color-grid'),
    categoryDeleteBtn: $('category-delete-btn'),
    categorySaveBtn: $('category-save-btn'),
    categoryCancelBtn: $('category-cancel-btn'),
    categoryModalClose: $('category-modal-close'),
    priorityFilters: $('priority-filters'),
    dueFilterSelect: $('due-filter'),
    settingsModal: $('settings-modal'),
    settingsDoneBtn: $('settings-done-btn'),
    settingsModalClose: $('settings-modal-close'),
    settingAutostart: $('setting-autostart'),
    settingStartMinimized: $('setting-start-minimized'),
    settingStartMenuShortcut: $('setting-start-menu-shortcut'),
    settingMiniPanel: $('setting-mini-panel'),
    settingQuitOnClose: $('setting-quit-on-close'),
    settingDefaultRemind: $('setting-default-remind'),
    settingRemindAtDue: $('setting-remind-at-due'),
    settingHotkeyEnabled: $('setting-hotkey-enabled'),
    settingHotkeyInput: $('setting-hotkey-input'),
    settingHotkeyCapture: $('setting-hotkey-capture'),
    settingHotkeyReset: $('setting-hotkey-reset'),
    themeGrid: $('theme-grid'),
    testNotificationBtn: $('test-notification-btn'),
    exportBtn: $('export-btn'),
    exportCsvBtn: $('export-csv-btn'),
    importBtn: $('import-btn'),
    backupBtn: $('backup-btn'),
    openFolderBtn: $('open-folder-btn'),
    dataDirLabel: $('data-dir-label'),
    versionLabel: $('version-label'),
    checkUpdatesBtn: $('check-updates-btn'),
    installUpdateBtn: $('install-update-btn'),
    updateStatusNote: $('update-status-note'),
    toastStack: $('toast-stack')
  };

  const NOTE_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffe66d', '#ff8c42'];

  let editingNoteId = null;
  let noteColor = NOTE_COLORS[0];

  function noteCount(n) {
    return U.noteCount(n);
  }

  function visibleNotes() {
    const query = state.search.trim().toLowerCase();
    if (!query) return state.data.notes;
    return state.data.notes.filter((note) => {
      return note.title.toLowerCase().includes(query)
        || (note.content || '').toLowerCase().includes(query);
    });
  }

  function renderNotes() {
    const notes = visibleNotes();
    const hasSearch = Boolean(state.search.trim());

    // В разделах «Все задачи» и по категории заметки показываются только при активном поиске
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

  function renderNoteColors() {
    els.noteColorPicker.textContent = '';
    for (const color of NOTE_COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `color-swatch${color === noteColor ? ' is-active' : ''}`;
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.title = color;
      swatch.setAttribute('aria-label', `Цвет ${color}`);
      swatch.addEventListener('click', () => {
        noteColor = color;
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
    editingNoteId = note ? note.id : null;
    noteColor = note && note.color ? note.color : NOTE_COLORS[0];

    els.noteModalTitle.textContent = note ? 'Редактировать заметку' : 'Новая заметка';
    els.noteTitleInput.value = note ? note.title : '';
    els.noteContentInput.value = note ? (note.content || '') : '';
    els.noteTitleError.hidden = true;
    els.noteDeleteBtn.hidden = !note;
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
    editingNoteId = null;
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
    const isNew = !editingNoteId;
    const payload = { title, content, color: noteColor };

    els.noteSaveBtn.disabled = true;
    try {
      const res = isNew
        ? await invoke(api.addNote(payload), 'Заметка добавлена')
        : await invoke(api.updateNote(editingNoteId, payload), 'Заметка обновлена');
      if (!res) return;

      closeNoteModal();
    } finally {
      els.noteSaveBtn.disabled = false;
    }
  }

  async function deleteNoteWithConfirm(noteId) {
    const note = state.data.notes.find((n) => n.id === noteId);
    if (!note) return;
    const confirmed = await confirmDialog({
      title: 'Удалить заметку?',
      text: `«${note.title}» будет удалена без возможности отменить действие.`,
      okText: 'Удалить'
    });
    if (!confirmed) return;
    const res = await invoke(api.deleteNote(noteId), 'Заметка удалена');
    if (res && !els.noteModal.hidden) closeNoteModal();
  }

  let confirmResolver = null;
  let snoozeMenu = null;

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

  function formatHotkey(value) {
    return String(value || '')
      .replace(/CommandOrControl|CmdOrCtrl|Control/gi, 'Ctrl')
      .replace(/\+/g, ' + ');
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
    setTimeout(() => {
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 200);
    }, type === 'error' ? 4800 : 2800);
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

  /* ------------------------------ filtering ------------------------------ */

  function dueMatchesView(task, view, now) {
    if (view === 'inbox') return !task.dueAt;
    if (!task.dueAt) return false;
    const due = Date.parse(task.dueAt);
    if (!Number.isFinite(due)) return false;
    const dueDate = new Date(due);

    if (view === 'today') return U.isSameDay(dueDate, now);
    if (view === 'tomorrow') return U.isSameDay(dueDate, U.addDays(now, 1));
    if (view === 'overdue') return due < now.getTime();
    if (view === 'soon') return due >= now.getTime() && due - now.getTime() <= 7 * 24 * 60 * 60 * 1000;
    return false;
  }

  function getVisibleTasks() {
    const now = new Date();
    if (state.view === 'notes') return [];
    let list = state.data.tasks.slice();

    if (state.view === 'done') {
      list = list.filter((task) => task.done);
    } else if (state.view === 'category') {
      list = list.filter((task) => task.categoryId === state.categoryId);
      if (state.filter === 'active') list = list.filter((task) => !task.done);
      else if (state.filter === 'done') list = list.filter((task) => task.done);
    } else if (state.view === 'inbox') {
      list = list.filter((task) => !task.dueAt);
      if (state.filter === 'active') list = list.filter((task) => !task.done);
      else if (state.filter === 'done') list = list.filter((task) => task.done);
    } else {
      if (state.view !== 'all') list = list.filter((task) => dueMatchesView(task, state.view, now));
      if (state.filter === 'active') list = list.filter((task) => !task.done);
      else if (state.filter === 'done') list = list.filter((task) => task.done);
    }

    const query = state.search.trim().toLowerCase();
    if (query) {
      list = list.filter((task) => {
        return task.title.toLowerCase().includes(query)
          || (task.description || '').toLowerCase().includes(query)
          || (task.subtasks || []).some((sub) => sub.title.toLowerCase().includes(query));
      });
    }

    if (state.priorityFilter) {
      list = list.filter((task) => task.priority === state.priorityFilter);
    }

    if (state.dueFilter && state.view !== 'inbox' && state.view !== 'notes') {
      list = list.filter((task) => dueMatchesView(task, state.dueFilter, now));
    }

    return list.sort(compareTasks);
  }

  function compareTasks(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;

    if (state.sort === 'title') {
      return a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' });
    }

    if (state.sort === 'created') {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }

    if (state.sort === 'due') {
      const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
      const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
      if (ad !== bd) return ad - bd;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }

    const now = Date.now();
    const aOver = a.dueAt && Date.parse(a.dueAt) < now;
    const bOver = b.dueAt && Date.parse(b.dueAt) < now;
    if (aOver !== bOver) return aOver ? -1 : 1;

    const pa = U.priorityRank(a.priority);
    const pb = U.priorityRank(b.priority);
    if (pa !== pb) return pa - pb;

    const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
    const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
    if (ad !== bd) return ad - bd;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }

  function computeCounts() {
    const now = new Date();
    const tasks = state.data.tasks;
    const active = tasks.filter((task) => !task.done);
    return {
      all: active.length,
      inbox: active.filter((task) => !task.dueAt).length,
      today: active.filter((task) => dueMatchesView(task, 'today', now)).length,
      tomorrow: active.filter((task) => dueMatchesView(task, 'tomorrow', now)).length,
      overdue: active.filter((task) => dueMatchesView(task, 'overdue', now)).length,
      soon: active.filter((task) => dueMatchesView(task, 'soon', now)).length,
      done: tasks.filter((task) => task.done).length,
      doneActualMinutes: tasks.filter((task) => task.done).reduce((sum, t) => sum + (t.actualMinutes || 0), 0),
      notes: state.data.notes.length
    };
  }

  /* ------------------------------- render -------------------------------- */

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
      invoke(api.toggleNote(note.id, check.checked));
    });

    const body = document.createElement('button');
    body.type = 'button';
    body.className = 'note-body';
    body.title = 'Редактировать заметку';
    body.addEventListener('click', () => openNoteModal(note.id));

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
    edit.addEventListener('click', () => openNoteModal(note.id));

    const remove = makeIconButton('delete-note', 'Удалить заметку', 'trash', 'danger');
    remove.classList.add('small');
    remove.addEventListener('click', () => deleteNoteWithConfirm(note.id));

    actions.append(edit, remove);
    main.append(check, body, actions);
    card.appendChild(main);
    return card;
  }

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
    const counts = computeCounts();

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

    renderCategories(counts);
  }

  function renderCategories(counts) {
    if (state.view === 'notes') {
      els.categoryList.textContent = '';
      return;
    }
    const categories = state.data.categories;
    els.categoryList.textContent = '';

    if (categories.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'category-empty';
      empty.textContent = 'Категорий пока нет. Нажмите +, чтобы создать.';
      els.categoryList.appendChild(empty);
      return;
    }

    const now = new Date();
    for (const category of categories) {
      const count = state.data.tasks.filter((task) => {
        if (task.categoryId !== category.id || task.done) return false;
        return true;
      }).length;

      const row = document.createElement('div');
      row.className = `category-item${state.view === 'category' && state.categoryId === category.id ? ' is-active' : ''}`;

      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'category-pick';
      pick.dataset.action = 'pick-category';
      pick.dataset.categoryId = category.id;

      const dot = document.createElement('span');
      dot.className = 'category-dot';
      dot.style.background = category.color;
      dot.style.color = category.color;

      const name = document.createElement('span');
      name.className = 'category-name';
      name.textContent = category.name;

      const badge = document.createElement('span');
      badge.className = 'category-count';
      badge.textContent = String(count);

      pick.append(dot, name, badge);

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'icon-btn small category-edit';
      edit.dataset.action = 'edit-category';
      edit.dataset.categoryId = category.id;
      edit.title = 'Изменить категорию';
      edit.setAttribute('aria-label', `Изменить категорию ${category.name}`);
      edit.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

      row.append(pick, edit);
      els.categoryList.appendChild(row);
    }

    void now;
    void counts;
  }

  function viewInfo() {
    if (state.view === 'category') {
      const category = currentCategory(state.categoryId);
      return {
        title: category ? category.name : 'Категория',
        icon: 'category'
      };
    }
    const map = {
      all: ['Все задачи', ''],
      inbox: ['Входящие', ''],
      today: ['Сегодня', ''],
      tomorrow: ['Завтра', ''],
      overdue: ['Просроченные', ''],
      soon: ['Ближайшая неделя', ''],
      done: ['Выполненные', ''],
      notes: ['Заметки', '']
    };
    const [title] = map[state.view] || map.all;
    return { title };
  }

  function renderHeader() {
    const visible = getVisibleTasks();
    const info = viewInfo();
    els.viewTitle.textContent = info.title;

    const isNotes = state.view === 'notes';
    const hasSearch = Boolean(state.search.trim());

    let subtitle = isNotes ? noteCount(visibleNotes().length) : U.taskCount(visible.length);
    if (hasSearch) {
      const taskCount = isNotes ? visibleNotes().length : visible.length;
      const noteCountFound = state.view === 'all' ? visibleNotes().length : 0;
      const total = taskCount + noteCountFound;
      subtitle = `Найдено: ${total}`;
    }
    els.viewSub.textContent = subtitle;

    const doneCount = state.data.tasks.filter((task) => task.done).length;
    els.clearCompletedBtn.hidden = doneCount === 0 || isNotes;

    // Фильтры и сортировка не нужны во вкладке «Заметки»
    if (isNotes) {
      els.filterGroup.closest('.filters-row').hidden = true;
      els.sortSelect.closest('.sort-wrap').hidden = true;
    } else {
      els.filterGroup.closest('.filters-row').hidden = false;
      els.sortSelect.closest('.sort-wrap').hidden = false;
    }

    // Фильтр по приоритету относится только к задачам, у заметок его нет
    const prioritySection = els.priorityFilters.closest('.sidebar-section');
    if (prioritySection) {
      prioritySection.hidden = isNotes;
    }

    els.searchInput.value = state.search;
    els.searchInput.placeholder = isNotes ? 'Поиск заметок…' : 'Поиск задач и заметок…';
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
    const active = state.priorityFilter || '';
    $$('.filter-pill', els.priorityFilters).forEach((pill) => {
      pill.classList.toggle('is-active', (pill.dataset.priority || '') === active);
    });
  }

  function syncDueFilter() {
    if (els.dueFilterSelect) {
      els.dueFilterSelect.value = state.dueFilter || '';
    }
  }

  function renderTaskList() {
    const tasks = getVisibleTasks();
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

    const tasksOnlyEmpty = state.view === 'all'
      ? tasks.length === 0
      : tasks.length === 0 && visibleNotes().length === 0;
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
      els.emptyText.textContent = 'Нажмите «Заметка», чтобы сохранить первую мысль или напоминание.';
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

    if (task.dueAt && !task.done) {
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

  function makeIconButton(action, title, icon, extraClass) {
    const icons = {
      clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.7"/>',
      pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v5M14 11v5"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>'
    };
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `icon-btn${extraClass ? ` ${extraClass}` : ''}`;
    button.dataset.action = action;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${icons[icon] || ''}</svg>`;
    return button;
  }

  function renderSubtasksPanel(task, depth = 0) {
    const panel = document.createElement('div');
    panel.className = 'subtasks-panel';
    panel.style.paddingLeft = `${depth * 20}px`;

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
      check.dataset.parentSubtaskId = task.id;
      check.title = subtask.done ? 'Снять отметку' : 'Отметить выполненной';
      check.setAttribute('aria-label', `Подзадача ${subtask.title}`);

      const title = document.createElement('span');
      title.className = 'subtask-title';
      title.textContent = subtask.title;

      const rowActions = document.createElement('div');
      rowActions.className = 'row-actions';

      const edit = makeIconButton('edit-subtask', 'Переименовать', 'pencil');
      edit.dataset.subtaskId = subtask.id;
      edit.dataset.parentSubtaskId = task.id;
      const remove = makeIconButton('delete-subtask', 'Удалить подзадачу', 'trash', 'danger');
      remove.dataset.subtaskId = subtask.id;
      remove.dataset.parentSubtaskId = task.id;

      const addSub = makeIconButton('add-sub-subtask', 'Добавить подзадачу', 'plus');
      addSub.dataset.subtaskId = subtask.id;
      addSub.dataset.parentSubtaskId = task.id;
      addSub.classList.add('small');

      rowActions.append(edit, addSub, remove);

      row.append(check, title, rowActions);
      panel.appendChild(row);

      // Рекурсивно рендерим вложенные подзадачи
      if (subtask.subtasks && subtask.subtasks.length > 0) {
        panel.appendChild(renderSubtasksPanel(subtask, depth + 1));
      }
    }

    const form = document.createElement('form');
    form.className = 'subtask-form';
    form.dataset.form = 'add-subtask';
    form.dataset.parentSubtaskId = task.id;

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

  function renderHotkeyStatus() {
    const settings = state.data.settings;
    const enabled = Boolean(settings.hotkeyEnabled);
    const registered = Boolean(state.runtime.hotkeyRegistered);
    els.hotkeyStatus.className = `statusbar-dot ${enabled && registered ? 'is-on' : 'is-off'}`;
    els.hotkeyStatus.title = !enabled
      ? 'Горячая клавиша отключена'
      : registered
        ? `Горячая клавиша: ${formatHotkey(settings.hotkey)}`
        : 'Не удалось зарегистрировать горячую клавишу';
    els.hotkeyHint.textContent = enabled ? formatHotkey(settings.hotkey) : 'Горячая клавиша отключена';

    if (state.view === 'notes') {
      els.statusLeft.textContent = noteCount(visibleNotes().length);
      return;
    }

    const visibleCount = getVisibleTasks().length;
    const total = state.data.tasks.length;
    let text = total === visibleCount
      ? U.taskCount(total)
      : `Показано ${visibleCount} из ${total}`;
    if (state.view === 'notes') {
      const notesCount = state.data.notes.length;
      if (notesCount > 0) {
        text += ` · ${noteCount(notesCount)}`;
      }
    }
    els.statusLeft.textContent = text;

    const counts = computeCounts();
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
    const settings = state.data.settings;
    const task = taskId ? currentTask(taskId) : null;
    const defaults = settings.defaultRemindBefore;
    const hasDefaultAdvance = Number.isFinite(Number(defaults)) && Number(defaults) >= 0;

    if (task) {
      const split = U.splitISODateTime(task.dueAt);
      state.draft = {
        id: task.id,
        title: task.title,
        description: task.description || '',
        dueDate: split.date,
        dueTime: task.dueAt ? split.time : '',
        priority: task.priority,
        color: task.color || null,
        categoryId: task.categoryId || '',
        estimatedMinutes: task.estimatedMinutes || null,
        actualMinutes: task.actualMinutes || null,
        reminders: task.reminders ? task.reminders.map((r) => ({ offset: r.offset, type: r.type })) : null,
        recurrence: task.recurrence ? { ...task.recurrence } : null,
        subtasks: (task.subtasks || []).map(mapDraftSubtask)
      };
      els.taskModalTitle.textContent = 'Редактировать задачу';
      els.taskDeleteBtn.hidden = false;
    } else {
      const preset = options.preset || {};
      const date = preset.date || '';
      const defaultReminders = [
        { offset: settings.defaultRemindBefore || 60, type: 'before' },
        { offset: 0, type: 'due' }
      ];
      state.draft = {
        id: null,
        title: '',
        description: '',
        dueDate: date,
        dueTime: date ? '18:00' : '',
        priority: 'normal',
        color: null,
        estimatedMinutes: null,
        actualMinutes: null,
        categoryId: preset.categoryId || (state.view === 'category' ? state.categoryId : ''),
        reminders: settings.defaultRemindAtDue !== false ? defaultReminders : null,
        recurrence: null,
        subtasks: []
      };
      els.taskModalTitle.textContent = 'Новая задача';
      els.taskDeleteBtn.hidden = true;
    }

    els.taskTitleInput.value = state.draft.title;
    els.taskDescInput.value = state.draft.description;
    els.taskDateInput.value = state.draft.dueDate;
    els.taskTimeInput.value = state.draft.dueTime || '18:00';
    els.taskPriorityInput.value = state.draft.priority;
    els.taskEstimatedMinutes.value = state.draft.estimatedMinutes ?? '';
    els.taskActualMinutes.value = state.draft.actualMinutes ?? '';
    loadReminderEditor(state.draft.id ? currentTask(state.draft.id) : state.draft);
    loadRecurrenceEditor(state.draft.id ? currentTask(state.draft.id) : state.draft);
    els.taskTitleError.hidden = true;

    renderCategoryOptions();
    renderDraftSubtasks();
    updateSubtaskCounter();

    state.taskColor = state.draft.color || null;
    renderTaskColorGrid();
    renderTaskTemplates();

    els.modalBackdrop.hidden = false;
    els.taskModal.hidden = false;
    els.confirmModal.hidden = true;
    els.categoryModal.hidden = true;
    els.settingsModal.hidden = true;
    els.noteModal.hidden = true;
    setTimeout(() => els.taskTitleInput.focus(), 30);
  }

  function renderCategoryOptions() {
    const select = els.taskCategoryInput;
    select.textContent = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Без категории';
    select.appendChild(none);
    for (const category of state.data.categories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    }
    select.value = state.draft ? state.draft.categoryId : '';
  }

  function renderTaskColorGrid() {
    const TASK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'];
    els.taskColorGrid.textContent = '';
    for (const color of TASK_COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `color-swatch${state.taskColor === color ? ' is-active' : ''}`;
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.title = color;
      swatch.setAttribute('aria-label', `Цвет ${color}`);
      swatch.addEventListener('click', () => {
        state.taskColor = color;
        renderTaskColorGrid();
      });
      els.taskColorGrid.appendChild(swatch);
    }
  }

  function mapDraftSubtask(sub) {
    return {
      id: sub.id || null,
      title: sub.title,
      done: Boolean(sub.done),
      subtasks: (sub.subtasks || []).map(mapDraftSubtask)
    };
  }

  function renderDraftSubtasks() {
    const list = els.subtaskEditorList;
    list.textContent = '';
    const draft = state.draft;
    if (!draft) return;

    renderDraftSubtaskItems(draft.subtasks || [], list, null);
    updateSubtaskCounter();
  }

  function renderDraftSubtaskItems(subtasks, container, parent) {
    (subtasks || []).forEach((subtask) => {
      const row = document.createElement('div');
      row.className = `subtask-editor-row${subtask.done ? ' is-done' : ''}`;
      if (parent) row.style.paddingLeft = '24px';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = subtask.done;
      check.title = 'Выполнена';
      check.addEventListener('change', () => {
        subtask.done = check.checked;
        renderDraftSubtasks();
      });

      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 500;
      input.value = subtask.title;
      input.placeholder = 'Название подзадачи';
      input.addEventListener('input', () => {
        subtask.title = input.value;
      });

      const actions = document.createElement('div');
      actions.className = 'subtask-editor-actions';

      const addSub = makeIconButton('add-draft-sub-subtask', 'Добавить подзадачу', 'plus');
      addSub.classList.add('small');
      addSub.addEventListener('click', (event) => {
        event.stopPropagation();
        state.draftSubtaskAddTarget = subtask;
        if (!subtask.subtasks) subtask.subtasks = [];
        els.subtaskInput.placeholder = `Подзадача для «${subtask.title}»…`;
        els.subtaskInput.focus();
      });

      const remove = makeIconButton('remove-draft-subtask', 'Удалить подзадачу', 'x', 'danger');
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removeDraftSubtask(subtask, parent);
        renderDraftSubtasks();
      });

      actions.append(addSub, remove);
      row.append(check, input, actions);
      container.appendChild(row);

      if (subtask.subtasks && subtask.subtasks.length > 0) {
        const nested = document.createElement('div');
        nested.className = 'subtask-editor-nested';
        renderDraftSubtaskItems(subtask.subtasks, nested, subtask);
        container.appendChild(nested);
      }
    });
  }

  function removeDraftSubtask(subtask, parent) {
    const target = parent ? parent.subtasks : state.draft.subtasks;
    const idx = target.indexOf(subtask);
    if (idx !== -1) target.splice(idx, 1);
  }

  function updateSubtaskCounter() {
    const draft = state.draft;
    if (!draft) {
      els.subtaskCounter.textContent = '0 из 0';
      return;
    }
    const done = (draft.subtasks || []).filter((sub) => sub.done && sub.title.trim()).length;
    els.subtaskCounter.textContent = `${done} из ${(draft.subtasks || []).filter((sub) => sub.title.trim()).length}`;
  }

  function addDraftSubtask() {
    const value = els.subtaskInput.value.trim();
    if (!value || !state.draft) return;
    const target = state.draftSubtaskAddTarget
      ? (state.draftSubtaskAddTarget.subtasks || (state.draftSubtaskAddTarget.subtasks = []))
      : state.draft.subtasks;
    target.push({ id: null, title: value, done: false, subtasks: [] });
    state.draftSubtaskAddTarget = null;
    els.subtaskInput.value = '';
    els.subtaskInput.placeholder = 'Название подзадачи';
    renderDraftSubtasks();
    updateSubtaskCounter();
    els.subtaskInput.focus();
  }

  function closeTaskModal() {
    els.taskModal.hidden = true;
    els.modalBackdrop.hidden = true;
    state.draft = null;
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
            subtasks: Array.isArray(sub.subtasks) ? sub.subtasks.filter((s) => s.title.trim()).map((s) => ({
              title: s.title.trim(),
              done: Boolean(s.done)
            })) : []
          }));
        const res = await invoke(api.addTask({ ...patch, subtasks }), 'Задача добавлена');
        if (!res) return;
        closeTaskModal();
        return;
      }

      // existing task: update fields first
      const res = await invoke(api.updateTask(draft.id, patch));
      if (!res) return;

      const original = (draft.subtasks || []).filter((sub) => sub.id);
      const originalIds = new Set(original.map((sub) => sub.id));
      const draftIds = new Set((draft.subtasks || []).filter((sub) => sub.id).map((sub) => sub.id));

      for (const id of originalIds) {
        if (!draftIds.has(id)) await api.deleteSubtask(draft.id, id);
      }

      for (const sub of (draft.subtasks || [])) {
        if (!sub.title.trim()) continue;
        if (sub.id) {
          const before = original.find((item) => item.id === sub.id);
          if (before && before.title !== sub.title) {
            await api.updateSubtask(draft.id, sub.id, { title: sub.title.trim() });
          }
          if (before && before.done !== sub.done) {
            await api.toggleSubtask(draft.id, sub.id, sub.done);
          }
        } else {
          await api.addSubtask(draft.id, sub.title.trim());
          if (sub.done) {
            const snapshot = await api.getState();
            applyState(snapshot);
            const updated = currentTask(draft.id);
            const added = updated && updated.subtasks[updated.subtasks.length - 1];
            if (added) await api.toggleSubtask(draft.id, added.id, true);
          }
        }
      }

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
    const task = currentTask(taskId);
    if (!task) return;
    const confirmed = await confirmDialog({
      title: 'Удалить задачу?',
      text: `«${task.title}» будет удалена без возможности отменить действие.`,
      okText: 'Удалить'
    });
    if (!confirmed) return;
    const res = await invoke(api.deleteTask(taskId), 'Задача удалена');
    if (res) closeTaskModal();
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
    renderColorGrid();

    els.modalBackdrop.hidden = false;
    els.categoryModal.hidden = false;
    els.taskModal.hidden = true;
    els.confirmModal.hidden = true;
    els.settingsModal.hidden = true;
    els.noteModal.hidden = true;
    setTimeout(() => els.categoryNameInput.focus(), 30);
  }

  function renderColorGrid() {
    els.categoryColorGrid.textContent = '';
    for (const color of U.CATEGORY_COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `color-swatch${state.categoryDraft.color === color ? ' is-active' : ''}`;
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.title = color;
      swatch.setAttribute('aria-label', `Цвет ${color}`);
      swatch.addEventListener('click', () => {
        state.categoryDraft.color = color;
        renderColorGrid();
      });
      els.categoryColorGrid.appendChild(swatch);
    }
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
      const res = await invoke(api.updateCategory(draft.id, { name, color: draft.color }), 'Категория обновлена');
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
    renderSettings();
    els.modalBackdrop.hidden = false;
    els.settingsModal.hidden = false;
    els.taskModal.hidden = true;
    els.confirmModal.hidden = true;
    els.categoryModal.hidden = true;
    els.noteModal.hidden = true;
  }

  function closeSettings() {
    stopHotkeyCapture();
    els.settingsModal.hidden = true;
    els.modalBackdrop.hidden = true;
  }

  function renderSettings() {
    const settings = state.data.settings;

    els.settingAutostart.checked = Boolean(settings.autostart);
    els.settingStartMinimized.checked = Boolean(settings.startMinimized);
    els.settingStartMenuShortcut.checked = Boolean(settings.startMenuShortcut);
    els.settingMiniPanel.checked = Boolean(settings.miniPanel);
    els.settingQuitOnClose.checked = Boolean(settings.quitOnClose);
    els.settingDefaultRemind.value = String(settings.defaultRemindBefore);
    els.settingRemindAtDue.checked = Boolean(settings.defaultRemindAtDue);
    els.settingHotkeyEnabled.checked = Boolean(settings.hotkeyEnabled);
    els.settingHotkeyInput.value = formatHotkey(settings.hotkey);

    $$('.theme-option', els.themeGrid).forEach((button) => {
      button.classList.toggle('is-active', button.dataset.theme === settings.theme);
    });

    els.dataDirLabel.textContent = state.runtime.dataDir || '%APPDATA%\\Мои задачи';
    els.versionLabel.textContent = state.runtime.version ? `Версия ${state.runtime.version}.` : '';
    els.checkUpdatesBtn.hidden = false;
    els.installUpdateBtn.hidden = true;
    els.updateStatusNote.hidden = true;
  }

  async function updateSetting(patch, message) {
    const res = await invoke(api.updateSettings(patch), message);
    if (res) {
      renderSettings();
      renderHotkeyStatus();
      if (res.runtime && Object.prototype.hasOwnProperty.call(res.runtime, 'hotkeyRegistered')) {
        if (state.data.settings.hotkeyEnabled && !res.runtime.hotkeyRegistered) {
          toast('Не удалось зарегистрировать горячую клавишу — возможно, она занята другой программой.', 'error');
        }
      }
    }
  }

  function startHotkeyCapture() {
    state.capturingHotkey = true;
    els.settingHotkeyInput.classList.add('is-capturing');
    els.settingHotkeyInput.value = 'Нажмите сочетание…';
    els.settingHotkeyInput.focus();
  }

  function stopHotkeyCapture() {
    state.capturingHotkey = false;
    els.settingHotkeyInput.classList.remove('is-capturing');
    const settings = state.data.settings;
    els.settingHotkeyInput.value = formatHotkey(settings.hotkey);
  }

  function hotkeyFromEvent(event) {
    const key = event.key;
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;

    let main = '';
    if (key === ' ') main = 'Space';
    else if (/^[a-zA-Z]$/.test(key)) main = key.toUpperCase();
    else if (/^[0-9]$/.test(key)) main = key;
    else if (/^F([1-9]|1[0-2])$/.test(key)) main = key;
    else return null;

    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');

    const isFunction = /^F/.test(main);
    if (parts.length === 0 && !isFunction) return null;

    return [...parts, main].join('+');
  }

  async function handleHotkeyKeydown(event) {
    if (!state.capturingHotkey) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      stopHotkeyCapture();
      return;
    }

    const accelerator = hotkeyFromEvent(event);
    if (!accelerator) return;

    state.capturingHotkey = false;
    els.settingHotkeyInput.classList.remove('is-capturing');
    await updateSetting({ hotkey: accelerator }, 'Горячая клавиша сохранена');
  }

  /* ------------------------------- confirm -------------------------------- */

  function confirmDialog({ title, text, okText }) {
    state.confirmReturn = !els.taskModal.hidden
      ? els.taskModal
      : !els.categoryModal.hidden
        ? els.categoryModal
        : !els.settingsModal.hidden
          ? els.settingsModal
          : !els.noteModal.hidden
            ? els.noteModal
            : null;

    els.confirmTitle.textContent = title || 'Подтверждение';
    els.confirmText.textContent = text || '';
    els.confirmOk.textContent = okText || 'Удалить';
    els.modalBackdrop.hidden = false;
    els.confirmModal.hidden = false;
    els.taskModal.hidden = true;
    els.categoryModal.hidden = true;
    els.settingsModal.hidden = true;
    els.noteModal.hidden = true;

    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function closeConfirm(result) {
    els.confirmModal.hidden = true;
    if (!result && state.confirmReturn) {
      els.modalBackdrop.hidden = false;
      state.confirmReturn.hidden = false;
    } else if (
      !els.taskModal.hidden ||
      !els.categoryModal.hidden ||
      !els.settingsModal.hidden ||
      !els.noteModal.hidden
    ) {
      els.modalBackdrop.hidden = false;
    } else {
      els.modalBackdrop.hidden = true;
    }
    state.confirmReturn = null;
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(result);
    }
  }

  /* -------------------------------- actions ------------------------------- */

  async function toggleTask(taskId, done) {
    const task = currentTask(taskId);
    if (!task) return;
    await invoke(api.toggleTask(taskId, done), done ? 'Задача выполнена' : null);
  }

  async function toggleSubtask(taskId, subtaskId, done) {
    await invoke(api.toggleSubtask(taskId, subtaskId, done));
  }

  async function deleteSubtask(taskId, subtaskId) {
    await invoke(api.deleteSubtask(taskId, subtaskId));
  }

  function openSnoozeMenu(button, taskId) {
    closeSnoozeMenu();
    const task = currentTask(taskId);
    if (!task) return;

    const menu = document.createElement('div');
    menu.className = 'snooze-menu';

    const title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = 'Отложить напоминание';
    menu.appendChild(title);

    const now = Date.now();
    const tomorrow = U.addDays(U.startOfDay(new Date()), 1);
    tomorrow.setHours(9, 0, 0, 0);

    const options = [
      { label: 'Через 10 минут', until: new Date(now + 10 * 60000) },
      { label: 'Через 1 час', until: new Date(now + 60 * 60000) },
      { label: 'Завтра в 09:00', until: tomorrow }
    ];

    for (const option of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = option.label;
      item.addEventListener('click', async () => {
        closeSnoozeMenu();
        await invoke(api.snoozeTask(taskId, option.until.toISOString()), `Напоминание отложено: ${option.label.toLowerCase()}`);
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.right - menuRect.width;
    let top = rect.bottom + 6;
    if (left < 8) left = 8;
    if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 6;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    snoozeMenu = menu;
  }

  function closeSnoozeMenu() {
    if (snoozeMenu) {
      snoozeMenu.remove();
      snoozeMenu = null;
    }
  }

  /* -------------------------------- reminder editor -------------------------------- */

  function reminderLabel(r) {
    const typeLabel = r.type === 'due' ? 'в момент срока' : `за ${U.formatDuration(r.offset)}`;
    return typeLabel;
  }

  function renderReminderEditor() {
    els.reminderList.textContent = '';
    if (state.reminderEditor.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'reminder-empty';
      empty.textContent = 'Напоминания не настроены';
      els.reminderList.appendChild(empty);
      return;
    }
    state.reminderEditor.forEach((r, index) => {
      const item = document.createElement('div');
      item.className = 'reminder-item';
      const typeBadge = document.createElement('span');
      typeBadge.className = `reminder-type ${r.type}`;
      typeBadge.textContent = r.type === 'due' ? 'срок' : 'заранее';
      const value = document.createElement('span');
      value.className = 'reminder-value';
      value.textContent = reminderLabel(r);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-ghost btn-sm reminder-remove';
      remove.title = 'Удалить напоминание';
      remove.textContent = 'Удалить';
      remove.addEventListener('click', () => {
        state.reminderEditor.splice(index, 1);
        renderReminderEditor();
      });
      item.append(typeBadge, value, remove);
      els.reminderList.appendChild(item);
    });
  }

  function addReminderEditor() {
    const existingTypes = new Set(state.reminderEditor.map((r) => r.type));
    let type = 'before';
    let offset = 60;
    if (!existingTypes.has('due')) {
      type = 'due';
      offset = 0;
    } else if (!existingTypes.has('before')) {
      type = 'before';
      offset = 60;
    } else {
      type = 'before';
      offset = 60;
    }
    state.reminderEditor.push({ offset, type });
    renderReminderEditor();
  }

  function loadReminderEditor(task) {
    if (task && Array.isArray(task.reminders) && task.reminders.length > 0) {
      state.reminderEditor = task.reminders.map((r) => ({ offset: Number(r.offset) || 0, type: r.type }));
    } else {
      // По умолчанию: за 1 час + в момент срока (как было раньше)
      state.reminderEditor = [
        { offset: 60, type: 'before' },
        { offset: 0, type: 'due' }
      ];
    }
    renderReminderEditor();
  }

  function loadRecurrenceEditor(task) {
    els.recurrenceTypeRadios.forEach((radio) => {
      radio.checked = false;
    });
    const rec = task && task.recurrence ? task.recurrence : null;
    if (rec) {
      const radio = Array.from(els.recurrenceTypeRadios).find((r) => r.value === rec.type);
      if (radio) radio.checked = true;
      els.recurrenceInterval.value = rec.interval || 1;
      els.recurrenceEndDate.value = rec.endDate ? rec.endDate.slice(0, 10) : '';
      if (rec.type === 'weekly') {
        els.recurrenceWeekdays.hidden = false;
        const days = new Set(rec.daysOfWeek || []);
        els.recurrenceWeekdayCheckboxes.forEach((cb) => {
          cb.checked = days.has(Number(cb.value));
        });
      } else {
        els.recurrenceWeekdays.hidden = true;
      }
    } else {
      els.recurrenceTypeRadios[0].checked = true;
      els.recurrenceInterval.value = 1;
      els.recurrenceEndDate.value = '';
      els.recurrenceWeekdays.hidden = true;
    }
    els.recurrenceOptions.hidden = !rec || rec.type === 'none';
  }

  function buildRecurrenceFromEditor() {
    const checked = Array.from(els.recurrenceTypeRadios).find((r) => r.checked);
    if (!checked || checked.value === 'none') return null;
    const type = checked.value;
    const recurrence = { type, interval: Math.max(1, Number(els.recurrenceInterval.value) || 1) };
    if (type === 'weekly') {
      const days = [];
      els.recurrenceWeekdayCheckboxes.forEach((cb) => {
        if (cb.checked) days.push(Number(cb.value));
      });
      if (days.length > 0) recurrence.daysOfWeek = days;
    }
    const end = els.recurrenceEndDate.value;
    if (end) recurrence.endDate = `${end}T00:00:00.000Z`;
    return recurrence;
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

    els.priorityFilters.addEventListener('click', (event) => {
      const pill = event.target.closest('.filter-pill');
      if (!pill) return;
      $$('.filter-pill').forEach((p) => p.classList.toggle('is-active', p === pill));
      state.priorityFilter = pill.dataset.priority || '';
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
        if (card) toggleSubtask(card.dataset.id, target.dataset.subtaskId, target.checked, target.dataset.parentSubtaskId || null);
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
        } else if (action === 'edit-subtask') {
          startInlineSubtaskEdit(card, button.dataset.subtaskId, button.dataset.parentSubtaskId || null);
        } else if (action === 'delete-subtask') {
          deleteSubtask(taskId, button.dataset.subtaskId, button.dataset.parentSubtaskId || null);
        } else if (action === 'add-sub-subtask') {
          const parentSubtaskId = button.dataset.subtaskId;
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = 'Новая подзадача…';
          input.maxLength = 500;
          input.autocomplete = 'off';
          button.replaceWith(input);
          input.focus();
          input.addEventListener('blur', () => {
            if (input.value.trim()) {
              invoke(api.addSubtask(card.dataset.id, input.value.trim(), parentSubtaskId), 'Подзадача добавлена');
            }
            button = makeIconButton('add-sub-subtask', 'Добавить подзадачу', 'plus');
            button.dataset.subtaskId = parentSubtaskId;
            button.dataset.parentSubtaskId = card.dataset.id;
            button.classList.add('small');
            input.replaceWith(button);
            button.addEventListener('click', (e) => {
              // handled by delegation
            });
          });
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (input.value.trim()) {
                invoke(api.addSubtask(card.dataset.id, input.value.trim(), parentSubtaskId), 'Подзадача добавлена');
              }
              const newBtn = makeIconButton('add-sub-subtask', 'Добавить подзадачу', 'plus');
              newBtn.dataset.subtaskId = parentSubtaskId;
              newBtn.dataset.parentSubtaskId = card.dataset.id;
              newBtn.classList.add('small');
              input.replaceWith(newBtn);
            } else if (e.key === 'Escape') {
              const newBtn = makeIconButton('add-sub-subtask', 'Добавить подзадачу', 'plus');
              newBtn.dataset.subtaskId = parentSubtaskId;
              newBtn.dataset.parentSubtaskId = card.dataset.id;
              newBtn.classList.add('small');
              input.replaceWith(newBtn);
            }
          });
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
      invoke(api.addSubtask(card.dataset.id, value, form.dataset.parentSubtaskId || null), 'Подзадача добавлена');
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
      const res = await invoke(api.addNoteTemplate({ title, content: els.noteContentInput.value }), 'Шаблон заметки сохранён');
      if (res) {
        renderNoteTemplates();
        toast('Шаблон заметки сохранён', 'success');
      }
    });
    els.noteCancelBtn.addEventListener('click', closeNoteModal);
    els.noteModalClose.addEventListener('click', closeNoteModal);
    els.noteDeleteBtn.addEventListener('click', () => {
      if (editingNoteId) deleteNoteWithConfirm(editingNoteId);
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
      state.draft.reminders = template.reminders ? template.reminders.map((r) => ({ offset: r.offset, type: r.type })) : null;
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
        toast(`Импортировано: ${res.result.tasks} задач, ${res.result.categories} категорий${notesPart}`, 'success');
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
          setTimeout(() => { els.updateStatusNote.hidden = true; els.checkUpdatesBtn.hidden = false; }, 3000);
        }
      } catch (err) {
        els.updateStatusNote.textContent = 'Ошибка проверки обновлений.';
        els.updateStatusNote.hidden = false;
        setTimeout(() => { els.updateStatusNote.hidden = true; els.checkUpdatesBtn.hidden = false; }, 3000);
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
      if (snoozeMenu && !event.target.closest('.snooze-menu') && !event.target.closest('[data-action="snooze"]')) {
        closeSnoozeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (snoozeMenu) {
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
      if (modalOpen && !els.taskModal.hidden && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveTask();
        return;
      }
      if (event.key === 'Enter' && document.activeElement === els.subtaskInput && !els.taskModal.hidden) {
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

    const row = card.querySelector(`[data-action="toggle-subtask"][data-subtask-id="${subtaskId}"]`);
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
        await invoke(api.updateSubtask(card.dataset.id, subtaskId, { title: value }, parentSubtaskId), 'Подзадача обновлена');
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
