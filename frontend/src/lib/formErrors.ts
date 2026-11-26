import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ApiErrorDetail } from '@/types/api';

export function applyValidationDetails<T extends FieldValues>(
  details: ApiErrorDetail[],
  setError: UseFormSetError<T>,
): boolean {
  let appliedAny = false;
  for (const detail of details) {
    const fieldName = detail.field ?? detail.path;
    if (fieldName) {
      setError(fieldName as Path<T>, {
        type: 'server',
        message: detail.message,
      });
      appliedAny = true;
    }
  }
  return appliedAny;
}

export function sanitizeRedirectPath(raw: string | null | undefined, fallback = '/app/dashboard'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}
