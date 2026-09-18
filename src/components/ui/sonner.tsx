import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function AppToaster(props: ToasterProps) {
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
        ? "dark"
        : "light",
  );

  useEffect(() => {
    const el = document.documentElement;

    const mo = new MutationObserver(() => {
      setTheme(el.classList.contains("dark") ? "dark" : "light");
    });

    mo.observe(el, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => mo.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      position="top-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}