'use strict';

(function () {
  function createViewModule(ctx) {
    const {
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
    } = ctx;

    function syncPriorityFilters() {
      if (els.priorityFilter) els.priorityFilter.value = state.priorityFilter || '';
    }

    function syncDueFilter() {
      if (els.dueFilterSelect) {
        els.dueFilterSelect.value = state.dueFilter || '';
      }
    }

    function syncFilters() {
      $$('.chip', els.filterGroup).forEach((chip) => {
        chip.classList.toggle('is-active', chip.dataset.filter === state.filter);
      });
      if (els.sortSelect) els.sortSelect.value = state.sort;
      syncPriorityFilters();
      syncDueFilter();
    }

    function renderSidebar() {
      const counts = computeCounts(state, U);

      $$('.nav-item[data-view]').forEach((button) => {
        const view = button.dataset.view;
        const badge = button.querySelector('.nav-count');
        if (badge) {
          badge.textContent = String(counts[view] || 0);
          badge.dataset.zero = String(!counts[view]);
        }
        button.classList.toggle('is-active', state.view === view);
      });

      const categorySection = els.categoryList && els.categoryList.closest('.sidebar-section');
      if (categorySection) {
        categorySection.hidden = state.view === 'notes';
      }

      const dueSection = els.dueFilterSelect && els.dueFilterSelect.closest('.sidebar-section');
      if (dueSection) {
        dueSection.hidden = state.view === 'notes';
      }

      if (typeof renderCategories === 'function') renderCategories();
    }

    function renderHeader() {
      const visible = getVisibleTasks(state, U);
      const info = viewInfo(state);
      if (els.viewTitle) els.viewTitle.textContent = info.title;

      const isNotes = state.view === 'notes';
      const hasSearch = Boolean(state.search.trim());

      let subtitle = isNotes ? U.noteCount(visibleNotes().length) : U.taskCount(visible.length);
      if (hasSearch) {
        const taskCount = visible.length;
        const noteCountFound = visibleNotes().length;
        const total = isNotes ? noteCountFound : taskCount;
        subtitle = `Найдено: ${total}`;
      }
      if (els.viewSub) els.viewSub.textContent = subtitle;

      const doneCount = state.data.tasks.filter((task) => task.done).length;
      if (els.clearCompletedBtn) els.clearCompletedBtn.hidden = doneCount === 0 || isNotes;

      if (isNotes) {
        const filtersRow = els.filterGroup && els.filterGroup.closest('.filters-row');
        if (filtersRow) filtersRow.hidden = true;
        const sortWrap = els.sortSelect && els.sortSelect.closest('.sort-wrap');
        if (sortWrap) sortWrap.hidden = true;
        if (els.notesRow) els.notesRow.hidden = false;
        if (els.notesViewActive) {
          els.notesViewActive.classList.toggle('is-active', !state.notesArchive);
        }
        if (els.notesViewArchived) {
          els.notesViewArchived.classList.toggle('is-active', state.notesArchive);
        }
        if (els.notesSectionAddBtn) els.notesSectionAddBtn.hidden = true;
      } else {
        const filtersRow = els.filterGroup && els.filterGroup.closest('.filters-row');
        if (filtersRow) filtersRow.hidden = false;
        const sortWrap = els.sortSelect && els.sortSelect.closest('.sort-wrap');
        if (sortWrap) sortWrap.hidden = false;
        if (els.notesRow) els.notesRow.hidden = true;
      }

      const prioritySection = els.priorityFilter && els.priorityFilter.closest('.sidebar-section');
      if (prioritySection) {
        prioritySection.hidden = isNotes;
      }

      if (els.searchInput) {
        els.searchInput.value = state.search;
        els.searchInput.placeholder = isNotes ? 'Поиск заметок…' : 'Поиск задач…';
        const wrap = els.searchInput.closest('.search-wrap');
        if (wrap) wrap.classList.toggle('has-value', Boolean(state.search));
      }
    }

    function renderHotkeyStatus() {
      const settings = (state.data && state.data.settings) || {};
      const enabled = Boolean(settings.hotkeyEnabled);
      const registered = Boolean(state.runtime && state.runtime.hotkeyRegistered);
      if (els.hotkeyStatus) {
        els.hotkeyStatus.className = `statusbar-dot ${enabled && registered ? 'is-on' : 'is-off'}`;
        els.hotkeyStatus.title = !enabled
          ? 'Горячая клавиша отключена'
          : registered
            ? `Горячая клавиша: ${U.formatHotkey(settings.hotkey)}`
            : 'Не удалось зарегистрировать горячую клавишу';
      }
      if (els.hotkeyHint) {
        els.hotkeyHint.textContent = enabled
          ? U.formatHotkey(settings.hotkey)
          : 'Горячая клавиша отключена';
      }

      if (state.view === 'notes') {
        if (els.statusLeft) els.statusLeft.textContent = U.noteCount(visibleNotes().length);
        return;
      }

      const visibleCount = getVisibleTasks(state, U).length;
      const total = state.data.tasks.length;
      let text = total === visibleCount ? U.taskCount(total) : `Показано ${visibleCount} из ${total}`;
      if (state.view === 'notes') {
        const notesCount = state.data.notes.length;
        if (notesCount > 0) {
          text += ` · ${U.noteCount(notesCount)}`;
        }
      }
      if (els.statusLeft) els.statusLeft.textContent = text;

      const counts = computeCounts(state, U);
      if (counts.doneActualMinutes > 0 && els.statusLeft) {
        els.statusLeft.textContent += ` · Затрачено: ${counts.doneActualMinutes} мин`;
      }
    }

    function setView(view, categoryId) {
      if (view === 'category') {
        state.view = 'category';
        state.categoryId = categoryId || null;
        state.filter = 'active';
      } else {
        state.view = view;
        state.categoryId = null;
        if (view === 'notes' || view === 'inbox') {
          state.priorityFilter = '';
          state.dueFilter = '';
        }
        if (view === 'done') state.filter = 'all';
        else if (state.filter === 'done') state.filter = 'active';
      }
      if (typeof renderAll === 'function') renderAll();
    }

    return {
      renderSidebar,
      renderHeader,
      syncFilters,
      renderHotkeyStatus,
      setView
    };
  }

  window.AppView = { create: createViewModule };
})();
