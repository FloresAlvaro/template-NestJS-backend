// Reserved demo identities; the principal register remains free for local testing.
const registers = [
  'Demo · Caja mostrador',
  'Demo · Caja auxiliar',
  'Demo · Caja administración',
];
const shifts = [
  {
    key: 'cash-closed-balanced',
    register: 0,
    email: 'vendedor@demo.example.com',
    daysAgo: 3,
    opening: '100.00',
    income: '50.00',
    withdrawal: '20.00',
    counted: '130.00',
  },
  {
    key: 'cash-closed-shortage',
    register: 1,
    email: 'laura@demo.example.com',
    daysAgo: 2,
    opening: '150.00',
    income: '30.00',
    withdrawal: '20.00',
    counted: '155.00',
  },
  {
    key: 'cash-open-seller',
    register: 0,
    email: 'vendedor@demo.example.com',
    daysAgo: 0,
    opening: '100.00',
    income: '50.00',
    withdrawal: '20.00',
  },
  {
    key: 'cash-open-laura',
    register: 1,
    email: 'laura@demo.example.com',
    daysAgo: 0,
    opening: '150.00',
    income: '30.00',
    withdrawal: '10.00',
  },
  {
    key: 'cash-closed-surplus',
    register: 2,
    email: 'admin@demo.example.com',
    daysAgo: 1,
    opening: '80.00',
    income: '20.00',
    withdrawal: '10.00',
    counted: '92.00',
  },
];
module.exports = { registers, shifts };
