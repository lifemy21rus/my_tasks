'use strict';

(function () {
  function dueMatchesView(task, view, now, U) {
    if (view === 'inbox') return !task.dueAt;
    if (view === 'nodue') return !task.dueAt;
    if (!task.dueAt) return false;
    const due = Date.parse(task.dueAt);
    if (!Number.isFinite(due)) return false;
    const dueDate = new Date(due);

    if (view === 'today') return U.isSameDay(dueDate, now);
    if (view === 'tomorrow') return U.isSameDay(dueDate, U.addDays(now, 1));
    if (view === 'overdue') return due < now.getTime();
    if (view === 'soon')
      return due >= now.getTime() && due - now.getTime() <= 7 * 24 * 60 * 60 * 1000;

    if (view === 'week') {
      const day = (now.getDay() + 6) % 7; // Mon=0
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      return dueDate >= start && dueDate < end;
    }
    if (view === 'month') {
      return dueDate.getFullYear() === now.getFullYear() && dueDate.getMonth() === now.getMonth();
    }

    return false;
  }

  function getVisibleTasks(state, U) {
    const now = new Date();
    if (state.view === 'notes') return [];
    let list = state.data.tasks.slice();

    if (state.view === 'done') {
      list = list.filter((task) => task.done);
    } else if (state.view === 'category') {
      list = list.filter((task) => task.categoryId === state.categoryId);
      if (state.filter === 'active') list = list.filter((task) => !task.done);
      else if (state.filter === 'done') list = list.filter((task) => task.done);
    } else if (state.view === 'inbox') {
      list = list.filter((task) => !task.dueAt);
      if (state.filter === 'active') list = list.filter((task) => !task.done);
      else if (state.filter === 'done') list = list.filter((task) => task.done);
    } else {
      if (state.view !== 'all')
        list = list.filter((task) => dueMatchesView(task, state.view, now, U));
      if (state.filter === 'active') list = list.filter((task) => !task.done);
      else if (state.filter === 'done') list = list.filter((task) => task.done);
    }

    const query = state.search.trim().toLowerCase();
    if (query) {
      const catById = new Map((state.data.categories || []).map((c) => [c.id, c]));
      const subtaskMatches = (subs) =>
        Array.isArray(subs) &&
        subs.some(
          (sub) =>
            String(sub && sub.title ? sub.title : '')
              .toLowerCase()
              .includes(query) || subtaskMatches(sub && sub.subtasks)
        );
      list = list.filter((task) => {
        const tagsText = Array.isArray(task.tags) ? task.tags.join(' ').toLowerCase() : '';
        const cat = task.categoryId ? catById.get(task.categoryId) : null;
        const catName = cat && cat.name ? String(cat.name).toLowerCase() : '';
        return (
          task.title.toLowerCase().includes(query) ||
          (task.description || '').toLowerCase().includes(query) ||
          tagsText.includes(query) ||
          catName.includes(query) ||
          subtaskMatches(task.subtasks)
        );
      });
    }

    if (state.priorityFilter) {
      list = list.filter((task) => task.priority === state.priorityFilter);
    }

    if (state.statusFilter) {
      list = list.filter(
        (task) => (task.status || (task.done ? 'done' : 'todo')) === state.statusFilter
      );
    }

    if (state.tagFilter) {
      list = list.filter((task) => Array.isArray(task.tags) && task.tags.includes(state.tagFilter));
    }

    if (state.attachmentsFilter === 'with') {
      list = list.filter((task) => Array.isArray(task.attachments) && task.attachments.length > 0);
    } else if (state.attachmentsFilter === 'without') {
      list = list.filter(
        (task) => !Array.isArray(task.attachments) || task.attachments.length === 0
      );
    }

    if (state.dueFilter && state.view !== 'inbox' && state.view !== 'notes') {
      list = list.filter((task) => dueMatchesView(task, state.dueFilter, now, U));
    }

    if ((state.dueFrom || state.dueTo) && state.view !== 'notes') {
      const fromTs = state.dueFrom ? new Date(`${state.dueFrom}T00:00:00`).getTime() : -Infinity;
      const toTs = state.dueTo ? new Date(`${state.dueTo}T23:59:59.999`).getTime() : Infinity;
      list = list.filter((task) => {
        if (!task.dueAt) return false;
        const due = Date.parse(task.dueAt);
        if (!Number.isFinite(due)) return false;
        return due >= fromTs && due <= toTs;
      });
    }

    return list.sort((a, b) => compareTasks(a, b, state, U));
  }

  function compareTasks(a, b, state, U) {
    if (a.done !== b.done) return a.done ? 1 : -1;

    if (state.sort === 'manual') {
      const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
      const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
      if (ao !== bo) return ao - bo;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }

    if (state.sort === 'title') {
      return a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' });
    }

    if (state.sort === 'created') {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }

    if (state.sort === 'due') {
      const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
      const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
      if (ad !== bd) return ad - bd;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }

    const now = Date.now();
    const aOver = a.dueAt && Date.parse(a.dueAt) < now;
    const bOver = b.dueAt && Date.parse(b.dueAt) < now;
    if (aOver !== bOver) return aOver ? -1 : 1;

    const pa = U.priorityRank(a.priority);
    const pb = U.priorityRank(b.priority);
    if (pa !== pb) return pa - pb;

    const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
    const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
    if (ad !== bd) return ad - bd;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }

  function computeCounts(state, U) {
    const now = new Date();
    const tasks = state.data.tasks;
    const active = tasks.filter((task) => !task.done);
    return {
      all: active.length,
      inbox: active.filter((task) => !task.dueAt).length,
      today: active.filter((task) => dueMatchesView(task, 'today', now, U)).length,
      tomorrow: active.filter((task) => dueMatchesView(task, 'tomorrow', now, U)).length,
      overdue: active.filter((task) => dueMatchesView(task, 'overdue', now, U)).length,
      soon: active.filter((task) => dueMatchesView(task, 'soon', now, U)).length,
      done: tasks.filter((task) => task.done).length,
      doneActualMinutes: tasks
        .filter((task) => task.done)
        .reduce((sum, t) => sum + (t.actualMinutes || 0), 0),
      notes: state.data.notes.filter((note) => !note.archived).length
    };
  }

  function viewInfo(state) {
    if (state.view === 'category') {
      const category = state.data.categories.find((c) => c.id === state.categoryId);
      return {
        title: category ? category.name : 'Категория',
        icon: 'category'
      };
    }
    const map = {
      all: ['Все задачи', ''],
      inbox: ['Входящие', ''],
      today: ['Сегодня', ''],
      tomorrow: ['Завтра', ''],
      overdue: ['Просроченные', ''],
      soon: ['Ближайшая неделя', ''],
      done: ['Выполненные', ''],
      notes: ['Заметки', '']
    };
    const [title] = map[state.view] || map.all;
    return { title };
  }

  window.AppStateHelpers = {
    dueMatchesView,
    getVisibleTasks,
    compareTasks,
    computeCounts,
    viewInfo
  };
})();
