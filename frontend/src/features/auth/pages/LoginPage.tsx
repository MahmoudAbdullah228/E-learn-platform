import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import {
  AuthShell,
  PublicButton,
  PublicInput,
  usePublicToast,
} from '@/components/public';
import {
  useLoginMutation,
  useResendVerificationMutation,
} from '@/features/auth/authApi';
import { parseApiError } from '@/lib/apiError';
import { applyValidationDetails, sanitizeRedirectPath } from '@/lib/formErrors';
import { useCooldown } from '@/lib/useCooldown';
import { loginSchema } from '@/lib/validation';

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showToast } = usePublicToast();
  const [login, { isLoading }] = useLoginMutation();
  const [resendVerification, { isLoading: isResending }] =
    useResendVerificationMutation();
  const { secondsLeft, isCoolingDown, startCooldown } = useCooldown();

  const stateNotice =
    (location.state as { notice?: string } | null)?.notice ?? null;

  const [formError, setFormError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleResend = async (email: string) => {
    try {
      await resendVerification({ email }).unwrap();
      showToast('If an eligible account exists, a verification email has been queued.', 'success');
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.status === 429) {
        startCooldown(parsed.retryAfterSeconds ?? 60);
      }
      showToast(parsed.message, 'error');
    }
  };

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    setUnverifiedEmail(null);

    try {
      const envelope = await login({
        email: values.email,
        password: values.password,
      }).unwrap();

      const roles = envelope.data.user.roles ?? [];
      const defaultHome = roles.includes('admin')
        ? '/admin/dashboard'
        : roles.includes('instructor')
          ? '/instructor/dashboard'
          : '/app/dashboard';

      const target = sanitizeRedirectPath(searchParams.get('redirect'), defaultHome);
      navigate(target, { replace: true });
    } catch (err) {
      const parsed = parseApiError(err);

      if (parsed.status === 429) {
        startCooldown(parsed.retryAfterSeconds ?? 60);
        setFormError(parsed.message);
        return;
      }

      if (parsed.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(values.email);
        setFormError('Your email is not verified yet. Please verify your email before logging in.');
        return;
      }

      if (parsed.code === 'ACCOUNT_SUSPENDED') {
        setFormError('Your account has been suspended. Please contact Pathly support.');
        return;
      }

      if (parsed.code === 'INVALID_CREDENTIALS') {
        setFormError('Invalid email or password.');
        return;
      }

      if (
        parsed.code === 'REQUEST_ORIGIN_DENIED' ||
        parsed.code === 'CORS_ORIGIN_DENIED'
      ) {
        setFormError(
          'This frontend origin is not allowed by the API. Check CORS_ORIGINS configuration.',
        );
        return;
      }

      if (parsed.code === 'VALIDATION_ERROR') {
        const applied = applyValidationDetails(parsed.details, setError);
        if (!applied) {
          setFormError(parsed.message);
        }
        return;
      }

      setFormError(parsed.message);
    }
  };

  return (
    <AuthShell
      panelHeadline="Welcome back to Pathly"
      panelSubtitle="Pick up right where you left off and keep building momentum."
      quote="“Small consistent sessions every day turn ambitious skills into second nature.”"
    >
      <div className="space-y-lg">
        <div className="space-y-xxs">
          <h1 className="text-[32px] font-bold leading-[1.25] text-ink">Log In</h1>
          <p className="text-[14px] text-ink-secondary">
            New to Pathly?{' '}
            <Link
              to="/register"
              className="font-semibold text-primary hover:text-primary-light"
            >
              Create an account
            </Link>
          </p>
        </div>

        {stateNotice && !formError && (
          <div
            role="status"
            className="rounded-md bg-primary-wash border border-primary-soft p-sm text-[13px] text-ink"
          >
            {stateNotice}
          </div>
        )}

        {formError && (
          <div
            role="alert"
            className="rounded-md bg-error-bg border border-error/30 p-sm text-[13px] text-error space-y-xs"
          >
            <p>{formError}</p>
            {unverifiedEmail && (
              <PublicButton
                variant="link-action"
                disabled={isCoolingDown || isResending}
                onClick={() => handleResend(unverifiedEmail)}
              >
                {isCoolingDown
                  ? `Resend available in ${secondsLeft}s`
                  : 'Resend verification email'}
              </PublicButton>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-md" noValidate>
          <PublicInput
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <div className="space-y-xs">
            <PublicInput
              label="Password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-[13px] font-semibold text-primary hover:text-primary-light"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <PublicButton
            type="submit"
            variant="primary-lg"
            fullWidth
            loading={isLoading}
            disabled={isCoolingDown}
          >
            {isCoolingDown ? `Please wait ${secondsLeft}s` : 'Log In'}
          </PublicButton>
        </form>
      </div>
    </AuthShell>
  );
}
