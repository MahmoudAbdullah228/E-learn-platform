import { SearchOutlined } from '@ant-design/icons';
import { Checkbox, Input, type CheckboxProps, type InputProps } from 'antd';
import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface DashboardInputProps extends InputProps {
  label?: string;
  error?: string;
  helperText?: string;
  isPassword?: boolean;
}

export function DashboardInput({
  label,
  error,
  helperText,
  isPassword = false,
  id,
  className,
  ...props
}: DashboardInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasError = Boolean(error);
  const Component = isPassword ? Input.Password : Input;

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
      <Component
        id={inputId}
        status={hasError ? 'error' : undefined}
        className={cn(
          'rounded-md',
          hasError && 'bg-error-bg border-error',
          className,
        )}
        {...props}
      />
      {error ? (
        <p className="text-[12px] text-error leading-[1.4]" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-[12px] text-ink-muted leading-[1.4]">{helperText}</p>
      ) : null}
    </div>
  );
}

export function DashboardSearchField({
  placeholder = 'Search...',
  className,
  ...props
}: InputProps) {
  return (
    <Input
      allowClear
      placeholder={placeholder}
      prefix={<SearchOutlined className="text-ink-placeholder" />}
      className={cn(
        'rounded-md bg-surface-muted border-transparent hover:bg-surface hover:border-primary focus-within:bg-surface focus-within:border-primary',
        className,
      )}
      {...props}
    />
  );
}

export interface DashboardCheckboxProps extends CheckboxProps {
  label: string;
  error?: string;
}

export function DashboardCheckbox({
  label,
  error,
  className,
  ...props
}: DashboardCheckboxProps) {
  return (
    <div className="space-y-xxs">
      <Checkbox className={cn('text-[14px] text-ink', className)} {...props}>
        {label}
      </Checkbox>
      {error && (
        <p className="text-[12px] text-error leading-[1.4]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
