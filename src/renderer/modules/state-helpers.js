'use strict';

(function () {
  function dueMatchesView(task, view, now, U) {
    if (view === 'inbox') return !task.dueAt;
    if (!task.dueAt) return false;
    const due = Date.parse(task.dueAt);
    if (!Number.isFinite(due)) return false;
    const dueDate = new Date(due);

    if (view === 'today') return U.isSameDay(dueDate, now);
    if (view === 'tomorrow') return U.isSameDay(dueDate, U.addDays(now, 1));
    if (view === 'overdue') return due < now.getTime();
    if (view === 'soon')
      return due >= now.getTime() && due - now.getTime() <= 7 * 24 * 60 * 60 * 1000;
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
      if (state.view !== 'all') list = list.filter((task) => dueMatchesView(task, state.view, now, U));
      if (state.filter === 'active') list = list.filter((task) => !task.done);
      else if (state.filter === 'done') list = list.filter((task) => task.done);
    }

    const query = state.search.trim().toLowerCase();
    if (query) {
      list = list.filter((task) => {
        return (
          task.title.toLowerCase().includes(query) ||
          (task.description || '').toLowerCase().includes(query) ||
          (task.subtasks || []).some((sub) => sub.title.toLowerCase().includes(query))
        );
      });
    }

    if (state.priorityFilter) {
      list = list.filter((task) => task.priority === state.priorityFilter);
    }

    if (state.dueFilter && state.view !== 'inbox' && state.view !== 'notes') {
      list = list.filter((task) => dueMatchesView(task, state.dueFilter, now, U));
    }

    return list.sort((a, b) => compareTasks(a, b, state, U));
  }

  function compareTasks(a, b, state, U) {
    if (a.done !== b.done) return a.done ? 1 : -1;

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
