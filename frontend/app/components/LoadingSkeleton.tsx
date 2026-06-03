export function LoadingSkeleton({ rows = 4, columns = 3 }: { rows?: number; columns?: number }) {
  const safeColumns = Math.max(1, columns);

  return (
    <div className="loading-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton-row"
          style={{
            animationDelay: `${i * 0.1}s`,
            gridTemplateColumns: `repeat(${safeColumns}, minmax(56px, 1fr))`,
          }}
        >
          {Array.from({ length: safeColumns }).map((_, col) => (
            <div
              key={col}
              className={`skeleton-line ${col % 3 === 0 ? "short" : col % 3 === 1 ? "medium" : "long"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
