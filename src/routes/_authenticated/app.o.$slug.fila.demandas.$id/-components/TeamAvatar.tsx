function initials(name: string) {
  return name
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Avatar de equipe/IA (bolhas de saída e comentários) — sem foto externa.
 * IA ganha pill violeta com "IA"; humanos ganham pill da marca com iniciais.
 * (O avatar de CLIENTE é o ContactAvatar global, com foto do WhatsApp.)
 */
export function TeamAvatar({
  name,
  isAI,
  size = "md",
}: {
  name: string;
  isAI?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={`${size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]"} shrink-0 rounded-full grid place-items-center font-bold ${
        isAI ? "pill-violet" : "pill-brand"
      }`}
      aria-hidden
    >
      {isAI ? "IA" : initials(name) || "?"}
    </div>
  );
}
