import { hashRequest } from './request-hash';

describe('Request hash compatibility', () => {
  const items = [{ productId: 3, quantity: 2, expectedUnitPrice: '0.10' }];

  it('preserves hashes of existing sales, payments and pickup orders', () => {
    expect(hashRequest({ customerId: 7, items })).toBe(
      '2f9682f3c553d655dbaa2a4b40ec71d7cc868755aa996b71d6ebaf7fe239c421',
    );
    expect(
      hashRequest({
        saleId: 12,
        kind: 'PAYMENT',
        reason: 'Pago de prueba',
        amount: '0.20',
        method: 'CASH',
        lines: [],
      }),
    ).toBe('1fa14125d5b07069d12a97c0260b7091a17fbd9a1d418b5090993143b7223935');
    expect(hashRequest({ items, fulfillment: 'PICKUP' })).toBe(
      'a84cc59b3c1fa63039068c288e45bf789667c8041029902dc4e11a0d8546503c',
    );
  });

  it('distinguishes changed quantities and decimal strings', () => {
    const original = hashRequest({ customerId: 7, items });
    expect(
      hashRequest({ customerId: 7, items: [{ ...items[0], quantity: 3 }] }),
    ).not.toBe(original);
    expect(
      hashRequest({
        customerId: 7,
        items: [{ ...items[0], expectedUnitPrice: '0.20' }],
      }),
    ).not.toBe(original);
  });
});
