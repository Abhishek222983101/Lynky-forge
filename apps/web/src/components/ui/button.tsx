import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-signal text-white hover:bg-signal/90 active:bg-signal/80",
  secondary: "bg-surface text-ink border border-mist hover:bg-canvas active:bg-mist/60",
  ghost: "text-steel hover:text-ink hover:bg-mist/50",
  danger: "bg-hazard text-white hover:bg-hazard/90 active:bg-hazard/80",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-11 px-5 text-sm rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 font-body font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : null}
      {children}
    </button>
  );
});
