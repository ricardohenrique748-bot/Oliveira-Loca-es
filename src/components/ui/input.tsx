import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-xl border border-foreground/15 bg-foreground/[0.04] px-3 py-2 text-sm transition-all hover:border-foreground/25 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-primary-ink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:shadow-[0_0_0_6px_rgba(252,229,1,0.18)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[72px] w-full rounded-xl border border-foreground/15 bg-foreground/[0.04] px-3 py-2 text-sm transition-all hover:border-foreground/25 placeholder:text-muted-foreground focus-visible:border-primary-ink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:shadow-[0_0_0_6px_rgba(252,229,1,0.18)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea };
