import { Check } from "lucide-react";
import type { CSSProperties } from "react";

export type StepperItem = {
  id: string;
  label: string;
  status: "complete" | "current" | "upcoming" | "error";
};

export function Stepper({
  steps,
  onStep,
}: {
  steps: StepperItem[];
  onStep?: (id: string) => void;
}) {
  const current = Math.max(
    0,
    steps.findIndex((step) => step.status === "current"),
  );
  return (
    <nav
      className="ds-stepper"
      aria-label="Etapas do cadastro"
      style={{ "--step-count": steps.length } as CSSProperties}
    >
      <p className="ds-stepper__mobile" aria-live="polite">
        Etapa {current + 1} de {steps.length}:{" "}
        <strong>{steps[current]?.label}</strong>
      </p>
      <ol>
        {steps.map((step, index) => {
          const enabled = step.status === "complete" && Boolean(onStep);
          const content = (
            <>
              <span className="ds-stepper__marker" aria-hidden="true">
                {step.status === "complete" ? <Check size={15} /> : index + 1}
              </span>
              <span>{step.label}</span>
            </>
          );
          return (
            <li
              key={step.id}
              data-status={step.status}
              aria-current={step.status === "current" ? "step" : undefined}
            >
              {enabled ? (
                <button type="button" onClick={() => onStep?.(step.id)}>
                  {content}
                </button>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
