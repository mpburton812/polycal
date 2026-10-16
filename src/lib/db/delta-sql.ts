/**
 * Versioned DDL applied after the schema freeze (PC-537).
 * Add a key when bumping SCHEMA_VERSION past 56. Do not edit an existing key.
 */
export const SCHEMA_DELTA_SQL: Record<number, string> = {
  57: `
ALTER TABLE stored_images ADD COLUMN storage_key TEXT
`,
};
