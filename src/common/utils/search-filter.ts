/** Treat PostgreSQL LIKE wildcards as literal characters in contains searches. */
export function escapeSearchText(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
