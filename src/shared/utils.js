(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MONTHS_SHORT = [
    'янв',
    'фев',
    'мар',
    'апр',
    'мая',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек'
  ];
  const MONTHS_GEN = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря'
  ];
  const WEEKDAYS = [
    'воскресенье',
    'понедельник',
    'вторник',
    'среда',
    'четверг',
    'пятница',
    'суббота'
  ];

  const CATEGORY_COLORS = [
    '#2563eb',
    '#7c3aed',
    '#db2777',
    '#dc2626',
    '#ea580c',
    '#ca8a04',
    '#16a34a',
    '#0891b2',
    '#475569'
  ];

  const PRIORITIES = ['low', 'normal', 'high'];
  const PRIORITY_LABELS = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
  const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

  const THEMES = ['light', 'dark', 'system'];
  const THEME_LABELS = { light: 'Светлая', dark: 'Тёмная', system: 'Как в системе' };

  const PANEL_TABS = ['both', 'tasks', 'notes'];
  const PANEL_TABS_LABELS = {
    both: 'Обе вкладки',
    tasks: 'Только задачи',
    notes: 'Только заметки'
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(value) {
    const d = parseDate(value) || new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(value, days) {
    const d = parseDate(value) || new Date();
    d.setDate(d.getDate() + days);
    return d;
  }

  function addMonthsClamped(value, months) {
    const d = parseDate(value) || new Date();
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d;
  }

  function isSameDay(a, b) {
    const da = parseDate(a);
    const db = parseDate(b);
    if (!da || !db) return false;
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  }

  function isToday(value, now) {
    return isSameDay(value, now || new Date());
  }

  function isTomorrow(value, now) {
    return isSameDay(value, addDays(now || new Date(), 1));
  }

  function isPast(value, now) {
    const d = parseDate(value);
    return !!d && d.getTime() < (now ? new Date(now).getTime() : Date.now());
  }

  function formatTime(value) {
    const d = parseDate(value);
    if (!d) return '';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatDateShort(value, now) {
    const d = parseDate(value);
    if (!d) return '';
    const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
    const currentYear = (now ? new Date(now) : new Date()).getFullYear();
    return d.getFullYear() === currentYear ? base : `${base} ${d.getFullYear()}`;
  }

  function formatDateFull(value) {
    const d = parseDate(value);
    if (!d) return '';
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatDateTimeFull(value) {
    const d = parseDate(value);
    if (!d) return '';
    return `${formatDateFull(d)}, ${formatTime(d)}`;
  }

  function formatWeekday(value) {
    const d = parseDate(value);
    return d ? WEEKDAYS[d.getDay()] : '';
  }

  function formatDueChip(value, nowValue) {
    if (!value) {
      return { text: 'Без срока', tone: 'none', title: 'Срок не задан' };
    }
    const d = parseDate(value);
    if (!d) {
      return { text: 'Без срока', tone: 'none', title: 'Срок не задан' };
    }
    const now = nowValue ? new Date(nowValue) : new Date();
    const dueMs = d.getTime();
    const nowMs = now.getTime();

    let text;
    if (isSameDay(d, now)) text = `Сегодня, ${formatTime(d)}`;
    else if (isSameDay(d, addDays(now, 1))) text = `Завтра, ${formatTime(d)}`;
    else if (isSameDay(d, addDays(now, -1))) text = `Вчера, ${formatTime(d)}`;
    else text = `${formatDateShort(d, now)}, ${formatTime(d)}`;

    let tone = 'normal';
    if (dueMs < nowMs) tone = 'overdue';
    else if (isSameDay(d, now)) tone = 'today';
    else if (isSameDay(d, addDays(now, 1))) tone = 'soon';

    return { text, tone, title: `Срок: ${formatDateTimeFull(d)}` };
  }

  function formatRelativeDue(value, nowValue) {
    const d = parseDate(value);
    if (!d) return '';
    const now = nowValue ? new Date(nowValue) : new Date();
    const diff = d.getTime() - now.getTime();
    const future = diff >= 0;
    const absMinutes = Math.round(Math.abs(diff) / 60000);

    let amount;
    if (absMinutes < 1) {
      amount = 'меньше минуты';
    } else if (absMinutes < 60) {
      amount = `${absMinutes} ${plural(absMinutes, 'минуту', 'минуты', 'минут')}`;
    } else if (absMinutes < 1440) {
      const hours = Math.round(absMinutes / 60);
      amount = `${hours} ${plural(hours, 'час', 'часа', 'часов')}`;
    } else {
      const days = Math.round(absMinutes / 1440);
      amount = `${days} ${plural(days, 'день', 'дня', 'дней')}`;
    }

    return future ? `через ${amount}` : `просрочено на ${amount}`;
  }

  function formatSnooze(value, nowValue) {
    const d = parseDate(value);
    if (!d) return '';
    const now = nowValue ? new Date(nowValue) : new Date();
    if (isSameDay(d, now)) return `Отложено до ${formatTime(d)}`;
    if (isSameDay(d, addDays(now, 1))) return `Отложено до завтра, ${formatTime(d)}`;
    return `Отложено до ${formatDateShort(d, now)}, ${formatTime(d)}`;
  }

  function plural(n, one, few, many) {
    const abs = Math.abs(Number(n) || 0);
    const mod10 = abs % 10;
    const mod100 = abs % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function taskCount(n) {
    return `${n} ${plural(n, 'задача', 'задачи', 'задач')}`;
  }

  function noteCount(n) {
    return `${n} ${plural(n, 'заметка', 'заметки', 'заметок')}`;
  }

  function formatDuration(minutes) {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 0) return '';
    if (m < 60) return `${m} ${plural(m, 'минута', 'минуты', 'минут')}`;
    if (m < 1440) {
      const h = Math.round(m / 60);
      return `${h} ${plural(h, 'час', 'часа', 'часов')}`;
    }
    const d = Math.round(m / 1440);
    return `${d} ${plural(d, 'день', 'дня', 'дней')}`;
  }

  function formatReminder(offset, remindAtDue, defaultOffset) {
    const resolved = offset === null || offset === undefined ? defaultOffset : Number(offset);
    const parts = [];
    if (resolved === -1) {
      parts.push('Без напоминания заранее');
    } else if (Number.isFinite(resolved) && resolved >= 0) {
      parts.push(`За ${formatDuration(resolved)}`);
    }
    if (remindAtDue) parts.push('в момент срока');
    return parts.join(' · ');
  }

  function priorityRank(priority) {
    return PRIORITY_RANK[priority] !== undefined ? PRIORITY_RANK[priority] : 1;
  }

  function priorityLabel(priority) {
    return PRIORITY_LABELS[priority] || PRIORITY_LABELS.normal;
  }

  function combineDateTime(dateStr, timeStr) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    if (!dateMatch) return null;
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeStr || '18:00'));
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hour = timeMatch ? Number(timeMatch[1]) : 18;
    const minute = timeMatch ? Number(timeMatch[2]) : 0;

    const d = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day ||
      d.getHours() !== hour ||
      d.getMinutes() !== minute
    ) {
      return null;
    }
    return d.toISOString();
  }

  function splitISODateTime(value) {
    if (!value) return { date: '', time: '18:00' };
    const d = parseDate(value);
    if (!d) return { date: '', time: '18:00' };
    return {
      date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    };
  }

  function dueBucket(value, nowValue) {
    if (!value) return 'none';
    const d = parseDate(value);
    if (!d) return 'none';
    const now = nowValue ? new Date(nowValue) : new Date();
    if (d.getTime() < now.getTime()) return 'overdue';
    if (isSameDay(d, now)) return 'today';
    if (isSameDay(d, addDays(now, 1))) return 'tomorrow';
    if (d.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000) return 'week';
    return 'later';
  }

  function noteTime(note) {
    const raw = note && (note.updatedAt || note.createdAt);
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function sortNotes(notes) {
    return [...(notes || [])].sort((a, b) => {
      const diff = noteTime(b) - noteTime(a);
      if (diff !== 0) return diff;
      return String((a && a.title) || '').localeCompare(String((b && b.title) || ''), 'ru');
    });
  }

  function groupNotes(notes) {
    const active = [];
    const done = [];
    for (const note of notes || []) {
      if (!note) continue;
      if (note.done) done.push(note);
      else active.push(note);
    }

    const groups = [
      { key: 'active', label: 'Активные', tone: '', items: sortNotes(active) },
      { key: 'done', label: 'Выполненные', tone: '', items: sortNotes(done) }
    ];
    return groups.filter((group) => group.items.length > 0);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(value, max) {
    const str = String(value === null || value === undefined ? '' : value);
    if (str.length <= max) return str;
    return `${str.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }

  // Представление горячей клавиши для отображения в интерфейсе:
  // «CommandOrControl+Shift+Space» → «Ctrl + Shift + Space».
  function formatHotkey(value) {
    return String(value || '')
      .replace(/CommandOrControl|CmdOrCtrl|Control/gi, 'Ctrl')
      .replace(/\+/g, ' + ');
  }

  return {
    MONTHS_SHORT,
    MONTHS_GEN,
    WEEKDAYS,
    CATEGORY_COLORS,
    PRIORITIES,
    PRIORITY_LABELS,
    PRIORITY_RANK,
    THEMES,
    THEME_LABELS,
    PANEL_TABS,
    PANEL_TABS_LABELS,
    pad2,
    parseDate,
    startOfDay,
    addDays,
    addMonthsClamped,
    isSameDay,
    isToday,
    isTomorrow,
    isPast,
    formatTime,
    formatDateShort,
    formatDateFull,
    formatDateTimeFull,
    formatWeekday,
    formatDueChip,
    formatRelativeDue,
    formatSnooze,
    plural,
    taskCount,
    noteCount,
    noteTime,
    sortNotes,
    groupNotes,
    formatDuration,
    formatReminder,
    priorityRank,
    priorityLabel,
    combineDateTime,
    splitISODateTime,
    dueBucket,
    escapeHtml,
    truncate,
    formatHotkey
  };
});
