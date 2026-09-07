import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
const variants = cva("inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50", {
  variants: { variant: { default: "bg-emerald-700 text-white hover:bg-emerald-800", outline: "border border-slate-300 bg-white hover:bg-slate-50", destructive: "bg-red-700 text-white hover:bg-red-800" }, size: { default: "h-10 px-4", sm: "h-9 px-3" } },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={cn(variants({ variant, size }), className)} {...props} />);
Button.displayName = "Button";
