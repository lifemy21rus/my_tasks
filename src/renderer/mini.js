'use strict';

(function () {
  const U = window.AppUtils;
  const api = window.api;

  const state = {
    data: { settings: {}, categories: [], tasks: [], notes: [] },
    runtime: {},
    errorTimer: null,
    expanded: new Set(),
    tab: 'tasks'
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    date: $('mini-date'),
    count: $('mini-count'),
    overdue: $('mini-overdue'),
    list: $('mini-list'),
    noteList: $('mini-note-list'),
    empty: $('mini-empty'),
    emptyTitle: $('mini-empty-title'),
    emptyText: $('mini-empty-text'),
    scroll: $('mini-scroll'),
    expand: $('mini-expand'),
    open: $('mini-open'),
    hide: $('mini-hide'),
    quickInput: $('mini-quick-input'),
    quickAddBtn: $('mini-quick-add'),
    tabTasks: $('mini-tab-tasks'),
    tabNotes: $('mini-tab-notes'),
    tabTasksCount: $('mini-tab-tasks-count'),
    tabNotesCount: $('mini-tab-notes-count'),
    toast: $('mini-toast')
  };

  function applyTheme() {
    document.documentElement.dataset.theme = state.data.settings.theme || 'system';
  }

  function applyState(res) {
    if (!res) return;
    if (res.data) state.data = res.data;
    if (res.runtime) state.runtime = res.runtime;
    applyTheme();
  }

  async function refresh() {
    try {
      const res = await api.getState();
      if (!res || !res.ok) {
        showError((res && res.error) || 'Не удалось загрузить задачи');
        return;
      }
      applyState(res);
      render();
    } catch (err) {
      showError('Не удалось загрузить задачи');
    }
  }

  function allTasks() {
    return [...state.data.tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return compareWithinGroup(a, b);
    });
  }

  function bucketOf(task, now) {
    if (!task.dueAt) return 'none';
    const due = Date.parse(task.dueAt);
    if (!Number.isFinite(due)) return 'none';
    if (due < now.getTime()) return 'overdue';
    if (U.isSameDay(due, now)) return 'today';
    if (U.isSameDay(due, U.addDays(now, 1))) return 'tomorrow';
    return 'later';
  }

  function compareWithinGroup(a, b) {
    const pa = U.priorityRank(a.priority);
    const pb = U.priorityRank(b.priority);
    if (pa !== pb) return pa - pb;
    const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
    const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
    if (ad !== bd) return ad - bd;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }

  function groupedTasks(tasks) {
    const now = new Date();
    const groups = [
      { key: 'overdue', label: 'Просрочено', tone: 'overdue', items: [] },
      { key: 'today', label: 'Сегодня', tone: '', items: [] },
      { key: 'tomorrow', label: 'Завтра', tone: '', items: [] },
      { key: 'later', label: 'Позже', tone: '', items: [] },
      { key: 'none', label: 'Без срока', tone: '', items: [] }
    ];
    const map = new Map(groups.map((group) => [group.key, group]));

    for (const task of tasks) {
      const key = bucketOf(task, now);
      map.get(key).items.push(task);
    }

    for (const group of groups) group.items.sort(compareWithinGroup);
    return groups.filter((group) => group.items.length > 0);
  }

  function categoryOf(id) {
    return state.data.categories.find((category) => category.id === id) || null;
  }

  function formatDateLabel() {
    const d = new Date();
    const weekday = U.WEEKDAYS[d.getDay()];
    return `${d.getDate()} ${U.MONTHS_GEN[d.getMonth()]}, ${weekday}`;
  }

  function renderTask(task) {
    const row = document.createElement('div');
    row.className = 'mini-task' + (task.done ? ' is-done' : '');
    row.dataset.id = task.id;
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    row.title = task.description ? `${task.title}\n${task.description}` : task.title;

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'mini-check';
    check.dataset.action = 'toggle';
    check.checked = Boolean(task.done);
    check.setAttribute('aria-label', `Выполнить: ${task.title}`);

    const body = document.createElement('div');
    body.className = 'mini-task-body';

    const title = document.createElement('div');
    title.className = 'mini-task-title';
    title.textContent = task.title;
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'mini-task-meta';

    if (task.dueAt) {
      const due = U.formatDueChip(task.dueAt);
      const dueNode = document.createElement('span');
      dueNode.className = `mini-due tone-${due.tone}`;
      dueNode.textContent = due.text;
      dueNode.title = due.title;
      meta.appendChild(dueNode);
    }

    const category = categoryOf(task.categoryId);
    if (category) {
      const cat = document.createElement('span');
      cat.className = 'mini-cat';
      cat.title = category.name;
      const dot = document.createElement('span');
      dot.className = 'mini-cat-dot';
      dot.style.background = category.color;
      const name = document.createElement('span');
      name.className = 'mini-cat-name';
      name.textContent = category.name;
      cat.append(dot, name);
      meta.appendChild(cat);
    }

    const subs = task.subtasks || [];
    if (subs.length > 0) {
      const doneCount = subs.filter((sub) => sub.done).length;

      const subsToggle = document.createElement('button');
      subsToggle.className = 'mini-subs-toggle' + (state.expanded.has(task.id) ? ' is-open' : '');
      subsToggle.type = 'button';
      subsToggle.setAttribute('aria-label', state.expanded.has(task.id) ? 'Скрыть подзадачи' : 'Показать подзадачи');
      subsToggle.textContent = state.expanded.has(task.id) ? '▾' : '▸';
      subsToggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.expanded.has(task.id)) state.expanded.delete(task.id);
        else state.expanded.add(task.id);
        render();
      });
      meta.appendChild(subsToggle);

      const subsCount = document.createElement('span');
      subsCount.className = 'mini-subs';
      subsCount.textContent = `✓ ${doneCount}/${subs.length}`;
      meta.appendChild(subsCount);

      if (state.expanded.has(task.id)) {
        const subsList = document.createElement('div');
        subsList.className = 'mini-subtasks';
        for (const sub of subs) {
          const subRow = document.createElement('div');
          subRow.className = 'mini-subtask';

          const subCheck = document.createElement('input');
          subCheck.type = 'checkbox';
          subCheck.className = 'mini-sub-check';
          subCheck.dataset.taskId = task.id;
          subCheck.dataset.subtaskId = sub.id;
          subCheck.checked = Boolean(sub.done);
          subCheck.addEventListener('change', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            try {
              const res = await api.toggleSubtask(task.id, sub.id, event.target.checked);
              if (res && res.ok) {
                applyState(res);
                render();
              }
            } catch (_) {
              // ignore
            }
          });

          const subTitle = document.createElement('span');
          subTitle.className = 'mini-subtitle';
          subTitle.textContent = sub.title;
          if (sub.done) {
            subTitle.style.textDecoration = 'line-through';
            subTitle.style.opacity = '0.55';
          }

          subRow.append(subCheck, subTitle);
          subsList.appendChild(subRow);
        }
        body.appendChild(subsList);
      }
    }

    if (task.priority === 'high') {
      const priority = document.createElement('span');
      priority.className = 'mini-priority';
      priority.textContent = 'Важно';
      meta.appendChild(priority);
    }

    body.appendChild(meta);
    row.append(check, body);
    return row;
  }

  function allNotes() {
    return state.data.notes || [];
  }

  function renderNote(note) {
    const row = document.createElement('div');
    row.className = 'mini-note' + (note.done ? ' is-done' : '');
    row.dataset.id = note.id;
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    row.title = note.content ? `${note.title}\n${note.content}` : note.title;
    row.style.setProperty('--note-color', note.color || '#ff6b6b');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'mini-check mini-note-check';
    check.dataset.action = 'toggle-note';
    check.checked = Boolean(note.done);
    check.setAttribute('aria-label', `Выполнить: ${note.title}`);

    const body = document.createElement('div');
    body.className = 'mini-note-body';

    const title = document.createElement('div');
    title.className = 'mini-note-title';
    title.textContent = note.title;
    body.appendChild(title);

    if (note.content) {
      const content = document.createElement('div');
      content.className = 'mini-note-content';
      content.textContent = note.content;
      body.appendChild(content);
    }

    row.append(check, body);
    return row;
  }

  function renderNoteList(notes) {
    els.noteList.textContent = '';

    els.count.textContent = U.noteCount(notes.length);
    els.overdue.hidden = true;
    els.overdue.textContent = '';

    if (notes.length === 0) {
      els.empty.hidden = false;
      els.emptyTitle.textContent = 'Заметок пока нет';
      els.emptyText.textContent = 'Добавьте первую заметку — панель всегда под рукой.';
      return;
    }

    els.empty.hidden = true;
    const fragment = document.createDocumentFragment();

    for (const group of U.groupNotes(notes)) {
      const section = document.createElement('section');
      section.className = 'mini-group';

      const heading = document.createElement('div');
      heading.className = `mini-group-title${group.tone ? ` tone-${group.tone}` : ''}`;

      const label = document.createElement('span');
      label.textContent = group.label;

      const count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = String(group.items.length);

      heading.append(label, count);
      section.appendChild(heading);

      for (const note of group.items) section.appendChild(renderNote(note));
      fragment.appendChild(section);
    }

    els.noteList.appendChild(fragment);
  }

  function render() {
    els.date.textContent = formatDateLabel();

    const tasks = allTasks();
    const notes = allNotes();
    const isNotes = state.tab === 'notes';

    els.tabTasksCount.textContent = String(tasks.length);
    els.tabNotesCount.textContent = String(notes.length);

    els.list.hidden = isNotes;
    els.noteList.hidden = !isNotes;

    for (const tab of document.querySelectorAll('.mini-tab')) {
      const active = tab.dataset.tab === state.tab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    }

    // Кнопка «Новая задача» заменена полем быстрого ввода: подсказка зависит от вкладки.
    els.quickInput.placeholder = isNotes ? 'Новая заметка…' : 'Новая задача…';
    els.quickAddBtn.title = isNotes ? 'Добавить заметку' : 'Добавить задачу';
    els.quickAddBtn.setAttribute('aria-label', isNotes ? 'Добавить заметку' : 'Добавить задачу');

    if (isNotes) {
      renderNoteList(notes);
      return;
    }

    renderTaskList(tasks);
  }

  function renderTaskList(tasks) {
    const overdueCount = state.data.tasks.filter((task) => {
      if (task.done) return false;
      if (!task.dueAt) return false;
      return Date.parse(task.dueAt) < Date.now();
    }).length;

    els.count.textContent = U.taskCount(tasks.length);
    els.overdue.hidden = overdueCount === 0;
    els.overdue.textContent = overdueCount > 0 ? `Просрочено: ${overdueCount}` : '';

    els.list.textContent = '';

    if (tasks.length === 0) {
      els.empty.hidden = false;
      const total = state.data.tasks.length;
      if (total === 0) {
        els.emptyTitle.textContent = 'Задач пока нет';
        els.emptyText.textContent = 'Добавьте первую задачу — панель всегда под рукой.';
      } else {
        els.emptyTitle.textContent = 'Все задачи выполнены';
        els.emptyText.textContent = 'Можно отдохнуть или добавить новую.';
      }
      return;
    }

    els.empty.hidden = true;
    const groups = groupedTasks(tasks);
    const fragment = document.createDocumentFragment();

    for (const group of groups) {
      const section = document.createElement('section');
      section.className = 'mini-group';

      const heading = document.createElement('div');
      heading.className = `mini-group-title${group.tone ? ` tone-${group.tone}` : ''}`;

      const label = document.createElement('span');
      label.textContent = group.label;

      const count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = String(group.items.length);

      heading.append(label, count);
      section.appendChild(heading);

      for (const task of group.items) section.appendChild(renderTask(task));
      fragment.appendChild(section);
    }

    els.list.appendChild(fragment);
  }

  async function toggleTask(id, done) {
    const task = state.data.tasks.find((t) => t.id === id);
    if (!task) return;
    if (task.done === done) return;

    const row = els.list.querySelector(`.mini-task[data-id="${id}"]`);
    if (row) row.classList.add('is-completing');

    try {
      const res = await api.toggleTask(id, done);
      if (!res || !res.ok) {
        showError((res && res.error) || 'Не удалось изменить задачу');
        if (row) row.classList.remove('is-completing');
        await refresh();
        return;
      }
      applyState(res);
      render();
    } catch (err) {
      showError('Не удалось изменить задачу');
      if (row) row.classList.remove('is-completing');
    }
  }

  async function toggleSubtask(taskId, subtaskId, done) {
    const task = state.data.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const subtask = (task.subtasks || []).find((s) => s.id === subtaskId);
    if (!subtask) return;
    if (subtask.done === done) return;

    try {
      const res = await api.toggleSubtask(taskId, subtaskId, done);
      if (!res || !res.ok) {
        showError((res && res.error) || 'Не удалось изменить подзадачу');
        await refresh();
        return;
      }
      applyState(res);
      render();
    } catch (err) {
      showError('Не удалось изменить подзадачу');
    }
  }

  async function toggleNote(id, done) {
    const note = allNotes().find((n) => n.id === id);
    if (!note) return;
    if (note.done === done) return;

    const row = els.noteList.querySelector(`.mini-note[data-id="${id}"]`);
    if (row) row.classList.add('is-completing');

    try {
      const res = await api.toggleNote(id, done);
      if (!res || !res.ok) {
        showError((res && res.error) || 'Не удалось изменить заметку');
        if (row) row.classList.remove('is-completing');
        await refresh();
        return;
      }
      applyState(res);
      render();
    } catch (err) {
      showError('Не удалось изменить заметку');
      if (row) row.classList.remove('is-completing');
    }
  }

  function showError(message) {
    if (!message) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    if (state.errorTimer) clearTimeout(state.errorTimer);
    state.errorTimer = setTimeout(() => {
      els.toast.hidden = true;
      state.errorTimer = null;
    }, 4000);
  }

  function expandApp(taskId) {
    api.expand(taskId || null);
  }

  function bindEvents() {
    els.list.addEventListener('change', (event) => {
      const target = event.target;
      if (!target || target.dataset.action !== 'toggle') return;
      const row = target.closest('.mini-task');
      if (!row) return;
      toggleTask(row.dataset.id, target.checked);
    });

    els.list.addEventListener('click', (event) => {
      if (event.target.closest('.mini-check')) return;
      if (event.target.closest('.mini-sub-check')) return;
      if (event.target.closest('.mini-subs-toggle')) return;

      const subRow = event.target.closest('.mini-subtask');
      if (subRow) {
        event.preventDefault();
        event.stopPropagation();
        const subCheck = subRow.querySelector('.mini-sub-check');
        if (subCheck) {
          const taskId = subCheck.dataset.taskId;
          const subtaskId = subCheck.dataset.subtaskId;
          toggleSubtask(taskId, subtaskId, !(subCheck.checked));
        }
        return;
      }

      // Задача больше не переключается при клике по строке:
      // отмечать выполнение можно только галочкой (через событие change).
      return;
    });

    els.list.addEventListener('dblclick', (event) => {
      const row = event.target.closest('.mini-task');
      if (!row) return;
      expandApp(row.dataset.id);
    });

    els.list.addEventListener('keydown', (event) => {
      const row = event.target.closest('.mini-task');
      if (!row) return;
      const check = row.querySelector('.mini-check');
      if (event.key === ' ') {
        event.preventDefault();
        toggleTask(row.dataset.id, !(check && check.checked));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        expandApp(row.dataset.id);
      }
    });

    els.noteList.addEventListener('change', (event) => {
      const target = event.target;
      if (!target || target.dataset.action !== 'toggle-note') return;
      const row = target.closest('.mini-note');
      if (!row) return;
      toggleNote(row.dataset.id, target.checked);
    });

    els.noteList.addEventListener('click', (event) => {
      if (event.target.closest('.mini-note-check')) return;

      const row = event.target.closest('.mini-note');
      if (!row) return;
      api.focusNote(row.dataset.id);
    });

    els.noteList.addEventListener('keydown', (event) => {
      const row = event.target.closest('.mini-note');
      if (!row) return;
      const check = row.querySelector('.mini-note-check');
      if (event.key === ' ') {
        event.preventDefault();
        toggleNote(row.dataset.id, !(check && check.checked));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        api.focusNote(row.dataset.id);
      }
    });

    for (const tab of document.querySelectorAll('.mini-tab')) {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (!target || target === state.tab) return;
        state.tab = target;
        els.scroll.scrollTop = 0;
        render();
      });
    }

    els.expand.addEventListener('click', () => expandApp());
    els.open.addEventListener('click', () => expandApp());
    els.hide.addEventListener('click', () => api.hideMini());

    // Быстрый ввод работает для обеих вкладок: задачи — на «Задачах», заметки — на «Заметках».
    async function addQuickItem() {
      const value = els.quickInput.value.trim();
      if (!value) return;
      const isNotes = state.tab === 'notes';
      try {
        const res = isNotes ? await api.addNote({ title: value }) : await api.addTask({ title: value });
        if (!res || !res.ok) {
          showError((res && res.error) || (isNotes ? 'Не удалось добавить заметку' : 'Не удалось добавить задачу'));
          return;
        }
        els.quickInput.value = '';
        applyState(res);
        render();
      } catch (err) {
        showError(isNotes ? 'Не удалось добавить заметку' : 'Не удалось добавить задачу');
      }
    }

    els.quickAddBtn.addEventListener('click', addQuickItem);
    els.quickInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addQuickItem();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        api.hideMini();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        // На вкладке «Заметки» Ctrl+N создаёт заметку, иначе — задачу.
        if (state.tab === 'notes') api.newNote();
        else api.newTask();
      }
    });

    if (api.onStateChanged) api.onStateChanged(() => refresh());
  }

  async function init() {
    bindEvents();
    await refresh();
    setInterval(render, 60000);
  }

  init();
})();
