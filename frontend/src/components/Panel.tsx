import { useId, type ReactNode } from 'react';
import './Panel.css';

type PanelProps = {
  title: string;
  children?: ReactNode;
  className?: string;
};

export function Panel({ title, children, className = '' }: PanelProps) {
  const titleId = useId();

  return (
    <section className={`panel ${className}`.trim()} aria-labelledby={titleId}>
      <div className="panel-header">
        <h2 id={titleId}>{title}</h2>
      </div>
      <div className="panel-content">{children}</div>
    </section>
  );
}
