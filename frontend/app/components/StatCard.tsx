import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon?: string;
  trend?: { direction: "up" | "down"; text: string };
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {icon && <span className="stat-card-icon">{icon}</span>}
      </div>
      <strong className="stat-card-value">{value}</strong>
      {trend && (
        <span className={`stat-card-trend ${trend.direction}`}>{trend.text}</span>
      )}
    </div>
  );
}
