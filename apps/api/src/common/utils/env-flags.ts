export function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function readCsvEnv(name: string, defaultValues: string[]): string[] {
  const value = process.env[name];
  const rawValues = value === undefined || value.trim() === ''
    ? defaultValues
    : value.split(',');

  return rawValues
    .map((item) => item.trim())
    .filter(Boolean);
}
