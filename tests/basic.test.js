'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { Store } = require('../src/main/store');
const {
  getReminderPlan,
  getReminderPlans,
  isReminderMissed
} = require('../src/main/reminder-logic');
const { noteCount, groupNotes, sortNotes } = require('../src/shared/utils');

test('parent task auto-completes when all subtasks done', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const task = store.addTask({ title: 'Родитель' });
  const t1 = store.addSubtask(task.id, 'Шаг 1');
  const t2 = store.addSubtask(task.id, 'Шаг 2');

  const sub1 = t1.subtasks.find((s) => s.title === 'Шаг 1');
  const sub2 = t2.subtasks.find((s) => s.title === 'Шаг 2');

  store.toggleSubtask(task.id, sub1.id, true);
  let current = store.getTasks().find((x) => x.id === task.id);
  assert.equal(current.done, false);
  assert.equal(current.completedAt, null);

  store.toggleSubtask(task.id, sub2.id, true);
  current = store.getTasks().find((x) => x.id === task.id);
  assert.equal(current.done, true);
  assert.ok(current.completedAt);
});

test('checking parent applies to all subtasks and completes it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const task = store.addTask({ title: 'Родитель2' });
  store.addSubtask(task.id, 'А');
  store.addSubtask(task.id, 'Б');

  store.toggleTask(task.id, true);
  let current = store.getTasks().find((x) => x.id === task.id);
  assert.equal(current.done, true);
  assert.ok(current.completedAt);
  for (const sub of current.subtasks) assert.equal(sub.done, true);

  store.toggleTask(task.id, false);
  current = store.getTasks().find((x) => x.id === task.id);
  assert.equal(current.done, false);
  assert.equal(current.completedAt, null);
  for (const sub of current.subtasks) assert.equal(sub.done, false);
});

test('adding subtask to completed parent reopens it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const task = store.addTask({ title: 'Родитель3' });
  store.addSubtask(task.id, 'Готово');
  let current = store.getTasks().find((x) => x.id === task.id);
  const sub = current.subtasks[0];
  store.toggleSubtask(task.id, sub.id, true);
  current = store.getTasks().find((x) => x.id === task.id);
  assert.equal(current.done, true);

  store.addSubtask(task.id, 'Новый шаг');
  current = store.getTasks().find((x) => x.id === task.id);
  assert.equal(current.done, false);
  assert.equal(current.completedAt, null);
});

test('subtasks are limited to two levels', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const task = store.addTask({
    title: 'Уровни',
    subtasks: [
      {
        title: 'Уровень 1',
        subtasks: [
          {
            title: 'Уровень 2',
            subtasks: [{ title: 'Уровень 3' }]
          }
        ]
      }
    ]
  });

  const current = store.getTasks().find((x) => x.id === task.id);
  const level1 = current.subtasks[0];
  const level2 = level1.subtasks[0];
  assert.equal(level2.title, 'Уровень 2');
  assert.equal(level2.subtasks.length, 0);

  assert.throws(
    () => store.addSubtask(task.id, 'Уровень 3', level2.id),
    /Максимум два уровня подзадач/
  );
});

test('deleting category moves tasks to "Без категории"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const cat = store.addCategory({ name: 'Работа', color: '#2563eb' });
  const task = store.addTask({ title: 'Задача', categoryId: cat.id });
  assert.equal(task.categoryId, cat.id);

  store.deleteCategory(cat.id);
  const current = store.getTasks().find((x) => x.id === task.id);
  assert.equal(current.categoryId, null);
});

