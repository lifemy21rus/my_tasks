'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),

  addTask: (input) => ipcRenderer.invoke('task:add', input),
  updateTask: (id, patch) => ipcRenderer.invoke('task:update', { id, patch }),
  deleteTask: (id) => ipcRenderer.invoke('task:delete', id),
  toggleTask: (id, done) => ipcRenderer.invoke('task:toggle', { id, done }),
  updateManyTasks: (ids, patch) => ipcRenderer.invoke('task:update-many', { ids, patch }),
  deleteManyTasks: (ids) => ipcRenderer.invoke('task:delete-many', { ids }),
  toggleManyTasks: (ids, done) => ipcRenderer.invoke('task:toggle-many', { ids, done }),

  addSubtask: (taskId, title, parentSubtaskId) => ipcRenderer.invoke('subtask:add', { taskId, title, parentSubtaskId }),
  updateSubtask: (taskId, subtaskId, patch, parentSubtaskId) => ipcRenderer.invoke('subtask:update', { taskId, subtaskId, patch, parentSubtaskId }),
  deleteSubtask: (taskId, subtaskId, parentSubtaskId) => ipcRenderer.invoke('subtask:delete', { taskId, subtaskId, parentSubtaskId }),
  toggleSubtask: (taskId, subtaskId, done, parentSubtaskId) => ipcRenderer.invoke('subtask:toggle', { taskId, subtaskId, done, parentSubtaskId }),

  addCategory: (input) => ipcRenderer.invoke('category:add', input),
  updateCategory: (id, patch) => ipcRenderer.invoke('category:update', { id, patch }),
  deleteCategory: (id) => ipcRenderer.invoke('category:delete', id),

  addNote: (input) => ipcRenderer.invoke('note:add', input),
  updateNote: (id, patch) => ipcRenderer.invoke('note:update', { id, patch }),
  deleteNote: (id) => ipcRenderer.invoke('note:delete', id),
  toggleNote: (id, done) => ipcRenderer.invoke('note:toggle', { id, done }),

  getNoteTemplates: () => ipcRenderer.invoke('note-templates:get'),
  addNoteTemplate: (input) => ipcRenderer.invoke('note-templates:add', input),
  updateNoteTemplate: (id, patch) => ipcRenderer.invoke('note-templates:update', { id, patch }),
  deleteNoteTemplate: (id) => ipcRenderer.invoke('note-templates:delete', id),

  getTaskTemplates: () => ipcRenderer.invoke('task-templates:get'),
  addTaskTemplate: (input) => ipcRenderer.invoke('task-templates:add', input),
  updateTaskTemplate: (id, patch) => ipcRenderer.invoke('task-templates:update', { id, patch }),
  deleteTaskTemplate: (id) => ipcRenderer.invoke('task-templates:delete', id),

  clearCompleted: () => ipcRenderer.invoke('tasks:clear-completed'),
  snoozeTask: (id, until) => ipcRenderer.invoke('task:snooze', { id, until }),

  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  exportData: () => ipcRenderer.invoke('data:export'),
  exportDataCsv: () => ipcRenderer.invoke('data:export-csv'),
  importData: () => ipcRenderer.invoke('data:import'),
  backupNow: () => ipcRenderer.invoke('data:backup'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  testNotification: () => ipcRenderer.invoke('notification:test'),

  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),

  expand: (taskId) => ipcRenderer.invoke('window:expand', { taskId: taskId || null }),
  newTask: () => ipcRenderer.invoke('window:new-task'),
  newNote: () => ipcRenderer.invoke('window:new-note'),
  focusNote: (noteId) => ipcRenderer.invoke('window:focus-note', { noteId: noteId || null }),
  hideMini: () => ipcRenderer.invoke('window:hide-mini'),

  onFocusTask: (callback) => subscribe('focus:task', callback),
  onFocusOverdue: (callback) => subscribe('focus:overdue', callback),
  onFocusNote: (callback) => subscribe('focus:note', callback),
  onOpenSettings: (callback) => subscribe('open:settings', callback),
  onNewTask: (callback) => subscribe('new:task', callback),
  onNewNote: (callback) => subscribe('new:note', callback),
  onStateChanged: (callback) => subscribe('state:changed', callback),
  onUpdateAvailable: (callback) => subscribe('update:available', callback)
});
