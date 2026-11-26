import { useNavigate } from 'react-router-dom';
import { useLogoutAllMutation, useLogoutMutation } from '@/features/auth/authApi';
import { parseApiError } from '@/lib/apiError';

export function useLogoutAction(onNotify?: (message: string, isError?: boolean) => void) {
  const navigate = useNavigate();
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();
  const [logoutAll, { isLoading: isLoggingOutAll }] = useLogoutAllMutation();

  const handleLogout = async () => {
    try {
      await logout().unwrap();
      navigate('/login', { replace: true });
    } catch (err) {
      const parsed = parseApiError(err);
      const msg =
        parsed.status === 429 && parsed.retryAfterSeconds
          ? `Too many requests. Please try logging out again in ${parsed.retryAfterSeconds}s.`
          : parsed.message;
      onNotify?.(msg, true);
    }
  };

  const handleLogoutAll = async () => {
    try {
      await logoutAll().unwrap();
      navigate('/login', {
        replace: true,
        state: { notice: 'Signed out from all devices.' },
      });
    } catch (err) {
      const parsed = parseApiError(err);
      const msg =
        parsed.status === 429 && parsed.retryAfterSeconds
          ? `Too many requests. Please try again in ${parsed.retryAfterSeconds}s.`
          : parsed.message;
      onNotify?.(msg, true);
    }
  };

  return {
    handleLogout,
    handleLogoutAll,
    isLoggingOut,
    isLoggingOutAll,
  };
}
