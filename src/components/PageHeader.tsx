import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  lede,
  action,
}: {
  kicker?: string;
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {action ? <div className="page-action">{action}</div> : null}
    </header>
  );
}
