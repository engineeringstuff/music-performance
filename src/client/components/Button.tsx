import type { ButtonHTMLAttributes, Ref } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent-400 text-emerald-950 shadow-[0_10px_40px_-12px_rgba(52,211,153,0.9)] hover:bg-accent-300",
  secondary:
    "border border-white/15 bg-white/5 text-slate-100 hover:border-white/25 hover:bg-white/10",
  ghost: "text-slate-300 hover:bg-white/5 hover:text-white",
  danger: "border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
};

const SIZES: Record<Size, string> = {
  md: "h-11 px-6 text-sm",
  lg: "h-14 px-8 text-base",
  xl: "h-20 min-w-64 px-10 text-xl",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  disabled = false,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight",
        "transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-stage-950",
        disabled
          ? "cursor-not-allowed border-white/10 bg-white/[0.06] text-slate-400 shadow-none"
          : VARIANTS[variant],
        SIZES[size],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
