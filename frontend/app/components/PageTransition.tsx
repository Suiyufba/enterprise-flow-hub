"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "../lib/gsap";

export function PageTransition({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(ref.current, {
        y: 24,
        opacity: 0,
        duration: 0.5,
        ease: "power3.out",
      });
    },
    { scope: ref }
  );

  return <div ref={ref}>{children}</div>;
}

export function CardStagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(ref.current!.children, {
        y: 20,
        opacity: 0,
        duration: 0.45,
        stagger: 0.08,
        ease: "power3.out",
      });
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
