import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * Menu de ações por linha renderizado em PORTAL com posição fixa:
 * não é clipado por wrappers com overflow (tabelas densas) nem depende
 * de ancestor relative. Fecha em clique fora, Esc e scroll/resize.
 * Abre pra baixo ou pra cima conforme o espaço no viewport (sem corte).
 */
export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!coords) return;
    const close = () => setCoords(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [coords]);

  const MENU_W = 176; // w-44
  const MENU_H = items.length * 28 + 8;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (coords) {
            setCoords(null);
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          const top = r.bottom + MENU_H > window.innerHeight ? r.top - MENU_H - 4 : r.bottom + 4;
          const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
          setCoords({ top, left });
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-700/60 hover:text-slate-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {coords &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCoords(null)} />
            <div
              className="fixed z-50 w-44 rounded-lg bg-slate-900 py-1 shadow-xl ring-1 ring-slate-700"
              style={{ top: coords.top, left: coords.left }}
            >
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  disabled={it.disabled}
                  onClick={() => {
                    setCoords(null);
                    it.onClick();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition hover:bg-slate-800 disabled:opacity-40 ${
                    it.danger ? "text-red-300" : "text-slate-300"
                  }`}
                >
                  {it.icon}
                  {it.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
