import { cn } from "@/lib/utils";

/**
 * Editorial display heading: a heavy Manrope phrase with one Newsreader-italic
 * accent word. Used for the wordmark and empty states.
 */
export function Display({
  lead,
  accent,
  tail,
  className,
}: {
  lead?: string;
  accent: string;
  tail?: string;
  className?: string;
}) {
  return (
    <span className={cn("font-extrabold tracking-tight", className)}>
      {lead ? `${lead} ` : ""}
      <span className="font-accent font-medium text-tucano-400">{accent}</span>
      {tail ? ` ${tail}` : ""}
    </span>
  );
}
