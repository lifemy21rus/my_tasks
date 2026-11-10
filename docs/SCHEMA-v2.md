# Схема данных v2.0

Целевой контракт для `data.json` (Variant A, локальное JSON-хранилище). Реализация должна обеспечивать обратную совместимость чтения v1 через миграцию и идемпотентную нормализацию.

## Верхний уровень

```json
{
  "version": 2,
  "meta": {
    "migratedFrom": 1,
    "migratedAt": "ISO-8601 | null",
    "appVersion": "2.0.0"
  },
  "settings": { },
  "categories": [ ],
  "tags": [ ],
  "tasks": [ ],
  "notes": [ ],
  "templates": [ ],
  "taskTemplates": [ ],
  "smartLists": [ ],
  "attachments": [ ],
  "activity": [ ]
}
```

- `version`: число, для 2.0 = `2`.
- `meta`: служебная информация о миграции/версии приложения (может отсутствовать в старых файлах до нормализации).
- Коллекции, отсутствующие во входных данных, создаются пустыми.

## Settings (`settings`)

Сохраняются все поля v1 + расширения v2 (значения по умолчанию при отсутствии):

- v1: `autostart`, `startMinimized`, `theme` (`light|dark|system`), `defaultRemindBefore`, `defaultRemindAtDue`, `hotkey`, `hotkeyEnabled`, `miniPanel`, `miniPanelAtStart`, `miniPanelTabs` (`both|tasks|notes`), `miniX`, `quitOnClose`, `startMenuShortcut`, `dataEncryption`.
- v2 (минимум): `defaultView` (`list` по умолчанию), `calendarView` (`month|week|day`), `kanbanEnabled`/prefs по мере внедрения (дефолты безопасны).

## Category (`categories[]`)

- `id: string`
- `name: string` (<= 60)
- `color: string` (`#rrggbb`)

Без ломающих изменений относительно v1.

## Tag (`tags[]`, v2)

- `id: string`
- `name: string` (нормализованное, уникальное в рамках справочника с учётом регистра/правил)
- `color: string | null` (опционально)

Задачи/заметки ссылаются на теги по `id` в поле `tags` (массив строк-id). При миграции v1 → `[]`.

## Task (`tasks[]`)

Поля v1 сохраняются: `id`, `title`, `description`, `dueAt`, `priority` (`low|normal|high`), `color`, `categoryId`, `done`, `completedAt`, `createdAt`, `updatedAt`, `reminders`, `remindBefore`, `remindAtDue`, `recurrence`, `notifiedBeforeAt`, `notifiedDueAt`, `snoozedUntil`, `estimatedMinutes`, `actualMinutes`, `subtasks`.

Поля v2:
- `status: "inbox" | "todo" | "in_progress" | "done"` — производное/согласованное с `done` (источник истины для завершения остаётся инвариантом `done`/подзадач; `status` синхронизируется при нормализации/мутациях).
- `order: number` — позиция для сортировки в списке/колонке (дефолт вычисляется стабильно, напр. по времени/индексу при миграции).
- `tags: string[]` — id тегов.
- `attachments: string[]` — id вложений (метаданные в `attachments`).

### Subtask (`task.subtasks[]`, рекурсивно)

v1: `id`, `title`, `done`, `createdAt`, `subtasks` (глубина нормализации — как в v1, по умолчанию 2 уровня). Инвариант: родитель `done/completedAt` выводится из состояния подзадач (`ensureTaskInvariant`).

## Note (`notes[]`)

v1: `id`, `title`, `content`, `color`, `done`, `archived`, `categoryId`, `createdAt`, `updatedAt`.

v2:
- `tags: string[]`
- `attachments: string[]`
- `linkedTaskIds: string[]` (связи с задачами)

## Templates

- `templates[]` (note templates): `id`, `title`, `content` (+ опциональные v2-поля при расширении).
- `taskTemplates[]`: v1-поля + `tags?`, `attachments?` при необходимости (по умолчанию пусто/совместимо).

## Smart List (`smartLists[]`, v2)

- `id: string`
- `name: string`
- `criteria: object` (фильтры: статус, сроки/inbox/overdue, приоритет, категория, теги, текстовый запрос и т.д.)
- `view: object | null` (предпочтения отображения, опционально)
- `createdAt`, `updatedAt`

## Attachment (`attachments[]`, v2, метаданные)

- `id: string`
- `entityType: "task" | "note" | null`
- `entityId: string | null`
- `name: string` (оригинальное имя)
- `fileName: string` (имя/ключ в каталоге `attachments/`)
- `mime: string | null`
- `size: number | null`
- `createdAt: string`

Фактическое содержимое — файл в `<dataDir>/attachments/` (см. ADR 0001, SECURITY-DATA-v2).

## Activity (`activity[]`, v2)

Append-only события для истории/статистики (минимальный контракт):

- `id: string`
- `entityType: "task" | "note"`
- `entityId: string`
- `type: string` (напр. `created`, `updated`, `completed`, `reopened`, `moved`, `deleted`)
- `at: string` (ISO)
- `data: object | null` (diff/контекст, опционально)

При миграции v1 → пустой массив.

## Правила миграции v1 → v2 (M1)

- `version`: 1/отсутствует → 2.
- Добавить `meta.migratedFrom/migratedAt/appVersion`.
- Гарантировать наличие коллекций: `tags`, `smartLists`, `attachments`, `activity`.
- Task: добавить `status` из `done` (`done ? "done" : "todo"` с учётом inbox-политики при отсутствии срока — уточняется реализацией, дефолт безопасный), `order`, `tags: []`, `attachments: []`; сохранить все v1-поля (напоминания legacy/new, recurrence, notified/snoozed, subtasks).
- Note: добавить `tags: []`, `attachments: []`, `linkedTaskIds: []`, сохранить `archived` и прочие v1-поля.
- Settings: сохранить пользовательские значения, дополнить дефолтами v2.
- Миграция идемпотентна; pre-migration бэкап выполняется до преобразования.