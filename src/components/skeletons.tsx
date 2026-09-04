import { useIsFetching } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bloco base com efeito shimmer. */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} />;
}

/** Envolve o conteúdo de uma página com fade-in suave. */
export function PageFade({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("animate-in fade-in-50 slide-in-from-bottom-1 duration-200", className)}>{children}</div>;
}

/** Barra fina de progresso no topo, só para carregamentos mais longos. */
export function TopProgressBar() {
  const routerLoading = useRouterState({ select: (s) => s.status === "pending" });
  const fetching = useIsFetching();
  const busy = routerLoading || fetching > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 450);
    return () => clearTimeout(t);
  }, [busy]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden bg-transparent">
      <div className="h-full w-1/3 rounded-full bg-primary/80 animate-progress-slide" />
    </div>
  );
}

export function CardsRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4">
          <Shimmer className="h-8 w-8 rounded-xl" />
          <Shimmer className="mt-3 h-3 w-24" />
          <Shimmer className="mt-2 h-7 w-16" />
          <Shimmer className="mt-3 h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Shimmer className="h-7 w-56" />
          <Shimmer className="mt-2 h-3 w-72" />
        </div>
        <Shimmer className="h-10 w-48 rounded-xl" />
      </div>
      <CardsRowSkeleton />
      <div className="rounded-2xl border border-border bg-card p-4">
        <Shimmer className="h-4 w-48" />
        <Shimmer className="mt-4 h-28 w-full" />
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, c) => (
          <div key={c} className="rounded-2xl border border-border bg-card p-3 space-y-2">
            <Shimmer className="h-3 w-28" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Shimmer key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5, height = "h-[76px]" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("rounded-xl border border-border bg-card p-3.5 flex items-start gap-3", height)}>
          <Shimmer className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Shimmer className="h-4 w-20" />
              <Shimmer className="h-4 w-16" />
            </div>
            <Shimmer className="h-4 w-2/3" />
            <Shimmer className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-5xl space-y-5">
      <Shimmer className="h-3 w-32" />
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex gap-2">
          <Shimmer className="h-5 w-24" />
          <Shimmer className="h-5 w-20" />
          <Shimmer className="h-5 w-20" />
        </div>
        <Shimmer className="h-7 w-3/4" />
        <Shimmer className="h-3 w-1/2" />
        <div className="flex gap-2 pt-2">
          <Shimmer className="h-9 w-32 rounded-lg" />
          <Shimmer className="h-9 w-32 rounded-lg" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <Shimmer className="h-4 w-36" />
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("flex gap-3", i % 2 ? "flex-row-reverse" : "")}>
            <Shimmer className="h-8 w-8 rounded-full" />
            <Shimmer className="h-16 w-2/3 rounded-2xl" />
          </div>
        ))}
        <Shimmer className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function FormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-4xl space-y-8">
      <div>
        <Shimmer className="h-7 w-48" />
        <Shimmer className="mt-2 h-3 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4">
            <Shimmer className="h-8 w-8 rounded-lg" />
            <Shimmer className="mt-3 h-3 w-24" />
            <Shimmer className="mt-2 h-6 w-14" />
          </div>
        ))}
      </div>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className="space-y-3">
          <Shimmer className="h-4 w-40" />
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <Shimmer className="h-10 w-full rounded-lg" />
            <Shimmer className="h-10 w-5/6 rounded-lg" />
            <Shimmer className="h-10 w-2/3 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
