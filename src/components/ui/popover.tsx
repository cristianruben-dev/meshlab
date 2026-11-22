import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "cn"

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 8,
  align = "end",
  collisionPadding = 8,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "collisionPadding">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} collisionPadding={collisionPadding} className="isolate z-50">
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 max-h-(--available-height) origin-(--transform-origin) overflow-y-auto rounded-2xl bg-popover text-popover-foreground outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
