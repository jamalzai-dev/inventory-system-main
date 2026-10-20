// DOM-only rendering: stored values never become markup or executable attributes.
import { t } from './i18n.js';
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
export const text = (key, tag = 'span', attrs = {}) => el(tag, { ...attrs, 'data-i18n': key }, t(key));
export function button(key, onclick, style = '', attrs = {}) {
  return el('button', { type: 'button', class: `button ${style}`, onclick, ...attrs }, text(key));
}
export const userText = value => el('bdi', { dir: 'auto' }, value ?? '—');
export function localize(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  root.querySelectorAll('[data-label]:not([data-column])').forEach(node => { node.setAttribute('aria-label', t(node.dataset.label)); });
  root.querySelectorAll('[data-column]').forEach(node => { node.dataset.label = t(node.dataset.column); });
  root.querySelectorAll('[data-placeholder]').forEach(node => { node.placeholder = t(node.dataset.placeholder); });
}
export function table(headers, rows, emptyKey = 'empty', hint = 'emptyHint') {
  // Explicit roles preserve table relationships when mobile CSS presents rows as cards.
  const body = el('tbody', { role: 'rowgroup' });
  if (rows.length) rows.forEach(row => body.append(el('tr', { role: 'row' }, row.map((cell, index) => el('td', { role: 'cell', 'data-column': headers[index], 'data-label': t(headers[index]) }, cell)))));
  else body.append(el('tr', { role: 'row' }, el('td', { role: 'cell', colspan: headers.length }, el('div', { class: 'empty' }, text(emptyKey, 'h3'), text(hint, 'p')))));
  return el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': t('scrollTable'), 'data-label': 'scrollTable' },
    el('table', { role: 'table' }, el('thead', { role: 'rowgroup' }, el('tr', { role: 'row' }, headers.map(key => text(key, 'th', { scope: 'col', role: 'columnheader' })))), body));
}
