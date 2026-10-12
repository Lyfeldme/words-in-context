'use strict';

/* ============================================================
   Константы и состояние
   ============================================================ */

const STORAGE_KEY = 'words_in_context_v2';
const LEGACY_KEY  = 'words_in_context_v1';
const THEME_KEY   = 'words_in_context_theme';

const THEMES = ['auto', 'light', 'dark', 'sepia', 'forest'];
const THEME_ICONS = {
  auto:   'ri-contrast-2-line',
  light:  'ri-sun-line',
  dark:   'ri-moon-line',
  sepia:  'ri-book-open-line',
  forest: 'ri-plant-line',
};
const THEME_LABELS = {
  auto:   'Авто',
  light:  'Светлая',
  dark:   'Тёмная',
  sepia:  'Сепия',
  forest: 'Лес',
};

const DEFAULT_LANGS = [
  'английский', 'немецкий', 'испанский', 'французский',
  'итальянский', 'португальский', 'японский', 'китайский',
  'корейский', 'арабский', 'турецкий', 'русский',
];

const LANG_FLAGS = {
  'английский': '🇬🇧', 'немецкий': '🇩🇪', 'испанский': '🇪🇸',
  'французский': '🇫🇷', 'итальянский': '🇮🇹', 'португальский': '🇵🇹',
  'японский': '🇯🇵', 'китайский': '🇨🇳', 'корейский': '🇰🇷',
  'арабский': '🇸🇦', 'турецкий': '🇹🇷', 'русский': '🇷🇺',
  'польский': '🇵🇱', 'нидерландский': '🇳🇱', 'шведский': '🇸🇪',
  'греческий': '🇬🇷', 'иврит': '🇮🇱', 'хинди': '🇮🇳',
  'украинский': '🇺🇦',
};

let words = loadWords();
let editingId = null;
let activeFilterLang = '';
let activeFilterTag  = '';
let currentTags     = [];
let currentContexts = [{ text: '', translation: '' }];
let pendingDelete   = null;

/* ============================================================
   Хранилище + миграция
   ============================================================ */

function normalizeWord(w) {
  if (!w || typeof w !== 'object') return null;

  // Поддержка: contexts[] с переводом, contexts[] строк, старый context (строка)
  let contexts = [];
  if (Array.isArray(w.contexts)) {
    contexts = w.contexts
      .map(c => {
        if (typeof c === 'string') return { text: c, translation: '' };
        return { text: c.text || '', translation: c.translation || '' };
      })
      .filter(c => c.text || c.translation);
  } else if (typeof w.context === 'string' && w.context) {
    contexts = [{ text: w.context, translation: '' }];
  }

  const tags = Array.isArray(w.tags)
    ? w.tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim())
    : [];

  return {
    id: w.id || uid(),
    createdAt: w.createdAt || Date.now(),
    language: w.language || '',
    word: String(w.word || ''),
    translation: w.translation || '',
    contexts,
    note: w.note || '',
    tags,
  };
}

function loadWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeWord).filter(Boolean);
      }
    }
    // Миграция из v1
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const migrated = parsed.map(normalizeWord).filter(Boolean);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch (e) {
    console.error('Ошибка загрузки:', e);
  }
  return [];
}

function saveWords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch (e) {
    console.error('Ошибка сохранения:', e);
  }
}

/* ============================================================
   Тема
   ============================================================ */

function applyTheme(theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem(THEME_KEY);
  } else {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.querySelector('i').className = THEME_ICONS[theme] || 'ri-contrast-2-line';
    toggle.title = `Тема: ${THEME_LABELS[theme] || theme}`;
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved || 'auto');
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  const idx = THEMES.indexOf(saved);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next);
  showToast(`Тема: ${THEME_LABELS[next]}`, 'ri-palette-line');
});

