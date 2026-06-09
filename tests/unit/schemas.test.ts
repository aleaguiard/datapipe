import { SCHEMAS } from '../../src/lib/schemas';

describe('SCHEMAS', () => {
  it('defines users schema with required name and email', () => {
    expect(SCHEMAS.users.name.required).toBe(true);
    expect(SCHEMAS.users.name.type).toBe('string');
    expect(SCHEMAS.users.email.required).toBe(true);
    expect(SCHEMAS.users.email.format).toBe('email');
    expect(SCHEMAS.users.age.required).toBe(false);
    expect(SCHEMAS.users.age.type).toBe('number');
  });

  it('defines orders schema with all required fields', () => {
    expect(SCHEMAS.orders.orderId.required).toBe(true);
    expect(SCHEMAS.orders.productName.required).toBe(true);
    expect(SCHEMAS.orders.quantity.type).toBe('number');
    expect(SCHEMAS.orders.price.type).toBe('number');
  });

  it('defines contacts schema with optional phone', () => {
    expect(SCHEMAS.contacts.firstName.required).toBe(true);
    expect(SCHEMAS.contacts.email.format).toBe('email');
    expect(SCHEMAS.contacts.phone.required).toBe(false);
  });
});
