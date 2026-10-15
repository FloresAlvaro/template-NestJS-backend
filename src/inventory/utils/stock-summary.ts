export function stockSummary(
  inventory: { quantity: number; minStock: number } | null | undefined,
) {
  const quantity = inventory?.quantity ?? 0;
  const minStock = inventory?.minStock ?? 0;
  return {
    quantity,
    minStock,
    stockStatus:
      quantity === 0
        ? 'OUT_OF_STOCK'
        : quantity <= minStock
          ? 'LOW_STOCK'
          : 'AVAILABLE',
  };
}

export function withStock<
  T extends { inventory: { quantity: number; minStock: number } | null },
>(product: T) {
  const { inventory, ...fields } = product;
  return { ...fields, ...stockSummary(inventory) };
}
