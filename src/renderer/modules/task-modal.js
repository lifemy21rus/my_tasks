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
          status: 'todo',
          color: null,
          estimatedMinutes: null,
          actualMinutes: null,
          tags: [],
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
      if (els.taskStatusInput) els.taskStatusInput.value = state.draft.status || 'todo';
      els.taskEstimatedMinutes.value = state.draft.estimatedMinutes ?? '';
      els.taskActualMinutes.value = state.draft.actualMinutes ?? '';
      if (els.taskTagsInput) els.taskTagsInput.value = (state.draft.tags || []).join(', ');
      renderTaskTagChips();
      renderTaskAttachments(state.draft.id);
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
      state.draft = null;
      state.draftSubtaskAddTarget = null;
    }

    function renderTaskAttachments(taskId) {
      if (!els.taskAttachmentList) return;
      els.taskAttachmentList.textContent = '';
      const canAttach = Boolean(taskId);
      if (els.taskAttachmentAddBtn) els.taskAttachmentAddBtn.disabled = !canAttach;
      if (els.taskAttachmentHint) els.taskAttachmentHint.hidden = canAttach;
      if (!canAttach) return;

      const task = currentTask(taskId);
      const all = (state.data && state.data.attachments) || [];
      const ids = task && Array.isArray(task.attachments) ? task.attachments : [];
      const items = ids.map((id) => all.find((a) => a.id === id)).filter(Boolean);
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'field-hint';
        empty.textContent = 'Нет вложений';
        els.taskAttachmentList.appendChild(empty);
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
        els.taskAttachmentList.appendChild(row);
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
        const taskId = state.draft && state.draft.id;
        if (!taskId) return;
        const res = await invoke(api.addAttachmentPick({ taskId }), 'Файл прикреплён');
        if (res) renderTaskAttachments(taskId);
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
        if (btn.dataset.action === 'delete-attachment') {
          const confirmed = await ctx.confirmDialog({
            title: 'Удалить вложение?',
            text: 'Файл будет удалён из задачи и хранилища вложений.',
            okText: 'Удалить'
          });
          if (!confirmed) return;
          const res = await invoke(api.deleteAttachment(id), 'Вложение удалено');
          if (res && state.draft && state.draft.id) renderTaskAttachments(state.draft.id);
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
