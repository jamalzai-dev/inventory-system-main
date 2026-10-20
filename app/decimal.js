// Exact base-10 arithmetic. API amounts stay strings; only scaled integers are used.
export function units(value, scale = 3, { bounded = true, signed = false } = {}) {
  if (typeof value !== 'string' || !new RegExp(`^${signed ? '-?' : ''}(0|[1-9][0-9]*)(\\.[0-9]{1,${scale}})?$`).test(value)) throw new Error('invalidDecimal');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  if (bounded && whole.length > 9) throw new Error('invalidDecimal');
  const result = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
  return negative ? -result : result;
}
export function decimal(value, scale = 3) {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(scale + 1, '0');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${sign}${digits.slice(0, -scale)}${fraction ? '.' + fraction : ''}`;
}
export function compare(a, b) {
  const x = units(String(a)), y = units(String(b));
  return x < y ? -1 : x > y ? 1 : 0;
}
export const add = (a, b) => decimal(units(a) + units(b));
export const subtract = (a, b) => decimal(units(a) - units(b));
export const stockStatus = material => compare(material.quantity, '0') === 0 ? 'out'
  : material.reorderLevel != null && compare(material.quantity, material.reorderLevel) <= 0 ? 'low' : 'good';
export const product = (quantity, price) => decimal(units(quantity) * units(price, 2), 5);
export function inventoryValue(materials) {
  return decimal(materials.reduce((sum, m) => m.price == null ? sum : sum + units(String(m.quantity)) * units(String(m.price), 2), 0n), 5);
}
// No Number conversion of decimal text, including totals beyond MAX_SAFE_INTEGER.
export function formatDecimal(value, locale = 'en-GB') {
  if (value == null) return '—';
  const source = String(value);
  units(source, 5, { bounded: false, signed: true });
  const [whole, fraction = ''] = source.split('.');
  const formatter = new Intl.NumberFormat(locale);
  const digits = Array.from({ length: 10 }, (_, i) => formatter.format(i));
  const separator = formatter.formatToParts(1.1).find(part => part.type === 'decimal').value;
  const integral = formatter.format(BigInt(whole));
  const sign = whole === '-0' ? formatter.formatToParts(-1).filter(p => ['minusSign', 'literal'].includes(p.type)).map(p => p.value).join('') : '';
  return sign + integral + (fraction ? separator + fraction.replace(/[0-9]/g, digit => digits[Number(digit)]) : '');
}
