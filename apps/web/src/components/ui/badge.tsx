import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "signal" | "hazard" | "steel" | "info" | "neutral";

const tones: Record<Tone, string> = {
  signal: "bg-signal-soft text-signal",
  hazard: "bg-hazard-soft text-hazard",
  info: "bg-info-soft text-info",
  steel: "bg-mist text-steel",
  neutral: "bg-canvas text-ink border border-mist",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  mono?: boolean;
}

export function Badge({ tone = "steel", mono, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        mono && "font-mono tnum tracking-tight",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
