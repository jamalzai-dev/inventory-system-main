import { KEY, RECOVERY_KEY, LEGACY_KEYS, InventoryError, createId } from './data.js';
import { stockStatus, units, inventoryValue, product } from './decimal.js';
import { createApi, ApiError } from './api.js';
import { InventoryStore } from './store.js';
import { t, setLanguage, number, money, date } from './i18n.js';
import { el, text, button, userText, localize, table } from './ui.js';
import { logout } from './auth.js';
import { icon } from './icons.js';
import { createGlobalSearch } from './search.js';
import { summarizeInventory, filterMaterials, renderInventoryCharts } from './dashboard.js';

const api = createApi({ onUnavailable: error => {
  if (store.status === 'auth') return;
  store.status = store.ready ? 'stale' : 'error'; store.error = error; store.emit();
}, onUnauthorized: () => {
  store.clear(); dialog.close(); confirmDialog.close(); historyDialog.close(); printArea.replaceChildren();
  globalSearch.close(); location.replace('/login');
} });
const store = new InventoryStore(api, {
  getItem: key => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: key => sessionStorage.removeItem(key)
});
let state = store.data;
let prefs = { lang: document.documentElement.lang, dark: document.documentElement.dataset.theme === 'dark' };
setLanguage(prefs.lang);
const pages = ['dashboard', 'materials', 'categories', 'suppliers', 'reports', 'backup', 'settings'];
let page = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
let query = '', categoryFilter = '', statusFilter = '', materialSort = 'recent';
let reportCategory = '', refreshRemovalLabels = null;
let opener, noticeTimer, pendingConfirmation;
// Reserved for the official KDRU IT logo. Insert an <img src="assets/kdru-it-logo.svg"
// alt=""> inside .logo-space when the approved asset is supplied; keep it empty until then.
const brand = () => el('div', { class: 'brand' }, el('span', { class: 'logo-space', 'aria-hidden': 'true' }), el('div', {}, text('brand', 'strong'), text('university', 'small')));
const nav = el('nav', { 'aria-label': t('workspace'), 'data-label': 'workspace' });
const icons = ['dashboard', 'package', 'layers', 'truck', 'chart', 'database', 'settings'];
pages.forEach((key, index) => nav.append(el('button', { type: 'button', 'data-page': key, onclick: () => navigate(key) }, icon(icons[index]), text(key))));
const sidebar = el('aside', { class: 'sidebar', id: 'navigation', 'aria-label': t('workspace'), 'data-label': 'workspace' }, brand(),
  el('button', { type: 'button', class: 'button sidebar-close', 'aria-label': t('close'), 'data-label': 'close', onclick: () => toggleMenu(false, true) }, icon('x')),
  text('workspace', 'p', { class: 'eyebrow' }), nav,
  el('div', { class: 'sidebar-note' }, el('span', { class: 'local-dot', 'aria-hidden': true }), text('centralInventory'), text('centralHint', 'p')));
const backdrop = el('div', { class: 'sidebar-backdrop', hidden: true, onclick: () => toggleMenu(false, true) });
const pageTitle = el('h1', { tabindex: '-1' });
const pageDescription = el('p', { class: 'muted' });
const menu = el('button', { type: 'button', class: 'button menu-button', 'data-label': 'menu', 'aria-label': t('menu'), 'aria-controls': 'navigation', 'aria-expanded': 'false', onclick: () => toggleMenu() }, icon('menu'));
const headerTitle = el('span', { class: 'header-page' });
const globalSearch = createGlobalSearch({
  getState: () => state,
  isUnavailable: () => store.status !== 'ready',
  onSelect: (collection, id) => {
    navigate(collection);
    const row = [...content.querySelectorAll('[data-record-id]')].find(node => node.dataset.recordId === id);
    if (row) { row.classList.add('record-highlight'); row.tabIndex = -1; row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center', behavior: 'instant' }); }
  }
});
const heading = el('header', { class: 'topbar' }, el('div', { class: 'header-context breadcrumb' }, menu, text('headerDepartment'), el('span', { class: 'breadcrumb-divider', 'aria-hidden': true }, '/'), headerTitle), globalSearch.element);
const content = el('div', { id: 'page-content' });
const errorBanner = el('div', { class: 'notice error', role: 'alert', hidden: true });
const connectionBanner = el('div', { class: 'notice connection-status', role: 'status', 'aria-live': 'polite', hidden: true });
const main = el('main', { id: 'main', tabindex: '-1' }, heading, el('div', { class: 'content' }, errorBanner,
  connectionBanner,
  el('div', { class: 'page-heading' }, el('div', {}, pageTitle, pageDescription), el('div', { id: 'page-actions' })), content));
const toast = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite', hidden: true });
const dialog = el('dialog', { 'aria-labelledby': 'dialog-title', class: 'record-dialog' });
const confirmDialog = el('dialog', { 'aria-labelledby': 'confirm-title', class: 'confirm-dialog' });
const historyDialog = el('dialog', { 'aria-labelledby': 'history-title', class: 'history-dialog' });
for (const modal of [dialog, confirmDialog, historyDialog]) {
  modal.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}
const printArea = el('section', { id: 'print-area' });
document.querySelector('#app').append(el('a', { href: '#main', class: 'skip-link', 'data-i18n': 'skip' }, t('skip')), sidebar, backdrop, main, dialog, confirmDialog, historyDialog, toast, printArea);

function reportError(error, target = errorBanner) {
  const key = error instanceof InventoryError || error instanceof ApiError ? error.code : 'unableSave';
  target.replaceChildren(text(key));
  target.hidden = false;
  if (error.uncertain) target.append(text(store.pending ? 'outcomeUncertain' : 'metadataUncertain', 'p'));
  if (target === errorBanner && key === 'staleData') target.append(button('reload', () => location.reload()));
}
function notify(key) {
  clearTimeout(noticeTimer);
  toast.replaceChildren(text(key)); toast.hidden = false;
  noticeTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}
async function run(action) { try { return await action(); } catch (error) { reportError(error); } }
async function refreshInventory() { return store.refresh(); }
async function retryPending() {
  await refreshInventory();
  await store.retry();
  dialog.close(); confirmDialog.close(); errorBanner.hidden = true; notify('saved');
}
function updateConnection() {
  connectionBanner.replaceChildren(); connectionBanner.hidden = false;
  if (store.busy) connectionBanner.append(text('savingInventory'));
  else if (store.journalError) connectionBanner.append(text('recoveryUnavailable'));
  else if (store.pending) connectionBanner.append(text('outcomeUncertain'), el('bdi', { dir: 'ltr' }, store.pending.body.operationId || store.pending.headers['Idempotency-Key']), button('retrySafely', () => run(retryPending), '', { disabled: store.busy }));
  else if (store.status === 'loading') connectionBanner.append(text('loadingInventory'));
  else if (store.status !== 'ready') connectionBanner.append(text(store.error?.code || 'serverUnreachable'), text('staleReadOnly'));
  else connectionBanner.hidden = true;
  if (!store.busy && store.status !== 'ready') connectionBanner.append(button('refreshInventory', () => run(refreshInventory)));
  document.documentElement.dataset.inventoryStatus = store.status;
}
const mobileNavigation = matchMedia('(max-width: 900px)');
function toggleMenu(force, restoreFocus = false) {
  const open = mobileNavigation.matches && (force ?? !sidebar.classList.contains('open'));
  sidebar.classList.toggle('open', open);
  sidebar.inert = mobileNavigation.matches && !open;
  main.inert = open;
  backdrop.hidden = !open;
  document.body.classList.toggle('navigation-open', open);
  menu.setAttribute('aria-expanded', String(open));
  if (open) {
    globalSearch.close();
    sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true');
    nav.querySelector('[aria-current="page"]')?.focus();
  } else {
    sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal');
    if (restoreFocus) menu.focus();
  }
}
mobileNavigation.addEventListener('change', () => toggleMenu(false));
toggleMenu(false);
sidebar.addEventListener('keydown', event => {
  if (!sidebar.classList.contains('open') || event.key !== 'Tab') return;
  const controls = [...sidebar.querySelectorAll('button')].filter(node => node.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
function navigate(next, { preserveFilters = false } = {}) {
  page = next;
  if (!preserveFilters) { query = ''; categoryFilter = ''; statusFilter = ''; materialSort = 'recent'; }
  history.replaceState(null, '', `#${next}`);
  toggleMenu(false); renderPage(); pageTitle.focus();
  if (!dialog.open && !confirmDialog.open) void refreshInventory();
}
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (pages.includes(next)) navigate(next); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && sidebar.classList.contains('open')) { event.preventDefault(); toggleMenu(false, true); } });
function savePreferences() {
  const activeSetting = document.activeElement.closest('.setting-row');
  const focusPosition = activeSetting ? [...document.querySelectorAll('.setting-row')].indexOf(activeSetting) : -1;
  const focusButton = activeSetting ? [...activeSetting.querySelectorAll('button')].indexOf(document.activeElement) : -1;
  document.documentElement.lang = prefs.lang;
  document.documentElement.dir = prefs.lang === 'ps' ? 'rtl' : 'ltr';
  document.documentElement.dataset.theme = prefs.dark ? 'dark' : 'light';
  setLanguage(prefs.lang);
  try { localStorage.setItem('university_it_preferences', JSON.stringify(prefs)); } catch { notify('preferenceFailed'); }
  localize(); renderPage(); updateConnection(); globalSearch.refresh();
  refreshRemovalLabels?.();
  if (focusPosition >= 0) document.querySelectorAll('.setting-row')[focusPosition]?.querySelectorAll('button')[focusButton]?.focus();
  document.title = t('app');
}
function badge(m) { const key = stockStatus(m); return text(key, 'span', { class: `pill ${key}` }); }
function categoryName(id) { return state.categories.find(x => x.id === id)?.name ?? '—'; }
function materialName(m) { return el('div', { class: 'record-name' }, el('span', { class: 'record-icon', 'aria-hidden': true }, icon('package')), el('div', {}, userText(m.name), el('small', { class: 'muted' }, m.serial ? el('bdi', { dir: 'ltr' }, m.serial) : text('noSerial')))); }
function rowActions(collection, record) {
  const edit = button('edit', () => run(() => openRecord(collection, record.id)), 'small', { disabled: store.blocked, title: t('edit'), 'aria-label': `${t('edit')}: ${record.name}` });
  const remove = button('delete', () => deleteRecord(collection, record), 'small danger-text', { disabled: store.blocked, title: t('delete'), 'aria-label': `${t('delete')}: ${record.name}` });
  edit.prepend(icon('edit')); remove.prepend(icon('trash'));
  return el('div', { class: 'row-actions' }, edit, remove);
}
function identifyRows(wrapper, records) {
  wrapper.querySelectorAll('tbody tr').forEach((row, index) => { if (records[index]) row.dataset.recordId = records[index].id; });
  return wrapper;
}
function materialRows(records, actions = false) {
  return records.map(m => [materialName(m), userText(categoryName(m.categoryId)), el('div', {}, number(m.quantity), el('small', { class: 'muted' }, text('reorderLevel'), ': ', number(m.reorderLevel))), userText(m.location),
    ...(actions ? [conditionText(m.condition), userText(m.responsible || '—')] : []), badge(m), ...(actions ? [rowActions('materials', m)] : [])]);
}
function conditionText(value) { return ['Good', 'Needs Repair', 'Damaged'].includes(value) ? text(value, 'span', { class: 'condition' }) : userText(value); }
function card(title, description, body, action = null) {
  return el('section', { class: 'card' }, el('div', { class: 'card-heading' }, el('div', {}, text(title, 'h2'), description ? text(description, 'p', { class: 'muted' }) : null), action), body);
}
function materialFilterControls(draw, { includeSort = true } = {}) {
  const category = el('select', { 'aria-label': t('categoryId'), 'data-label': 'categoryId' }, el('option', { value: '' }, t('allCategories')), state.categories.map(c => el('option', { value: c.id }, c.name)));
  category.value = categoryFilter;
  const status = el('select', { 'aria-label': t('status'), 'data-label': 'status' }, ['', 'good', 'low', 'out'].map(key => el('option', { value: key }, t(key || 'allStatuses'))));
  status.value = statusFilter;
  category.addEventListener('change', () => { categoryFilter = category.value; draw(); });
  status.addEventListener('change', () => { statusFilter = status.value; draw(); });
  const sort = el('select', { 'aria-label': t('sortBy'), 'data-label': 'sortBy', class: 'material-sort' }, ['recent','name','category','quantity','status'].map(key => el('option', { value: key }, t(`sort_${key}`))));
  sort.value = materialSort;
  sort.addEventListener('change', () => { materialSort = sort.value; draw(); });
  return [category, status, ...(includeSort ? [sort] : [])];
}
function renderDashboard() {
  const summary = summarizeInventory(state);
  const stats = [['totalMaterials', summary.total, 'registered', 'package'], ['good', summary.good, 'healthyCountHint', 'check'], ['low', summary.low, 'lowCountHint', 'alert'], ['out', summary.out, 'outCountHint', 'circleOff']];
  const cards = el('div', { class: 'stats' }, stats.map(([key, value, hint, symbol], index) => el('section', { class: `stat stat-${index}` }, el('div', { class: 'stat-heading' }, text(key, 'h2'), el('span', { class: `stat-icon ${key}`, 'aria-hidden': true }, icon(symbol))), el('strong', { class: 'stat-value' }, number(value)), text(hint, 'p'))));
  const result = el('div');
  const count = el('p', { class: 'result-count', 'aria-live': 'polite' });
  const filters = el('div', { class: 'filters preview-filters', id: 'preview-filters', hidden: !categoryFilter && !statusFilter && materialSort === 'recent' });
  const filter = button('filter', () => { filters.hidden = !filters.hidden; filter.setAttribute('aria-expanded', String(!filters.hidden)); if (!filters.hidden) filters.querySelector('select')?.focus(); }, '', { 'aria-controls': 'preview-filters', 'aria-expanded': String(!filters.hidden) });
  filter.prepend(icon('filter'));
  const seeAll = button('seeAll', () => navigate('materials', { preserveFilters: true }), '');
  seeAll.append(icon('arrowRight'));
  filters.append(...materialFilterControls(draw));
  const preview = card('materialInventory', 'inventoryPreviewHint', el('div', {}, filters, result, count), el('div', { class: 'card-actions' }, filter, seeAll));
  preview.classList.add('inventory-preview');
  function draw() {
    const matches = filterMaterials(state, { category: categoryFilter, status: statusFilter, sort: materialSort });
    const rows = matches.slice(0, 6);
    result.replaceChildren(identifyRows(table(['material','categoryId','quantity','location','status','actions'], rows.map(m => [...materialRows([m])[0], rowActions('materials', m)])), rows));
    count.textContent = t('previewCount', { count: number(rows.length), total: number(matches.length) });
  }
  draw();
  content.append(cards, renderInventoryCharts(state), preview);
}
function filtered(collection) {
  if (collection === 'materials') return filterMaterials(state, { query, category: categoryFilter, status: statusFilter, sort: materialSort });
  const needle = query.normalize('NFKC').toLocaleLowerCase().trim();
  const fields = collection === 'categories' ? ['name','description'] : ['name','contact','phone','email','address'];
  return state[collection].filter(record => !needle || fields.some(key => String(record[key] || '').normalize('NFKC').toLocaleLowerCase().includes(needle)));
}
function renderRecords(collection) {
  const search = el('input', { type: 'search', 'aria-label': t('search'), 'data-label': 'search', 'data-placeholder': 'searchHint', placeholder: t('searchHint'), value: query });
  const filters = el('div', { class: 'filters' }, search);
  const result = el('div');
  const count = el('p', { class: 'result-count', 'aria-live': 'polite' });
  if (collection === 'materials') filters.append(...materialFilterControls(draw));
  function draw() {
    const rows = filtered(collection);
    count.textContent = t('count', { count: number(rows.length) });
    if (collection === 'materials') result.replaceChildren(identifyRows(table(['material','categoryId','quantity','location','condition','responsible','status','actions'], materialRows(rows, true)), rows));
    else if (collection === 'categories') result.replaceChildren(table(['categoryId','description','materials','actions'], rows.map(c => [userText(c.name), userText(c.description || '—'), number(state.materials.filter(m => m.categoryId === c.id).length), rowActions(collection, c)])));
    else result.replaceChildren(table(['supplierId','contact','phone','email','address','materials','actions'], rows.map(s => [userText(s.name), userText(s.contact || '—'), el('bdi', { dir: 'ltr' }, s.phone || '—'), el('bdi', { dir: 'ltr' }, s.email || '—'), userText(s.address || '—'), number(state.materials.filter(m => m.supplierId === s.id).length), rowActions(collection, s)])));
    identifyRows(result, rows);
  }
  search.addEventListener('input', () => { query = search.value; draw(); });
  content.append(el('section', { class: 'card' }, filters, result, count)); draw();
}
function renderReports() {
  const categorySelect = el('select', { id: 'print-category' }, el('option', { value: '' }, t('choose')), state.categories.map(c => el('option', { value: c.id }, c.name)));
  categorySelect.value = reportCategory;
  categorySelect.addEventListener('change', () => { reportCategory = categorySelect.value; });
  content.append(el('div', { class: 'filters category-print-controls' }, text('categoryId', 'label', { for: 'print-category' }), categorySelect,
    button('printCategory', () => {
      if (!reportCategory) { reportError(new InventoryError('selectPrintCategory')); categorySelect.focus(); return; }
      void run(() => printReport(reportCategory));
    })));
  const status = el('dl', { class: 'summary-list' }, ['good','low','out'].map(key => [text(key, 'dt'), el('dd', {}, number(state.materials.filter(m => stockStatus(m) === key).length))]));
  const groups = el('dl', { class: 'summary-list' }, state.categories.map(c => [el('dt', {}, userText(c.name)), el('dd', {}, number(state.materials.filter(m => m.categoryId === c.id).length))]));
  if (!state.categories.length) groups.append(text('empty', 'p'));
  const value = inventoryValue(state.materials);
  content.append(el('div', { class: 'report-grid' }, card('status', null, status), card('categories', null, groups), card('inventoryValue', null, el('div', { class: 'card-body' }, el('bdi', { class: 'value', dir: 'auto' }, money(value)), text('valueHint', 'p', { class: 'muted' })))),
    text('exactValueHint', 'p', { class: 'muted' }),
    card('attention', null, table(['material','categoryId','quantity','location','status'], materialRows(state.materials.filter(m => stockStatus(m) !== 'good')), 'healthy', 'healthyHint')));
  content.append(button('movementHistory', () => run(() => openMovements())));
}
function download(payload, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = el('a', { href: url, download: filename }); document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('downloaded');
}
async function exportInventory() {
  if (!(await refreshInventory()) || store.pending) throw new ApiError('mutationBlocked');
  download({ format: 'kdru-central-inventory-read-only', version: 1, exportedAt: new Date().toISOString(),
    notice: 'Read-only inventory export. Not a transaction snapshot or restorable database backup. Movement history and sessions are not included.',
    data: state }, 'kdru-central-inventory-export.json');
}
function legacyArchive() {
  const records = {};
  for (const key of [KEY, RECOVERY_KEY, ...LEGACY_KEYS]) records[key] = localStorage.getItem(key);
  return { format: 'university-it-raw-archive', version: 1, records };
}
function renderBackup() {
  let hasLegacy = false;
  try { hasLegacy = Object.values(legacyArchive().records).some(value => value !== null); } catch { /* Export reports access errors. */ }
  content.append(el('div', { class: 'backup-grid' },
    card('centralExport', 'centralExportHint', el('div', { class: 'card-body' }, button('centralExport', () => run(exportInventory), 'primary', { disabled: store.blocked }))),
    card('centralRestore', 'centralRestoreHint', el('div', { class: 'card-body' }, button('restore', () => {}, '', { disabled: true }))),
    card('legacyExport', hasLegacy ? 'legacySeparate' : 'noLegacy', el('div', { class: 'card-body stack' },
      button('legacyExport', () => run(() => download(legacyArchive(), 'kdru-legacy-browser-archive.json'))),
      button('legacyBackup', () => run(() => {
        const raw = localStorage.getItem(KEY);
        if (raw === null) throw new InventoryError('noLegacy');
        download({ app: 'University IT Material Management', version: 2, data: JSON.parse(raw) }, 'kdru-legacy-browser-backup.json');
      }), '', { disabled: !hasLegacy })))));
}
function renderSettings() {
  const languages = el('div', { class: 'segmented' }, ['en', 'ps'].map(lang => el('button', { type: 'button', class: 'button language-button', 'data-language': lang, lang, 'aria-pressed': String(prefs.lang === lang), onclick: () => { prefs.lang = lang; savePreferences(); } }, lang === 'en' ? 'English' : 'پښتو')));
  const appearance = el('div', { class: 'segmented' }, ['light', 'dark'].map(theme => {
    const control = button(theme, () => { prefs.dark = theme === 'dark'; savePreferences(); }, 'theme-button', { 'data-theme-choice': theme, 'aria-pressed': String(prefs.dark === (theme === 'dark')) });
    control.prepend(icon(theme === 'light' ? 'sun' : 'moon')); return control;
  }));
  const signOut = button('signOut', async () => { try { await logout(() => { store.clear(); printArea.replaceChildren(); }); } catch { notify('signOutFailed'); } }, 'danger-text');
  signOut.prepend(icon('logout'));
  content.append(el('section', { class: 'card settings' },
    el('div', { class: 'setting-row' }, el('div', {}, text('language', 'h2'), text('languageHint', 'p', { class: 'muted' })), languages),
    el('div', { class: 'setting-row' }, el('div', {}, text('theme', 'h2'), text('themeHint', 'p', { class: 'muted' })), appearance),
    el('div', { class: 'setting-row' }, el('div', {}, text('currency', 'h2'), text('currencyHint', 'p', { class: 'muted' })), el('bdi', { dir: 'ltr' }, 'AFN'))),
    el('section', { class: 'card settings settings-section' }, el('div', { class: 'setting-row' }, el('div', {}, text('session', 'h2'), text('sessionHint', 'p', { class: 'muted' })), signOut)),
    text('reviewTranslation', 'p', { class: 'muted translation-note' }));
}
function renderPage() {
  pageTitle.textContent = t(page); headerTitle.textContent = t(page); pageDescription.textContent = t(`${page}Desc`);
  nav.querySelectorAll('button').forEach(node => { node.classList.toggle('active', node.dataset.page === page); if (node.dataset.page === page) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); });
  const actions = document.querySelector('#page-actions');
  if (!actions) return; // Session expiry may have already removed the protected shell.
  actions.replaceChildren();
  if (['dashboard','materials','categories','suppliers'].includes(page)) {
    const collection = page === 'dashboard' ? 'materials' : page;
    const add = button({materials:'addMaterial',categories:'addCategory',suppliers:'addSupplier'}[collection], () => run(() => openRecord(collection)), 'primary', { disabled: store.blocked });
    add.prepend(icon('plus')); actions.append(add);
    if (page === 'materials') actions.append(button('addStock', () => openRemoval('add'), '', { disabled: store.blocked }), button('removeMaterials', () => openRemoval('remove'), '', { id: 'remove-materials', disabled: store.blocked }), button('movementHistory', () => run(() => openMovements()), '', { disabled: store.status !== 'ready' }));
  } else if (page === 'reports') actions.append(button('print', () => run(() => printReport()), '', { disabled: store.blocked }));
  actions.append(button('refreshInventory', () => run(refreshInventory), '', { disabled: store.busy }));
  content.replaceChildren();
  if (!store.ready && !['settings', 'backup'].includes(page)) { content.append(text(store.status === 'loading' ? 'loadingInventory' : 'inventoryUnavailable', 'p', { class: 'card card-body', role: 'status' })); return; }
  if (page === 'dashboard') renderDashboard();
  else if (['materials','categories','suppliers'].includes(page)) renderRecords(page);
  else if (page === 'reports') renderReports();
  else if (page === 'backup') renderBackup();
  else renderSettings();
}
function closeDialog() { dialog.close(); }
dialog.addEventListener('close', () => {
  refreshRemovalLabels = null;
  // Native close events are queued: do not steal focus from a new user action.
  if (document.activeElement === document.body || dialog.contains(document.activeElement)) {
    if (opener?.isConnected) opener.focus(); else pageTitle.focus();
  }
});
function openDialog(title, body) {
  opener = document.activeElement;
  dialog.replaceChildren(el('div', { class: 'dialog-heading' }, text(title, 'h2', { id: 'dialog-title' }), el('div', { class: 'dialog-actions' }, button('close', closeDialog, 'small'))), body);
  dialog.showModal();
}
function openRemoval(type = 'remove') {
  if (store.blocked) { reportError(new ApiError('mutationBlocked')); return; }
  const selected = new Map();
  let reviewing = false, completed = false;
  const errors = el('div', { id: 'removal-errors', class: 'notice error', role: 'alert', hidden: true });
  const search = el('input', { id: 'removal-search', type: 'search', 'data-placeholder': 'searchHint', placeholder: t('searchHint') });
  const select = el('select', { id: 'removal-material' });
  const available = el('p', { class: 'muted', 'aria-live': 'polite' });
  const rows = el('div', { class: 'stack removal-rows' });
  const reason = el('textarea', { id: 'stock-reason', rows: 2, maxlength: 1000 });
  const unit = material => typeof material.unit === 'string' && material.unit.trim() ? userText(material.unit) : text('units');
  function showAvailable() {
    const material = state.materials.find(m => m.id === select.value);
    available.replaceChildren(...(material ? [text('availableQuantity'), ': ', number(material.quantity), ' ', unit(material)] : []));
  }
  function filterOptions() {
    const previous = select.value;
    const needle = search.value.trim().toLocaleLowerCase();
    const matches = state.materials.filter(m => [m.name, m.serial, m.location, categoryName(m.categoryId)].some(value => String(value || '').toLocaleLowerCase().includes(needle)));
    select.replaceChildren(el('option', { value: '' }, t('selectMaterial')), ...matches.map(m => el('option', { value: m.id }, `${m.name} · ${m.serial || m.location || '—'}`)));
    select.value = matches.some(m => m.id === previous) ? previous : '';
    showAvailable();
  }
  search.addEventListener('input', filterOptions);
  select.addEventListener('change', showAvailable);
  function addSelection() {
    const material = state.materials.find(m => m.id === select.value);
    if (!material) { reportError(new InventoryError('removalEmpty'), errors); select.focus(); return; }
    if (selected.has(material.id)) { selected.get(material.id).input.focus(); return; }
    if (selected.size >= 25) { reportError(new ApiError('batchLimit'), errors); return; }
    errors.hidden = true;
    const inputId = `removal-quantity-${selected.size}-${createId()}`;
    const input = el('input', { id: inputId, type: 'text', inputmode: 'decimal', required: true, dir: 'ltr', 'aria-describedby': 'removal-errors' });
    const stock = el('p', { class: 'muted' }, text('availableQuantity'), ': ', number(material.quantity), ' ', unit(material));
    const row = el('section', { class: 'card card-body', 'data-removal-id': material.id }, el('h3', {}, userText(material.name)), el('small', {}, userText(material.serial || material.location)), stock,
      el('div', { class: 'field' }, el('label', { for: inputId }, text(type === 'add' ? 'quantity' : 'removalAmount')), input),
      button('excludeRemoval', () => { selected.delete(material.id); row.remove(); select.focus(); }, 'small'));
    selected.set(material.id, { input, stock, material }); rows.append(row); input.focus();
  }
  const form = el('form', { novalidate: true, id: 'removal-form' }, text('stockHint', 'p', { class: 'muted' }), errors,
    el('div', { class: 'form-grid' }, el('div', { class: 'field' }, text('search', 'label', { for: 'removal-search' }), search),
      el('div', { class: 'field' }, text('material', 'label', { for: 'removal-material' }), select)), available,
    button('selectMaterial', addSelection, '', { id: 'add-removal' }), rows,
    el('div', { class: 'field' }, text('reason', 'label', { for: 'stock-reason' }), reason),
    el('div', { class: 'dialog-footer' }, button('cancel', closeDialog), el('button', { type: 'submit', class: 'button primary' }, text(type === 'add' ? 'reviewStock' : 'reviewRemoval'))));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (reviewing || completed) return;
    errors.hidden = true;
    try {
      const entries = [...selected].map(([id, { input }]) => {
        input.removeAttribute('aria-invalid');
        let valid = false;
        try { valid = units(input.value) > 0n; } catch { /* Exact validation below. */ }
        if (!valid) {
          input.setAttribute('aria-invalid', 'true'); input.focus(); throw new InventoryError('removalQuantity');
        }
        return { materialId: id, quantity: input.value };
      });
      if (!entries.length) throw new InventoryError('removalEmpty');
      const summary = el('div', {}, text('stockPreviewHint', 'p'), table(['material','availableQuantity', type === 'add' ? 'quantity' : 'removalAmount'], entries.map(entry => {
        const m = state.materials.find(m => m.id === entry.materialId);
        return [userText(m.name), el('span', {}, number(m.quantity), ' ', unit(m)), number(entry.quantity)];
      })));
      reviewing = true;
      confirmDialog.addEventListener('close', () => { reviewing = false; }, { once: true });
      confirmAction(type === 'add' ? 'addStock' : 'confirmRemoval', summary, type === 'add' ? 'addStock' : 'confirmRemoval', async () => {
        if (completed) return;
        completed = true;
        try { await store.stock(type, entries, reason.value.trim() || null); notify(type === 'add' ? 'stockSaved' : 'removalSaved'); }
        catch (error) { completed = false; throw error; }
        closeDialog();
      });
    } catch (error) { reportError(error, errors); }
  });
  openDialog(type === 'add' ? 'addStock' : 'removeMaterials', form);
  refreshRemovalLabels = () => {
    filterOptions();
    for (const { stock, material } of selected.values()) stock.replaceChildren(text('availableQuantity'), ': ', number(material.quantity), ' ', unit(material));
  };
  filterOptions(); search.focus();
}
const recordFields = {
  materials: ['name','categoryId','reorderLevel','location','condition','serial','unit','responsible','supplierId','price','purchaseDate','description'],
  categories: ['name','description'],
  suppliers: ['name','contact','phone','email','address','description']
};
async function openRecord(collection, id) {
  if (store.blocked) { reportError(new ApiError('mutationBlocked')); return; }
  if (collection === 'materials' && !state.categories.length) { notify('categoryFirst'); navigate('categories'); return; }
  const old = id ? (collection === 'materials' ? await api.material(id) : state[collection].find(x => x.id === id)) : null;
  if (dialog.open || store.blocked) return;
  const defaults = { categoryId: state.categories[0]?.id || '' };
  const controls = {};
  const errors = el('div', { class: 'notice error', role: 'alert', hidden: true });
  const form = el('form', { novalidate: true }, text(collection === 'materials' && !id ? 'zeroStockHint' : 'requiredHint', 'p', { class: 'muted' }), errors);
  const fields = el('div', { class: 'form-grid' });
  for (const key of recordFields[collection]) {
    const required = ['name','categoryId'].includes(key);
    const attrs = { id: `field-${key}`, name: key, required, dir: ['phone','email','serial','purchaseDate'].includes(key) ? 'ltr' : 'auto', 'aria-describedby': 'form-errors' };
    let input;
    if (key === 'description') input = el('textarea', { ...attrs, rows: 3 });
    else if (key === 'categoryId' || key === 'supplierId') {
      const records = key === 'categoryId' ? state.categories : state.suppliers;
      input = el('select', attrs, el('option', { value: '', 'data-i18n': key === 'categoryId' ? 'choose' : 'unspecified' }, t(key === 'categoryId' ? 'choose' : 'unspecified')), records.map(x => el('option', { value: x.id }, x.name)));
    } else if (key === 'condition') input = el('input', { ...attrs, type: 'text' });
    else input = el('input', { ...attrs, type: key === 'purchaseDate' ? 'date' : key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text' });
    input.value = old?.[key] ?? defaults[key] ?? '';
    if (['reorderLevel', 'price'].includes(key)) { input.setAttribute('inputmode', 'decimal'); input.setAttribute('dir', 'ltr'); }
    controls[key] = input;
    fields.append(el('div', { class: `field ${['name', 'description', 'address'].includes(key) ? 'full' : ''}` }, el('label', { for: attrs.id }, text(key), required ? el('span', { 'aria-hidden': true }, ' *') : null), input));
  }
  errors.id = 'form-errors';
  form.append(fields, el('div', { class: 'dialog-footer' }, button('cancel', closeDialog), el('button', { type: 'submit', class: 'button primary' }, text('save'))));
  let saving = false;
  form.addEventListener('submit', async event => {
    event.preventDefault(); errors.hidden = true;
    if (saving) return;
    Object.values(controls).forEach(input => input.removeAttribute('aria-invalid'));
    try {
      const invalid = Object.values(controls).find(input => input.required && !input.value.trim());
      if (invalid) { invalid.setAttribute('aria-invalid', 'true'); invalid.focus(); throw new InventoryError('required'); }
      if (controls.email?.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(controls.email.value)) { controls.email.setAttribute('aria-invalid', 'true'); controls.email.focus(); throw new InventoryError('invalidEmail'); }
      const record = {};
      for (const [key, input] of Object.entries(controls)) {
        if (old && input.value === (old[key] ?? '')) continue; // Omitted means preserve.
        const value = input.value.trim();
        if (['reorderLevel','price'].includes(key) && value) {
          try { units(value, key === 'price' ? 2 : 3); }
          catch { input.setAttribute('aria-invalid','true'); input.focus(); throw new ApiError('invalidDecimal'); }
        }
        record[key] = value || (input.required ? '' : null);
      }
      if (old && !Object.keys(record).length) { closeDialog(); return; }
      saving = true; setFormBusy(form, true);
      if (old) await store.update(collection, old, record); else await store.create(collection, record);
      notify(collection === 'materials' && !old ? 'materialCreated' : 'saved'); closeDialog();
    } catch (error) {
      reportError(error, errors);
      if (error.code === 'recordConflict') errors.append(button('reloadRecord', async () => {
        if (await refreshInventory()) { closeDialog(); await run(() => openRecord(collection, id)); }
      }));
    } finally { saving = false; setFormBusy(form, false); }
  });
  openDialog(({ materials: id ? 'editMaterial' : 'addMaterial', categories: id ? 'editCategory' : 'addCategory', suppliers: id ? 'editSupplier' : 'addSupplier' })[collection], form);
  controls.name.focus();
  if (old && collection === 'materials') form.insertBefore(button('movementHistory', () => run(() => openMovements(old.id))), fields);
}
function setFormBusy(form, busy) {
  form.setAttribute('aria-busy', String(busy));
  form.querySelectorAll('button, input, select, textarea').forEach(node => { node.disabled = busy; });
}
function confirmAction(title, body, actionKey, action) {
  const returnFocus = document.activeElement;
  const errors = el('p', { class: 'notice error', role: 'alert', hidden: true });
  const cancel = button('cancel', () => confirmDialog.close());
  let pending = false;
  const submit = button(actionKey, async () => {
    if (pending) return;
    pending = true; submit.disabled = true; cancel.disabled = true;
    try { await action(); confirmDialog.close(); }
    catch (error) { reportError(error, errors); }
    finally { pending = false; submit.disabled = false; cancel.disabled = false; }
  }, 'primary');
  confirmDialog.replaceChildren(text(title, 'h2', { id: 'confirm-title' }), body, errors, el('div', { class: 'dialog-footer' }, cancel, submit));
  pendingConfirmation = returnFocus; confirmDialog.showModal(); cancel.focus();
}
confirmDialog.addEventListener('close', () => {
  if (document.activeElement === document.body || confirmDialog.contains(document.activeElement)) {
    if (pendingConfirmation?.isConnected) pendingConfirmation.focus(); else pageTitle.focus();
  }
});
function deleteRecord(collection, record) {
  confirmAction('confirmDelete', el('div', {}, el('p', { class: 'record-name' }, userText(record.name)), text('deleteHint', 'p')), 'delete', async () => {
    await store.remove(collection, record); notify('deleted');
  });
}
async function printReport(categoryId = null) {
  if (!(await refreshInventory()) || store.pending) throw new ApiError('mutationBlocked');
  const category = categoryId === null ? null : state.categories.find(c => c.id === categoryId);
  if (categoryId !== null && !category) { reportError(new InventoryError('selectPrintCategory')); return; }
  const materials = category ? state.materials.filter(m => m.categoryId === category.id) : state.materials;
  printArea.replaceChildren(text('app', 'h1'), ...(category ? [el('h2', {}, text('categoryId'), ': ', userText(category.name))] : []),
    el('p', {}, text('generated'), ': ', date(new Date())), el('p', {}, text('inventoryValue'), ': ', money(inventoryValue(materials))), text('exactValueHint', 'p'),
    table(['material','categoryId','quantity','price','lineValue','location','condition','responsible','status'], materials.map(m => [userText(m.name), userText(categoryName(m.categoryId)), number(m.quantity), money(m.price), m.price == null ? '—' : money(product(m.quantity, m.price)), userText(m.location), conditionText(m.condition), userText(m.responsible || '—'), text(stockStatus(m))]), category ? 'emptyCategory' : 'empty', category ? 'emptyCategoryHint' : 'emptyHint'));
  window.print();
}
async function openMovements(id = null) {
  const body = el('div', { class: 'stack' });
  const rows = el('div'), errors = el('p', { class: 'notice error', hidden: true, role: 'alert' });
  let cursor = null, records = [], pending = false;
  const more = button('loadMore', () => run(() => load(false)));
  async function load(reset) {
    if (pending) return;
    pending = true; more.disabled = true; errors.hidden = true;
    try {
      const result = await api.movements(id, reset ? null : cursor);
      if (!historyDialog.contains(body)) return;
      records = reset ? result.data : [...records, ...result.data.filter(row => !records.some(old => old.id === row.id))];
      cursor = result.page.nextCursor;
      rows.replaceChildren(table(['material', 'stockAction', 'quantity', 'reason', 'generated'], records.map(row => [userText(row.materialName), text(row.type === 'add' ? 'addStock' : 'removeMaterials'), number(row.quantityDelta), userText(row.reason), date(new Date(row.createdAt))])));
      more.hidden = cursor === null;
    } catch (error) { reportError(error, errors); }
    finally { pending = false; more.disabled = false; }
  }
  body.append(button('refreshInventory', () => load(true)), errors, rows, more);
  const returnFocus = document.activeElement;
  historyDialog.replaceChildren(el('div', { class: 'dialog-heading' }, text('movementHistory', 'h2', { id: 'history-title' }), button('close', () => historyDialog.close())), body);
  historyDialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); }, { once: true });
  historyDialog.showModal(); await load(true);
}
let lastStoreStatus, lastStoreBlocked;
store.subscribe(() => {
  const changed = state !== store.data || lastStoreStatus !== store.status || lastStoreBlocked !== store.blocked;
  state = store.data; lastStoreStatus = store.status; lastStoreBlocked = store.blocked;
  updateConnection();
  if (!changed) return;
  globalSearch.refresh();
  // Forms live outside content and retain their draft/version during refreshes.
  const active = document.activeElement;
  if (!contentDraftActive() || store.status !== 'ready') {
    const rowId = content.contains(active) ? active.closest('[data-record-id]')?.dataset.recordId : null;
    const action = rowId ? active.closest('button')?.querySelector('[data-i18n]')?.dataset.i18n : null;
    renderPage();
    if (rowId) {
      const row = [...content.querySelectorAll('[data-record-id]')].find(node => node.dataset.recordId === rowId);
      if (row) { row.tabIndex = -1; (action ? row.querySelector(`button:has([data-i18n="${action}"])`) : row)?.focus({ preventScroll: true }); }
    }
  }
});
function contentDraftActive() {
  const active = document.activeElement;
  return content.contains(active) && active.matches('input, select, textarea, [contenteditable="true"]');
}
function refreshWhenIdle() {
  if (!document.hidden && !dialog.open && !confirmDialog.open && !historyDialog.open && !contentDraftActive()) void refreshInventory();
}
window.addEventListener('focus', refreshWhenIdle);
window.addEventListener('online', refreshWhenIdle);
window.addEventListener('offline', () => { store.status = store.ready ? 'stale' : 'error'; store.error = new ApiError('serverUnreachable'); store.emit(); });
window.addEventListener('pagehide', () => {
  store.clear(); dialog.close(); confirmDialog.close(); historyDialog.close(); globalSearch.close(); printArea.replaceChildren();
});
window.addEventListener('inventory-session-expired', () => {
  store.clear(); dialog.close(); confirmDialog.close(); historyDialog.close(); globalSearch.close(); printArea.replaceChildren();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) { store.status = 'loading'; store.emit(); void refreshInventory(); }
});
document.addEventListener('visibilitychange', refreshWhenIdle);
window.addEventListener('beforeunload', event => { if (store.pending || store.busy) { event.preventDefault(); event.returnValue = ''; } });
setInterval(refreshWhenIdle, 60000);
renderPage(); updateConnection(); document.title = t('app'); void refreshInventory();
