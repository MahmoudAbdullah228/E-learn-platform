import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Eye, EyeOff, Search, X } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface PublicInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const PublicInput = forwardRef<HTMLInputElement, PublicInputProps>(
  ({ label, error, helperText, type = 'text', className, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const resolvedType = isPassword && showPassword ? 'text' : type;
    const hasError = Boolean(error);

    return (
      <div className="space-y-xxs w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[14px] font-semibold leading-[1.4] text-ink"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            aria-invalid={hasError}
            className={cn(
              'w-full rounded-md border px-md py-sm text-[14px] leading-[1.5] text-ink placeholder:text-ink-placeholder transition-colors focus:outline-none',
              isPassword && 'pr-10',
              hasError
                ? 'bg-error-bg border-error focus:border-error'
                : 'bg-surface border-border focus:border-primary',
              props.disabled && 'opacity-60 cursor-not-allowed bg-surface-muted',
              className,
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-sm top-1/2 -translate-y-1/2 text-ink-placeholder hover:text-ink p-xxs cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error ? (
          <p className="text-[12px] text-error leading-[1.4]" role="alert">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-[12px] text-ink-muted leading-[1.4]">{helperText}</p>
        ) : null}
      </div>
    );
  },
);
PublicInput.displayName = 'PublicInput';

export interface PublicSearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
}

export const PublicSearchField = forwardRef<HTMLInputElement, PublicSearchFieldProps>(
  ({ className, value, onClear, placeholder = 'Search courses...', ...props }, ref) => {
    const hasValue = typeof value === 'string' && value.length > 0;

    return (
      <div
        className={cn(
          'flex items-center gap-xs rounded-md bg-surface-muted border border-transparent px-sm py-xs transition-colors hover:bg-surface hover:border-primary focus-within:bg-surface focus-within:border-primary',
          className,
        )}
      >
        <Search className="h-4 w-4 text-ink-placeholder shrink-0" aria-hidden="true" />
        <input
          ref={ref}
          type="search"
          value={value}
          placeholder={placeholder}
          className="w-full bg-transparent text-[14px] leading-[1.5] text-ink placeholder:text-ink-placeholder focus:outline-none"
          {...props}
        />
        {hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="text-ink-placeholder hover:text-ink p-xxs cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  },
);
PublicSearchField.displayName = 'PublicSearchField';

export interface PublicCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
  error?: string;
}

export function PublicCheckbox({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
  error,
}: PublicCheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <div className="space-y-xxs">
      <div className="flex items-center gap-xs min-h-[32px]">
        <CheckboxPrimitive.Root
          id={checkboxId}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(val) => onCheckedChange(val === true)}
          className={cn(
            'h-4 w-4 shrink-0 rounded-xs border border-border bg-surface transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-on-primary cursor-pointer disabled:opacity-50',
            error && 'border-error',
          )}
        >
          <CheckboxPrimitive.Indicator>
            <Check className="h-3 w-3 stroke-[3]" />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        <label
          htmlFor={checkboxId}
          className="text-[14px] text-ink select-none cursor-pointer leading-[1.4]"
        >
          {label}
        </label>
      </div>
      {error && (
        <p className="text-[12px] text-error leading-[1.4]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