test('notes can be added, updated, completed and deleted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const note = store.addNote({ title: '  Идея  ', content: '  Текст заметки  ', color: '#4ecdc4' });
  assert.equal(note.title, 'Идея');
  assert.equal(note.content, 'Текст заметки');
  assert.equal(note.color, '#4ecdc4');
  assert.equal(note.done, false);

  const updated = store.updateNote(note.id, { title: 'Новая идея', content: 'Обновлённый текст' });
  assert.equal(updated.title, 'Новая идея');
  assert.equal(updated.content, 'Обновлённый текст');
  assert.ok(updated.updatedAt);

  const toggled = store.toggleNote(note.id, true);
  assert.equal(toggled.done, true);
  assert.equal(store.getNotes()[0].done, true);

  store.deleteNote(note.id);
  assert.equal(store.getNotes().length, 0);
});

test('note update rejects an empty title and survives reload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });
  const note = store.addNote({ title: 'Заметка', content: '', color: '#ff6b6b' });

  assert.throws(() => store.updateNote(note.id, { title: '   ' }), /название/);

  const reloaded = new Store(dir, { isPackaged: false });
  const notes = reloaded.getNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'Заметка');
  assert.equal(notes[0].color, '#ff6b6b');
});

test('deleting category clears it from notes too', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const cat = store.addCategory({ name: 'Идеи', color: '#7c3aed' });
  const note = store.addNote({
    title: 'Заметка',
    content: '',
    color: '#4ecdc4',
    categoryId: cat.id
  });
  assert.equal(note.categoryId, cat.id);

  store.deleteCategory(cat.id);
  assert.equal(store.getNotes()[0].categoryId, null);
});

test('note count uses correct Russian plural forms', () => {
  assert.equal(noteCount(1), '1 заметка');
  assert.equal(noteCount(2), '2 заметки');
  assert.equal(noteCount(5), '5 заметок');
  assert.equal(noteCount(11), '11 заметок');
  assert.equal(noteCount(21), '21 заметка');
  assert.equal(noteCount(0), '0 заметок');
});

test('notes are grouped into active and completed sections', () => {
  const notes = [
    { id: 'a', title: 'Первая', done: false, updatedAt: '2024-01-02T10:00:00.000Z' },
    { id: 'b', title: 'Вторая', done: true, updatedAt: '2024-01-03T10:00:00.000Z' },
    { id: 'c', title: 'Третья', done: false, updatedAt: '2024-01-04T10:00:00.000Z' }
  ];

  const groups = groupNotes(notes);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, 'active');
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].key, 'done');
  assert.equal(groups[1].items.length, 1);
  assert.equal(groups[1].items[0].id, 'b');
});

test('empty note groups are omitted and notes sort by update time', () => {
  assert.deepEqual(groupNotes([]), []);
  assert.deepEqual(
    groupNotes([{ id: 'a', title: 'Готово', done: true }]).map((g) => g.key),
    ['done']
  );

  const sorted = sortNotes([
    { id: 'old', title: 'Старая', updatedAt: '2024-01-01T10:00:00.000Z' },
    { id: 'new', title: 'Новая', updatedAt: '2024-01-05T10:00:00.000Z' }
  ]);
  assert.equal(sorted[0].id, 'new');
});

test('reminder plan respects defaults and per-task overrides', () => {
  const now = Date.now();
  const due = now + 120 * 60000;
  const settings = { defaultRemindBefore: 60, defaultRemindAtDue: true };

  const plan1 = getReminderPlan(
    { id: '1', done: false, dueAt: new Date(due).toISOString() },
    settings,
    now
  );
  assert.equal(plan1.hasAdvance, true);
  assert.equal(plan1.offset, 60);

  const plan2 = getReminderPlan(
    { id: '2', done: false, dueAt: new Date(due).toISOString(), remindBefore: 30 },
    settings,
    now
  );
  assert.equal(plan2.offset, 30);

  const plan3 = getReminderPlan(
    { id: '3', done: false, dueAt: new Date(due).toISOString(), remindBefore: -1 },
    settings,
    now
  );
  assert.equal(plan3.hasAdvance, false);

  const plan4 = getReminderPlan(
    { id: '4', done: false, dueAt: new Date(due).toISOString(), remindAtDue: false },
    settings,
    now
  );
  assert.equal(plan4.hasDue, false);
});

