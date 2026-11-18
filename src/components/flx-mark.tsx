import { useId } from "react";

/**
 * Monograma "F de fita" do Fluxo — vetor vivo, sem imagem.
 *
 * viewBox AJUSTADO ao bounding box real do glifo (10 4 27 40): elimina o
 * letterbox horizontal interno que afastava o F do texto ao lado. Com
 * `h-8 w-auto` no call site, a largura do SVG passa a ser exatamente a
 * largura visual do F — o único espaço entre marca e texto é o gap do flex.
 *
 * Geometria (F maiúsculo legível):
 *  • haste CONTÍNUA + canto superior arredondado + braço superior reto;
 *  • braço do meio reto, atracado na haste (desenhado por baixo dela);
 *  • fita grossa (7/40), pontas redondas;
 *  • tone="brand": degradê por fita; tone="mono": currentColor.
 *  • ids via useId → várias instâncias na mesma tela sem colisão.
 */
export function FlxMark({
  className,
  title = "Fluxo",
  tone = "brand",
}: {
  className?: string;
  title?: string;
  tone?: "brand" | "mono";
}) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const gradA = `flxA-${uid}`;
  const gradB = `flxB-${uid}`;

  // Haste contínua + canto superior + braço superior (mais longo).
  const stemTop = "M 14 40 V 15 C 14 11 17 8 21 8 H 33";
  // Braço do meio: reto, atracado na haste (a haste, desenhada depois,
  // cobre o junction), mais curto que o topo.
  const midArm = "M 14 23 H 27";

  const strokeA = tone === "mono" ? "currentColor" : `url(#${gradA})`;
  const strokeB = tone === "mono" ? "currentColor" : `url(#${gradB})`;

  return (
    <svg
      viewBox="10 4 27 40"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradA} gradientUnits="userSpaceOnUse" x1="14" y1="40" x2="33" y2="8">
          <stop offset="0" stopColor="#1e40af" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={gradB} gradientUnits="userSpaceOnUse" x1="14" y1="23" x2="27" y2="23">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.6" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {/* Braço do meio POR BAIXO: a haste (desenhada depois) cobre o junction. */}
      <path
        d={midArm}
        stroke={strokeB}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d={stemTop}
        stroke={strokeA}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
