import { units, decimal } from './decimal.js';

// Accept the numerals staff type on English, Pashto and Arabic keyboards.
// Separators for grouping and exponents remain invalid; the API still gets ASCII.
export function stockInput(value) {
  const canonical = value.trim().replace(/[۰-۹٠-٩]/g, char => String(char.charCodeAt(0) - (char <= '٩' ? 0x660 : 0x6f0))).replace(/٫/g, '.');
  if (units(canonical) <= 0n) throw new Error('removalQuantity');
  return canonical;
}
export function stockPreview(current, input, type) {
  const quantity = stockInput(input);
  const next = units(current) + units(quantity) * (type === 'remove' ? -1n : 1n);
  if (next < 0n) throw new Error('removalExcess');
  if (next > 999999999999n) throw new Error('stockOverflow');
  return { quantity, result: decimal(next) };
}
