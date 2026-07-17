"use client";

import { useRef, useEffect, type ReactNode } from "react";
import { gsap } from "../lib/gsap";

export function AnimateHeight({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    tweenRef.current?.kill();
    if (open) {
      ref.current.style.overflow = "hidden";
      ref.current.style.height = "auto";
      const h = ref.current.offsetHeight;
      tweenRef.current = gsap.fromTo(
        ref.current,
        { height: 0, opacity: 0 },
        {
          height: h,
          opacity: 1,
          duration: 0.3,
          ease: "power2.out",
          onComplete: () => {
            if (ref.current) {
              ref.current.style.height = "auto";
              ref.current.style.overflow = "visible";
            }
          },
        }
      );
    } else {
      ref.current.style.overflow = "hidden";
      tweenRef.current = gsap.to(ref.current, {
        height: 0,
        opacity: 0,
        duration: 0.25,
        ease: "power2.in",
        onComplete: () => {
          if (ref.current) {
            ref.current.style.height = "0px";
          }
        },
      });
    }
    return () => {
      tweenRef.current?.kill();
    };
  }, [open]);

  return (
    <div ref={ref} style={open ? undefined : { height: 0, overflow: "hidden", opacity: 0 }}>
      {children}
    </div>
  );
}
