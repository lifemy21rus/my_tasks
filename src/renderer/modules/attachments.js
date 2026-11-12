'use strict';

(function () {
  const SIZE_UNITS = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];

  function formatSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${size} Б`;
    let value = size;
    let unit = 0;
    while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
      value /= 1024;
      unit += 1;
    }
    const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${String(rounded).replace('.', ',')} ${SIZE_UNITS[unit]}`;
  }

  function findAttachment(state, id) {
    const all = (state && state.data && state.data.attachments) || [];
    return all.find((item) => item && item.id === id) || null;
  }

  function collectAttachments(state, ids) {
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => findAttachment(state, id)).filter(Boolean);
  }

  const OPEN_ICON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';

  const FOLDER_ICON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

  const CLOSE_ICON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // Строка вложения в модальном окне: имя (открывает файл), размер,
  // кнопки «показать в папке» и «удалить».
  function createRow(att) {
    const row = document.createElement('div');
    row.className = 'attachment-row';

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'attachment-name';
    name.dataset.action = 'open-attachment';
    name.dataset.id = att.id;
    name.textContent = att.name || att.id;
    name.title = `${att.name || att.id} — открыть файл`;
    name.setAttribute('aria-label', `Открыть файл ${att.name || att.id}`);

    const size = document.createElement('span');
    size.className = 'attachment-size';
    size.textContent = formatSize(att.size);

    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'icon-btn small';
    reveal.dataset.action = 'reveal-attachment';
    reveal.dataset.id = att.id;
    reveal.title = 'Показать в папке';
    reveal.setAttribute('aria-label', 'Показать файл в папке');
    reveal.innerHTML = FOLDER_ICON;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn small danger';
    del.dataset.action = 'delete-attachment';
    del.dataset.id = att.id;
    del.title = 'Удалить вложение';
    del.setAttribute('aria-label', 'Удалить вложение');
    del.innerHTML = CLOSE_ICON;

    row.append(name);
    if (size.textContent) row.appendChild(size);
    row.append(reveal, del);
    return row;
  }

  // Компактная ссылка на файл в карточке задачи/заметки.
  function createLink(att, options = {}) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'meta-attachment';
    link.dataset.action = 'open-attachment';
    link.dataset.id = att.id;
    link.title = `${att.name || att.id} — открыть файл`;
    link.setAttribute('aria-label', `Открыть файл ${att.name || att.id}`);
    link.textContent = options.label || att.name || att.id;
    return link;
  }

  window.AppAttachments = {
    formatSize,
    findAttachment,
    collectAttachments,
    createRow,
    createLink,
    OPEN_ICON
  };
})();
