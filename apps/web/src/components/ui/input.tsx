import { cn } from "@/lib/cn";
import { forwardRef, useId, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-[13px] font-medium text-ink">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-steel/60",
          "focus:border-signal focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-hazard" : "border-mist",
          className
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <p className="text-[13px] text-hazard">{error}</p> : null}
    </div>
  );
});
