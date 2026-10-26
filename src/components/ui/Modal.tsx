import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const SIZE_CLASSES = {
  md: "max-w-md",
  "3xl": "max-w-3xl",
} as const;

type ModalProps = {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  size?: keyof typeof SIZE_CLASSES;
  onClose: () => void;
  children: React.ReactNode;
};

export function Modal({
  title,
  eyebrow,
  size = "md",
  onClose,
  children,
}: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // body へ出す。transform のかかった親 (ダッシュボードのカード) の中では
  // position:fixed がその親を基準にしてしまい、画面全体に広がらないため
  return createPortal(
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-xl ${SIZE_CLASSES[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between p-4">
          <div className="min-w-0 pl-2">
            {eyebrow && <p className="text-xs text-black/50">{eyebrow}</p>}
            <h2
              id={titleId}
              className={`truncate text-base font-semibold text-black ${eyebrow ? "mt-1" : ""}`}
            >
              {title}
            </h2>
          </div>
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-black/50 hover:bg-black/10"
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
