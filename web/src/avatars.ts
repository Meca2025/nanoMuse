/**
 * The agent's face. Muse gives its agent a plush doll; nanoMuse has its red panda — drawn
 * live (components/RedPanda.tsx), so it blinks, breathes and changes pose with what the
 * agent is doing — plus six knitted dolls shipped as pictures (public/avatars/*.webp), or an
 * emoji on a colour for anyone who prefers it. `profile.avatar` names the face; "" means the
 * emoji.
 */
export interface Plush {
  id: string;
  /** shown in the picker; the agent's own name is separate */
  label: string;
}

/** The red panda: the project's mark, drawn live. */
export const MASCOT = "panda";

/**
 * The dragon: the default face, the one the Android app wears — five stills, one per mood
 * (public/avatars/dragon-*.webp), so the web and the phone show the same creature.
 */
export const DRAGON = "dragon";
export type DragonMood = "idle" | "working" | "waiting" | "happy" | "error";

export function isDragon(id: string | undefined | null): boolean {
  return id === DRAGON;
}

export function dragonUrl(mood: string): string {
  const still: DragonMood = mood === "working" || mood === "waiting" || mood === "happy" || mood === "error" ? mood : "idle";
  return `/avatars/dragon-${still}.webp`;
}

export const PLUSH: readonly Plush[] = [
  { id: "sunny", label: "Sunny" },
  { id: "moss", label: "Moss" },
  { id: "sky", label: "Sky" },
  { id: "fox", label: "Fox" },
  { id: "bolt", label: "Bolt" },
  { id: "plum", label: "Plum" },
];

export function isMascot(id: string | undefined | null): boolean {
  return id === MASCOT;
}

export function isPlush(id: string | undefined | null): id is string {
  return !!id && PLUSH.some((p) => p.id === id);
}

export function plushUrl(id: string): string {
  return `/avatars/${id}.webp`;
}
