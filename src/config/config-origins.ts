export function trustedOrigins(
  value = 'http://localhost:3000,http://localhost:3001',
): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
