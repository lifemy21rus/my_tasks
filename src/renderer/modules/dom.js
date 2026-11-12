'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function makeIconButton(action, title, icon, extraClass) {
    const icons = {
      clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.7"/>',
      pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      trash:
        '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v5M14 11v5"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      'chevron-down': '<path d="M6 9l6 6 6-6"/>',
      'chevron-right': '<path d="M9 6l6 6-6 6"/>',
      undo: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 7"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>'
    };
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `icon-btn${extraClass ? ` ${extraClass}` : ''}`;
    button.dataset.action = action;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${icons[icon] || ''}</svg>`;
    return button;
  }

  function setSvgIcon(container, paths, width, height, strokeWidth = '1.9') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', strokeWidth);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (paths) {
      if (typeof paths === 'string' && paths.trim().startsWith('<')) {
        svg.innerHTML = paths;
      } else if (Array.isArray(paths)) {
        for (const d of paths) {
          const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          pathEl.setAttribute('d', d);
          svg.appendChild(pathEl);
        }
      } else {
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', paths);
        svg.appendChild(pathEl);
      }
    }
    container.appendChild(svg);
  }

  function cacheElements() {
    const els = {
      categoryList: $('category-list'),
      viewTitle: $('view-title'),
      viewSub: $('view-sub'),
      searchInput: $('search-input'),
      searchClear: $('search-clear'),
      filterGroup: $('filter-group'),
      viewModeGroup: $('view-mode-group'),
      sortSelect: $('sort-select'),
      taskList: $('task-list'),
      emptyState: $('empty-state'),
      emptyTitle: $('empty-title'),
      emptyText: $('empty-text'),
      emptyAddBtn: $('empty-add-btn'),
      newTaskBtn: $('new-task-btn'),
      settingsBtn: $('settings-btn'),
      addCategoryBtn: $('add-category-btn'),
      clearCompletedBtn: $('clear-completed-btn'),
      statusLeft: $('status-left'),
      hotkeyStatus: $('hotkey-status'),
      hotkeyHint: $('hotkey-hint'),
      modalBackdrop: $('modal-backdrop'),
      taskModal: $('task-modal'),
      taskModalTitle: $('task-modal-title'),
      taskTitleInput: $('task-title-input'),
      taskTitleError: $('task-title-error'),
      taskDescInput: $('task-desc-input'),
      taskDateInput: $('task-date-input'),
      taskTimeInput: $('task-time-input'),
      taskPriorityInput: $('task-priority-input'),
      taskCategoryInput: $('task-category-input'),
      taskStatusInput: $('task-status-input'),
      taskEstimatedMinutes: $('task-estimated-minutes'),
      taskActualMinutes: $('task-actual-minutes'),
      clearDueBtn: $('clear-due-btn'),
      quickDue: $('quick-due'),
      reminderList: $('reminder-list'),
      addReminderBtn: $('add-reminder-btn'),
      taskColorGrid: $('task-color-grid'),
      recurrenceTypeRadios: $$('input[name="recurrence-type"]'),
      recurrenceOptions: $('recurrence-options'),
      recurrenceInterval: $('recurrence-interval'),
      recurrenceWeekdays: $('recurrence-weekdays'),
      recurrenceWeekdayCheckboxes: $$('input[name="recurrence-weekday"]'),
      recurrenceEndDate: $('recurrence-end-date'),
      subtaskEditorList: $('subtask-editor-list'),
      subtaskInput: $('subtask-input'),
      subtaskAddBtn: $('subtask-add-btn'),
      subtaskCounter: $('subtask-counter'),
      taskTagsInput: $('task-tags-input'),
      taskTagsChips: $('task-tags-chips'),
      taskAttachmentsField: $('task-attachments-field'),
      taskAttachmentList: $('task-attachment-list'),
      taskAttachmentAddBtn: $('task-attachment-add-btn'),
      taskAttachmentHint: $('task-attachment-hint'),
      taskSaveBtn: $('task-save-btn'),
      taskCancelBtn: $('task-cancel-btn'),
      taskDeleteBtn: $('task-delete-btn'),
      taskModalClose: $('task-modal-close'),
      newNoteBtn: $('new-note-btn'),
      noteList: $('note-list'),
      notesSection: $('notes-section'),
      notesSectionHead: $('notes-section-head'),
      notesSectionCount: $('notes-section-count'),
      notesSectionAddBtn: $('notes-section-add-btn'),
      notesViewActive: $('notes-view-active'),
      notesViewArchived: $('notes-view-archived'),
      notesRow: $('topbar-notes-row'),
      noteModal: $('note-modal'),
      noteModalTitle: $('note-modal-title'),
      noteTitleInput: $('note-title-input'),
      noteContentInput: $('note-content-input'),
      noteTitleError: $('note-title-error'),
      noteTagsInput: $('note-tags-input'),
      noteTagsChips: $('note-tags-chips'),
      noteAttachmentList: $('note-attachment-list'),
      noteAttachmentAddBtn: $('note-attachment-add-btn'),
      noteAttachmentHint: $('note-attachment-hint'),
      noteColorPicker: $('note-color-picker'),
      noteSaveBtn: $('note-save-btn'),
      noteCancelBtn: $('note-cancel-btn'),
      noteModalClose: $('note-modal-close'),
      confirmModal: $('confirm-modal'),
      confirmTitle: $('confirm-title'),
      confirmText: $('confirm-text'),
      confirmOk: $('confirm-ok'),
      confirmCancel: $('confirm-cancel'),
      confirmClose: $('confirm-close'),
      promptModal: $('prompt-modal'),
      promptTitle: $('prompt-title'),
      promptMessage: $('prompt-message'),
      promptLabel: $('prompt-label'),
      promptInput: $('prompt-input'),
      promptError: $('prompt-error'),
      promptOk: $('prompt-ok'),
      promptCancel: $('prompt-cancel'),
      promptClose: $('prompt-close'),
      categoryModal: $('category-modal'),
      categoryModalTitle: $('category-modal-title'),
      categoryNameInput: $('category-name-input'),
      categoryNameError: $('category-name-error'),
      categoryColorGrid: $('category-color-grid'),
      categoryDeleteBtn: $('category-delete-btn'),
      categorySaveBtn: $('category-save-btn'),
      categoryCancelBtn: $('category-cancel-btn'),
      categoryModalClose: $('category-modal-close'),
      priorityFilter: $('priority-filter'),
      statusFilter: $('status-filter'),
      statusFilterSection: $('status-filter-section'),
      dueFilterSelect: $('due-filter'),
      dueFromInput: $('due-from'),
      dueToInput: $('due-to'),
      dueRange: $('due-range'),
      dueRangeToggle: $('due-range-toggle'),
      tagFilter: $('tag-filter'),
      tagFilterSection: $('tag-filter-section'),
      attachmentsFilter: $('attachments-filter'),
      attachmentsFilterSection: $('attachments-filter-section'),
      smartListsSection: $('smart-lists-section'),
      smartListList: $('smart-list-list'),
      saveSmartListBtn: $('save-smart-list-btn'),
      settingsModal: $('settings-modal'),
      settingsDoneBtn: $('settings-done-btn'),
      settingsModalClose: $('settings-modal-close'),
      settingAutostart: $('setting-autostart'),
      settingStartMinimized: $('setting-start-minimized'),
      settingStartMenuShortcut: $('setting-start-menu-shortcut'),
      settingMiniPanel: $('setting-mini-panel'),
      settingMiniPanelAtStart: $('setting-mini-panel-at-start'),
      settingMiniPanelTabs: $('setting-mini-panel-tabs'),
      settingDataEncryption: $('setting-data-encryption'),
      settingQuitOnClose: $('setting-quit-on-close'),
      settingDefaultRemind: $('setting-default-remind'),
      settingRemindAtDue: $('setting-remind-at-due'),
      settingHotkeyEnabled: $('setting-hotkey-enabled'),
      settingHotkeyInput: $('setting-hotkey-input'),
      settingHotkeyCapture: $('setting-hotkey-capture'),
      settingHotkeyReset: $('setting-hotkey-reset'),
      themeGrid: $('theme-grid'),
      testNotificationBtn: $('test-notification-btn'),
      exportBtn: $('export-btn'),
      exportCsvBtn: $('export-csv-btn'),
      importBtn: $('import-btn'),
      backupBtn: $('backup-btn'),
      restoreBackupBtn: $('restore-backup-btn'),
      openFolderBtn: $('open-folder-btn'),
      backupList: $('backup-list'),
      backupListWrap: $('backup-list-wrap'),
      attachmentsGcBtn: $('attachments-gc-btn'),
      tagManageList: $('tag-manage-list'),
      tagNewName: $('tag-new-name'),
      tagAddBtn: $('tag-add-btn'),
      statsGrid: $('stats-grid'),
      activityList: $('activity-list'),
      activityFilter: $('activity-filter'),
      dataDirLabel: $('data-dir-label'),
      versionLabel: $('version-label'),
      checkUpdatesBtn: $('check-updates-btn'),
      installUpdateBtn: $('install-update-btn'),
      updateStatusNote: $('update-status-note'),
      tagSuggestions: $('tag-suggestions'),
      toastStack: $('toast-stack')
    };
    return els;
  }

  window.AppDOM = { $, $$, makeIconButton, cacheElements, setSvgIcon };
})();
