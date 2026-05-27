export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="loading-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 0.1}s` }}>
          <div className="skeleton-line short" />
          <div className="skeleton-line medium" />
          <div className="skeleton-line long" />
        </div>
      ))}
    </div>
  );
}
