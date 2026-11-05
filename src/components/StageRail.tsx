import { loadProgress, progressStateLabel, type LoadStatus } from "../lib/load-types";

export function StageRail({ status }: { status: LoadStatus }) {
  const steps = loadProgress(status);
  return (
    <ol className="stage-rail" aria-label="Load progress">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`stage-step ${step.state}`}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="stage-name">{step.label}</span>
          <span className="stage-state">{progressStateLabel(step, status)}</span>
        </li>
      ))}
    </ol>
  );
}
