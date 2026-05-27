type StatusColor = "green" | "blue" | "orange" | "red" | "purple" | "gray";

const STATUS_COLORS: Record<string, StatusColor> = {
  active: "green",
  completed: "green",
  approved: "green",
  paid: "green",
  delivered: "green",
  success: "green",
  enabled: "green",

  lead: "blue",
  processing: "blue",
  in_progress: "blue",
  confirmed: "blue",
  issued: "blue",

  pending: "orange",
  draft: "orange",
  submitted: "orange",
  shipped: "orange",

  cancelled: "red",
  rejected: "red",
  failed: "red",
  lost: "red",
  overdue: "red",
  error: "red",

  inactive: "gray",
  disabled: "gray",
  refunded: "purple",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const color = STATUS_COLORS[status] ?? "gray";
  const text = label ?? status;
  return <span className={`status-badge status-${color}`}>{text}</span>;
}
