import { useEffect, useRef } from "react";
import { animate } from "../lib/anime";
import { AppIcon, type AppIconName } from "./AppIcon";

function getNumericValue(val: string | number): { number: number; prefix: string } | null {
  if (typeof val === "number") return { number: val, prefix: "" };
  if (val === "...") return null;
  if (val.startsWith("¥")) {
    const num = parseFloat(val.replace(/[¥,]/g, ""));
    return isNaN(num) ? null : { number: num, prefix: "¥" };
  }
  return null;
}

export function StatCard({
  label,
  value,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon?: AppIconName;
  trend?: { direction: "up" | "down"; text: string };
}) {
  const valueRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const parsed = getNumericValue(value);
    if (!parsed || !valueRef.current) return;

    const target = parsed.number;
    const prefix = parsed.prefix;
    const obj = { val: 0 };

    const animation = animate(obj, {
      val: target,
      duration: 1200,
      ease: "outExpo",
      onUpdate: () => {
        if (valueRef.current) {
          valueRef.current.textContent =
            prefix + Math.round(obj.val).toLocaleString();
        }
      },
    });

    return () => {
      animation.cancel?.();
    };
  }, [value]);

  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {icon && (
          <span className="stat-card-icon">
            <AppIcon name={icon} />
          </span>
        )}
      </div>
      <strong ref={valueRef} className="stat-card-value">
        {value}
      </strong>
      {trend && (
        <span className={`stat-card-trend ${trend.direction}`}>{trend.text}</span>
      )}
    </div>
  );
}
