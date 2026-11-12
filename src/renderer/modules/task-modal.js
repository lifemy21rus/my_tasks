'use strict';

(function () {
  const TASK_COLORS = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#84cc16',
    '#22c55e',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6'
  ];

  function mapDraftSubtask(sub) {
    return {
      id: sub.id || null,
      title: sub.title,
      done: Boolean(sub.done),
      subtasks: (sub.subtasks || []).map(mapDraftSubtask)
    };
  }

  function renderTaskColorGrid(ctx) {
    const { els, state } = ctx;
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
        renderTaskColorGrid(ctx);
      });
      els.taskColorGrid.appendChild(swatch);
    }
  }

  function createTaskModalModule(ctx) {
    const {
      els,
      state,
      api,
      invoke,
      toast,
      renderCategoryOptions,
      renderDraftSubtasks,
      updateSubtaskCounter,
      loadReminderEditor,
      loadRecurrenceEditor,
      currentTask,
      U
    } = ctx;

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

    function syncTaskTagsInput(tags) {
      if (!els.taskTagsInput) return;
      els.taskTagsInput.value = tags.join(', ');
      renderTaskTagChips();
    }

    function renderTaskTagChips() {
      if (!els.taskTagsChips || !els.taskTagsInput) return;
      const tags = parseTagsInput(els.taskTagsInput.value);
      els.taskTagsChips.textContent = '';
      for (const tag of tags) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip tag-chip-removable';
        chip.dataset.tag = tag;
        chip.title = `Удалить тег: ${tag}`;
        chip.textContent = tag;
        chip.addEventListener('click', () => {
          const next = parseTagsInput(els.taskTagsInput.value).filter((t) => t !== tag);
          syncTaskTagsInput(next);
          els.taskTagsInput.focus();
        });
        els.taskTagsChips.appendChild(chip);
      }
    }

    if (els.taskTagsInput) {
      els.taskTagsInput.addEventListener('input', renderTaskTagChips);
      els.taskTagsInput.addEventListener('change', renderTaskTagChips);
    }

    function openTaskModal(taskId, options = {}) {
      const settings = state.data.settings;
      const task = taskId ? currentTask(taskId) : null;

      if (task) {
        const split = U.splitISODateTime(task.dueAt);
        state.draft = {
          id: task.id,
          title: task.title,
          description: task.description || '',
          dueDate: split.date,
          dueTime: task.dueAt ? split.time : '',
          priority: task.priority,
          status: task.status || (task.done ? 'done' : 'todo'),
          color: task.color || null,
          categoryId: task.categoryId || '',
          estimatedMinutes: task.estimatedMinutes || null,
          actualMinutes: task.actualMinutes || null,
          tags: Array.isArray(task.tags) ? task.tags.slice() : [],
          reminders: task.reminders
            ? task.reminders.map((r) => ({ offset: r.offset, type: r.type }))
            : null,
          recurrence: task.recurrence ? { ...task.recurrence } : null,
          subtasks: (task.subtasks || []).map(mapDraftSubtask),
          attachments: Array.isArray(task.attachments) ? task.attachments.slice() : [],
          pendingAttachments: []
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
          status: 'todo',
          color: null,
          estimatedMinutes: null,
          actualMinutes: null,
          tags: [],
          categoryId: preset.categoryId || (state.view === 'category' ? state.categoryId : ''),
          reminders: settings.defaultRemindAtDue !== false ? defaultReminders : null,
          recurrence: null,
          subtasks: [],
          attachments: [],
          pendingAttachments: []
        };
        els.taskModalTitle.textContent = 'Новая задача';
        els.taskDeleteBtn.hidden = true;
      }

      els.taskTitleInput.value = state.draft.title;
      els.taskDescInput.value = state.draft.description;
      els.taskDateInput.value = state.draft.dueDate;
      els.taskTimeInput.value = state.draft.dueTime || '18:00';
      els.taskPriorityInput.value = state.draft.priority;
      if (els.taskStatusInput) els.taskStatusInput.value = state.draft.status || 'todo';
      els.taskEstimatedMinutes.value = state.draft.estimatedMinutes ?? '';
      els.taskActualMinutes.value = state.draft.actualMinutes ?? '';
      if (els.taskTagsInput) els.taskTagsInput.value = (state.draft.tags || []).join(', ');
      renderTaskTagChips();
      renderTaskAttachments();
      loadReminderEditor(state.draft.id ? currentTask(state.draft.id) : state.draft);
      loadRecurrenceEditor(state.draft.id ? currentTask(state.draft.id) : state.draft);
      els.taskTitleError.hidden = true;

      renderCategoryOptions();
      state.draftSubtaskAddTarget = null;
      els.subtaskInput.value = '';
      els.subtaskInput.placeholder = 'Название подзадачи';
      renderDraftSubtasks();
      updateSubtaskCounter();

      state.taskColor = state.draft.color || null;
      renderTaskColorGrid(ctx);

      els.modalBackdrop.hidden = false;
      els.taskModal.hidden = false;
      els.confirmModal.hidden = true;
      els.categoryModal.hidden = true;
      els.settingsModal.hidden = true;
      els.noteModal.hidden = true;
      setTimeout(() => els.taskTitleInput.focus(), 30);
    }

    function closeTaskModal() {
      els.taskModal.hidden = true;
      els.modalBackdrop.hidden = true;
      discardPendingAttachments();
      state.draft = null;
      state.draftSubtaskAddTarget = null;
    }

    // Файлы, прикреплённые в текущей сессии редактирования, но не сохранённые,
    // удаляются из хранилища, чтобы не оставлять «осиротевшие» файлы.
    function discardPendingAttachments() {
      const draft = state.draft;
      if (!draft || !Array.isArray(draft.pendingAttachments)) return;
      const ids = draft.pendingAttachments.slice();
      draft.pendingAttachments = [];
      for (const id of ids) {
        try {
          const result = api.deleteAttachment(id);
          if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch (_) {}
      }
    }

    function renderTaskAttachments() {
      if (!els.taskAttachmentList) return;
      els.taskAttachmentList.textContent = '';
      const draft = state.draft;
      const ids = draft && Array.isArray(draft.attachments) ? draft.attachments : [];
      const items = window.AppAttachments.collectAttachments(state, ids);
      if (els.taskAttachmentAddBtn) els.taskAttachmentAddBtn.disabled = false;
      if (els.taskAttachmentHint) els.taskAttachmentHint.hidden = true;
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'field-hint';
        empty.textContent = 'Нет вложений';
        els.taskAttachmentList.appendChild(empty);
        return;
      }
      for (const att of items) {
        els.taskAttachmentList.appendChild(window.AppAttachments.createRow(att));
      }
    }

    // saveTask: централизовано в app.js (modal-form-events)

    async function deleteTaskWithConfirm(taskId) {
      const task = currentTask(taskId);
      if (!task) return;
      const snapshot = JSON.parse(JSON.stringify(task));
      const confirmed = await ctx.confirmDialog({
        title: 'Удалить задачу?',
        text: `«${task.title}» будет удалена. Действие можно отменить сразу после удаления.`,
        okText: 'Удалить'
      });
      if (!confirmed) return;
      const res = await invoke(api.deleteTask(taskId));
      if (res) {
        if (typeof toast === 'function') {
          toast('Задача удалена', 'success', {
            label: 'Отменить',
            onClick: async () => {
              await invoke(api.restoreTask(snapshot), 'Задача восстановлена');
            }
          });
        }
        ctx.renderAll();
      }
    }

    if (els.taskAttachmentAddBtn) {
      els.taskAttachmentAddBtn.addEventListener('click', async () => {
        const draft = state.draft;
        if (!draft) return;
        const taskId = draft.id || null;
        // Для новой задачи файл сначала копируется в хранилище без привязки
        // и связывается с задачей при сохранении.
        const res = await invoke(
          api.addAttachmentPick(taskId ? { taskId } : {}),
          'Файл прикреплён'
        );
        const attachment = res && res.result;
        if (!attachment || !attachment.id) return;
        if (!Array.isArray(draft.attachments)) draft.attachments = [];
        if (!draft.attachments.includes(attachment.id)) draft.attachments.push(attachment.id);
        if (!Array.isArray(draft.pendingAttachments)) draft.pendingAttachments = [];
        draft.pendingAttachments.push(attachment.id);
        renderTaskAttachments();
      });
    }

    if (els.taskAttachmentList) {
      els.taskAttachmentList.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        if (btn.dataset.action === 'open-attachment') {
          await invoke(api.openAttachment(id));
          return;
        }
        if (btn.dataset.action === 'reveal-attachment') {
          await invoke(api.revealAttachment ? api.revealAttachment(id) : Promise.resolve(null));
          return;
        }
        if (btn.dataset.action === 'delete-attachment') {
          const confirmed = await ctx.confirmDialog({
            title: 'Удалить вложение?',
            text: 'Файл будет удалён из задачи и хранилища вложений.',
            okText: 'Удалить'
          });
          if (!confirmed) return;
          const res = await invoke(api.deleteAttachment(id), 'Вложение удалено');
          if (res) {
            const draft = state.draft;
            if (draft && Array.isArray(draft.attachments)) {
              draft.attachments = draft.attachments.filter((item) => item !== id);
            }
            if (draft && Array.isArray(draft.pendingAttachments)) {
              draft.pendingAttachments = draft.pendingAttachments.filter((item) => item !== id);
            }
            renderTaskAttachments();
          }
        }
      });
    }

    return {
      openTaskModal,
      closeTaskModal,
      deleteTaskWithConfirm,
      mapDraftSubtask,
      renderTaskColorGrid,
      renderTaskAttachments
    };
  }

  window.AppTaskModal = { create: createTaskModalModule };
})();
