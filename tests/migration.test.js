'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { Store } = require('../src/main/store');
const { migrateData, normalizeData, encryptData } = require('../src/main/normalizers');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('migration: v1 fixture migrates to valid v2 and is idempotent', () => {
  const fixture = readJson(path.join(__dirname, 'fixtures/v1/full.json'));
  const migrated1 = migrateData(fixture, { isPackaged: false });
  const data1 = normalizeData(migrated1, false);
  const migrated2 = migrateData(JSON.parse(JSON.stringify(data1)), { isPackaged: false });
  const data2 = normalizeData(migrated2, false);

  assert.equal(data1.version, 2);
  assert.equal(data2.version, 2);
  assert.ok(data1.meta && data1.meta.migratedFrom === 1);
  assert.deepEqual(
    data1.tasks.map((t) => t.id),
    data2.tasks.map((t) => t.id)
  );
  assert.deepEqual(
    data1.notes.map((n) => n.id),
    data2.notes.map((n) => n.id)
  );

  const task1 = data1.tasks.find((t) => t.id === 'task1');
  assert.ok(task1);
  assert.equal(task1.status, 'todo');
  assert.ok(Array.isArray(task1.tags));
  assert.ok(Array.isArray(task1.attachments));
  assert.ok(Number.isFinite(task1.order));
  assert.equal(task1.priority, 'high');
  assert.ok(Array.isArray(task1.subtasks) && task1.subtasks.length === 2);

  const doneTask = data1.tasks.find((t) => t.id === 'task2');
  assert.ok(doneTask);
  assert.equal(doneTask.done, true);
  assert.equal(doneTask.status, 'done');

  const note = data1.notes.find((n) => n.id === 'note1');
  assert.ok(note);
  assert.equal(note.archived, true);
  assert.deepEqual(note.tags, []);
  assert.deepEqual(note.attachments, []);
  assert.deepEqual(note.linkedTaskIds, []);

  assert.ok(Array.isArray(data1.tags));
  assert.ok(Array.isArray(data1.smartLists));
  assert.ok(Array.isArray(data1.attachments));
  assert.ok(Array.isArray(data1.activity));
  assert.equal(data1.settings.theme, 'dark');
});

test('migration: Store.load migrates existing v1 file and preserves data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-mig-'));
  const fixture = readJson(path.join(__dirname, 'fixtures/v1/full.json'));
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(fixture, null, 2), 'utf8');

  const store = new Store(dir, { isPackaged: false });
  const data = store.getData();
  assert.equal(data.version, 2);
  assert.equal(data.tasks.length, 2);
  assert.equal(data.notes.length, 1);
  assert.equal(store.getTasks().find((t) => t.id === 'task1').title, 'Задача с подзадачами');

  const notice = store.takeNotice();
  assert.ok(notice && notice.type === 'success');
  assert.ok(String(notice.message || '').includes('2.0'));
  assert.equal(store.takeNotice(), null);

  const saved = readJson(path.join(dir, 'data.json'));
  assert.equal(saved.version, 2);
});

test('migration: importing v1 JSON yields v2 data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-import-'));
  const store = new Store(dir, { isPackaged: false });
  const fixturePath = path.join(__dirname, 'fixtures/v1/full.json');

  const result = store.importFrom(fixturePath);
  assert.equal(result.tasks, 2);
  assert.equal(result.categories, 1);
  assert.equal(result.notes, 1);

  const data = store.getData();
  assert.equal(data.version, 2);
  assert.ok(data.tasks.every((t) => Array.isArray(t.tags) && typeof t.status === 'string'));
});

test('backup restore: restores data from created backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-restore-'));
  const store = new Store(dir, { isPackaged: false });
  store.addTask({ title: 'A' });
  const backupPath = store.createBackup('manual');
  store.addTask({ title: 'B' });
  assert.equal(store.getTasks().length, 2);

  store.restoreBackup(backupPath);
  assert.equal(store.getTasks().length, 1);
  assert.equal(store.getTasks()[0].title, 'A');
});

