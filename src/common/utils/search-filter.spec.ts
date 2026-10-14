import { escapeSearchText } from './search-filter';

describe('Literal search filters', () => {
  it.each([
    ['AUD-001', 'AUD-001'],
    ['100%', '100\\%'],
    ['SKU_01', 'SKU\\_01'],
    ['a\\b', 'a\\\\b'],
    ['\\%_', '\\\\\\%\\_'],
    ['Auriculares inalámbricos', 'Auriculares inalámbricos'],
    ['', ''],
  ])('escapes %p without changing ordinary text', (input, expected) => {
    expect(escapeSearchText(input)).toBe(expected);
  });
});
