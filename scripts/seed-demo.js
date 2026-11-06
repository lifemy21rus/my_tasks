'use strict';

const path = require('path');
const fs = require('fs');
const { Store } = require('../src/main/store');

const dir = process.argv[2];
if (!dir) throw new Error('Укажите папку данных');
fs.mkdirSync(dir, { recursive: true });

// очищаем только данные, не всю папку: иначе можно удалить профиль
// Electron, пока приложение ещё работает с этой папкой
for (const name of ['data.json', 'backups']) {
  fs.rmSync(path.join(dir, name), { recursive: true, force: true });
}

const store = new Store(dir, { isPackaged: false });

const work = store.addCategory({ name: 'Работа', color: '#2563eb' });
const home = store.addCategory({ name: 'Дом', color: '#16a34a' });
const personal = store.addCategory({ name: 'Личное', color: '#db2777' });

function at(dayOffset, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const report = store.addTask({
  title: 'Подготовить отчёт за квартал',
  description: 'Собрать цифры по продажам, сделать сводную таблицу и отправить руководителю.',
  dueAt: at(0, 18, 0),
  priority: 'high',
  categoryId: work.id,
  remindBefore: 60,
  remindAtDue: true
});
store.addSubtask(report.id, 'Выгрузить данные из CRM');
const sub2 = store.addSubtask(report.id, 'Свести таблицу');
store.addSubtask(report.id, 'Проверить у руководителя');
const taskNow = store.getTasks().find((t) => t.id === report.id);
store.toggleSubtask(report.id, taskNow.subtasks[0].id, true);
void sub2;

store.addTask({
  title: 'Позвонить в сервисный центр',
  description: 'Уточнить сроки ремонта ноутбука.',
  dueAt: at(-1, 15, 30),
  priority: 'normal',
  categoryId: home.id,
  remindBefore: 30,
  remindAtDue: true
});

store.addTask({
  title: 'Купить продукты на неделю',
  description: 'Молоко, яйца, овощи, кофе.',
  dueAt: at(1, 19, 0),
  priority: 'normal',
  categoryId: personal.id,
  remindBefore: -1,
  remindAtDue: true
});

const book = store.addTask({
  title: 'Дочитать книгу «Атомные привычки»',
  dueAt: at(6, 21, 0),
  priority: 'low',
  categoryId: personal.id,
  remindBefore: 1440,
  remindAtDue: false
});
store.addSubtask(book.id, 'Глава 8');
store.addSubtask(book.id, 'Глава 9');

store.addTask({
  title: 'Оплатить интернет',
  dueAt: at(-2, 10, 0),
  priority: 'normal',
  categoryId: home.id,
  remindBefore: -1,
  remindAtDue: false
});
const internet = store.getTasks().find((t) => t.title === 'Оплатить интернет');
store.toggleTask(internet.id, true);

store.addNote({
  title: 'Идея для отчёта',
  content: 'Добавить раздел с графиком по отделам и сравнение с прошлым кварталом.',
  color: '#4ecdc4'
});

store.addNote({
  title: 'Список покупок к обсуждению',
  content: 'Протектор для ноутбука, новая мышь, кабели для зарядки.',
  color: '#ffe66d'
});

const doneNote = store.addNote({
  title: 'Записать номер сервиса',
  content: '',
  color: '#ff6b6b'
});
store.toggleNote(doneNote.id, true);

console.log('Демо-данные созданы в', dir);