/* ============================================================
   Утилиты
   ============================================================ */

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function uniqueLangs() {
  const used = words.map(w => w.language).filter(Boolean);
  return [...new Set([...DEFAULT_LANGS, ...used])]
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

function flagFor(lang) {
  return LANG_FLAGS[lang.toLowerCase()] || '🌐';
}

function allTags() {
  const set = new Set();
  words.forEach(w => (w.tags || []).forEach(t => set.add(t)));
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   Тосты
   ============================================================ */

function showToast(message, icon = 'ri-information-line', undoCallback = null) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    <i class="${icon} toast-icon"></i>
    <span class="toast-msg">${escapeHtml(message)}</span>
    ${undoCallback ? '<button class="toast-undo" type="button">Отменить</button>' : ''}
  `;
  if (undoCallback) {
    el.querySelector('.toast-undo').addEventListener('click', () => {
      undoCallback();
      dismissToast(el);
    });
  }
  container.appendChild(el);
  setTimeout(() => dismissToast(el), undoCallback ? 6000 : 3000);
  return el;
}

function dismissToast(el) {
  if (!el || el.classList.contains('toast-out')) return;
  el.classList.add('toast-out');
  setTimeout(() => el.remove(), 250);
}

/* ============================================================
   DOM
   ============================================================ */

const form              = document.getElementById('wordForm');
const languageInput     = document.getElementById('language');
const wordInput         = document.getElementById('word');
const translationInput  = document.getElementById('translation');
const noteInput         = document.getElementById('note');
const tagsInput         = document.getElementById('tagsInput');
const tagsChipsEl       = document.getElementById('tagsChips');
const tagsSuggestionsEl = document.getElementById('tagsSuggestions');
const contextsContainer = document.getElementById('contextsContainer');
const submitBtn         = document.getElementById('submitBtn');
const submitBtnText     = document.getElementById('submitBtnText');
const cancelEditBtn     = document.getElementById('cancelEdit');
const wordListEl        = document.getElementById('wordList');
const emptyEl           = document.getElementById('empty');
const searchInput       = document.getElementById('search');
const statsEl           = document.getElementById('stats');
const exportBtn         = document.getElementById('exportBtn');
const exportCsvBtn      = document.getElementById('exportCsvBtn');
const exportPdfBtn      = document.getElementById('exportPdfBtn');
const importBtn         = document.getElementById('importBtn');
const importFile        = document.getElementById('importFile');
const dropZone          = document.getElementById('dropZone');

/* ============================================================
   Модалка выбора языка
   ============================================================ */

function createLangModal({ overlay, listEl, searchEl, openBtn, closeBtn, cancelBtn }) {
  let activeIndex = -1;
  let lastFocus = null;

  function render(query = '') {
    const q = query.trim().toLowerCase();
    const current = languageInput.value.trim();
    const opts = uniqueLangs().filter(l => !q || l.toLowerCase().includes(q));

    if (!opts.length) {
      listEl.innerHTML = `<li class="modal-list-empty"><i class="ri-search-eye-line"></i>Ничего не найдено</li>`;
      activeIndex = -1;
      return;
    }

    listEl.innerHTML = opts.map(l => `
      <li class="modal-list-item${current === l ? ' selected' : ''}"
          data-value="${escapeHtml(l)}" role="option" tabindex="-1">
        <span class="flag">${flagFor(l)}</span>
        <span class="name">${escapeHtml(l)}</span>
        <i class="ri-check-line check"></i>
      </li>
    `).join('');
    activeIndex = -1;
  }

  function moveActive(delta) {
    const items = [...listEl.querySelectorAll('.modal-list-item')];
    if (!items.length) return;
    items.forEach(i => i.classList.remove('active'));
    activeIndex = (activeIndex + delta + items.length) % items.length;
    items[activeIndex].classList.add('active');
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function open() {
    lastFocus = document.activeElement;
    searchEl.value = '';
    render('');
    overlay.hidden = false;
    overlay.classList.remove('closing');
    requestAnimationFrame(() => searchEl.focus());
  }

  function close() {
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('closing');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }, 160);
  }

  function choose(value) {
    languageInput.value = value;
    close();
  }

  openBtn.addEventListener('click', (e) => { e.preventDefault(); open(); });
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  searchEl.addEventListener('input', () => render(searchEl.value));
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const items = [...listEl.querySelectorAll('.modal-list-item')];
      const pick = activeIndex >= 0 ? items[activeIndex] : items[0];
      if (pick) choose(pick.dataset.value);
    }
  });
  listEl.addEventListener('click', (e) => {
    const item = e.target.closest('.modal-list-item');
    if (!item) return;
    choose(item.dataset.value);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) { e.stopPropagation(); close(); }
  });

  return { open, close };
}

/* ============================================================
   Dropdown
   ============================================================ */

function createDropdown(rootEl, onChange, getItems) {
  const triggerEl = rootEl.querySelector('.dropdown-trigger');
  const menuEl    = rootEl.querySelector('.dropdown-menu');
  const textEl    = rootEl.querySelector('.dropdown-text');
  let value = '';

  function renderMenu() {
    const items = getItems();
    menuEl.innerHTML = items.map(item => `
      <li class="dropdown-item${value === item.value ? ' selected' : ''}"
          data-value="${escapeHtml(item.value)}" role="option">
        <i class="${item.icon || 'ri-price-tag-3-line'}"></i>
        <span>${escapeHtml(item.label)}</span>
        ${value === item.value ? '<i class="ri-check-line check"></i>' : ''}
      </li>
    `).join('');
  }

  function setValue(v, label) {
    value = v;
    textEl.textContent = label;
    renderMenu();
    if (onChange) onChange(v);
  }

  triggerEl.addEventListener('click', (e) => {
    e.preventDefault();
    renderMenu();
    rootEl.classList.toggle('open');
  });
  menuEl.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const label = item.querySelector('span').textContent;
    setValue(item.dataset.value, label);
    rootEl.classList.remove('open');
  });
  document.addEventListener('click', (e) => {
    if (!rootEl.contains(e.target)) rootEl.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') rootEl.classList.remove('open');
  });

  return { refresh: renderMenu, getValue: () => value, setValue, reset: () => setValue('', 'Все') };
}

/* ============================================================
   Инициализация компонентов
   ============================================================ */

createLangModal({
  overlay:   document.getElementById('langModal'),
  listEl:    document.getElementById('langModalList'),
  searchEl:  document.getElementById('langModalSearch'),
  openBtn:   document.getElementById('openLangPicker'),
  closeBtn:  document.getElementById('closeLangModal'),
  cancelBtn: document.getElementById('langModalCancel'),
});

const filterLangDropdown = createDropdown(
  document.getElementById('filterLangDropdown'),
  (val) => { activeFilterLang = val; render(); },
  () => {
    const langs = [...new Set(words.map(w => w.language).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ru'));
    return [
      { value: '', label: 'Все языки', icon: 'ri-apps-2-line' },
      ...langs.map(l => ({ value: l, label: l, icon: 'ri-global-line' })),
    ];
  }
);

const filterTagDropdown = createDropdown(
  document.getElementById('filterTagDropdown'),
  (val) => { activeFilterTag = val; render(); },
  () => {
    const tags = allTags();
    return [
      { value: '', label: 'Все теги', icon: 'ri-apps-2-line' },
      ...tags.map(t => ({ value: t, label: t, icon: 'ri-price-tag-3-line' })),
    ];
  }
);

/* ============================================================
   Теги
   ============================================================ */

function renderTagsChips() {
  tagsChipsEl.innerHTML = currentTags.map(t => `
    <span class="tag-chip">
      ${escapeHtml(t)}
      <button type="button" data-tag="${escapeHtml(t)}" aria-label="Удалить тег">
        <i class="ri-close-line"></i>
      </button>
    </span>
  `).join('');
}

function renderTagsSuggestions() {
  const query = tagsInput.value.trim().toLowerCase();
  const existing = allTags().filter(t =>
    !currentTags.includes(t) && (!query || t.toLowerCase().includes(query))
  );

  if (!existing.length || !query) {
    tagsSuggestionsEl.hidden = true;
    return;
  }

  tagsSuggestionsEl.innerHTML = existing.slice(0, 8).map(t => `
    <div class="suggestion" data-tag="${escapeHtml(t)}">
      <i class="ri-price-tag-3-line"></i> ${escapeHtml(t)}
    </div>
  `).join('');
  tagsSuggestionsEl.hidden = false;
}

function addTag(tag) {
  const t = String(tag || '').trim().replace(/,$/, '');
  if (!t || currentTags.includes(t)) return;
  currentTags.push(t);
  renderTagsChips();
  tagsInput.value = '';
  renderTagsSuggestions();
}

function removeTag(tag) {
  currentTags = currentTags.filter(t => t !== tag);
  renderTagsChips();
  renderTagsSuggestions();
}

tagsChipsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tag]');
  if (!btn) return;
  removeTag(btn.dataset.tag);
});

tagsInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    e.stopPropagation();
    if (tagsInput.value.trim()) addTag(tagsInput.value);
  } else if (e.key === 'Backspace' && !tagsInput.value && currentTags.length) {
    currentTags.pop();
    renderTagsChips();
    renderTagsSuggestions();
  } else if (e.key === 'Escape') {
    tagsSuggestionsEl.hidden = true;
  }
});

tagsInput.addEventListener('input', renderTagsSuggestions);
tagsInput.addEventListener('focus', renderTagsSuggestions);

// Клик по контейнеру — фокус на инпут
document.getElementById('tagsInputWrap').addEventListener('click', (e) => {
  if (e.target.closest('.tag-chip button')) return;
  tagsInput.focus();
});

tagsSuggestionsEl.addEventListener('mousedown', (e) => {
  const item = e.target.closest('.suggestion');
  if (!item) return;
  e.preventDefault();
  addTag(item.dataset.tag);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#tagsInputWrap') && !e.target.closest('#tagsSuggestions')) {
    tagsSuggestionsEl.hidden = true;
  }
});

/* ============================================================
   Контексты
   ============================================================ */

function renderContexts() {
  contextsContainer.innerHTML = currentContexts.map((ctx, i) => `
    <div class="context-row">
      <div class="context-fields">
        <textarea class="context-text" placeholder="Пример предложения..."
                  data-index="${i}" data-field="text">${escapeHtml(ctx.text || '')}</textarea>
        <textarea class="context-translation" placeholder="Перевод предложения (необязательно)..."
                  data-index="${i}" data-field="translation">${escapeHtml(ctx.translation || '')}</textarea>
      </div>
      ${currentContexts.length > 1
        ? `<button type="button" class="remove-context" data-index="${i}" title="Удалить контекст">
             <i class="ri-delete-bin-line"></i>
           </button>`
        : ''}
    </div>
  `).join('');
}

contextsContainer.addEventListener('input', (e) => {
  const ta = e.target.closest('textarea');
  if (!ta) return;
  const i = Number(ta.dataset.index);
  const field = ta.dataset.field;
  if (currentContexts[i]) currentContexts[i][field] = ta.value;
});

contextsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-context');
  if (!btn) return;
  const i = Number(btn.dataset.index);
  currentContexts.splice(i, 1);
  if (!currentContexts.length) currentContexts.push({ text: '', translation: '' });
  renderContexts();
});

document.getElementById('addContextBtn').addEventListener('click', () => {
  currentContexts.push({ text: '', translation: '' });
  renderContexts();
});

/* ============================================================
   Рендер списка
   ============================================================ */

function render() {
  const query = searchInput.value.trim();
  const q = query.toLowerCase();

  // Сброс невалидных фильтров
  const allLangs = [...new Set(words.map(w => w.language).filter(Boolean))];
  if (activeFilterLang && !allLangs.includes(activeFilterLang)) {
    filterLangDropdown.setValue('', 'Все языки');
    activeFilterLang = '';
  }
  if (activeFilterTag && !allTags().includes(activeFilterTag)) {
    filterTagDropdown.setValue('', 'Все теги');
    activeFilterTag = '';
  }
  filterLangDropdown.refresh();
  filterTagDropdown.refresh();

  // Фильтрация
  const filtered = words
    .filter(w => !activeFilterLang || w.language === activeFilterLang)
    .filter(w => !activeFilterTag  || (w.tags || []).includes(activeFilterTag))
    .filter(w => {
      if (!q) return true;
      const ctxText = (w.contexts || []).map(c => `${c.text} ${c.translation || ''}`).join(' ');
      return [w.word, w.translation, ctxText, w.note, w.language, ...(w.tags || [])]
        .some(v => (v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  // Статистика
  if (words.length) {
    const shown = filtered.length !== words.length ? ` • показано: ${filtered.length}` : '';
    statsEl.textContent = `Всего слов: ${words.length}${shown}`;
  } else {
    statsEl.textContent = '';
  }

  // Пустые состояния
  if (!filtered.length) {
    wordListEl.innerHTML = '';
    if (words.length === 0) {
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      wordListEl.innerHTML = `
        <div class="empty">
          <i class="ri-search-eye-line empty-icon"></i>
          <p>Ничего не найдено</p>
          <p class="muted">Попробуй изменить запрос или сбросить фильтр</p>
        </div>
      `;
    }
    return;
  }
  emptyEl.hidden = true;

  // Карточки
  wordListEl.innerHTML = filtered.map(w => {
    const contextsHtml = (w.contexts || []).length
      ? (w.contexts || []).map(c => {
          if (!c.text && !c.translation) return '';
          return `
            <div class="context">
              ${c.text
                ? `<div class="context-text">${highlight(c.text, query)}</div>`
                : ''}
              ${c.translation
                ? `<div class="context-translation">
                     <i class="ri-translate-2"></i>
                     <span>${highlight(c.translation, query)}</span>
                   </div>`
                : ''}
            </div>
          `;
        }).join('')
      : '';

    const tagsHtml = (w.tags || []).length
      ? `<div class="word-tags">${w.tags.map(t =>
          `<span class="word-tag">${highlight(t, query)}</span>`
        ).join('')}</div>`
      : '';

    return `
      <div class="word-item" data-id="${w.id}">
        <div class="item-actions">
          <button class="icon-btn" data-action="edit" title="Редактировать" aria-label="Редактировать">
            <i class="ri-edit-line"></i>
          </button>
          <button class="icon-btn del" data-action="delete" title="Удалить" aria-label="Удалить">
            <i class="ri-delete-bin-line"></i>
          </button>
        </div>
        <div class="head">
          ${w.language ? `<span class="lang"><i class="ri-global-line"></i>${escapeHtml(w.language)}</span>` : ''}
          <span class="word">${highlight(w.word, query)}</span>
          ${w.translation ? `<span class="translation">— ${highlight(w.translation, query)}</span>` : ''}
        </div>
        ${contextsHtml}
        ${w.note ? `<div class="note"><i class="ri-lightbulb-line"></i><span>${highlight(w.note, query)}</span></div>` : ''}
        ${tagsHtml}
      </div>
    `;
  }).join('');
}

/* ============================================================
   Форма
   ============================================================ */

form.addEventListener('submit', (e) => {
  e.preventDefault();

  // Автодобавление тега из инпута, если пользователь не нажал Enter
  if (tagsInput.value.trim()) {
    addTag(tagsInput.value);
  }

  const cleanContexts = currentContexts
    .map(c => ({
      text: (c.text || '').trim(),
      translation: (c.translation || '').trim(),
    }))
    .filter(c => c.text || c.translation);

  const data = {
    language: languageInput.value.trim(),
    word: wordInput.value.trim(),
    translation: translationInput.value.trim(),
    contexts: cleanContexts,
    note: noteInput.value.trim(),
    tags: [...currentTags],
  };
  if (!data.word) return;

  if (editingId) {
    const idx = words.findIndex(w => w.id === editingId);
    if (idx !== -1) words[idx] = { ...words[idx], ...data };
    exitEditMode();
    showToast('Слово обновлено', 'ri-save-line');
  } else {
    words.push({ id: uid(), createdAt: Date.now(), ...data });
    showToast('Слово добавлено', 'ri-add-line');
  }

  saveWords();
  resetForm();
  render();
  wordInput.focus();
});

cancelEditBtn.addEventListener('click', exitEditMode);

function resetForm() {
  form.reset();
  currentTags = [];
  currentContexts = [{ text: '', translation: '' }];
  renderTagsChips();
  renderContexts();
}

function enterEditMode(item) {
  editingId = item.id;
  languageInput.value = item.language || '';
  wordInput.value = item.word || '';
  translationInput.value = item.translation || '';
  noteInput.value = item.note || '';
  currentTags = [...(item.tags || [])];
  currentContexts = (item.contexts && item.contexts.length)
    ? item.contexts.map(c => ({ text: c.text || '', translation: c.translation || '' }))
    : [{ text: '', translation: '' }];

  renderTagsChips();
  renderContexts();

  submitBtnText.textContent = 'Сохранить';
  submitBtn.querySelector('i').className = 'ri-save-line';
  cancelEditBtn.hidden = false;

  window.scrollTo({ top: 0, behavior: 'smooth' });
  wordInput.focus();
}

function exitEditMode() {
  editingId = null;
  resetForm();
  submitBtnText.textContent = 'Добавить';
  submitBtn.querySelector('i').className = 'ri-add-line';
  cancelEditBtn.hidden = true;
}

/* ============================================================
   Удаление с Undo
   ============================================================ */

wordListEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const itemEl = btn.closest('.word-item');
  const id = itemEl.dataset.id;
  const item = words.find(w => w.id === id);
  if (!item) return;

  if (btn.dataset.action === 'delete') softDelete(item);
  else if (btn.dataset.action === 'edit') enterEditMode(item);
});

function softDelete(item) {
  if (pendingDelete) commitPendingDelete();

  words = words.filter(w => w.id !== item.id);
  if (editingId === item.id) exitEditMode();
  saveWords();
  render();

  pendingDelete = {
    item,
    timer: setTimeout(() => commitPendingDelete(), 6000),
  };

  showToast(`«${item.word}» удалено`, 'ri-delete-bin-line', () => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      words.push(pendingDelete.item);
      saveWords();
      render();
      pendingDelete = null;
    }
  });
}

function commitPendingDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  pendingDelete = null;
}

/* ============================================================
   Поиск
   ============================================================ */

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 120);
});

/* ============================================================
   Экспорт JSON
   ============================================================ */

exportBtn.addEventListener('click', () => {
  if (!words.length) { showToast('Нечего экспортировать', 'ri-error-warning-line'); return; }
  downloadFile(
    JSON.stringify(words, null, 2),
    `words-${new Date().toISOString().slice(0, 10)}.json`,
    'application/json'
  );
  showToast('JSON сохранён', 'ri-download-line');
});

/* ============================================================
   Экспорт CSV (для Excel / Anki)
   ============================================================ */

exportCsvBtn.addEventListener('click', () => {
  if (!words.length) { showToast('Нечего экспортировать', 'ri-error-warning-line'); return; }

  const escapeCsv = (v) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[";\n\r]/.test(s) ? `"${s}"` : s;
  };

  const header = ['Слово', 'Перевод', 'Контекст', 'Перевод контекста', 'Теги', 'Язык', 'Заметка'];
  const rows = [];

  words.forEach(w => {
    const ctxs = (w.contexts || []);
    if (ctxs.length) {
      ctxs.forEach(c => {
        rows.push([
          escapeCsv(w.word),
          escapeCsv(w.translation),
          escapeCsv(c.text),
          escapeCsv(c.translation),
          escapeCsv((w.tags || []).join(' ')),
          escapeCsv(w.language),
          escapeCsv(w.note),
        ]);
      });
    } else {
      rows.push([
        escapeCsv(w.word),
        escapeCsv(w.translation),
        '', '', 
        escapeCsv((w.tags || []).join(' ')),
        escapeCsv(w.language),
        escapeCsv(w.note),
      ]);
    }
  });

  const csv = '\uFEFF' + [header, ...rows].map(r => r.join(';')).join('\r\n');
  downloadFile(csv, `words-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  showToast('CSV сохранён', 'ri-file-text-line');
});