test('export/import: transfers attachments bundle next to JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-export-'));
  const store = new Store(dir, { isPackaged: false });
  const task = store.addTask({ title: 'With attachment' });
  const srcFile = path.join(dir, 'sample.txt');
  fs.writeFileSync(srcFile, 'hello-attachment', 'utf8');
  const att = store.addAttachmentFromPath(srcFile, { taskId: task.id });
  assert.ok(att && att.id);

  const exportPath = path.join(dir, 'bundle.json');
  store.exportTo(exportPath);
  assert.ok(fs.existsSync(exportPath));
  assert.ok(fs.existsSync(`${exportPath}.attachments`));

  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-import2-'));
  const store2 = new Store(dir2, { isPackaged: false });
  const result = store2.importFrom(exportPath);
  assert.equal(result.tasks, 1);
  const data = store2.getData();
  assert.equal(data.attachments.length, 1);
  const restoredTask = data.tasks.find((t) => t.title === 'With attachment');
  assert.ok(restoredTask && restoredTask.attachments.length === 1);
  const attPath = store2.getAttachmentPath(data.attachments[0].id);
  assert.equal(fs.readFileSync(attPath, 'utf8'), 'hello-attachment');
});

test('export/import: missing attachments bundle does not fail import', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-export-nobundle-'));
  const store = new Store(dir, { isPackaged: false });
  store.addTask({ title: 'No bundle task' });
  const exportPath = path.join(dir, 'solo.json');
  store.exportTo(exportPath);
  // ensure no bundle
  try {
    fs.rmSync(`${exportPath}.attachments`, { recursive: true, force: true });
  } catch (_) {}

  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-import-nobundle-'));
  const store2 = new Store(dir2, { isPackaged: false });
  const result = store2.importFrom(exportPath);
  assert.equal(result.tasks, 1);
  const data = store2.getData();
  assert.ok(Array.isArray(data.attachments));
});

test('backup restore: restores attachments snapshot when present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-backup-att-'));
  const store = new Store(dir, { isPackaged: false });
  const task = store.addTask({ title: 'Task with file' });
  const srcFile = path.join(dir, 'src.txt');
  fs.writeFileSync(srcFile, 'backup-content', 'utf8');
  const att = store.addAttachmentFromPath(srcFile, { taskId: task.id });
  assert.ok(att && att.id);

  const backupPath = store.createBackup('manual');
  assert.ok(fs.existsSync(backupPath.replace(/\.json$/i, '.attachments')));

  // mutate state: remove attachment metadata/file
  try {
    store.deleteAttachment(att.id);
  } catch (_) {}
  store.deleteTask(task.id);
  assert.equal(store.getAttachments().length, 0);

  store.restoreBackup(backupPath);
  const data = store.getData();
  assert.equal(data.tasks.length, 1);
  assert.equal(data.attachments.length, 1);
  const restoredPath = store.getAttachmentPath(data.attachments[0].id);
  assert.ok(restoredPath && fs.existsSync(restoredPath));
  assert.equal(fs.readFileSync(restoredPath, 'utf8'), 'backup-content');
});

test('backup restore: works when attachments snapshot is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-backup-noatt-'));
  const store = new Store(dir, { isPackaged: false });
  store.addTask({ title: 'Task A' });
  const backupPath = store.createBackup('manual');
  const attSnapshot = backupPath.replace(/\.json$/i, '.attachments');
  if (fs.existsSync(attSnapshot)) fs.rmSync(attSnapshot, { recursive: true, force: true });

  store.addTask({ title: 'Task B' });
  assert.equal(store.getTasks().length, 2);

  store.restoreBackup(backupPath);
  assert.equal(store.getTasks().length, 1);
  assert.equal(store.getTasks()[0].title, 'Task A');
});

test('backup restore: rejects files outside backups directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-restore-guard-'));
  const store = new Store(dir, { isPackaged: false });
  store.addTask({ title: 'A' });
  const outside = path.join(dir, 'outside.json');
  fs.writeFileSync(outside, JSON.stringify(store.getData(), null, 2), 'utf8');
  assert.throws(() => store.restoreBackup(outside), /backups/i);
});

