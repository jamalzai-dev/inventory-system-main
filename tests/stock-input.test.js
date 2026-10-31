import test from 'node:test';
import assert from 'node:assert/strict';
import { stockInput, stockPreview } from '../app/stock-input.js';

test('English, Pashto and Arabic keyboard quantities become exact API strings', () => {
  for (const input of ['0.500', '۰٫۵۰۰', '٠٫٥٠٠']) assert.equal(stockInput(input), '0.500');
  assert.deepEqual(stockPreview('50', '۱۰', 'remove'), { quantity: '10', result: '40' });
  assert.equal(stockPreview('0.5', '0.500', 'remove').result, '0');
  assert.equal(stockPreview('0.1', '0.2', 'add').result, '0.3');
});
test('preview rejects excess, invalid decimals and overflow without rounding', () => {
  for (const input of ['0', '-1', '1e3', '1,000', '1.0000', '01', 'NaN']) assert.throws(() => stockInput(input));
  assert.throws(() => stockPreview('1', '1.001', 'remove'), /removalExcess/);
  assert.throws(() => stockPreview('999999999.999', '0.001', 'add'), /stockOverflow/);
});
