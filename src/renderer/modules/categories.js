'use strict';

(function () {
  function createCategoriesModule(ctx) {
    const { els, state, U, setSvgIcon } = ctx;

    function renderCategories() {
      if (state.view === 'notes') {
        els.categoryList.textContent = '';
        return;
      }
      const categories = state.data.categories;
      els.categoryList.textContent = '';

      if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'category-empty';
        empty.textContent = 'Категорий пока нет. Нажмите +, чтобы создать.';
        els.categoryList.appendChild(empty);
        return;
      }

      for (const category of categories) {
        const count = state.data.tasks.filter((task) => {
          if (task.categoryId !== category.id || task.done) return false;
          return true;
        }).length;

        const row = document.createElement('div');
        row.className = `category-item${state.view === 'category' && state.categoryId === category.id ? ' is-active' : ''}`;

        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'category-pick';
        pick.dataset.action = 'pick-category';
        pick.dataset.categoryId = category.id;

        const dot = document.createElement('span');
        dot.className = 'category-dot';
        dot.style.background = category.color;
        dot.style.color = category.color;

        const name = document.createElement('span');
        name.className = 'category-name';
        name.textContent = category.name;

        const badge = document.createElement('span');
        badge.className = 'category-count';
        badge.textContent = String(count);

        pick.append(dot, name, badge);

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'icon-btn small category-edit';
        edit.dataset.action = 'edit-category';
        edit.dataset.categoryId = category.id;
        edit.title = 'Изменить категорию';
        edit.setAttribute('aria-label', `Изменить категорию ${category.name}`);
        setSvgIcon(
          edit,
          '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
          14,
          14,
          '2'
        );

        row.append(pick, edit);
        els.categoryList.appendChild(row);
      }
    }

    function renderCategoryOptions() {
      const select = els.taskCategoryInput;
      select.textContent = '';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'Без категории';
      select.appendChild(none);
      for (const category of state.data.categories) {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
      }
      select.value = state.draft ? state.draft.categoryId : '';
    }

    function renderColorGrid(container, selectedColor, onSelect) {
      if (!container) return;
      container.textContent = '';
      for (const color of U.CATEGORY_COLORS) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = `color-swatch${selectedColor === color ? ' is-active' : ''}`;
        swatch.style.background = color;
        swatch.dataset.color = color;
        swatch.title = color;
        swatch.setAttribute('aria-label', `Цвет ${color}`);
        swatch.addEventListener('click', () => {
          onSelect(color);
        });
        container.appendChild(swatch);
      }
    }

    return {
      renderCategories,
      renderCategoryOptions,
      renderColorGrid
    };
  }

  window.AppCategories = { create: createCategoriesModule };
})();
