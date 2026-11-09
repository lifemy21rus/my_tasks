'use strict';

(function () {
  const TASK_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6'
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
      els, state, api, invoke, toast, renderAll,
      renderCategoryOptions, renderDraftSubtasks, updateSubtaskCounter,
      loadReminderEditor, loadRecurrenceEditor, currentTask,
      buildRecurrenceFromEditor, U
    } = ctx;

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
          color: task.color || null,
          categoryId: task.categoryId || '',
          estimatedMinutes: task.estimatedMinutes || null,
          actualMinutes: task.actualMinutes || null,
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
        recurrence: ctx.buildRecurrenceFromEditor ? ctx.buildRecurrenceFromEditor() : null
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

        const res = await invoke(api.updateTask(draft.id, patch));
        if (!res) return;

        const original = (draft.subtasks || []).filter((sub) => sub.id);
        const originalIds = new Set(original.map((sub) => sub.id));
        const draftIds = new Set((draft.subtasks || []).filter((sub) => sub.id).map((sub) => sub.id));

        for (const id of originalIds) {
          if (!draftIds.has(id)) await api.deleteSubtask(draft.id, id);
        }

        for (const sub of draft.subtasks || []) {
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
              if (snapshot && snapshot.ok) {
                ctx.state.data = snapshot.data;
                ctx.state.runtime = snapshot.runtime;
                const updated = state.data.tasks.find((t) => t.id === draft.id);
                const added = updated && updated.subtasks[updated.subtasks.length - 1];
                if (added) await api.toggleSubtask(draft.id, added.id, true);
              }
            }
          }
        }

        const finalState = await api.getState();
        if (finalState && finalState.ok) {
          ctx.state.data = finalState.data;
          ctx.state.runtime = finalState.runtime;
          ctx.renderAll();
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
      const confirmed = await ctx.confirmDialog({
        title: 'Удалить задачу?',
        text: `«${task.title}» будет удалена без возможности отменить действие.`,
        okText: 'Удалить'
      });
      if (!confirmed) return;
      const res = await invoke(api.deleteTask(taskId), 'Задача удалена');
      if (res) ctx.renderAll();
    }

    return {
      openTaskModal,
      closeTaskModal,
      saveTask,
      deleteTaskWithConfirm,
      mapDraftSubtask,
      renderTaskColorGrid
    };
  }

  window.AppTaskModal = { create: createTaskModalModule };
})();
