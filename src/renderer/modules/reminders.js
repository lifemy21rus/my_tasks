'use strict';

(function () {
  function createRemindersModule(ctx) {
    const { els, state, U, api, invoke, currentTask } = ctx;

    function openSnoozeMenu(button, taskId) {
      const task = currentTask(taskId);
      if (!task) return;

      closeSnoozeMenu();

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
          await invoke(
            api.snoozeTask(taskId, option.until.toISOString()),
            `Напоминание отложено: ${option.label.toLowerCase()}`
          );
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
      state.snoozeMenu = menu;
    }

    function closeSnoozeMenu() {
      if (state.snoozeMenu) {
        state.snoozeMenu.remove();
        state.snoozeMenu = null;
      }
    }

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
        state.reminderEditor = task.reminders.map((r) => ({
          offset: Number(r.offset) || 0,
          type: r.type
        }));
      } else {
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
      const recurrence = {
        type,
        interval: Math.max(1, Number(els.recurrenceInterval.value) || 1)
      };
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

    return {
      openSnoozeMenu,
      closeSnoozeMenu,
      reminderLabel,
      renderReminderEditor,
      addReminderEditor,
      loadReminderEditor,
      loadRecurrenceEditor,
      buildRecurrenceFromEditor
    };
  }

  window.AppReminders = { create: createRemindersModule };
})();
