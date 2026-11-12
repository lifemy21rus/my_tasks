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

    function syncStatusFilter() {
      if (els.statusFilter) els.statusFilter.value = state.statusFilter || '';
    }

    function syncDueFilter() {
      if (els.dueFilterSelect) {
        els.dueFilterSelect.value = state.dueFilter || '';
      }
      if (els.dueFromInput) els.dueFromInput.value = state.dueFrom || '';
      if (els.dueToInput) els.dueToInput.value = state.dueTo || '';
      const hasRange = Boolean(state.dueFrom || state.dueTo);
      const open = Boolean(state.dueRangeOpen) || hasRange;
      if (els.dueRange) els.dueRange.hidden = !open;
      if (els.dueRangeToggle) {
        els.dueRangeToggle.setAttribute('aria-expanded', String(open));
        els.dueRangeToggle.classList.toggle('is-active', open);
      }
    }

    function syncTagFilter() {
      const values = new Set();
      for (const task of state.data.tasks || []) {
        for (const tag of task.tags || []) if (tag) values.add(String(tag));
      }
      for (const note of state.data.notes || []) {
        for (const tag of note.tags || []) if (tag) values.add(String(tag));
      }
      for (const tag of state.data.tags || []) {
        if (tag && tag.name) values.add(String(tag.name));
      }
      const sorted = Array.from(values).sort((a, b) => a.localeCompare(b, 'ru'));

      if (els.tagFilter) {
        const current = state.tagFilter || '';
        els.tagFilter.textContent = '';
        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'Все теги';
        els.tagFilter.appendChild(allOpt);
        for (const value of sorted) {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = value;
          els.tagFilter.appendChild(opt);
        }
        if (current && !values.has(current)) {
          const opt = document.createElement('option');
          opt.value = current;
          opt.textContent = current;
          els.tagFilter.appendChild(opt);
        }
        els.tagFilter.value = current;
      }

      if (els.attachmentsFilter) {
        els.attachmentsFilter.value = state.attachmentsFilter || '';
      }

      if (els.tagSuggestions) {
        els.tagSuggestions.textContent = '';
        for (const value of sorted) {
          const opt = document.createElement('option');
          opt.value = value;
          els.tagSuggestions.appendChild(opt);
        }
      }
    }

    function syncFilters() {
      $$('.chip', els.filterGroup).forEach((chip) => {
        chip.classList.toggle('is-active', chip.dataset.filter === state.filter);
      });
      $$('.chip[data-view-mode]', els.viewModeGroup || document).forEach((chip) => {
        chip.classList.toggle('is-active', chip.dataset.viewMode === (state.viewMode || 'list'));
      });
      if (els.sortSelect) els.sortSelect.value = state.sort;
      syncPriorityFilters();
      syncStatusFilter();
      syncDueFilter();
      syncTagFilter();
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

    function currentCriteria() {
      return {
        view: state.view,
        viewMode: state.viewMode || 'list',
        categoryId: state.categoryId || null,
        filter: state.filter,
        search: state.search || '',
        sort: state.sort,
        dueFilter: state.dueFilter || '',
        dueFrom: state.dueFrom || '',
        dueTo: state.dueTo || '',
        priorityFilter: state.priorityFilter || '',
        statusFilter: state.statusFilter || '',
        tagFilter: state.tagFilter || '',
        attachmentsFilter: state.attachmentsFilter || '',
        notesArchive: Boolean(state.notesArchive)
      };
    }

    function applyCriteria(criteria) {
      if (!criteria || typeof criteria !== 'object') return;
      const c = criteria;
      state.view = typeof c.view === 'string' ? c.view : 'all';
      state.viewMode = typeof c.viewMode === 'string' ? c.viewMode : 'list';
      state.categoryId = c.categoryId || null;
      state.filter = typeof c.filter === 'string' ? c.filter : 'active';
      state.search = typeof c.search === 'string' ? c.search : '';
      state.sort = typeof c.sort === 'string' ? c.sort : 'smart';
      state.dueFilter = typeof c.dueFilter === 'string' ? c.dueFilter : '';
      state.dueFrom = typeof c.dueFrom === 'string' ? c.dueFrom : '';
      state.dueTo = typeof c.dueTo === 'string' ? c.dueTo : '';
      state.priorityFilter = typeof c.priorityFilter === 'string' ? c.priorityFilter : '';
      state.statusFilter = typeof c.statusFilter === 'string' ? c.statusFilter : '';
      state.tagFilter = typeof c.tagFilter === 'string' ? c.tagFilter : '';
      state.attachmentsFilter = typeof c.attachmentsFilter === 'string' ? c.attachmentsFilter : '';
      state.notesArchive = Boolean(c.notesArchive);
    }

    function renderSmartLists() {
      if (!els.smartListList) return;
      const lists = (state.data && state.data.smartLists) || [];
      els.smartListList.textContent = '';
      for (const list of lists) {
        const row = document.createElement('div');
        row.className = 'smart-list-row';
        row.dataset.id = list.id;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `category-item${state.activeSmartListId === list.id ? ' is-active' : ''}`;
        btn.dataset.action = 'apply-smart-list';
        btn.dataset.smartListId = list.id;
        btn.title = list.name;
        const label = document.createElement('span');
        label.className = 'category-name';
        label.textContent = list.name;
        btn.appendChild(label);

        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'icon-btn small';
        rename.dataset.action = 'rename-smart-list';
        rename.dataset.smartListId = list.id;
        rename.title = 'Переименовать список';
        rename.setAttribute('aria-label', 'Переименовать список');
        rename.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn small danger';
        del.dataset.action = 'delete-smart-list';
        del.dataset.smartListId = list.id;
        del.title = 'Удалить список';
        del.setAttribute('aria-label', 'Удалить список');
        del.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

        row.append(btn, rename, del);
        els.smartListList.appendChild(row);
      }
      if (lists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'field-hint';
        empty.textContent = 'Нет сохранённых списков';
        els.smartListList.appendChild(empty);
      }
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
      if (!isNotes && state.activeSmartListId) {
        const activeList = (state.data.smartLists || []).find(
          (l) => l.id === state.activeSmartListId
        );
        if (activeList && activeList.name) {
          subtitle += ` • Список: ${activeList.name}`;
        }
      }
      if (els.viewSub) els.viewSub.textContent = subtitle;

      const doneCount = state.data.tasks.filter((task) => task.done).length;
      if (els.clearCompletedBtn) els.clearCompletedBtn.hidden = doneCount === 0 || isNotes;

      if (isNotes) {
        const filtersRow = els.filterGroup && els.filterGroup.closest('.filters-row');
        if (filtersRow) filtersRow.hidden = true;
        const sortWrap = els.sortSelect && els.sortSelect.closest('.sort-wrap');
        if (sortWrap) sortWrap.hidden = true;
        if (els.viewModeGroup) els.viewModeGroup.hidden = true;
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
        if (sortWrap) sortWrap.hidden = state.viewMode === 'calendar';
        if (els.viewModeGroup) els.viewModeGroup.hidden = false;
        if (els.notesRow) els.notesRow.hidden = true;
      }

      const prioritySection = els.priorityFilter && els.priorityFilter.closest('.sidebar-section');
      if (prioritySection) {
        prioritySection.hidden = isNotes;
      }

      const statusSection =
        els.statusFilterSection ||
        (els.statusFilter && els.statusFilter.closest('.sidebar-section')) ||
        null;
      if (statusSection) {
        statusSection.hidden = isNotes;
      }

      const tagSection =
        els.tagFilterSection ||
        (els.tagFilter && els.tagFilter.closest('.sidebar-section')) ||
        null;
      if (tagSection) {
        tagSection.hidden = isNotes;
      }

      const attachmentsSection =
        els.attachmentsFilterSection ||
        (els.attachmentsFilter && els.attachmentsFilter.closest('.sidebar-section')) ||
        null;
      if (attachmentsSection) {
        attachmentsSection.hidden = isNotes;
      }

      const smartSection = els.smartListsSection || null;
      if (smartSection) smartSection.hidden = isNotes;
      renderSmartLists();

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
      let text =
        total === visibleCount ? U.taskCount(total) : `Показано ${visibleCount} из ${total}`;
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
          state.statusFilter = '';
          state.dueFilter = '';
          state.dueFrom = '';
          state.dueTo = '';
          state.tagFilter = '';
          state.attachmentsFilter = '';
        }
        if (view === 'notes') state.viewMode = 'list';
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
      setView,
      currentCriteria,
      applyCriteria,
      renderSmartLists
    };
  }

  window.AppView = { create: createViewModule };
})();
