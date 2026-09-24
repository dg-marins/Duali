import type { ReactNode } from "react";

export type TimelineItem = {
  id: string;
  date: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

export function Timeline({
  items,
  label = "Histórico",
}: {
  items: TimelineItem[];
  label?: string;
}) {
  return (
    <ol className="ds-timeline" aria-label={label}>
      {items.map((item) => (
        <li
          className="ds-timeline__item"
          data-tone={item.tone ?? "neutral"}
          key={item.id}
        >
          <span className="ds-timeline__marker" aria-hidden="true" />
          <div>
            <time dateTime={item.date}>{item.date}</time>
            <strong>{item.title}</strong>
            {item.description && <p>{item.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
