import { encodeCursor, decodeCursor } from '../../src/handlers/rows';

describe('rows cursor', () => {
  it('round-trips a rowIndex', () => {
    expect(decodeCursor(encodeCursor(0))).toBe(0);
    expect(decodeCursor(encodeCursor(1234))).toBe(1234);
  });

  it('is URL-safe', () => {
    expect(encodeCursor(999999)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['negative', Buffer.from(JSON.stringify({ r: -1 })).toString('base64url')],
    ['non-integer', Buffer.from(JSON.stringify({ r: 1.5 })).toString('base64url')],
    ['string', Buffer.from(JSON.stringify({ r: '5' })).toString('base64url')],
    ['missing', Buffer.from(JSON.stringify({})).toString('base64url')],
  ])('rejects %s', (_, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});
