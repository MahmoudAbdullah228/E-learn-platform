import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import { AuthShell, PublicButton, PublicInput } from '@/components/public';
import { useForgotPasswordMutation } from '@/features/auth/authApi';
import { parseApiError } from '@/lib/apiError';
import { applyValidationDetails } from '@/lib/formErrors';
import { useCooldown } from '@/lib/useCooldown';
import { emailOnlySchema } from '@/lib/validation';

type ForgotFormValues = z.infer<typeof emailOnlySchema>;

export function ForgotPasswordPage() {
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();
  const { secondsLeft, isCoolingDown, startCooldown } = useCooldown();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotFormValues) => {
    setFormError(null);
    try {
      await forgotPassword({ email: values.email }).unwrap();
      // Identical UI regardless of whether the account exists, is suspended, or is unverified.
      setSubmitted(true);
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.status === 429) {
        startCooldown(parsed.retryAfterSeconds ?? 60);
        setFormError(parsed.message);
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

  if (submitted) {
    return (
      <AuthShell
        panelHeadline="Reset your password"
        panelSubtitle="Check your inbox for a one-time reset link."
      >
        <div className="space-y-lg text-center md:text-left">
          <div className="h-14 w-14 rounded-full bg-primary-tint text-primary flex items-center justify-center mx-auto md:mx-0">
            <MailCheck className="h-7 w-7" />
          </div>
          <div className="space-y-xs">
            <h1 className="text-[32px] font-bold text-ink">Check your email</h1>
            <p className="text-[14px] text-ink-secondary leading-[1.6]">
              If an eligible account is registered for that email address, we have sent instructions to reset your password. Links expire after 30 minutes.
            </p>
          </div>
          <PublicButton variant="primary-lg" fullWidth asChild>
            <Link to="/login">Return to Log In</Link>
          </PublicButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      panelHeadline="Forgot your password?"
      panelSubtitle="Enter your email address and we will send you a secure one-time reset link."
    >
      <div className="space-y-lg">
        <div className="space-y-xxs">
          <h1 className="text-[32px] font-bold text-ink">Forgot Password</h1>
          <p className="text-[14px] text-ink-secondary">
            Remembered it?{' '}
            <Link
              to="/login"
              className="font-semibold text-primary hover:text-primary-light"
            >
              Back to Log In
            </Link>
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
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <PublicButton
            type="submit"
            variant="primary-lg"
            fullWidth
            loading={isLoading}
            disabled={isCoolingDown}
          >
            {isCoolingDown ? `Please wait ${secondsLeft}s` : 'Send Reset Link'}
          </PublicButton>
        </form>
      </div>
    </AuthShell>
  );
}
