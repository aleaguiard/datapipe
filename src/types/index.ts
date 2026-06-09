export type SchemaType = 'users' | 'orders' | 'contacts';

export type JobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIAL_FAILURE'
  | 'FAILED';

export interface Job {
  pk: string;
  etag: string;
  status: JobStatus;
  schemaType: SchemaType;
  s3Key: string;
  filename: string;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  createdAt: string;
  updatedAt: string;
}

export interface Row {
  pk: string;
  jobId: string;
  rowIndex: number;
  data: Record<string, unknown>;
  valid: boolean;
  errors: string[];
}

export interface SQSJobMessage {
  jobId: string;
  s3Key: string;
  schemaType: SchemaType;
  etag: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data: Record<string, unknown>;
}
