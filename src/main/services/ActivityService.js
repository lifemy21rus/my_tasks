'use strict';

class ActivityService {
  constructor(ctx) {
    this.ctx = ctx;
    this.normalizers = ctx.normalizers;
  }

  _data() {
    return (this.ctx && this.ctx.store && this.ctx.store.data) || this.ctx.data;
  }

  log(type, payload = {}) {
    const data = this._data();
    if (!data) return null;
    if (!Array.isArray(data.activity)) data.activity = [];
    const entry = {
      id: this.normalizers.uid(),
      type: String(type || 'event'),
      at: this.normalizers.nowIso(),
      payload:
        payload && typeof payload === 'object'
          ? JSON.parse(JSON.stringify(payload))
          : { value: payload }
    };
    data.activity.push(entry);
    if (data.activity.length > 500) {
      data.activity.splice(0, data.activity.length - 500);
    }
    return entry;
  }

  getActivity(limit = 100) {
    const data = this._data();
    const list = Array.isArray(data && data.activity) ? data.activity.slice() : [];
    list.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const n = Number(limit);
    const capped =
      Number.isFinite(n) && n > 0 ? list.slice(0, Math.min(n, 500)) : list.slice(0, 100);
    return this.normalizers.clone(capped);
  }

  getStats() {
    const data = this._data() || {};
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const now = Date.now();
    const byStatus = { todo: 0, in_progress: 0, done: 0, inbox: 0, other: 0 };
    let overdue = 0;
    let dueToday = 0;
    let withDue = 0;
    for (const t of tasks) {
      const s = t.status || (t.done ? 'done' : 'todo');
      if (Object.prototype.hasOwnProperty.call(byStatus, s)) byStatus[s] += 1;
      else byStatus.other += 1;
      if (t.dueAt) {
        withDue += 1;
        const due = Date.parse(t.dueAt);
        if (Number.isFinite(due)) {
          const d = new Date(due);
          const today = new Date(now);
          if (!t.done && due < now) overdue += 1;
          if (
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
          ) {
            dueToday += 1;
          }
        }
      }
    }
    return {
      tasks: {
        total: tasks.length,
        active: tasks.filter((t) => !t.done).length,
        completed: tasks.filter((t) => t.done).length,
        overdue,
        dueToday,
        withDue,
        byStatus
      },
      notes: {
        total: notes.length,
        archived: notes.filter((n) => n.archived).length,
        active: notes.filter((n) => !n.archived).length
      },
      activityCount: Array.isArray(data.activity) ? data.activity.length : 0
    };
  }
}

module.exports = { ActivityService };
