import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-yellow-100/60 bg-gradient-to-br from-[#fff35a] to-[#e9d200] font-semibold text-brand-black shadow-[inset_0_1px_2px_rgba(255,255,255,0.7),0_4px_20px_rgba(252,229,1,0.25)] hover:-translate-y-px hover:from-[#fff67a] hover:to-[#f5dd00] hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_8px_28px_rgba(252,229,1,0.4)]",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-foreground/15 bg-foreground/[0.03] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] backdrop-blur-sm hover:border-foreground/25 hover:bg-foreground/[0.07]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
        dark: "bg-foreground text-background shadow-sm hover:bg-foreground/85",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-3",
        xs: "h-7 rounded-lg px-2 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
