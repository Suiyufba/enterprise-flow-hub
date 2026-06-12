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

const STATUS_LABELS: Record<string, string> = {
  active: "启用",
  inactive: "停用",
  disabled: "停用",
  enabled: "启用",
  completed: "已完成",
  approved: "已通过",
  success: "成功",
  failed: "失败",
  error: "错误",

  draft: "草稿",
  confirmed: "已确认",
  processing: "处理中",
  in_progress: "进行中",
  shipped: "已发货",
  delivered: "已交付",
  cancelled: "已取消",
  submitted: "已提交",
  rejected: "已拒绝",
  refunded: "已退款",

  issued: "已开具",
  paid: "已付款",
  pending: "待处理",
  overdue: "已逾期",

  lead: "潜在",
  lost: "已流失",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const color = STATUS_COLORS[status] ?? "gray";
  const text = label ?? STATUS_LABELS[status] ?? status;
  return <span className={`status-badge status-${color}`}>{text}</span>;
}
