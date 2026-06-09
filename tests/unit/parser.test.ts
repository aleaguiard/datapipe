import { parseCSV, parseJSON, parseFile } from '../../src/lib/parser';

describe('parseCSV', () => {
  it('parses CSV buffer into array of objects', () => {
    const csv = Buffer.from('name,email\nAlice,alice@example.com\nBob,bob@example.com');
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Alice', email: 'alice@example.com' });
    expect(rows[1]).toEqual({ name: 'Bob', email: 'bob@example.com' });
  });

  it('skips empty lines', () => {
    const csv = Buffer.from('name,email\nAlice,alice@example.com\n\n');
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
  });

  it('trims whitespace from values', () => {
    const csv = Buffer.from('name,email\n Alice , alice@example.com ');
    const rows = parseCSV(csv);
    expect(rows[0].name).toBe('Alice');
  });

  it('parses semicolon-delimited CSV', () => {
    const csv = Buffer.from('name;email\nAlice;alice@example.com\nBob;bob@example.com');
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });
});

describe('parseJSON', () => {
  it('parses JSON array buffer', () => {
    const json = Buffer.from(JSON.stringify([{ id: '1', value: 42 }]));
    const rows = parseJSON(json);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: '1', value: 42 });
  });

  it('throws if JSON is not an array', () => {
    const json = Buffer.from(JSON.stringify({ id: '1' }));
    expect(() => parseJSON(json)).toThrow('JSON must be an array');
  });
});

describe('parseFile', () => {
  it('routes .csv extension to CSV parser', () => {
    const csv = Buffer.from('name\nAlice');
    expect(parseFile(csv, 'data.csv')).toHaveLength(1);
  });

  it('routes .json extension to JSON parser', () => {
    const json = Buffer.from('[{"name":"Alice"}]');
    expect(parseFile(json, 'data.json')).toHaveLength(1);
  });

  it('throws for unsupported extension', () => {
    expect(() => parseFile(Buffer.from(''), 'data.xlsx')).toThrow('Unsupported file type: xlsx');
  });
});
