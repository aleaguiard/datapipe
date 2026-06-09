import { parse } from 'csv-parse/sync';

function detectDelimiter(content: Buffer | string): string {
  const firstLine = (Buffer.isBuffer(content) ? content.toString('utf8') : content).split('\n')[0] ?? '';
  return firstLine.includes(';') ? ';' : ',';
}

export function parseCSV(content: Buffer | string): Record<string, unknown>[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: detectDelimiter(content),
  }) as Record<string, unknown>[];
}

export function parseJSON(content: Buffer | string): Record<string, unknown>[] {
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
  return parsed as Record<string, unknown>[];
}

export function parseFile(content: Buffer, filename: string): Record<string, unknown>[] {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return parseCSV(content);
  if (ext === 'json') return parseJSON(content);
  throw new Error(`Unsupported file type: ${ext}`);
}
