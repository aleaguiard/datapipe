import { Schema } from './schemas';
import { ValidationResult } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRow(
  raw: Record<string, unknown>,
  schema: Schema,
): ValidationResult {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  for (const [field, def] of Object.entries(schema)) {
    const value = raw[field];
    const isEmpty = value === undefined || value === null || value === '';

    if (def.required && isEmpty) {
      errors.push(`${field} is required`);
      continue;
    }

    if (isEmpty) continue;

    if (def.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push(`${field} must be a number`);
      } else {
        data[field] = num;
      }
    } else {
      const str = String(value);
      data[field] = str;
      if (def.format === 'email' && !EMAIL_RE.test(str)) {
        errors.push(`${field} must be a valid email`);
      }
    }
  }

  return { valid: errors.length === 0, errors, data };
}
