'use strict';

(function () {
  function createTaskListModule(ctx) {
    const { els, state, U, makeIconButton, getVisibleTasks, visibleNotes, currentCategory } = ctx;

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
        const checkbox = els.taskList.querySelector(
          `.task-card[data-id="${task.id}"] .task-check`
        );
        if (!checkbox) continue;
        const subs = task.subtasks || [];
        const doneSubs = subs.filter((sub) => sub.done).length;
        if (!task.done && subs.length > 0 && doneSubs > 0) {
          checkbox.indeterminate = true;
          checkbox.classList.add('is-partial');
        }
      }
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

    function startInlineSubtaskEdit(card, subtaskId, parentSubtaskId = null) {
      const { currentTask, api, invoke, renderTaskList } = ctx;
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

      let finished = false;
      const finish = async (save) => {
        if (finished) return;
        finished = true;
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

    return {
      renderTaskList,
      openInlineSubtaskForm,
      startInlineSubtaskEdit
    };
  }

  window.AppTaskList = { create: createTaskListModule };
})();
