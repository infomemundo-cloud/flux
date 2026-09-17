import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function AppToaster(props: ToasterProps) {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );

  useEffect(() => {
    const el = document.documentElement;
    const mo = new MutationObserver(() =>
      setTheme(el.classList.contains("dark") ? "dark" : "light"),
    );
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      duration={3500}
      {...props}
    />
  );
}
