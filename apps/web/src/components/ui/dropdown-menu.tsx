"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({
  className,
  align = "end",
  ...props
}: Menu.DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-56 rounded-md border border-border bg-card p-1 text-sm shadow-lg",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const itemClass =
  "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function DropdownMenuItem({ className, ...props }: Menu.DropdownMenuItemProps) {
  return <Menu.Item className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: Menu.DropdownMenuRadioItemProps) {
  return (
    <Menu.RadioItem className={cn(itemClass, "pl-7 relative", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-2 inline-flex size-3 items-center justify-center">
        <span className="size-1.5 rounded-full bg-primary" />
      </Menu.ItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: Menu.DropdownMenuLabelProps) {
  return (
    <Menu.Label className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)} {...props} />
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-border" />;
}
