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

      let priorityFlag = null;
      if (task.priority === 'high') {
        priorityFlag = document.createElement('span');
        priorityFlag.className = 'priority-flag high';
        priorityFlag.textContent = 'Важно';
      } else if (task.priority === 'low') {
        priorityFlag = document.createElement('span');
        priorityFlag.className = 'priority-flag low';
        priorityFlag.textContent = 'Не срочно';
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

      if (Array.isArray(task.attachments) && task.attachments.length > 0) {
        const items = window.AppAttachments.collectAttachments(state, task.attachments);
        if (items.length === 0) {
          const att = document.createElement('span');
          att.className = 'meta-attachments';
          att.title = `Вложений: ${task.attachments.length}`;
          att.textContent = `📎 ${task.attachments.length}`;
          meta.appendChild(att);
        } else {
          // Каждый файл — отдельная ссылка: открыть можно любой из них.
          items.forEach((att, index) => {
            const link = window.AppAttachments.createLink(att, {
              label: index === 0 ? `📎 ${att.name || att.id}` : att.name || att.id
            });
            meta.appendChild(link);
          });
        }
      }

      if (Array.isArray(task.tags) && task.tags.length > 0) {
        for (const tag of task.tags) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'tag-chip';
          chip.dataset.action = 'filter-tag';
          chip.dataset.tag = String(tag);
          chip.textContent = String(tag);
          chip.title = `Фильтр по тегу: ${String(tag)}`;
          meta.appendChild(chip);
        }
      }

      body.appendChild(meta);

      // В канбане колонка узкая: метку приоритета переносим в мета-строку,
      // чтобы заголовок задачи не сжимался до одного символа.
      if (priorityFlag) {
        if (state.viewMode === 'board') meta.appendChild(priorityFlag);
        else titleRow.appendChild(priorityFlag);
      }

      const actions = document.createElement('div');
      actions.className = 'task-actions';

      if (task.dueAt && !task.done && reminderHasFired(task)) {
        actions.appendChild(makeIconButton('snooze', 'Отложить напоминание', 'clock'));
      }
      actions.appendChild(makeIconButton('edit', 'Редактировать', 'pencil'));
      actions.appendChild(makeIconButton('delete', 'Удалить', 'trash', 'danger'));

      main.append(checkbox, body, actions);
      card.appendChild(main);

      if (state.viewMode === 'list' && state.sort === 'manual') {
        card.draggable = true;
        card.dataset.draggableTask = '1';
      }

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

    function renderBoard(tasks) {
      const columns = [
        { id: 'todo', title: 'К выполнению', statuses: ['todo', 'inbox'] },
        { id: 'in_progress', title: 'В работе', statuses: ['in_progress'] },
        { id: 'done', title: 'Готово', statuses: ['done'] }
      ];
      const board = document.createElement('div');
      board.className = 'board';

      for (const col of columns) {
        const colTasks = tasks.filter((t) =>
          col.statuses.includes(t.status || (t.done ? 'done' : 'todo'))
        );
        colTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
        const colEl = document.createElement('section');
        colEl.className = 'board-col';
        colEl.dataset.status = col.id;

        const head = document.createElement('div');
        head.className = 'board-col-head';
        const title = document.createElement('span');
        title.className = 'board-col-title';
        title.textContent = col.title;
        const count = document.createElement('span');
        count.className = 'board-col-count';
        count.textContent = String(colTasks.length);
        head.append(title, count);

        const body = document.createElement('div');
        body.className = 'board-col-body';
        body.dataset.dropStatus = col.id;
        if (colTasks.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'board-empty';
          empty.textContent = 'Нет задач';
          body.appendChild(empty);
        } else {
          for (const task of colTasks) {
            const card = renderTaskCard(task);
            card.classList.add('is-board');
            card.draggable = true;
            card.dataset.draggableTask = '1';
            const move = document.createElement('div');
            move.className = 'board-move';
            if (col.id !== 'todo') {
              const back = document.createElement('button');
              back.type = 'button';
              back.className = 'btn btn-ghost btn-sm';
              back.dataset.action = 'move-status';
              back.dataset.status = col.id === 'done' ? 'in_progress' : 'todo';
              back.textContent = col.id === 'done' ? 'В работу' : 'К выполнению';
              move.appendChild(back);
            }
            if (col.id !== 'done') {
              const fwd = document.createElement('button');
              fwd.type = 'button';
              fwd.className = 'btn btn-ghost btn-sm';
              fwd.dataset.action = 'move-status';
              fwd.dataset.status = col.id === 'todo' ? 'in_progress' : 'done';
              fwd.textContent = col.id === 'todo' ? 'В работу' : 'Готово';
              move.appendChild(fwd);
            }
            if (move.childNodes.length) card.querySelector('.task-body').appendChild(move);
            body.appendChild(card);
          }
        }
        colEl.append(head, body);
        board.appendChild(colEl);
      }
      return board;
    }

    function renderCalendar(tasks) {
      const container = document.createElement('div');
      container.className = 'calendar-view';
      const mode = state.calendarMode || 'month';
      const now = new Date();
      const anchor = state.calendarAnchor ? new Date(state.calendarAnchor) : now;

      function startOfWeek(d) {
        const day = (d.getDay() + 6) % 7;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
      }
      function sameDay(a, b) {
        return (
          a.getFullYear() === b.getFullYear() &&
          a.getMonth() === b.getMonth() &&
          a.getDate() === b.getDate()
        );
      }
      function ymd(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      function tasksOnDate(dateStr) {
        return tasks.filter((t) => {
          if (!t.dueAt) return false;
          const d = new Date(t.dueAt);
          return !Number.isNaN(d.getTime()) && ymd(d) === dateStr;
        });
      }
      function createTaskChip(task) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `calendar-item${task.done ? ' is-done' : ''}`;
        item.dataset.action = 'edit';
        item.title = task.title;
        item.textContent = task.title;
        const wrap = document.createElement('div');
        wrap.className = 'task-card';
        wrap.dataset.id = task.id;
        wrap.dataset.draggableTask = '1';
        wrap.draggable = true;
        wrap.style.padding = '0';
        wrap.style.border = '0';
        wrap.style.background = 'transparent';
        wrap.appendChild(item);
        return wrap;
      }

      const head = document.createElement('div');
      head.className = 'calendar-head';

      const modeSwitch = document.createElement('div');
      modeSwitch.className = 'calendar-mode-switch';
      [
        { id: 'month', label: 'Месяц' },
        { id: 'week', label: 'Неделя' },
        { id: 'day', label: 'День' }
      ].forEach((m) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `chip${mode === m.id ? ' is-active' : ''}`;
        btn.dataset.action = 'calendar-mode';
        btn.dataset.mode = m.id;
        btn.textContent = m.label;
        modeSwitch.appendChild(btn);
      });

      const nav = document.createElement('div');
      nav.className = 'calendar-nav';
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn btn-ghost btn-sm';
      prev.dataset.action = 'calendar-prev';
      prev.textContent = '‹';
      const todayBtn = document.createElement('button');
      todayBtn.type = 'button';
      todayBtn.className = 'btn btn-ghost btn-sm';
      todayBtn.dataset.action = 'calendar-today';
      todayBtn.textContent = 'Сегодня';
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn btn-ghost btn-sm';
      next.dataset.action = 'calendar-next';
      next.textContent = '›';
      nav.append(prev, todayBtn, next);

      const title = document.createElement('div');
      title.className = 'calendar-title';
      head.append(title, modeSwitch, nav);
      container.appendChild(head);

      if (mode === 'week') {
        const start = startOfWeek(anchor);
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
        const fmt = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        title.textContent = `${fmt(start)} — ${fmt(end)} ${end.getFullYear()}`;
        const grid = document.createElement('div');
        grid.className = 'calendar-week-grid';
        const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        for (let i = 0; i < 7; i++) {
          const dayDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          const dateStr = ymd(dayDate);
          const col = document.createElement('div');
          col.className = `calendar-week-col${sameDay(dayDate, now) ? ' is-today' : ''}`;
          col.dataset.dropDate = dateStr;
          const h = document.createElement('div');
          h.className = 'calendar-week-col-head';
          h.textContent = `${weekdays[i]} ${dayDate.getDate()}`;
          const body = document.createElement('div');
          body.className = 'calendar-week-col-body';
          body.dataset.dropDate = dateStr;
          const list = tasksOnDate(dateStr).sort(
            (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)
          );
          if (list.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'calendar-empty';
            empty.textContent = '—';
            body.appendChild(empty);
          } else {
            for (const task of list) body.appendChild(createTaskChip(task));
          }
          col.append(h, body);
          grid.appendChild(col);
        }
        container.appendChild(grid);
      } else if (mode === 'day') {
        const dayDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
        title.textContent = dayDate.toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        const dateStr = ymd(dayDate);
        const list = tasksOnDate(dateStr).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
        const grid = document.createElement('div');
        grid.className = 'calendar-day-grid';
        const byHour = new Map();
        const noTime = [];
        for (const t of list) {
          const d = new Date(t.dueAt);
          const h = d.getHours();
          const m = d.getMinutes();
          if (h === 0 && m === 0 && !/\d{2}:\d{2}/.test(String(t.dueAt))) {
            noTime.push(t);
          } else {
            if (!byHour.has(h)) byHour.set(h, []);
            byHour.get(h).push(t);
          }
        }
        if (noTime.length > 0) {
          const slot = document.createElement('div');
          slot.className = 'calendar-day-slot';
          slot.dataset.dropDate = dateStr;
          const label = document.createElement('div');
          label.className = 'calendar-day-slot-label';
          label.textContent = 'В течение дня';
          const body = document.createElement('div');
          body.className = 'calendar-day-slot-body';
          body.dataset.dropDate = dateStr;
          for (const task of noTime) body.appendChild(createTaskChip(task));
          slot.append(label, body);
          grid.appendChild(slot);
        }
        for (let h = 0; h < 24; h++) {
          const slot = document.createElement('div');
          slot.className = 'calendar-day-slot';
          slot.dataset.dropDate = dateStr;
          slot.dataset.dropHour = String(h);
          const label = document.createElement('div');
          label.className = 'calendar-day-slot-label';
          label.textContent = `${String(h).padStart(2, '0')}:00`;
          const body = document.createElement('div');
          body.className = 'calendar-day-slot-body';
          body.dataset.dropDate = dateStr;
          body.dataset.dropHour = String(h);
          for (const task of byHour.get(h) || []) body.appendChild(createTaskChip(task));
          slot.append(label, body);
          grid.appendChild(slot);
        }
        container.appendChild(grid);
        // Прокручиваем дневную сетку к первому часу с задачами.
        setTimeout(() => {
          const firstBusy = grid.querySelector('.calendar-day-slot-body:not(:empty)');
          if (!firstBusy) return;
          const busySlot = firstBusy.closest('.calendar-day-slot');
          grid.scrollTop = Math.max(0, busySlot.offsetTop - 48);
        }, 0);
      } else {
        // month
        const viewDate = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const first = new Date(year, month, 1);
        const startDay = (first.getDay() + 6) % 7; // Mon=0
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const monthName = first.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
        title.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

        const grid = document.createElement('div');
        grid.className = 'calendar-grid';
        const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        for (const w of weekdays) {
          const c = document.createElement('div');
          c.className = 'calendar-weekday';
          c.textContent = w;
          grid.appendChild(c);
        }
        for (let i = 0; i < startDay; i++) {
          const c = document.createElement('div');
          c.className = 'calendar-cell is-empty';
          grid.appendChild(c);
        }
        const byDay = new Map();
        for (const task of tasks) {
          if (!task.dueAt) continue;
          const d = new Date(task.dueAt);
          if (d.getFullYear() !== year || d.getMonth() !== month) continue;
          const day = d.getDate();
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day).push(task);
        }
        for (let day = 1; day <= daysInMonth; day++) {
          const cell = document.createElement('div');
          cell.className = 'calendar-cell';
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          cell.dataset.dropDate = dateStr;
          const dayDate = new Date(year, month, day);
          if (sameDay(dayDate, now)) cell.classList.add('is-today');
          const num = document.createElement('div');
          num.className = 'calendar-daynum';
          num.textContent = String(day);
          cell.appendChild(num);
          const list = (byDay.get(day) || []).sort(
            (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)
          );
          for (const task of list.slice(0, 4)) cell.appendChild(createTaskChip(task));
          if (list.length > 4) {
            const more = document.createElement('div');
            more.className = 'calendar-more';
            more.textContent = `+${list.length - 4}`;
            cell.appendChild(more);
          }
          grid.appendChild(cell);
        }
        container.appendChild(grid);
      }

      if (tasks.every((t) => !t.dueAt)) {
        const hint = document.createElement('div');
        hint.className = 'field-hint';
        hint.textContent = 'У задач в этом списке нет сроков для отображения в календаре.';
        container.appendChild(hint);
      }
      return container;
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
      els.taskList.classList.toggle('is-board-mode', state.viewMode === 'board');
      els.taskList.classList.toggle('is-calendar-mode', state.viewMode === 'calendar');
      els.emptyAddBtn.textContent = 'Добавить задачу';

      const tasksOnlyEmpty =
        state.view === 'all'
          ? tasks.length === 0
          : tasks.length === 0 && visibleNotes().length === 0;
      if (tasksOnlyEmpty) {
        els.emptyState.hidden = false;
        els.emptyAddBtn.hidden = Boolean(state.search.trim());
        renderEmptyText();
        return;
      }

      els.emptyState.hidden = true;
      if (state.viewMode === 'board') {
        els.taskList.appendChild(renderBoard(tasks));
        return;
      }
      if (state.viewMode === 'calendar') {
        els.taskList.appendChild(renderCalendar(tasks));
        return;
      }

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

    function bindTaskListEvents(handlers) {
      const {
        toggleSelection,
        toggleTask,
        toggleSubtask,
        openTaskModal,
        deleteTaskWithConfirm,
        openSnoozeMenu,
        deleteSubtask,
        invoke,
        api
      } = handlers;

      function taskStatusOf(task) {
        return task.status || (task.done ? 'done' : 'todo');
      }

      async function moveTaskToColumn(taskId, targetStatus, beforeTaskId) {
        const all = (state.data.tasks || []).slice();
        const task = all.find((t) => t.id === taskId);
        if (!task) return;
        const statusSet = targetStatus === 'todo' ? ['todo', 'inbox'] : [targetStatus];
        const colTasks = all
          .filter((t) => statusSet.includes(taskStatusOf(t)) && t.id !== taskId)
          .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
        let insertIndex = colTasks.length;
        if (beforeTaskId) {
          const idx = colTasks.findIndex((t) => t.id === beforeTaskId);
          if (idx >= 0) insertIndex = idx;
        }
        colTasks.splice(insertIndex, 0, task);

        const base = 1000;
        const primary = {
          status: targetStatus,
          order: (insertIndex + 1) * base,
          done: targetStatus === 'done'
        };
        if (targetStatus === 'done') {
          await invoke(api.toggleTask(taskId, true));
          // ensure order too
          await invoke(api.updateTask(taskId, { order: primary.order }));
        } else {
          await invoke(api.updateTask(taskId, primary));
        }
        // reindex others in column
        const ops = [];
        for (let i = 0; i < colTasks.length; i++) {
          const t = colTasks[i];
          if (t.id === taskId) continue;
          const newOrder = (i + 1) * base;
          if (Number(t.order) !== newOrder) ops.push(api.updateTask(t.id, { order: newOrder }));
        }
        if (ops.length) await Promise.all(ops);
      }

      els.taskList.addEventListener('change', (event) => {
        const target = event.target;
        if (target.dataset.action === 'select-task') {
          if (typeof toggleSelection === 'function') {
            toggleSelection(target.dataset.taskId);
          }
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

      els.taskList.addEventListener('dragstart', (event) => {
        const card = event.target.closest('.task-card[data-draggable-task="1"]');
        if (!card) return;
        state.dragTaskId = card.dataset.id;
        event.dataTransfer.effectAllowed = 'move';
        try {
          event.dataTransfer.setData('text/plain', card.dataset.id);
        } catch (_) {}
        card.classList.add('is-dragging');
      });

      els.taskList.addEventListener('dragend', (event) => {
        const card = event.target.closest('.task-card');
        if (card) card.classList.remove('is-dragging');
        state.dragTaskId = null;
        els.taskList
          .querySelectorAll('.board-col-body.is-drag-over')
          .forEach((el) => el.classList.remove('is-drag-over'));
      });

      els.taskList.addEventListener('dragover', (event) => {
        const body = event.target.closest('.board-col-body[data-drop-status]');
        const cell = event.target.closest(
          '.calendar-cell[data-drop-date], .calendar-week-col-body[data-drop-date], .calendar-day-slot-body[data-drop-date]'
        );
        const target = body || cell;
        if (target) {
          event.preventDefault();
          target.classList.add('is-drag-over');
          event.dataTransfer.dropEffect = 'move';
          return;
        }
        if (state.viewMode === 'list' && state.sort === 'manual' && state.dragTaskId) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      });

      els.taskList.addEventListener('dragleave', (event) => {
        const target = event.target.closest(
          '.board-col-body[data-drop-status], .calendar-cell[data-drop-date], .calendar-week-col-body[data-drop-date], .calendar-day-slot-body[data-drop-date]'
        );
        if (!target) return;
        if (!target.contains(event.relatedTarget)) target.classList.remove('is-drag-over');
      });

      els.taskList.addEventListener('drop', async (event) => {
        const body = event.target.closest('.board-col-body[data-drop-status]');
        const cell = event.target.closest(
          '.calendar-cell[data-drop-date], .calendar-week-col-body[data-drop-date], .calendar-day-slot-body[data-drop-date]'
        );
        const taskId =
          state.dragTaskId || (event.dataTransfer ? event.dataTransfer.getData('text/plain') : '');

        // list manual reorder
        if (!body && !cell && state.viewMode === 'list' && state.sort === 'manual' && taskId) {
          const inList = event.target.closest('#task-list') || event.target === els.taskList;
          if (inList) {
            event.preventDefault();
            const cards = Array.from(
              els.taskList.querySelectorAll(':scope > .task-card[data-draggable-task="1"]')
            ).filter((c) => c.dataset.id !== taskId);
            let beforeTaskId = null;
            const y = event.clientY;
            for (const c of cards) {
              const rect = c.getBoundingClientRect();
              if (y < rect.top + rect.height / 2) {
                beforeTaskId = c.dataset.id;
                break;
              }
            }
            const visible = getVisibleTasks(state, U).filter((t) => t.id !== taskId);
            let insertIndex = visible.length;
            if (beforeTaskId) {
              const idx = visible.findIndex((t) => t.id === beforeTaskId);
              if (idx >= 0) insertIndex = idx;
            }
            const moved = (state.data.tasks || []).find((t) => t.id === taskId);
            if (moved) {
              visible.splice(insertIndex, 0, moved);
              const base = 1000;
              const ops = [];
              for (let i = 0; i < visible.length; i++) {
                const t = visible[i];
                const newOrder = (i + 1) * base;
                if (Number(t.order) !== newOrder)
                  ops.push(api.updateTask(t.id, { order: newOrder }));
              }
              state.dragTaskId = null;
              if (ops.length) await Promise.all(ops);
              renderTaskList();
            }
            return;
          }
        }

        if (!body && !cell) return;
        event.preventDefault();
        (body || cell).classList.remove('is-drag-over');
        if (!taskId) return;

        if (body) {
          const status = body.dataset.dropStatus;
          if (!status) return;
          let beforeTaskId = null;
          const cards = Array.from(
            body.querySelectorAll('.task-card[data-draggable-task="1"]')
          ).filter((c) => c.dataset.id !== taskId);
          const y = event.clientY;
          for (const c of cards) {
            const rect = c.getBoundingClientRect();
            if (y < rect.top + rect.height / 2) {
              beforeTaskId = c.dataset.id;
              break;
            }
          }
          state.dragTaskId = null;
          await moveTaskToColumn(taskId, status, beforeTaskId);
          return;
        }

        if (cell) {
          const dateStr = cell.dataset.dropDate;
          if (!dateStr) return;
          const task = (state.data.tasks || []).find((t) => t.id === taskId);
          let time = '18:00';
          if (Object.prototype.hasOwnProperty.call(cell.dataset, 'dropHour')) {
            const hh = Number(cell.dataset.dropHour);
            if (Number.isFinite(hh) && hh >= 0 && hh <= 23) {
              time = `${String(hh).padStart(2, '0')}:00`;
            }
          } else if (task && task.dueAt) {
            try {
              const d = new Date(task.dueAt);
              if (!Number.isNaN(d.getTime())) {
                time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              }
            } catch (_) {}
          }
          const dueAt = U.combineDateTime ? U.combineDateTime(dateStr, time) : null;
          state.dragTaskId = null;
          if (dueAt) await invoke(api.updateTask(taskId, { dueAt }), 'Срок обновлён');
        }
      });

      els.taskList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (button && button.tagName !== 'INPUT') {
          const action = button.dataset.action;
          if (action === 'calendar-mode') {
            state.calendarMode = button.dataset.mode || 'month';
            if (!state.calendarAnchor) state.calendarAnchor = Date.now();
            renderTaskList();
            return;
          }
          if (
            action === 'calendar-prev' ||
            action === 'calendar-next' ||
            action === 'calendar-today'
          ) {
            const mode = state.calendarMode || 'month';
            const delta = action === 'calendar-prev' ? -1 : action === 'calendar-next' ? 1 : 0;
            const base = state.calendarAnchor ? new Date(state.calendarAnchor) : new Date();
            if (action === 'calendar-today') {
              state.calendarAnchor = Date.now();
              state.calendarMonthOffset = 0;
            } else if (mode === 'week') {
              state.calendarAnchor = new Date(
                base.getFullYear(),
                base.getMonth(),
                base.getDate() + delta * 7
              ).getTime();
            } else if (mode === 'day') {
              state.calendarAnchor = new Date(
                base.getFullYear(),
                base.getMonth(),
                base.getDate() + delta
              ).getTime();
            } else {
              state.calendarAnchor = new Date(
                base.getFullYear(),
                base.getMonth() + delta,
                1
              ).getTime();
              state.calendarMonthOffset = (Number(state.calendarMonthOffset) || 0) + delta;
            }
            renderTaskList();
            return;
          }
          if (action === 'open-attachment') {
            event.preventDefault();
            event.stopPropagation();
            invoke(api.openAttachment(button.dataset.id));
            return;
          }
          if (action === 'filter-tag') {
            const tag = button.dataset.tag || '';
            if (tag && handlers.onFilterTag) handlers.onFilterTag(tag, 'task');
            else if (tag) {
              state.tagFilter = tag;
              renderTaskList();
            }
            return;
          }

          const card = event.target.closest('.task-card');
          if (!card) return;
          const taskId = card.dataset.id;
          if (action === 'edit') openTaskModal(taskId);
          else if (action === 'delete') deleteTaskWithConfirm(taskId);
          else if (action === 'snooze') openSnoozeMenu(button, taskId);
          else if (action === 'move-status') {
            const status = button.dataset.status;
            if (status === 'done') {
              invoke(api.toggleTask(taskId, true), 'Задача выполнена');
            } else if (status) {
              const maxOrder = (state.data.tasks || [])
                .filter((t) => (t.status || (t.done ? 'done' : 'todo')) === status)
                .reduce((m, t) => Math.max(m, Number(t.order) || 0), 0);
              invoke(
                api.updateTask(taskId, { status, done: false, order: maxOrder + 1 }),
                'Статус обновлён'
              );
            }
          } else if (action === 'toggle-expand') {
            if (state.expanded.has(taskId)) state.expanded.delete(taskId);
            else state.expanded.add(taskId);
            renderTaskList();
          } else if (action === 'toggle-sub-subtasks') {
            const subtaskId = button.dataset.subtaskId;
            if (state.expandedNestedSubtasks.has(subtaskId))
              state.expandedNestedSubtasks.delete(subtaskId);
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

        const cell = event.target.closest('[data-drop-date]');
        if (cell && state.viewMode === 'calendar' && cell.dataset.dropDate) {
          const isTaskClick =
            event.target.closest('.calendar-item') ||
            event.target.closest('.task-card[data-draggable-task]') ||
            event.target.closest('button[data-action="edit"]');
          if (!isTaskClick) {
            openTaskModal(null, { preset: { date: cell.dataset.dropDate } });
            return;
          }
        }

        const card = event.target.closest('.task-card');
        if (!card) return;
        if (event.target.closest('.task-check')) return;
        if (event.target.closest('[data-action="toggle-subtask"]')) return;
        if (event.target.closest('.subtask-row')) return;

        const checkbox = card.querySelector('.task-check');
        if (checkbox) {
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
        invoke(api.addSubtask(card.dataset.id, value, parentSubtaskId), 'Подзадача добавлена');
      });
    }

    return {
      renderTaskList,
      openInlineSubtaskForm,
      startInlineSubtaskEdit,
      bindTaskListEvents
    };
  }

  window.AppTaskList = { create: createTaskListModule };
})();
