import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile } from "lucide-react";

/**
 * Picker de emojis próprio (sem lib nova — princípio do lightbox).
 * Grade curada por grupo; inserção no cursor é responsabilidade de quem
 * consome (onPick), porque o textarea é controlado pelo route.
 */
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: ["😀","😃","😄","","😆","","🤣","😂","🙂","😉","😊","😇","","😍","","😘","","😚","","🥲","😋","😛","","🤪","😝","","🤭","🤫","","😐","😑","😶","😏","😒","","😬","","😌","😔","😪","🤤","😴","😷","🤒","","🤢","","🥵","","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓",""],
  },
  {
    label: "Gestos & corações",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","👍","👎","👌","🤌","🤏","✌️","🤞","🫰","","🤘","","👈","","👆","","☝️","✋","🤚","️","🖖","👋","🤝","🙏","💪","🫶","","🙌"],
  },
  {
    label: "Natureza & comida",
    emojis: ["🐶","","🐭","","🐰","","🐻","","🐨","","🦁","","🐷","","🐵","🐔","🐧","🐦","🦆","🦅","","🐝","🌵","","🌲","","🌴","","🌿","️","🍀","🍁","🍃","🍇","🍉","🍊","🍋","🍌","🍍","🥭","","🍐","🍑","🍒","🍓","🥝","🍅","","🌽","","🍔","","🎂","🍰","☕","🥤",""],
  },
  {
    label: "Objetos & símbolos",
    emojis: ["⌚","","💻","️","","📸","","🎥","","📺","⏰","⌛","","🔌","💡","🔦","🛒","","💳","💎","🔧","","⚙️","","🔑","📦","📄","📎","✂️","✏️","📌","📍","✅","❌","️","❗","❓","💯","🔥","✨","🎉","🎊","🏆","🥇","","🚀",""],
  },
];

export function EmojiPicker({
  onPick,
  triggerClass,
}: {
  onPick: (emoji: string) => void;
  triggerClass?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Emoji" aria-label="Inserir emoji" className={triggerClass}>
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[268px] max-h-[240px] overflow-y-auto scrollbar-thin p-2"
      >
        {EMOJI_GROUPS.map((g) => (
          <div key={g.label} className="mb-2 last:mb-0">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {g.label}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {g.emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onPick(e)}
                  title={e}
                  className="grid h-7 w-7 place-items-center rounded-md text-base transition hover:bg-secondary"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}