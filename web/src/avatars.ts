/**
 * The agent's face. Muse gives its agent a plush doll; nanoMuse has its dragon — five stills,
 * one per mood (public/avatars/dragon-*.webp), the same creature the Android app wears — or a
 * face the person had drawn for them in the avatar studio (served from the runtime's files),
 * or an emoji on a colour for anyone who prefers it. `profile.avatar` names the face; "" means
 * the emoji.
 */

import { fileUrl } from "./api";

/** The dragon: the default face. */
export const DRAGON = "dragon";
export type DragonMood = "idle" | "working" | "waiting" | "happy" | "error";

/**
 * Faces from before 0.1.23 — the red panda drawn live and the six knitted dolls — are gone;
 * a profile still naming one wears the dragon.
 */
const RETIRED = new Set(["panda", "sunny", "moss", "sky", "fox", "bolt", "plum"]);

export function isDragon(id: string | undefined | null): boolean {
  return !id || id === DRAGON || RETIRED.has(id);
}

/**
 * A face from the avatar studio: `profile.avatar` is its id, the stills live in the workspace
 * under `avatar/<id>/` (idle · working · waiting · happy · error, webp) and come through the
 * files API — the same five moods the dragon has.
 */
export function studioUrl(id: string, mood: string): string {
  const still: DragonMood = mood === "working" || mood === "waiting" || mood === "happy" || mood === "error" ? mood : "idle";
  return fileUrl(`avatar/${id}/${still}.webp`);
}

export function dragonUrl(mood: string): string {
  const still: DragonMood = mood === "working" || mood === "waiting" || mood === "happy" || mood === "error" ? mood : "idle";
  return `/avatars/dragon-${still}.webp`;
}
