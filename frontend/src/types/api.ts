export type UserRole = 'student' | 'instructor' | 'admin';

export type AccountStatus = 'active' | 'suspended';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  status: AccountStatus;
  emailVerified: boolean;
  avatarAssetId?: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
  message?: string;
}

export interface ApiErrorDetail {
  field?: string;
  path?: string;
  message: string;
  code?: string;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details: ApiErrorDetail[];
  };
}
