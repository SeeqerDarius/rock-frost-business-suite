import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  id: string;
  label: string;
}

/**
 * A small, accessible step indicator for a multi-step flow - no Base UI
 * primitive exists for this shape, so it's a bespoke component (the first
 * wizard/stepper pattern in this codebase). Server-component friendly: it
 * only ever displays state, it never owns navigation - the caller drives
 * which step is current (e.g. from a URL search param), matching this app's
 * existing convention of storing view state in the URL rather than client
 * state for multi-step or tabbed server-rendered flows.
 */
export function Stepper({ steps, currentStepId, className }: { steps: StepperStep[]; currentStepId: string; className?: string }) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1 gap-y-3", className)}>
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStepId;
        const isComplete = currentIndex >= 0 && index < currentIndex;
        return (
          <li key={step.id} className="flex items-center">
            <span className="flex items-center gap-2">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : isComplete
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {isComplete ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span className={cn("text-sm", isCurrent ? "font-medium text-foreground" : "text-muted-foreground")}>{step.label}</span>
            </span>
            {index < steps.length - 1 ? <span className="mx-2 h-px w-4 shrink-0 bg-border sm:w-8" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
