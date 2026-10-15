import { Prisma } from '../../../generated/prisma/client';
import { saleBalance, serializeSale, type SaleDetail } from './sales-view';

const decimal = (value: string) => new Prisma.Decimal(value);
function operation(
  kind: SaleDetail['operations'][number]['kind'],
  amount: string,
  quantity = 0,
): SaleDetail['operations'][number] {
  return {
    cashMovement: null,
    operationId: 1,
    requestId: '11111111-1111-4111-8111-111111111111',
    requestHash: 'private-operation-hash',
    saleId: 1,
    userId: 1,
    userName: 'Administrator',
    kind,
    amount: decimal(amount),
    method: kind === 'PAYMENT' || kind === 'REFUND' ? 'CASH' : null,
    reason: 'Test operation',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    items: quantity
      ? [
          {
            operationItemId: 1,
            operationId: 1,
            saleItemId: 1,
            quantity,
            subtotal: decimal(amount),
          },
        ]
      : [],
  };
}
function sale(operations: SaleDetail['operations'] = []): SaleDetail {
  return {
    grossTotal: null,
    discountTotal: null,
    promotionSnapshot: null,
    saleId: 1,
    requestId: '22222222-2222-4222-8222-222222222222',
    requestHash: 'private-sale-hash',
    customerId: 1,
    userId: 1,
    customerName: 'Customer',
    customerDocument: null,
    sellerName: 'Seller',
    total: decimal('0.30'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    operations,
    items: [
      {
        saleItemId: 1,
        saleId: 1,
        productId: 1,
        listUnitPrice: null,
        unitDiscount: null,
        productName: 'Historical name',
        sku: 'HISTORY',
        quantity: 3,
        unitPrice: decimal('0.10'),
        subtotal: decimal('0.30'),
      },
    ],
  };
}

describe('Sale balances and historical responses', () => {
  it('adds fractional payments exactly without changing the original sale', () => {
    const input = sale([
      operation('PAYMENT', '0.10'),
      operation('PAYMENT', '0.20'),
    ]);
    const result = saleBalance(input);
    expect(result.paid.toFixed(2)).toBe('0.30');
    expect(result.balanceDue.toFixed(2)).toBe('0.00');
    expect(input.total.toFixed(2)).toBe('0.30');
  });
  it('reduces unpaid debt on return without inventing a refund', () => {
    const result = saleBalance(sale([operation('RETURN', '0.10', 1)]));
    expect(result.adjustedTotal.toFixed(2)).toBe('0.20');
    expect(result.balanceDue.toFixed(2)).toBe('0.20');
    expect(result.refundDue.toFixed(2)).toBe('0.00');
    expect(result.refunded.toFixed(2)).toBe('0.00');
  });
  it('keeps a refund due after cancellation until money is manually refunded', () => {
    const input = sale([
      operation('PAYMENT', '0.30'),
      operation('RETURN', '0.10', 1),
      operation('CANCEL', '0.20', 2),
      operation('REFUND', '0.10'),
    ]);
    const result = serializeSale(input);
    expect(result).toMatchObject({
      status: 'CANCELLED',
      total: '0.30',
      adjustedTotal: '0.00',
      paid: '0.30',
      refunded: '0.10',
      balanceDue: '0.00',
      refundDue: '0.20',
    });
    expect(result.items[0]).toMatchObject({
      productName: 'Historical name',
      quantity: 3,
      returnedQuantity: 3,
      unitPrice: '0.10',
    });
  });
  it.each([
    [[], 'ACTIVE', 0],
    [[operation('RETURN', '0.10', 1)], 'PARTIALLY_RETURNED', 1],
    [[operation('RETURN', '0.30', 3)], 'RETURNED', 3],
  ] as const)(
    'serializes the status of operation set %p',
    (operations, status, returnedQuantity) => {
      const result = serializeSale(sale([...operations]));
      expect(result.status).toBe(status);
      expect(result.items[0].returnedQuantity).toBe(returnedQuantity);
    },
  );
  it('preserves amounts above JavaScript safe integer precision', () => {
    const input = sale([operation('PAYMENT', '9999999999999999.98')]);
    input.total = decimal('9999999999999999.99');
    expect(saleBalance(input).balanceDue.toFixed(2)).toBe('0.01');
  });
  it('omits operation hashes from JSON while retaining historical line data', () => {
    const result: unknown = JSON.parse(
      JSON.stringify(serializeSale(sale([operation('RETURN', '0.10', 1)]))),
    );
    expect(result).not.toHaveProperty('requestHash');
    expect(result).not.toHaveProperty('operations.0.requestHash');
    expect(result).toHaveProperty('items.0.subtotal', '0.30');
    expect(result).toHaveProperty('operations.0.items.0.subtotal', '0.10');
  });
});
