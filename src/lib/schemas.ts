import { SchemaType } from '../types';

export interface FieldDef {
  type: 'string' | 'number';
  required: boolean;
  format?: 'email';
}

export type Schema = Record<string, FieldDef>;

export const SCHEMAS: Record<SchemaType, Schema> = {
  users: {
    name:  { type: 'string', required: true },
    email: { type: 'string', required: true, format: 'email' },
    age:   { type: 'number', required: false },
  },
  orders: {
    orderId:     { type: 'string', required: true },
    productName: { type: 'string', required: true },
    quantity:    { type: 'number', required: true },
    price:       { type: 'number', required: true },
  },
  contacts: {
    firstName: { type: 'string', required: true },
    lastName:  { type: 'string', required: true },
    email:     { type: 'string', required: true, format: 'email' },
    phone:     { type: 'string', required: false },
  },
};
