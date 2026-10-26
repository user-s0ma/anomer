import { useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";

type RowMenuItem = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
  danger?: boolean;
};

export function RowMenu({
  items,
  ariaLabel = "この行の操作",
  disabled = false,
}: {
  items: RowMenuItem[];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  // 開いた位置 (ボタンの真下・右揃え)。body へ出すので画面基準で持つ
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setAnchor(null);
    };
    // 画面が動くと座標がずれるので、その場合は閉じる
    const close = () => setAnchor(null);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  // ポータルの中でも React のイベントは親へ伝わるため、行のリンクを踏ませない
  function swallow(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function toggle(event: React.MouseEvent) {
    swallow(event);
    if (anchor) {
      setAnchor(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black/50 hover:bg-black/10"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={toggle}
        disabled={disabled}
      >
        <Ellipsis className="h-4 w-4" />
      </button>
      {anchor &&
        createPortal(
          // 行やモーダルの overflow に切り取られないよう body へ出す
          <div
            ref={menuRef}
            className="fixed z-40 min-w-36 rounded-xl border border-black/20 bg-white p-1 shadow"
            style={{ top: anchor.top, right: anchor.right }}
            role="menu"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm ${
                    item.danger
                      ? "text-down hover:bg-down/10"
                      : "text-black hover:bg-black/10"
                  }`}
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    swallow(event);
                    setAnchor(null);
                    item.onSelect();
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
