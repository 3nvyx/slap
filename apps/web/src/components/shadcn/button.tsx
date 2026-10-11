import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Slap's buttons. "ink" is the default solid, "accent" is the one orange key on a page (it sits on a hard
// shadow and travels down when pressed, like a key on the device), "outline" and "ghost" are the quiet ones.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,transform,filter] duration-150 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        ink: "bg-primary text-primary-foreground hover:bg-primary/90",
        accent:
          "bg-accent text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_0_rgba(0,0,0,0.32)] hover:brightness-105 active:translate-y-px active:scale-100 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_0_rgba(0,0,0,0.32)]",
        outline:
          "border border-line bg-panel text-ink shadow-xs hover:border-ink/30 hover:bg-panel-2",
        ghost: "text-ink-2 hover:bg-panel-2 hover:text-ink",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5",
        md: "h-9 px-4 has-[>svg]:px-3",
        lg: "h-14 px-6 text-base font-semibold tracking-tight",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "outline",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
