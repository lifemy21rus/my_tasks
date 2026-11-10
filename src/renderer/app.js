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
    return state.data.notes
      .filter((note) => {
        if (state.notesArchive && !note.archived) return false;
        if (!state.notesArchive && note.archived) return false;
        if (!query) return true;
        return (
          note.title.toLowerCase().includes(query) ||
          (note.content || '').toLowerCase().includes(query)
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
    const confirmed = await confirmDialog({
      title: 'Удалить заметку навсегда?',
      text: `«${note.title}» будет удалена без возможности восстановления.`,
      okText: 'Удалить'
    });
    if (!confirmed) return;
    const res = await invoke(api.deleteNote(noteId), 'Заметка удалена');
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

  let noteModal;

  const notes = window.AppNotes.create({
    els,
    state,
    visibleNotesFn: visibleNotes,
    makeIconButton,
    onEditNote: (id) => noteModal.openNoteModal(id),
    onArchiveNote: (id) => archiveNoteWithConfirm(id),
    onDeleteNote: (id) => deleteNoteWithConfirm(id),
    onToggleNote: (id, done) => invoke(api.toggleNote(id, done))
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
    currentCategory
  });

  // Сохраняем ссылку для обратного вызова изменения цвета
  categories._state = state;

  noteModal = window.AppNoteModal.create({
    els,
    state,
    api,
    invoke,
    confirmDialog: modals.confirmDialog
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

  function renderCategoryColorGrid() {
    return categories.renderCategoryColorGrid();
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
      toast('Ошибка открытия модалки задачи: ' + (err && err.message ? err.message : String(err)), 'error');
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
    window.AppShellEvents.bind({
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
      addReminderEditor
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
      api
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
      api,
      invoke,
      toast,
      confirmDialog,
      closeSettings,
      updateSetting,
      startHotkeyCapture,
      handleHotkeyKeydown
    });

    // global UI events (modals, shortcuts)
    window.AppGlobalEvents.bind({
      els,
      state,
      closeConfirm,
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
