import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { AuthShell, PublicButton, PublicInput } from '@/components/public';
import { useResetPasswordMutation } from '@/features/auth/authApi';
import { parseApiError } from '@/lib/apiError';
import { applyValidationDetails } from '@/lib/formErrors';
import { useCooldown } from '@/lib/useCooldown';
import { resetPasswordSchema } from '@/lib/validation';

type ResetFormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [resetPassword, { isLoading }] = useResetPasswordMutation();
  const { secondsLeft, isCoolingDown, startCooldown } = useCooldown();

  const [token] = useState<string | null>(() => searchParams.get('token'));
  const [resetSuccess, setResetSuccess] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.has('token')) {
      // Remove token from address bar immediately; never log or persist it.
      navigate('/reset-password', { replace: true });
    }
  }, [navigate, searchParams]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ResetFormValues) => {
    if (!token) {
      setTokenExpired(true);
      return;
    }

    setFormError(null);
    try {
      await resetPassword({ token, password: values.password }).unwrap();
      setResetSuccess(true);
    } catch (err) {
      const parsed = parseApiError(err);

      if (parsed.status === 429) {
        startCooldown(parsed.retryAfterSeconds ?? 60);
        setFormError(parsed.message);
        return;
      }

      if (parsed.code === 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN') {
        setTokenExpired(true);
        return;
      }

      if (parsed.code === 'PASSWORD_RESET_IN_PROGRESS') {
        setFormError(
          'A password reset is already being processed. Please wait briefly and retry, or use the newer reset email if you requested one.',
        );
        return;
      }

      if (parsed.code === 'VALIDATION_ERROR') {
        const applied = applyValidationDetails(parsed.details, setError);
        if (!applied) setFormError(parsed.message);
        return;
      }

      setFormError(parsed.message);
    }
  };

  if (resetSuccess) {
    return (
      <AuthShell
        panelHeadline="Password updated"
        panelSubtitle="All previous sessions have been signed out for your security."
      >
        <div className="space-y-lg text-center md:text-left">
          <div className="h-14 w-14 rounded-full bg-success-bg text-success-strong flex items-center justify-center mx-auto md:mx-0">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="space-y-xs">
            <h1 className="text-[32px] font-bold text-ink">Password Reset</h1>
            <p className="text-[14px] text-ink-secondary">
              Your password has been updated. Please log in with your new password.
            </p>
          </div>
          <PublicButton variant="primary-lg" fullWidth asChild>
            <Link to="/login">Log In</Link>
          </PublicButton>
        </div>
      </AuthShell>
    );
  }

  if (!token || tokenExpired) {
    return (
      <AuthShell
        panelHeadline="Reset link expired"
        panelSubtitle="Password reset links expire after 30 minutes and can only be used once."
      >
        <div className="space-y-lg text-center md:text-left">
          <div className="h-14 w-14 rounded-full bg-error-bg text-error flex items-center justify-center mx-auto md:mx-0">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-xs">
            <h1 className="text-[32px] font-bold text-ink">Link Invalid or Expired</h1>
            <p className="text-[14px] text-ink-secondary">
              This password reset link is invalid or has expired. Request a fresh link to continue.
            </p>
          </div>
          <PublicButton variant="primary-lg" fullWidth asChild>
            <Link to="/forgot-password">Request New Reset Link</Link>
          </PublicButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      panelHeadline="Choose a new password"
      panelSubtitle="Resetting your password signs out all existing sessions on other devices."
    >
      <div className="space-y-lg">
        <div className="space-y-xxs">
          <h1 className="text-[32px] font-bold text-ink">Reset Password</h1>
          <p className="text-[14px] text-ink-secondary">
            Enter a strong new password (8 to 72 UTF-8 bytes).
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-md bg-error-bg border border-error/30 p-sm text-[13px] text-error"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-md" noValidate>
          <PublicInput
            label="New Password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <PublicInput
            label="Confirm New Password"
            type="password"
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <PublicButton
            type="submit"
            variant="primary-lg"
            fullWidth
            loading={isLoading}
            disabled={isCoolingDown}
          >
            {isCoolingDown ? `Please wait ${secondsLeft}s` : 'Reset Password'}
          </PublicButton>
        </form>
      </div>
    </AuthShell>
  );
}
