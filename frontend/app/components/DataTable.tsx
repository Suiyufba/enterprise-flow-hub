"use client";

import type { ReactNode } from "react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { EmptyState } from "./EmptyState";

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  width?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  className,
  total = 0,
  page = 1,
  limit = 20,
  onPageChange,
  emptyTitle = "暂无数据",
  emptyDesc,
  emptyAction,
}: {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  className?: string;
  total?: number;
  page?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  emptyTitle?: string;
  emptyDesc?: string;
  emptyAction?: ReactNode;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const skeletonRows = Math.max(4, Math.min(limit, 8));

  if (loading) return <LoadingSkeleton rows={skeletonRows} columns={columns.length} />;

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDesc} action={emptyAction} />;
  }

  return (
    <div className={["data-table-wrap", className].filter(Boolean).join(" ")}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="data-table-footer">
          <span className="data-table-info">
            共 {total} 条，第 {page}/{totalPages} 页
          </span>
          <div className="data-table-pages">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              type="button"
              aria-label="上一页"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, i, arr) => {
                const showEllipsis = i > 0 && p - arr[i - 1] > 1;
                return (
                  <span key={p}>
                    {showEllipsis && <span className="data-table-ellipsis">…</span>}
                    <button
                      className={p === page ? "active" : ""}
                      onClick={() => onPageChange?.(p)}
                      type="button"
                      {...(p === page ? { "aria-current": "page" as const } : {})}
                    >
                      {p}
                    </button>
                  </span>
                );
              })}
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
              type="button"
              aria-label="下一页"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
