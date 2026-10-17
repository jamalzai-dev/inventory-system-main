import { t } from './i18n.js';
import { el, text, userText } from './ui.js';
import { icon } from './icons.js';

const collections = ['materials', 'categories', 'suppliers'];
const collectionIcons = { materials: 'package', categories: 'layers', suppliers: 'truck' };
const normalize = value => typeof value === 'string' ? value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim() : '';
const detail = values => values.filter(value => typeof value === 'string' && value.trim()).join(' · ');

// Search only explicitly permitted inventory fields, never arbitrary state or authentication data.
// Token matching allows, for example, a material name and its category in the same query.
export function searchRecords(state, query, limit = 30) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 30;
  if (!tokens.length || !maximum || !state) return [];
  const categories = new Map((state.categories || []).map(row => [row.id, row]));
  const suppliers = new Map((state.suppliers || []).map(row => [row.id, row]));
  const groups = [];
  const seen = new Set();
  for (const collection of collections) {
    const matches = [];
    for (const row of state[collection] || []) {
      const key = `${collection}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let values;
      let description;
      if (collection === 'materials') {
        const category = categories.get(row.categoryId)?.name;
        const supplier = suppliers.get(row.supplierId)?.name;
        values = [row.name, row.serial, category, supplier, row.location, row.description, row.responsible];
        description = detail([row.serial, category, row.location]);
      } else if (collection === 'categories') {
        values = [row.name, row.description];
        description = detail([row.description]);
      } else {
        values = [row.name, row.description, row.contact, row.phone, row.email, row.address];
        description = detail([row.contact, row.email, row.phone]);
      }
      const searchable = normalize(values.filter(value => typeof value === 'string').join(' '));
      if (tokens.every(token => searchable.includes(token))) {
        matches.push({ collection, id: row.id, name: row.name, detail: description });
        if (matches.length >= maximum) break;
      }
    }
    if (matches.length) groups.push(matches);
  }
  // Reserve space for distinct entity types even when many materials match a
  // category or supplier name. Keep grouped order and a strict overall cap.
  const results = [];
  groups.forEach((matches, index) => {
    const remainingGroups = groups.length - index - 1;
    const available = Math.max(0, maximum - results.length);
    const take = Math.min(matches.length, Math.max(available > 0 ? 1 : 0, available - remainingGroups));
    results.push(...matches.slice(0, take));
  });
  return results;
}

// This component is mounted once in the shared header. Refresh after repository changes
// or a language change; section navigation does not need to recreate the input.
export function createGlobalSearch({ getState, onSelect, isUnavailable = () => false }) {
  let timer;
  let composing = false;
  let opened = false;
  let results = [];
  let options = [];
  let active = -1;
  const input = el('input', {
    id: 'global-search-input', type: 'search', role: 'combobox',
    autocomplete: 'off', spellcheck: 'false', 'aria-autocomplete': 'list',
    'aria-controls': 'global-search-results', 'aria-expanded': 'false',
    'aria-haspopup': 'listbox', 'aria-describedby': 'global-search-help',
    'data-placeholder': 'globalSearch', 'data-label': 'globalSearchLabel'
  });
  const label = text('globalSearchLabel', 'label', { class: 'visually-hidden', for: input.id });
  const help = text('searchKeyboardHint', 'span', { id: 'global-search-help', class: 'visually-hidden' });
  const live = el('span', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const popup = el('div', { id: 'global-search-results', class: 'search-results', role: 'listbox', hidden: true, 'data-label': 'searchResults' });
  const clear = el('button', {
    type: 'button', class: 'search-clear', hidden: true, 'data-label': 'searchClear',
    onmousedown: event => event.preventDefault(),
    onclick: () => { input.value = ''; input.focus(); show(); }
  }, icon('x'));
  const element = el('div', { class: 'global-search' },
    label, el('div', { class: 'search-input-wrap' }, icon('search'), input, clear), help, popup, live);

  function syncLabels() {
    input.placeholder = t('globalSearch');
    input.setAttribute('aria-label', t('globalSearchLabel'));
    label.textContent = t('globalSearchLabel');
    help.textContent = t('searchKeyboardHint');
    clear.setAttribute('aria-label', t('searchClear'));
    clear.title = t('searchClear');
    clear.hidden = !input.value;
    popup.setAttribute('aria-label', t('searchResults'));
  }

  function setActive(index, scroll = true) {
    active = index;
    options.forEach((option, optionIndex) => option.setAttribute('aria-selected', String(optionIndex === active)));
    if (options[active]) {
      input.setAttribute('aria-activedescendant', options[active].id);
      if (scroll) options[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function outside(event) {
    if (!element.contains(event.target)) close();
  }

  function close() {
    clearTimeout(timer);
    timer = undefined;
    opened = false;
    results = [];
    options = [];
    active = -1;
    popup.hidden = true;
    popup.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    live.textContent = '';
    document.removeEventListener('pointerdown', outside);
  }

  function select(index) {
    const selected = results[index];
    if (!selected) return;
    // Recheck the current source at activation time, including during the debounce window.
    const unavailable = isUnavailable();
    if (unavailable || !(getState()?.[selected.collection] || []).some(row => row.id === selected.id)) {
      show();
      return;
    }
    input.value = '';
    clear.hidden = true;
    close();
    onSelect(selected.collection, selected.id);
  }

  function show() {
    clearTimeout(timer);
    timer = undefined;
    syncLabels();
    const unavailable = isUnavailable();
    const query = normalize(input.value);
    results = !unavailable && query ? searchRecords(getState(), query) : [];
    options = [];
    active = -1;
    input.removeAttribute('aria-activedescendant');
    popup.replaceChildren();
    if (!results.length) {
      const key = unavailable ? 'searchUnavailable' : query ? 'searchNoResults' : 'searchStart';
      popup.append(text(key, 'div', { class: 'search-empty', role: 'presentation' }));
      live.textContent = t(key);
    } else {
      for (const collection of collections) {
        const matches = results.map((row, index) => ({ row, index })).filter(({ row }) => row.collection === collection);
        if (!matches.length) continue;
        const labelId = `global-search-group-${collection}`;
        const group = el('div', { class: 'search-group', role: 'group', 'aria-labelledby': labelId },
          text(collection, 'div', { id: labelId, class: 'search-group-label', role: 'presentation' }));
        for (const { row, index } of matches) {
          const option = el('div', {
            id: `global-search-option-${index}`, class: 'search-result', role: 'option',
            'aria-selected': 'false',
            onmousedown: event => event.preventDefault(),
            onclick: () => select(index),
            onpointermove: event => { if (event.pointerType === 'mouse') setActive(index, false); }
          }, icon(collectionIcons[collection]),
          el('span', { class: 'search-result-content' }, el('strong', {}, userText(row.name)),
            row.detail ? el('small', {}, userText(row.detail)) : null),
          text(collection, 'span', { class: 'search-result-type' }));
          options[index] = option;
          group.append(option);
        }
        popup.append(group);
      }
      live.textContent = t('searchResultCount', { count: results.length });
    }
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (!opened) document.addEventListener('pointerdown', outside);
    opened = true;
  }

  function schedule() {
    // Immediately discard the old result set so a changed query cannot activate stale results.
    close();
    clear.hidden = !input.value;
    if (!composing) timer = setTimeout(show, 120);
  }

  input.addEventListener('input', schedule);
  input.addEventListener('search', schedule);
  input.addEventListener('compositionstart', () => { composing = true; close(); });
  input.addEventListener('compositionend', () => { composing = false; schedule(); });
  input.addEventListener('focus', show);
  input.addEventListener('click', () => { if (!opened) show(); });
  input.addEventListener('keydown', event => {
    if (event.isComposing || composing) return;
    if (event.key === 'Escape') {
      if (opened || timer !== undefined) { event.preventDefault(); event.stopPropagation(); close(); }
    } else if (event.key === 'Tab') close();
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!opened || timer !== undefined) show();
      if (results.length) setActive(event.key === 'ArrowDown'
        ? (active + 1) % results.length
        : (active < 0 ? results.length - 1 : (active - 1 + results.length) % results.length));
    } else if (event.key === 'Enter') {
      if (timer !== undefined) show();
      if (opened && results.length) { event.preventDefault(); select(active < 0 ? 0 : active); }
    }
  });
  element.addEventListener('focusout', () => {
    queueMicrotask(() => { if (!element.contains(document.activeElement)) close(); });
  });

  function refresh() {
    syncLabels();
    if (opened) show();
    else {
      results = [];
      options = [];
      input.removeAttribute('aria-activedescendant');
    }
  }
  syncLabels();
  return { element, refresh, close, input };
}
