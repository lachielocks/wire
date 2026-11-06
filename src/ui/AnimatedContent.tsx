// Adapted from React Bits AnimatedContent by David Haz (MIT + Commons Clause).
// https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Animations/AnimatedContent
// Mount-only subset: short entrance motion, with reduced-motion support and GSAP cleanup.
import { useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { gsap } from "gsap";
export function AnimatedContent({
  children,
  className = "",
  delay = 0,
  ...props
}: HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: 12, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          delay,
          ease: "power3.out",
          clearProps: "transform,opacity",
        },
      );
    }, el);
    return () => ctx.revert();
  }, [delay]);
  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
}
