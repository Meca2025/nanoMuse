import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { DRAGON, dragonUrl, isDragon, studioUrl } from "../avatars";
import { useT } from "../i18n";
import { cx } from "../util";

const EMOJI = ["✨", "🌙", "🪐", "🌿", "🔥", "🌊", "🦉", "🦊", "🐙", "🎯", "🧭", "💎", "🍀", "🎈", "🤖", "🧠"];
export const AVATAR_COLORS = ["#0064d4", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#4b5563"];

export interface AvatarChoice {
  avatar: string;
  emoji: string;
  color: string;
}

/**
 * The dragon, a face drawn for you in the avatar studio (when the profile has one, or when
 * `onGenerate` is given: describe it and the chat draws four to choose from), plus an emoji on
 * a colour for anyone who would rather. Used in setup and in Settings.
 */
export function AvatarPicker({
  value,
  onChange,
  onGenerate,
}: {
  value: AvatarChoice;
  onChange: (v: AvatarChoice) => void;
  /** asked for a new face: the description typed; the caller hands it to the chat */
  onGenerate?: (description: string) => void;
}) {
  const t = useT();
  const [describing, setDescribing] = useState(false);
  const [description, setDescription] = useState("");
  const emojiMode = value.avatar === "";
  // a face from the studio: anything that is neither the dragon nor the emoji
  const studio = !emojiMode && !isDragon(value.avatar) ? value.avatar : null;
  const ring = "ring-[2.5px] ring-accent ring-offset-2 ring-offset-bg";
  const tile = "relative aspect-square overflow-hidden rounded-full transition";
  const submit = () => {
    const d = description.trim();
    if (!d || !onGenerate) return;
    onGenerate(d);
    setDescription("");
    setDescribing(false);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <button
          type="button"
          aria-label={t("The dragon")}
          aria-pressed={value.avatar === DRAGON}
          onClick={() => onChange({ ...value, avatar: DRAGON })}
          className={cx(tile, "bg-[#f1efeb]", value.avatar === DRAGON ? ring : "opacity-90 hover:opacity-100")}
        >
          <img src={dragonUrl(value.avatar === DRAGON ? "happy" : "idle")} alt="" draggable={false} className="h-full w-full object-cover" />
        </button>
        {studio && (
          <button type="button" aria-label={t("The face drawn for you")} aria-pressed className={cx(tile, "bg-surface-2", ring)}>
            <img src={studioUrl(studio, "happy")} alt="" draggable={false} className="h-full w-full object-cover" />
          </button>
        )}
        {onGenerate && (
          <button
            type="button"
            aria-label={t("Draw a new one")}
            aria-pressed={describing}
            onClick={() => setDescribing((v) => !v)}
            className={cx(tile, "flex items-center justify-center border border-dashed border-border text-accent", describing ? ring : "hover:bg-surface-2")}
          >
            <Sparkles size={22} />
          </button>
        )}
        <button
          type="button"
          aria-label={t("An emoji instead")}
          aria-pressed={emojiMode}
          onClick={() => onChange({ ...value, avatar: "" })}
          className={cx("flex aspect-square items-center justify-center rounded-full text-[26px] transition", emojiMode ? ring : "opacity-90 hover:opacity-100")}
          style={{ background: `linear-gradient(135deg, ${value.color}, color-mix(in srgb, ${value.color} 60%, #ffffff))` }}
        >
          {value.emoji}
        </button>
      </div>
      {describing && onGenerate && (
        <div className="rounded-2xl bg-surface-2 p-3 space-y-2">
          <p className="text-[12.5px] text-muted">{t("Describe the new look; the chat draws four to choose from and shows the cost first.")}</p>
          <div className="flex gap-2">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t("a small orange cat with round glasses")}
              maxLength={200}
              className="min-w-0 flex-1 rounded-xl bg-bg px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button type="button" onClick={submit} disabled={!description.trim()} className="rounded-xl bg-accent px-3 py-2 text-[13.5px] font-medium text-accent-fg disabled:opacity-40">
              {t("Draw")}
            </button>
          </div>
        </div>
      )}
      {emojiMode && (
        <>
          <div className="grid grid-cols-8 gap-1.5">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onChange({ ...value, emoji: e })}
                className={cx("flex aspect-square items-center justify-center rounded-2xl bg-surface-2 text-[22px]", value.emoji === e && "ring-2 ring-accent")}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => onChange({ ...value, color: c })}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                style={{ background: c }}
              >
                {value.color === c && <Check size={16} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
