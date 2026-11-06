import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatedContent } from "./AnimatedContent";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const buttons = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,a[href],[tabindex="0"]',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
    buttons()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const all = buttons(),
          first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <AnimatedContent className={`modal ${wide ? "wide" : ""}`}>
        <div ref={ref} role="dialog" aria-modal="true" aria-label={title}>
          <div className="modal-heading">
            <h2>{title}</h2>
            <button
              className="icon-button"
              aria-label="Close dialog"
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </div>
          {children}
        </div>
      </AnimatedContent>
    </div>
  );
}
