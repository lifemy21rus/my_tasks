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
    viewMode: 'list',
    categoryId: null,
    filter: 'active',
    search: '',
    sort: 'smart',
    dueFilter: '',
    dueFrom: '',
    dueTo: '',
    dueRangeOpen: false,
    expanded: new Set(),
    expandedNestedSubtasks: new Set(),
    draft: null,
    draftSubtaskAddTarget: null,
    categoryDraft: null,
    noteDraftAttachments: [],
    notePendingAttachments: [],
    capturingHotkey: false,
    confirmReturn: null,
    promptReturn: null,
    lastFocusedTask: null,
    priorityFilter: '',
    statusFilter: '',
    tagFilter: '',
    attachmentsFilter: '',
    activeSmartListId: null,
    calendarMonthOffset: 0,
    calendarMode: 'month',
    calendarAnchor: null,
    dragTaskId: null,
    reminderEditor: [],
    taskColor: null,
    notesArchive: false
  };

  const els = cacheElements();

  const NOTE_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffe66d', '#ff8c42'];

  state.editingNoteId = null;
  state.noteColor = NOTE_COLORS[0];

  function visibleNotes() {
    const query = state.search.trim().toLowerCase();
    return state.data.notes
      .filter((note) => {
        if (state.notesArchive && !note.archived) return false;
        if (!state.notesArchive && note.archived) return false;
        if (!query) return true;
        const tagsText = Array.isArray(note.tags) ? note.tags.join(' ').toLowerCase() : '';
        return (
          note.title.toLowerCase().includes(query) ||
          (note.content || '').toLowerCase().includes(query) ||
          tagsText.includes(query)
        );
      })
      .sort((a, b) => {
        const at = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
        const bt = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
        return bt - at;
      });
  }

  function openNoteModal(noteId = null) {
    return noteModal.openNoteModal(noteId);
  }

  function closeNoteModal() {
    return noteModal.closeNoteModal();
  }

  async function saveNote() {
    return noteModal.saveNote();
  }

  async function archiveNoteWithConfirm(noteId) {
    return noteModal.archiveNoteWithConfirm(noteId);
  }

  async function deleteNoteWithConfirm(noteId) {
    const note = state.data.notes.find((n) => n.id === noteId);
    if (!note) return;
    const snapshot = JSON.parse(JSON.stringify(note));
    const confirmed = await confirmDialog({
      title: 'Удалить заметку навсегда?',
      text: `«${note.title}» будет удалена. Действие можно отменить сразу после удаления.`,
      okText: 'Удалить'
    });
    if (!confirmed) return;
    const res = await invoke(api.deleteNote(noteId));
    if (res) {
      toast('Заметка удалена', 'success', {
        label: 'Отменить',
        onClick: async () => {
          await invoke(api.restoreNote(snapshot), 'Заметка восстановлена');
        }
      });
      if (!els.noteModal.hidden) closeNoteModal();
    }
  }

  /* ------------------------------- helpers ------------------------------- */

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

  function toast(message, type = 'info', action) {
    if (!message) return;
    const node = document.createElement('div');
    node.className = `toast${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
    const dot = document.createElement('span');
    dot.className = 'toast-dot';
    const text = document.createElement('span');
    text.textContent = message;
    node.append(dot, text);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 200);
    };
    if (action && action.label && typeof action.onClick === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', async () => {
        try {
          await action.onClick();
        } finally {
          close();
        }
      });
      node.appendChild(btn);
    }
    els.toastStack.appendChild(node);
    setTimeout(close, action ? 6000 : type === 'error' ? 4800 : 2800);
  }

  function applyState(res) {
    if (!res) return;
    if (res.data) state.data = res.data;
    if (res.runtime) state.runtime = res.runtime;
    if (res.runtime && res.runtime.notice) {
      const notice = res.runtime.notice;
      if (typeof notice === 'string') toast(notice, 'error');
      else if (notice && typeof notice === 'object') {
        toast(notice.message || '', notice.type || 'info');
      }
    }
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

  let noteModal;

  const notes = window.AppNotes.create({
    els,
    state,
    visibleNotesFn: visibleNotes,
    makeIconButton,
    onEditNote: (id) => noteModal.openNoteModal(id),
    onArchiveNote: (id) => archiveNoteWithConfirm(id),
    onDeleteNote: (id) => deleteNoteWithConfirm(id),
    onToggleNote: async (id, done) => {
      const res = await invoke(api.toggleNote(id, done));
      if (!res) return;
      toast(done ? 'Заметка выполнена' : 'Заметка возвращена в работу', 'success', {
        label: 'Отменить',
        onClick: async () => {
          await invoke(api.toggleNote(id, !done));
        }
      });
    },
    onFilterTag: (tag) => {
      if (!tag) return;
      if (state.view === 'notes') {
        state.search = tag;
      } else {
        state.tagFilter = tag;
      }
      renderAll();
    },
    onOpenAttachment: (id) => {
      if (!id) return;
      invoke(api.openAttachment(id));
    }
  });

  function renderNotes() {
    return notes.renderNotes();
  }

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

  const categories = window.AppCategories.create({
    els,
    state,
    U,
    setSvgIcon,
    api,
    invoke,
    confirmDialog: modals.confirmDialog,
    currentCategory,
    toast,
    renderAll: () => renderAll()
  });

  // Сохраняем ссылку для обратного вызова изменения цвета
  categories._state = state;

  noteModal = window.AppNoteModal.create({
    els,
    state,
    api,
    invoke,
    confirmDialog: modals.confirmDialog,
    toast
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
    U
  });

  function renderCategories() {
    return categories.renderCategories();
  }

  function renderCategoryOptions() {
    return categories.renderCategoryOptions();
  }

  /* ------------------------------ filtering ------------------------------ */

  /* ------------------------------- render -------------------------------- */

  const view = window.AppView.create({
    els,
    state,
    U,
    $$,
    getVisibleTasks,
    computeCounts,
    viewInfo,
    visibleNotes,
    renderCategories,
    renderAll
  });

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
    return view.renderSidebar();
  }

  function renderHeader() {
    return view.renderHeader();
  }

  function syncFilters() {
    return view.syncFilters();
  }

  const taskList = window.AppTaskList.create({
    els,
    state,
    U,
    makeIconButton,
    getVisibleTasks,
    visibleNotes,
    currentCategory,
    currentTask,
    invoke,
    api,
    renderTaskList: () => taskList.renderTaskList()
  });

  function renderTaskList() {
    return taskList.renderTaskList();
  }

  function renderHotkeyStatus() {
    return view.renderHotkeyStatus();
  }

  /* -------------------------------- views -------------------------------- */

  function setView(nextView, categoryId) {
    return view.setView(nextView, categoryId);
  }

  /* ------------------------------ task modal ------------------------------ */

  function openTaskModal(taskId, options = {}) {
    try {
      taskModal.openTaskModal(taskId, options);
    } catch (err) {
      toast(
        'Ошибка открытия модалки задачи: ' + (err && err.message ? err.message : String(err)),
        'error'
      );
    }
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

    const tags = els.taskTagsInput
      ? (() => {
          const seen = new Set();
          return els.taskTagsInput.value
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
    const status = els.taskStatusInput ? els.taskStatusInput.value : draft.status || 'todo';
    const attachments =
      state.draft && Array.isArray(state.draft.attachments) ? state.draft.attachments.slice() : [];
    const patch = {
      title,
      description: els.taskDescInput.value,
      dueAt,
      priority: els.taskPriorityInput.value,
      status,
      done: status === 'done',
      color: state.taskColor || undefined,
      estimatedMinutes: Number(els.taskEstimatedMinutes.value) || undefined,
      actualMinutes: Number(els.taskActualMinutes.value) || undefined,
      categoryId: els.taskCategoryInput.value || null,
      tags,
      attachments,
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
        // Файлы прикреплены к сохранённой задаче — сбрасываем список «черновых».
        if (state.draft) state.draft.pendingAttachments = [];
        closeTaskModal();
        return;
      }

      // existing task: update fields first
      const res = await invoke(api.updateTask(draft.id, patch));
      if (!res) return;

      const existing = currentTask(draft.id);
      await syncSubtasks(draft.id, draft.subtasks || [], (existing && existing.subtasks) || []);

      const finalState = await api.getState();
      if (finalState && finalState.ok) {
        applyState(finalState);
        renderAll();
      }
      toast('Изменения сохранены', 'success');
      // Файлы прикреплены к сохранённой задаче — сбрасываем список «черновых».
      if (state.draft) state.draft.pendingAttachments = [];
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
    return categories.openCategoryModal(categoryId);
  }

  function closeCategoryModal() {
    return categories.closeCategoryModal();
  }

  async function saveCategory() {
    return categories.saveCategory();
  }

  async function deleteCategoryWithConfirm() {
    return categories.deleteCategoryWithConfirm();
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

  function promptDialog(options) {
    return modals.promptDialog(options);
  }

  function closePrompt(result) {
    return modals.closePrompt(result);
  }

  function submitPrompt() {
    return modals.submitPrompt();
  }

  /* -------------------------------- actions ------------------------------- */

  async function toggleTask(taskId, done) {
    const task = currentTask(taskId);
    if (!task) return;
    const res = await invoke(api.toggleTask(taskId, done));
    if (!res) return;
    const message = done ? 'Задача выполнена' : 'Задача возвращена в работу';
    toast(message, 'success', {
      label: 'Отменить',
      onClick: async () => {
        await invoke(
          api.toggleTask(taskId, !done),
          done ? 'Задача возвращена в работу' : 'Задача выполнена'
        );
      }
    });
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
    window.AppShellEvents.bind({
      $$,
      els,
      state,
      api,
      invoke,
      confirmDialog,
      promptDialog,
      setView,
      openCategoryModal,
      openTaskModal,
      openNoteModal,
      openSettings,
      renderAll,
      renderTaskList,
      addReminderEditor,
      currentCriteria: () => view.currentCriteria(),
      applyCriteria: (c) => view.applyCriteria(c),
      toast
    });

    // task list delegation
    taskList.bindTaskListEvents({
      toggleSelection: typeof toggleSelection === 'function' ? toggleSelection : null,
      toggleTask,
      toggleSubtask,
      openTaskModal,
      deleteTaskWithConfirm,
      openSnoozeMenu,
      deleteSubtask,
      invoke,
      api,
      onFilterTag: (tag) => {
        if (!tag) return;
        state.tagFilter = tag;
        renderAll();
      }
    });

    // modal form bindings
    window.AppModalFormEvents.bind({
      els,
      state,
      U,
      closeTaskModal,
      saveTask,
      deleteTaskWithConfirm,
      saveNote,
      closeNoteModal,
      addDraftSubtask,
      saveCategory,
      closeCategoryModal,
      deleteCategoryWithConfirm
    });

    // settings modal and data actions
    window.AppSettingsEvents.bind({
      els,
      state,
      api,
      invoke,
      toast,
      confirmDialog,
      promptDialog,
      closeSettings,
      updateSetting,
      startHotkeyCapture,
      handleHotkeyKeydown,
      renderSettings: () => modals.renderSettings(),
      renderTagManageList: () => modals.renderTagManageList()
    });

    // global UI events (modals, shortcuts)
    window.AppGlobalEvents.bind({
      els,
      state,
      closeConfirm,
      closePrompt,
      submitPrompt,
      closeTaskModal,
      closeCategoryModal,
      closeSettings,
      closeNoteModal,
      closeSnoozeMenu,
      openTaskModal,
      saveTask,
      addDraftSubtask
    });

    // main-process events
    window.AppIpcEvents.bind({
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
    });
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
