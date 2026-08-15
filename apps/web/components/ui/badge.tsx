import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-none border px-2 py-1 text-[0.625rem] leading-none font-semibold tracking-wider whitespace-nowrap uppercase transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "border-primary/15 bg-primary/9 text-primary [a]:hover:bg-primary/14",
        secondary:
          "border-border/80 bg-muted/70 text-muted-foreground [a]:hover:text-foreground",
        destructive:
          "border-destructive/15 bg-destructive/8 text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/12",
        outline: "border-current/55 bg-card text-foreground [a]:hover:bg-muted",
        status: "border-0",
        ghost:
          "border-transparent px-0 text-muted-foreground hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
