import { stockStatus } from './data.js';
import { number, t } from './i18n.js';
import { el, text, userText } from './ui.js';

// A material record is the shared unit for every dashboard statistic and chart.
// Stock quantities can describe different units and are never summed here.
export function summarizeInventory(state) {
  const summary = { total: state.materials.length, good: 0, low: 0, out: 0 };
  const categoryCounts = new Map(state.categories.map(category => [category.id, 0]));
  for (const material of state.materials) {
    summary[stockStatus(material)] += 1;
    categoryCounts.set(material.categoryId, (categoryCounts.get(material.categoryId) || 0) + 1);
  }
  summary.categories = state.categories.map(category => ({
    id: category.id, name: category.name, count: categoryCounts.get(category.id)
  }));
  return summary;
}

const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const compareText = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const timestamp = value => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : -Infinity;
};

// Preview and full-list filtering share this selector. Only existing public
// material fields and the names of their related records are searchable.
export function filterMaterials(state, { query = '', category = '', status = '', sort = 'recent' } = {}) {
  const needle = normalize(query);
  const categoryNames = new Map(state.categories.map(record => [record.id, record.name]));
  const supplierNames = new Map(state.suppliers.map(record => [record.id, record.name]));
  const matches = state.materials.filter(material => {
    if (category && material.categoryId !== category) return false;
    if (status && stockStatus(material) !== status) return false;
    return !needle || [
      material.name, material.serial, material.location, material.description,
      material.responsible, material.condition, material.unit, material.purchaseDate,
      categoryNames.get(material.categoryId), supplierNames.get(material.supplierId)
    ].some(value => normalize(value).includes(needle));
  });
  return matches.sort((a, b) => {
    let difference;
    switch (sort) {
      case 'name': difference = compareText(a.name, b.name); break;
      case 'category': difference = compareText(categoryNames.get(a.categoryId), categoryNames.get(b.categoryId)); break;
      case 'quantity': difference = a.quantity - b.quantity; break;
      case 'status': difference = compareText(stockStatus(a), stockStatus(b)); break;
      default: {
        const aTime = timestamp(a.createdAt), bTime = timestamp(b.createdAt);
        difference = aTime === bTime ? compareText(a.name, b.name) : aTime > bTime ? -1 : 1;
      }
    }
    return difference || compareId(a, b);
  });
}

function chartCard(titleKey, subtitle, body) {
  return el('section', { class: 'card chart-card' },
    el('div', { class: 'card-heading' }, el('div', {}, text(titleKey, 'h2'), el('p', { class: 'muted' }, subtitle))),
    body);
}

function categoryChart(summary) {
  const chart = el('div', {
    class: 'category-chart', tabindex: '0', role: 'region',
    'aria-label': t('materialsByCategory'), 'data-label': 'materialsByCategory'
  });
  if (summary.categories.length) {
    const largest = summary.categories.reduce((maximum, category) => Math.max(maximum, category.count), 1);
    chart.append(el('div', { class: 'bar-chart' }, summary.categories.map(category => {
      const count = number(category.count);
      const label = `${category.name}: ${t('count', { count })}`;
      return el('div', { class: 'bar-column', role: 'img', 'aria-label': label, title: label, 'data-category-id': category.id },
        el('span', { class: 'bar-value', 'aria-hidden': 'true' }, count),
        el('div', { class: 'bar-track', 'aria-hidden': 'true' },
          el('div', { class: 'bar-fill', style: `height: ${category.count / largest * 100}%` })),
        el('span', { class: 'bar-label', 'aria-hidden': 'true' }, userText(category.name)));
    })));
  }
  if (!summary.total) chart.append(text('noChartData', 'p', { class: 'chart-empty muted' }));
  return chart;
}

const svgNS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function stockChart(summary) {
  const keys = ['good', 'low', 'out'];
  // The visible legend supplies the full text equivalent, including zero counts.
  const svg = svgElement('svg', { viewBox: '0 0 188 188', 'aria-hidden': 'true', focusable: 'false' });
  const circle = { cx: 94, cy: 94, r: 80, fill: 'none', 'stroke-width': 24 };
  svg.append(svgElement('circle', { ...circle, stroke: 'var(--chart-grid, var(--line))' }));
  let offset = 0;
  if (summary.total) {
    for (const key of keys) {
      const share = summary[key] / summary.total * 100;
      if (share) svg.append(svgElement('circle', {
        ...circle, 'data-status': key, pathLength: 100,
        stroke: `var(--${key}-chart)`,
        'stroke-dasharray': `${share} ${100 - share}`,
        'stroke-dashoffset': -offset, transform: 'rotate(-90 94 94)'
      }));
      offset += share;
    }
  }
  const donut = el('div', { class: 'donut-chart' }, svg,
    el('div', { class: 'donut-center' }, el('strong', {}, number(summary.total)), text('totalMaterials', 'span')));
  const legend = el('dl', { class: 'chart-legend' }, keys.map(key =>
    el('div', { class: 'legend-item', 'data-status': key },
      el('dt', {}, el('span', { class: `legend-dot ${key}`, style: `background: var(--${key}-chart)`, 'aria-hidden': 'true' }), text(key)),
      el('dd', {}, el('strong', {}, number(summary[key]))))));
  return el('div', { class: 'donut-layout' }, donut, legend,
    summary.total ? null : text('noChartData', 'p', { class: 'chart-empty muted' }));
}

export function renderInventoryCharts(state) {
  const summary = summarizeInventory(state);
  return el('div', { class: 'dashboard-grid' },
    chartCard('materialsByCategory', t('categoryCount', { count: number(summary.categories.length) }), categoryChart(summary)),
    chartCard('stockDistribution', t('count', { count: number(summary.total) }), stockChart(summary)));
}
