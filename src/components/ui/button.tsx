import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary/40 bg-primary text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/.14)] hover:-translate-y-px hover:bg-primary/90 hover:shadow-[0_10px_30px_hsl(var(--primary)/.2)]",
        destructive: "border-destructive/40 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border-primary/30 bg-primary/[0.07] text-foreground shadow-sm hover:border-primary/55 hover:bg-primary/[0.14] hover:text-foreground",
        secondary: "border-border/80 bg-secondary/85 text-secondary-foreground shadow-sm hover:bg-secondary",
        ghost: "border-transparent bg-transparent text-foreground hover:border-primary/20 hover:bg-primary/[0.08] hover:text-foreground",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