test('missed reminder detection works', () => {
  const now = Date.now();
  const due = now - 10 * 60000;
  const settings = { defaultRemindBefore: 60, defaultRemindAtDue: true };
  const task = { id: '1', done: false, dueAt: new Date(due).toISOString() };
  assert.equal(isReminderMissed(task, settings, now), true);

  const snoozed = { ...task, snoozedUntil: new Date(now + 60000).toISOString() };
  assert.equal(isReminderMissed(snoozed, settings, now), false);
});

test('getReminderPlans returns multiple reminders per task', () => {
  const now = Date.now();
  const due = now + 120 * 60000;
  const settings = { defaultRemindBefore: 60, defaultRemindAtDue: true };
  const task = {
    id: '1',
    done: false,
    dueAt: new Date(due).toISOString(),
    reminders: [
      { offset: 1440, type: 'before' },
      { offset: 30, type: 'before' },
      { offset: 0, type: 'due' }
    ]
  };
  const plans = getReminderPlans(task, settings, now);
  assert.equal(plans.length, 3);
  assert.equal(plans[0].type, 'before');
  assert.equal(plans[0].offset, 1440);
  assert.equal(plans[1].type, 'before');
  assert.equal(plans[1].offset, 30);
  assert.equal(plans[2].type, 'due');
  assert.equal(plans[2].offset, 0);
});

test('getReminderPlan returns before-plan first for backward compatibility', () => {
  const now = Date.now();
  const due = now + 120 * 60000;
  const settings = { defaultRemindBefore: 60, defaultRemindAtDue: true };
  const task = {
    id: '1',
    done: false,
    dueAt: new Date(due).toISOString(),
    reminders: [
      { offset: 1440, type: 'before' },
      { offset: 0, type: 'due' }
    ]
  };
  const plan = getReminderPlan(task, settings, now);
  assert.equal(plan.type, 'before');
  assert.equal(plan.offset, 1440);
});

test('isReminderMissed works with multiple reminders', () => {
  const now = Date.now();
  const due = now - 10 * 60000; // already due
  const settings = { defaultRemindBefore: 60, defaultRemindAtDue: true };
  const task = {
    id: '1',
    done: false,
    dueAt: new Date(due).toISOString(),
    reminders: [
      { offset: 60, type: 'before' },
      { offset: 0, type: 'due' }
    ]
  };
  assert.equal(isReminderMissed(task, settings, now), true);

  const notified = {
    ...task,
    notifiedDueAt: new Date(now).toISOString(),
    notifiedBeforeAt: new Date(now).toISOString()
  };
  assert.equal(isReminderMissed(notified, settings, now), false);
});

test('completing a recurring task creates the next instance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const task = store.addTask({
    title: 'Daily report',
    dueAt: tomorrow,
    recurrence: { type: 'daily', interval: 1 }
  });

  assert.equal(store.getTasks().length, 1);
  assert.equal(task.recurrence.type, 'daily');

  store.toggleTask(task.id, true);
  const tasks = store.getTasks();
  assert.equal(tasks.length, 2);
  const completed = tasks.find((t) => t.id === task.id);
  assert.equal(completed.done, true);
  const next = tasks.find((t) => t.id !== task.id);
  assert.ok(next, 'Next instance should be created');
  assert.equal(next.title, 'Daily report');
  assert.equal(next.done, false);
  assert.equal(next.recurrence.type, 'daily');
  const nextDue = new Date(next.dueAt);
  const origDue = new Date(tomorrow);
  assert.equal(nextDue.getDate(), origDue.getDate() + 1);
});

test('bulk update, delete and toggle many tasks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const t1 = store.addTask({ title: 'A', dueAt: new Date(Date.now() + 86400000).toISOString() });
  const t2 = store.addTask({ title: 'B', dueAt: new Date(Date.now() + 172800000).toISOString() });
  const t3 = store.addTask({ title: 'C', dueAt: new Date(Date.now() + 259200000).toISOString() });

  const updated = store.updateManyTasks([t1.id, t2.id], { priority: 'high' });
  assert.equal(updated.results.length, 2);
  assert.equal(updated.errors.length, 0);
  assert.equal(store.getTasks().find((t) => t.id === t1.id).priority, 'high');
  assert.equal(store.getTasks().find((t) => t.id === t2.id).priority, 'high');

  const toggled = store.toggleManyTasks([t1.id, t2.id], true);
  assert.equal(toggled.results.length, 2);
  assert.equal(toggled.errors.length, 0);
  assert.equal(store.getTasks().find((t) => t.id === t1.id).done, true);

  const removed = store.deleteManyTasks([t3.id]);
  assert.equal(removed.removed, 1);
  assert.equal(removed.errors.length, 0);
  assert.equal(store.getTasks().length, 2);
});

test('notes can be archived and unarchived, hidden from default listing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  const note = store.addNote({ title: 'Заметка', content: 'Текст', color: '#ff6b6b' });
  assert.equal(store.getNotes().length, 1);
  assert.equal(store.getNotes(true).length, 1);
  assert.equal(note.archived, false);

  const archived = store.archiveNote(note.id);
  assert.equal(archived.archived, true);
  assert.equal(store.getNotes().length, 0);
  assert.equal(store.getNotes(true).length, 1);

  const unarchived = store.unarchiveNote(note.id);
  assert.equal(unarchived.archived, false);
  assert.equal(store.getNotes().length, 1);
});

test('archiveNote and unarchiveNote throw on missing note', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  assert.throws(() => store.archiveNote('missing-id'), /не найдена/);
  assert.throws(() => store.unarchiveNote('missing-id'), /не найдена/);
});

test('import rejects malformed JSON without breaking the store', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });
  const badFile = path.join(dir, 'bad.json');
  fs.writeFileSync(badFile, '{ not valid json', 'utf8');

  assert.throws(() => store.importFrom(badFile), /Не удалось прочитать файл импорта/);
  assert.equal(store.getTasks().length, 0);
  assert.equal(store.getNotes().length, 0);
});

test('import rejects non-object JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });
  const arrFile = path.join(dir, 'arr.json');
  fs.writeFileSync(arrFile, '[1,2,3]', 'utf8');

  assert.throws(() => store.importFrom(arrFile), /Некорректная структура/);
});

test('settings include mini panel options', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-'));
  const store = new Store(dir, { isPackaged: false });

  store.updateSettings({ miniPanelAtStart: true, miniPanelTabs: 'notes' });
  // updateSettings returns void; re-read via getSettings
  const current = store.getSettings();
  assert.equal(current.miniPanelAtStart, true);
  assert.equal(current.miniPanelTabs, 'notes');

  store.updateSettings({ miniPanelAtStart: false, miniPanelTabs: 'both' });
  const current2 = store.getSettings();
  assert.equal(current2.miniPanelAtStart, false);
  assert.equal(current2.miniPanelTabs, 'both');

  // invalid tabs value is ignored
  store.updateSettings({ miniPanelTabs: 'invalid' });
  assert.equal(store.getSettings().miniPanelTabs, 'both');
});

test('normalizeSettings applies defaults for new mini panel fields', () => {
  const { normalizeSettings } = require('../src/main/store');
  const settings = normalizeSettings({}, false);
  assert.equal(settings.miniPanelAtStart, false);
  assert.equal(settings.miniPanelTabs, 'both');

  const withValues = normalizeSettings({ miniPanelAtStart: true, miniPanelTabs: 'tasks' }, false);
  assert.equal(withValues.miniPanelAtStart, true);
  assert.equal(withValues.miniPanelTabs, 'tasks');
});
