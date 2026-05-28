export type AppIconName =
  | "alert"
  | "automation"
  | "bell"
  | "chart"
  | "chat"
  | "check"
  | "clipboard"
  | "copy"
  | "dashboard"
  | "document"
  | "download"
  | "edit"
  | "file"
  | "folder"
  | "image"
  | "invoice"
  | "library"
  | "moon"
  | "payment"
  | "project"
  | "refresh"
  | "search"
  | "settings"
  | "spark"
  | "sync"
  | "table"
  | "user"
  | "x";

const iconPaths: Record<AppIconName, string[]> = {
  alert: ["M12 4 21 20H3z", "M12 9v5", "M12 17h.01"],
  automation: ["M13 3 5 14h6l-1 7 8-11h-6z"],
  bell: ["M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6", "M10 19a2 2 0 0 0 4 0"],
  chart: ["M4 19V5", "M4 19h16", "M8 15v-4", "M12 15V8", "M16 15v-7"],
  chat: ["M5 6h14v10H8l-3 3z", "M8 9h8", "M8 12h5"],
  check: ["M5 12.5 10 17 19 7"],
  clipboard: ["M8 5h8", "M9 3h6v4H9z", "M7 5H5v16h14V5h-2", "M8 12h8", "M8 16h6"],
  copy: ["M8 8h10v10H8z", "M6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"],
  dashboard: ["M4 5h7v7H4z", "M13 5h7v4h-7z", "M13 11h7v8h-7z", "M4 14h7v5H4z"],
  document: ["M7 3h7l5 5v13H7z", "M14 3v6h5", "M9 14h6", "M9 17h4"],
  download: ["M12 4v10", "M8 10l4 4 4-4", "M5 20h14"],
  edit: ["M5 19l4-.8L18.5 8.7a2.1 2.1 0 0 0-3-3L6 15.2z", "M14 7l3 3"],
  file: ["M7 3h7l5 5v13H7z", "M14 3v6h5"],
  folder: ["M5 7h5l2 3h7v9H5z"],
  image: ["M5 5h14v14H5z", "M8 15l3-3 2 2 3-4 3 5", "M9 9h.01"],
  invoice: ["M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2z", "M9 8h6", "M9 12h6", "M9 16h4"],
  library: ["M5 4h11a3 3 0 0 1 3 3v13H7a2 2 0 0 1-2-2z", "M7 16h12", "M8 8h7"],
  moon: ["M20 15.5A8 8 0 0 1 8.5 4 6.5 6.5 0 1 0 20 15.5Z"],
  payment: ["M4 7h16v10H4z", "M4 10h16", "M8 15h3"],
  project: ["M5 7h5l2 3h7v9H5z"],
  refresh: ["M19 7v5h-5", "M5 17v-5h5", "M18 12a6 6 0 0 0-10.5-4", "M6 12a6 6 0 0 0 10.5 4"],
  search: ["M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z", "M15.5 15.5 20 20"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19 12h2", "M3 12h2", "M12 3v2", "M12 19v2", "M17 5.6l-1.4 1.4", "M8.4 17 7 18.4", "M7 5.6 8.4 7", "M15.6 17l1.4 1.4"],
  spark: ["M13 3 5 14h6l-1 7 8-11h-6z"],
  sync: ["M17 4v5h-5", "M7 20v-5h5", "M17 9a6 6 0 0 0-10.6-2.5", "M7 15a6 6 0 0 0 10.6 2.5"],
  table: ["M4 5h16v14H4z", "M4 10h16", "M4 15h16", "M10 5v14", "M16 5v14"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M5 20a7 7 0 0 1 14 0"],
  x: ["M6 6l12 12", "M18 6 6 18"],
};

export function AppIcon({ name, className = "" }: { name: AppIconName; className?: string }) {
  return (
    <svg className={`app-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {iconPaths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