test('migration: partial v1 data is normalized with defaults and required collections', () => {
  const raw = { tasks: [{ title: 'Only title' }], notes: [{ title: 'Note' }] };
  const migrated = migrateData(raw, { isPackaged: false });
  const data = normalizeData(migrated, false);

  assert.equal(data.version, 2);
  assert.ok(Array.isArray(data.tags));
  assert.ok(Array.isArray(data.smartLists));
  assert.ok(Array.isArray(data.attachments));
  assert.ok(Array.isArray(data.activity));
  assert.ok(data.meta && typeof data.meta === 'object');
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].status, 'todo');
  assert.ok(Array.isArray(data.tasks[0].tags));
  assert.ok(Array.isArray(data.tasks[0].attachments));
  assert.equal(data.notes.length, 1);
  assert.ok(Array.isArray(data.notes[0].tags));
  assert.ok(Array.isArray(data.notes[0].attachments));
  assert.ok(Array.isArray(data.notes[0].linkedTaskIds));
});

test('migration: preserves legacy reminders, recurrence, snooze and notified fields', () => {
  const raw = {
    version: 1,
    tasks: [
      {
        id: 't1',
        title: 'Legacy',
        done: false,
        dueAt: '2026-12-01T15:00:00.000Z',
        remindBefore: 30,
        remindAtDue: true,
        recurrence: { type: 'daily', interval: 2, endDate: null },
        snoozedUntil: '2026-12-01T14:30:00.000Z',
        notifiedBeforeAt: '2026-12-01T14:30:00.000Z',
        notifiedDueAt: null,
        createdAt: '2026-01-01T10:00:00.000Z'
      }
    ]
  };

  const data = normalizeData(migrateData(raw, { isPackaged: false }), false);
  const task = data.tasks[0];
  assert.equal(task.remindBefore, 30);
  assert.equal(task.remindAtDue, true);
  assert.ok(Array.isArray(task.reminders) && task.reminders.length >= 1);
  assert.ok(task.recurrence && task.recurrence.type === 'daily' && task.recurrence.interval === 2);
  assert.equal(task.snoozedUntil, '2026-12-01T14:30:00.000Z');
  assert.equal(task.notifiedBeforeAt, '2026-12-01T14:30:00.000Z');
});

test('load: recovers from corrupt data.json using latest backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-corrupt-'));
  const store = new Store(dir, { isPackaged: false });
  store.addTask({ title: 'Safe' });
  store.createBackup('manual');

  fs.writeFileSync(path.join(dir, 'data.json'), '{ broken json', 'utf8');
  const store2 = new Store(dir, { isPackaged: false });
  assert.equal(store2.getTasks().length, 1);
  assert.equal(store2.getTasks()[0].title, 'Safe');
  assert.ok(store2.takeNotice());
  const files = fs.readdirSync(dir);
  assert.ok(files.some((f) => f.startsWith('data.corrupt-')));
});

test('migration: Store.load migrates encrypted v1 file when password is available', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytasks-encv1-'));
  const fixture = readJson(path.join(__dirname, 'fixtures/v1/full.json'));
  const password = 'test-password';
  const prev = process.env.MYTASKS_DATA_PASSWORD;
  process.env.MYTASKS_DATA_PASSWORD = password;
  try {
    fs.writeFileSync(
      path.join(dir, 'data.json'),
      encryptData(JSON.stringify(fixture), password),
      'utf8'
    );
    const store = new Store(dir, { isPackaged: false });
    const data = store.getData();
    assert.equal(data.version, 2);
    assert.equal(data.tasks.length, fixture.tasks.length);
    assert.ok(data.meta && data.meta.migratedFrom === 1);
  } finally {
    if (prev === undefined) delete process.env.MYTASKS_DATA_PASSWORD;
    else process.env.MYTASKS_DATA_PASSWORD = prev;
  }
});