/* ============================================================
   Экспорт PDF
   ============================================================ */

exportPdfBtn.addEventListener('click', async () => {
  if (!words.length) { showToast('Нечего экспортировать', 'ri-error-warning-line'); return; }
  if (!window.jspdf || !window.html2canvas) {
    showToast('PDF-библиотеки не загрузились', 'ri-error-warning-line');
    return;
  }

  showToast('Генерируем PDF...', 'ri-loader-4-line');

  const pdfNode = document.createElement('div');
  pdfNode.style.cssText = `
    position: fixed; left: -99999px; top: 0;
    width: 794px; padding: 40px; background: #ffffff; color: #1e2230;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px; line-height: 1.5;
  `;

  const sorted = [...words].sort((a, b) =>
    (a.language || '').localeCompare(b.language || '', 'ru') || b.createdAt - a.createdAt
  );

  pdfNode.innerHTML = `
    <h1 style="margin:0 0 8px;font-size:22px;color:#4f6bed;">Слова в контексте</h1>
    <p style="margin:0 0 24px;color:#7a8194;font-size:12px;">
      Экспорт от ${new Date().toLocaleDateString('ru-RU')} • всего слов: ${sorted.length}
    </p>
    ${sorted.map(w => `
      <div style="border-bottom:1px solid #e3e6ee;padding:12px 0;page-break-inside:avoid;">
        <div style="margin-bottom:4px;">
          ${w.language ? `<span style="font-size:10px;text-transform:uppercase;font-weight:700;color:#4f6bed;background:#eef1fe;padding:2px 8px;border-radius:20px;margin-right:8px;">${escapeHtml(w.language)}</span>` : ''}
          <strong style="font-size:16px;">${escapeHtml(w.word)}</strong>
          ${w.translation ? `<span style="color:#7a8194;"> — ${escapeHtml(w.translation)}</span>` : ''}
        </div>
        ${(w.contexts || []).filter(c => c.text || c.translation).map(c => `
          <div style="border-left:3px solid #d6dcfa;padding:2px 0 2px 10px;margin:6px 0;">
            ${c.text ? `<div style="font-style:italic;color:#3a3f4f;">${escapeHtml(c.text)}</div>` : ''}
            ${c.translation ? `<div style="font-size:12px;color:#7a8194;margin-top:2px;">↳ ${escapeHtml(c.translation)}</div>` : ''}
          </div>
        `).join('')}
        ${w.note ? `<div style="font-size:12px;color:#7a8194;margin-top:6px;">💡 ${escapeHtml(w.note)}</div>` : ''}
        ${(w.tags || []).length ? `<div style="margin-top:8px;">${w.tags.map(t =>
          `<span style="font-size:11px;font-weight:700;color:#4f6bed;background:#eef1fe;padding:2px 8px;border-radius:20px;margin-right:4px;">${escapeHtml(t)}</span>`
        ).join('')}</div>` : ''}
      </div>
    `).join('')}
  `;

  document.body.appendChild(pdfNode);

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const canvas = await html2canvas(pdfNode, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: -window.scrollY,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 0;

    doc.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;

    while (heightLeft > 0) {
      position -= pageH;
      doc.addPage();
      doc.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    doc.save(`words-${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('PDF сохранён', 'ri-file-pdf-line');
  } catch (err) {
    console.error(err);
    showToast('Ошибка при генерации PDF', 'ri-error-warning-line');
  } finally {
    pdfNode.remove();
  }
});

/* ============================================================
   Импорт JSON
   ============================================================ */

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await importJsonFile(file);
  importFile.value = '';
});

async function importJsonFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error('Ожидался массив записей');

    const existingIds = new Set(words.map(w => w.id));
    const newItems = data
      .filter(w => w && w.word)
      .map(w => {
        const normalized = normalizeWord(w);
        if (!normalized) return null;
        if (existingIds.has(normalized.id)) normalized.id = uid();
        return normalized;
      })
      .filter(Boolean);

    words = [...words, ...newItems];
    saveWords();
    render();
    showToast(`Импортировано: ${newItems.length}`, 'ri-upload-line');
  } catch (err) {
    showToast('Ошибка импорта: ' + err.message, 'ri-error-warning-line');
  }
}

/* ============================================================
   Drag-and-drop
   ============================================================ */

let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  dragCounter++;
  dropZone.hidden = false;
});

window.addEventListener('dragover', (e) => {
  if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropZone.hidden = true;
  }
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropZone.hidden = true;

  const file = e.dataTransfer?.files?.[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.json')) {
    showToast('Поддерживаются только JSON-файлы', 'ri-error-warning-line');
    return;
  }

  await importJsonFile(file);
});

/* ============================================================
   Горячие клавиши
   ============================================================ */

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (document.activeElement && form.contains(document.activeElement)) {
      form.requestSubmit();
    }
  }
  if (e.key === '/' &&
      !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
      document.getElementById('langModal').hidden) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape' && editingId && document.getElementById('langModal').hidden) {
    exitEditMode();
  }
});

/* ============================================================
   Старт
   ============================================================ */

initTheme();
renderTagsChips();
renderContexts();
render();
wordInput.focus();