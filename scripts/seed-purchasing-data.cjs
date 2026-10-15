const users = [
  {
    name: 'Demo · Administrador',
    email: 'admin@demo.example.com',
    role: 'ADMIN',
    isActive: true,
  },
  {
    name: 'Demo · Vendedora Laura',
    email: 'laura@demo.example.com',
    role: 'SELLER',
    isActive: true,
  },
];
const suppliers = [
  {
    name: 'Demo · Distribuidora Andina',
    document: 'DEMO-SUP-001',
    contactName: 'Demo · Gabriela',
    email: 'andina@demo.example.com',
    phone: 'DEMO-700001',
    address: 'Dirección ficticia · La Paz',
    notes: 'Proveedor ficticio de material de empaque.',
  },
  {
    name: 'Demo · Suministros del Sur',
    document: 'DEMO-SUP-002',
    contactName: 'Demo · Martín',
    email: 'sur@demo.example.com',
    phone: 'DEMO-700002',
    address: 'Dirección ficticia · Cochabamba',
    notes: 'Proveedor ficticio para reposición.',
  },
  {
    name: 'Demo · Proveedor inactivo',
    document: 'DEMO-SUP-003',
    contactName: 'Demo · Contacto inactivo',
    email: 'proveedor-inactivo@demo.example.com',
    notes: 'Inactivo: no permite nuevas compras ni recepción.',
    inactive: true,
  },
];
const products = [
  {
    name: 'Demo · Paquete de etiquetas',
    sku: 'DEMO-BUY-001',
    cost: '2.00',
    salePrice: '4.90',
    quantity: 0,
    minStock: 5,
  },
  {
    name: 'Demo · Bolsa para empaque',
    sku: 'DEMO-BUY-002',
    cost: '0.50',
    salePrice: '1.50',
    quantity: 0,
    minStock: 10,
  },
  {
    name: 'Demo · Cinta de embalaje',
    sku: 'DEMO-BUY-003',
    cost: '3.50',
    salePrice: '6.90',
    quantity: 0,
    minStock: 5,
  },
];
// Product indexes refer only to this isolated purchasing catalog.
const purchases = [
  {
    key: 'purchase-received',
    supplier: 0,
    reference: 'DEMO-COMPRA-001',
    state: 'RECEIVED',
    updateCost: false,
    items: [
      [0, 20, '1.80'],
      [1, 50, '0.45'],
    ],
  },
  {
    key: 'purchase-updated-cost',
    supplier: 1,
    reference: 'DEMO-COMPRA-002',
    state: 'RECEIVED',
    updateCost: true,
    items: [[2, 15, '3.10']],
  },
  {
    key: 'purchase-cancelled',
    supplier: 1,
    reference: 'DEMO-COMPRA-003',
    state: 'CANCELLED',
    items: [[0, 8, '1.90']],
  },
  {
    key: 'purchase-pending-restock',
    supplier: 0,
    reference: 'DEMO-COMPRA-004',
    state: 'PENDING',
    items: [
      [0, 10, '1.75'],
      [1, 30, '0.40'],
    ],
  },
  {
    key: 'purchase-pending',
    supplier: 0,
    reference: 'DEMO-COMPRA-005',
    state: 'PENDING',
    items: [[2, 10, '3.00']],
  },
];
module.exports = {
  users,
  suppliers,
  products,
  purchases,
  categoryName: 'Demo · Abastecimiento',
};
