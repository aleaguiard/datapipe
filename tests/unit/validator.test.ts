import { validateRow } from '../../src/lib/validator';
import { SCHEMAS } from '../../src/lib/schemas';

describe('validateRow — users schema', () => {
  it('passes a valid user row', () => {
    const result = validateRow({ name: 'Alice', email: 'alice@example.com' }, SCHEMAS.users);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.data).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('includes optional age when present and coerces to number', () => {
    const result = validateRow({ name: 'Alice', email: 'alice@example.com', age: '30' }, SCHEMAS.users);
    expect(result.valid).toBe(true);
    expect(result.data.age).toBe(30);
  });

  it('fails when required field name is missing', () => {
    const result = validateRow({ email: 'alice@example.com' }, SCHEMAS.users);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name is required');
  });

  it('fails when email format is invalid', () => {
    const result = validateRow({ name: 'Alice', email: 'not-an-email' }, SCHEMAS.users);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('email must be a valid email');
  });

  it('fails when age is not a number', () => {
    const result = validateRow({ name: 'Alice', email: 'alice@example.com', age: 'old' }, SCHEMAS.users);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('age must be a number');
  });
});

describe('validateRow — orders schema', () => {
  it('passes a valid order row', () => {
    const result = validateRow(
      { orderId: 'O1', productName: 'Widget', quantity: '5', price: '9.99' },
      SCHEMAS.orders,
    );
    expect(result.valid).toBe(true);
    expect(result.data.quantity).toBe(5);
    expect(result.data.price).toBe(9.99);
  });

  it('fails when price is missing', () => {
    const result = validateRow(
      { orderId: 'O1', productName: 'Widget', quantity: '5' },
      SCHEMAS.orders,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('price is required');
  });
});

describe('validateRow — contacts schema', () => {
  it('passes without optional phone', () => {
    const result = validateRow(
      { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' },
      SCHEMAS.contacts,
    );
    expect(result.valid).toBe(true);
  });

  it('passes with phone present', () => {
    const result = validateRow(
      { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', phone: '+34600000000' },
      SCHEMAS.contacts,
    );
    expect(result.valid).toBe(true);
    expect(result.data.phone).toBe('+34600000000');
  });
});
