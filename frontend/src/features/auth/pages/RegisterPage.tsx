import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import {
  AuthShell,
  PublicButton,
  PublicInput,
  usePublicToast,
} from '@/components/public';
import {
  useRegisterMutation,
  useResendVerificationMutation,
} from '@/features/auth/authApi';
import { parseApiError } from '@/lib/apiError';
import { applyValidationDetails } from '@/lib/formErrors';
import { useCooldown } from '@/lib/useCooldown';
import { registerSchema } from '@/lib/validation';

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { showToast } = usePublicToast();
  const [registerUser, { isLoading }] = useRegisterMutation();
  const [resendVerification, { isLoading: isResending }] =
    useResendVerificationMutation();
  const { secondsLeft, isCoolingDown, startCooldown } = useCooldown();

  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [deliveryDelayed, setDeliveryDelayed] = useState(false);
  const [existingEmailConflict, setExistingEmailConflict] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
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

  const onSubmit = async (values: RegisterFormValues) => {
    setFormError(null);
    setExistingEmailConflict(null);

    try {
      await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
      }).unwrap();
      setDeliveryDelayed(false);
      setSubmittedEmail(values.email);
    } catch (err) {
      const parsed = parseApiError(err);

      if (parsed.status === 429) {
        startCooldown(parsed.retryAfterSeconds ?? 60);
        setFormError(parsed.message);
        return;
      }

      if (parsed.code === 'EMAIL_DELIVERY_UNAVAILABLE') {
        setDeliveryDelayed(true);
        setSubmittedEmail(values.email);
        return;
      }

      if (parsed.code === 'RESOURCE_ALREADY_EXISTS') {
        setExistingEmailConflict(values.email);
        setFormError(
          'An account with this email already exists. You can log in or request a new verification email.',
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

  if (submittedEmail) {
    return (
      <AuthShell
        panelHeadline="Verify your email to begin learning"
        panelSubtitle="One quick confirmation keeps your Pathly account secure."
        benefits={[
          'Access free and paid courses in Arabic and English',
          'Track lesson completion and resume anytime',
          'Apply to become a Pathly instructor from your dashboard',
        ]}
      >
        <div className="space-y-lg text-center md:text-left">
          <div className="h-14 w-14 rounded-full bg-primary-tint text-primary flex items-center justify-center mx-auto md:mx-0">
            <MailCheck className="h-7 w-7" />
          </div>

          <div className="space-y-xs">
            <h1 className="text-[32px] font-bold leading-[1.25] text-ink">
              Check your email
            </h1>
            <p className="text-[14px] text-ink-secondary leading-[1.6]">
              {deliveryDelayed
                ? `Your account for ${submittedEmail} was created, but email delivery is temporarily unavailable. Please use the button below to resend your verification email.`
                : `We sent a verification link to ${submittedEmail}. Open the link in that email to activate your account.`}
            </p>
          </div>

          <div className="space-y-sm pt-xs">
            <PublicButton
              variant="primary-lg"
              fullWidth
              loading={isResending}
              disabled={isCoolingDown}
              onClick={() => handleResend(submittedEmail)}
            >
              {isCoolingDown
                ? `Resend available in ${secondsLeft}s`
                : 'Resend Verification Email'}
            </PublicButton>

            <div className="text-center text-[14px] text-ink-secondary pt-xs">
              Already verified?{' '}
              <Link
                to="/login"
                className="font-semibold text-primary hover:text-primary-light"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      panelHeadline="Start building real skills today"
      panelSubtitle="Join Egyptian learners and expert instructors on Pathly."
      benefits={[
        'Curated courses across software, design, business, and more',
        'Structured curricula with video lessons and downloadable PDFs',
        'Calm, focused study workspace built for steady progress',
      ]}
    >
      <div className="space-y-lg">
        <div className="space-y-xxs">
          <h1 className="text-[32px] font-bold leading-[1.25] text-ink">
            Create Account
          </h1>
          <p className="text-[14px] text-ink-secondary">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-primary hover:text-primary-light"
            >
              Log In
            </Link>
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-md bg-error-bg border border-error/30 p-sm text-[13px] text-error space-y-xs"
          >
            <p>{formError}</p>
            {existingEmailConflict && (
              <div className="flex flex-wrap gap-sm">
                <PublicButton
                  variant="link-action"
                  disabled={isCoolingDown || isResending}
                  onClick={() => handleResend(existingEmailConflict)}
                >
                  {isCoolingDown
                    ? `Wait ${secondsLeft}s`
                    : 'Resend verification email'}
                </PublicButton>
                <Link
                  to="/login"
                  className="text-[13px] font-semibold text-ink hover:text-primary"
                >
                  Go to Log In →
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-md" noValidate>
          <PublicInput
            label="Full Name"
            placeholder="e.g. Nour El-Din"
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />

          <PublicInput
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <PublicInput
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            helperText="8 to 72 UTF-8 bytes."
            error={errors.password?.message}
            {...register('password')}
          />

          <PublicButton
            type="submit"
            variant="primary-lg"
            fullWidth
            loading={isLoading}
            disabled={isCoolingDown}
          >
            {isCoolingDown
              ? `Please wait ${secondsLeft}s`
              : 'Create Account'}
          </PublicButton>
        </form>
      </div>
    </AuthShell>
  );
}
