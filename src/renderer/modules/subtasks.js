'use strict';

(function () {
  function createSubtasksModule(ctx) {
    const { els, state, makeIconButton } = ctx;

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

        if (!parent) actions.appendChild(addSub);
        actions.appendChild(remove);
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
        ? state.draftSubtaskAddTarget.subtasks || (state.draftSubtaskAddTarget.subtasks = [])
        : state.draft.subtasks;
      target.push({ id: null, title: value, done: false, subtasks: [] });
      state.draftSubtaskAddTarget = null;
      els.subtaskInput.value = '';
      els.subtaskInput.placeholder = 'Название подзадачи';
      renderDraftSubtasks();
      updateSubtaskCounter();
      els.subtaskInput.focus();
      const addRow = els.subtaskInput.closest('.subtask-add-row') || els.subtaskInput;
      if (addRow && addRow.scrollIntoView) {
        addRow.scrollIntoView({ block: 'nearest' });
      }
    }

    return {
      renderDraftSubtasks,
      updateSubtaskCounter,
      addDraftSubtask
    };
  }

  window.AppSubtasks = { create: createSubtasksModule };
})();
