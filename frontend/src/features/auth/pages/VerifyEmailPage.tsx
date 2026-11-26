import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import {
  AuthShell,
  PublicButton,
  PublicInput,
  usePublicToast,
} from '@/components/public';
import {
  useResendVerificationMutation,
  useVerifyEmailMutation,
} from '@/features/auth/authApi';
import { parseApiError } from '@/lib/apiError';
import { useCooldown } from '@/lib/useCooldown';
import { emailOnlySchema } from '@/lib/validation';

type ResendFormValues = z.infer<typeof emailOnlySchema>;

type VerifyState = 'verifying' | 'verified' | 'invalid';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = usePublicToast();
  const [verifyEmail] = useVerifyEmailMutation();
  const [resendVerification, { isLoading: isResending }] =
    useResendVerificationMutation();
  const { secondsLeft, isCoolingDown, startCooldown } = useCooldown();

  const [initialToken] = useState<string | null>(() => searchParams.get('token'));
  const hasTriggeredRef = useRef(false);
  const [verifyState, setVerifyState] = useState<VerifyState>(
    initialToken ? 'verifying' : 'invalid',
  );
  const [errorMessage, setErrorMessage] = useState<string>(
    initialToken
      ? ''
      : 'Verification link is missing or incomplete. Request a new one below.',
  );
  const [resendSubmitted, setResendSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendFormValues>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    if (!initialToken) return;

    // Strip ?token= from the address bar immediately after reading.
    navigate('/verify-email', { replace: true });

    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    void (async () => {
      try {
        await verifyEmail({ token: initialToken }).unwrap();
        setVerifyState('verified');
      } catch (err) {
        const parsed = parseApiError(err);
        setVerifyState('invalid');
        setErrorMessage(
          parsed.code === 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN'
            ? 'This verification link is invalid or has expired. You can request a new verification email below.'
            : parsed.message,
        );
      }
    })();
  }, [initialToken, navigate, verifyEmail]);

  const onResendSubmit = async (values: ResendFormValues) => {
    try {
      await resendVerification({ email: values.email }).unwrap();
      setResendSubmitted(true);
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.status === 429) {
        startCooldown(parsed.retryAfterSeconds ?? 60);
      }
      showToast(parsed.message, 'error');
    }
  };

  return (
    <AuthShell
      panelHeadline="Confirm your email address"
      panelSubtitle="Email verification protects your enrollments, progress, and certificates."
    >
      {verifyState === 'verifying' && (
        <div className="space-y-md text-center md:text-left">
          <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto md:mx-0" />
          <h1 className="text-[32px] font-bold text-ink">Verifying your email…</h1>
          <p className="text-[14px] text-ink-secondary">
            Please wait while we confirm your verification link.
          </p>
        </div>
      )}

      {verifyState === 'verified' && (
        <div className="space-y-lg text-center md:text-left">
          <div className="h-14 w-14 rounded-full bg-success-bg text-success-strong flex items-center justify-center mx-auto md:mx-0">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="space-y-xs">
            <h1 className="text-[32px] font-bold text-ink">Email verified!</h1>
            <p className="text-[14px] text-ink-secondary">
              Your account is active. You can now log in and start learning.
            </p>
          </div>
          <PublicButton variant="primary-lg" fullWidth asChild>
            <Link to="/login">Log In to Pathly</Link>
          </PublicButton>
        </div>
      )}

      {verifyState === 'invalid' && (
        <div className="space-y-lg">
          <div className="h-14 w-14 rounded-full bg-error-bg text-error flex items-center justify-center">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-xs">
            <h1 className="text-[32px] font-bold text-ink">Verification needed</h1>
            <p className="text-[14px] text-ink-secondary">{errorMessage}</p>
          </div>

          {resendSubmitted ? (
            <div className="rounded-md bg-primary-wash border border-primary-soft p-md text-[14px] text-ink space-y-xs">
              <p className="font-semibold">Check your email</p>
              <p className="text-ink-secondary text-[13px]">
                If an eligible account matches that email, we have queued a new verification link.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onResendSubmit)} className="space-y-md" noValidate>
              <PublicInput
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email')}
              />
              <PublicButton
                type="submit"
                variant="primary-lg"
                fullWidth
                loading={isResending}
                disabled={isCoolingDown}
              >
                {isCoolingDown
                  ? `Wait ${secondsLeft}s`
                  : 'Send New Verification Link'}
              </PublicButton>
            </form>
          )}

          <div className="text-center text-[14px] text-ink-secondary">
            <Link
              to="/login"
              className="font-semibold text-primary hover:text-primary-light"
            >
              Back to Log In
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
