import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import type { CloudConfig } from "../types";
import { cx } from "../util";
import { REPO_URL } from "./CommunityNotice";
import { primaryBtn, secondaryBtn } from "./Form";

/**
 * The ask for a star, at the moments it is fair to make it: when the free allowance was just
 * claimed (the account page after signing in), after the first and the tenth task the agent
 * finished, after a face is drawn in the studio, and when the allowance is used up (a row
 * among the ways on). Each moment is asked once in this browser; going to GitHub from any of
 * them ends them all. A card where the moment is, never a dialog — and the tone is a thank
 * you, not a bill: a star tells the people building it that it helped.
 */
export type StarMoment = "signed_in" | "first_task" | "tenth_task" | "new_look";

const STARRED_KEY = "nm.star.starred";
const TASKS_KEY = "nm.star.tasks";
const momentKey = (m: StarMoment) => `nm.star.${m}`;

/** One more task finished in this browser; the count so far. */
export function countTask(): number {
  try {
    const n = (Number(localStorage.getItem(TASKS_KEY)) || 0) + 1;
    localStorage.setItem(TASKS_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
}
/** The moment a finished-task count makes due, if any: the first and the tenth. */
export const momentForTask = (n: number): StarMoment | null => (n === 1 ? "first_task" : n === 10 ? "tenth_task" : null);

/** The words for each moment (one source, so every client says the same thing). */
export function starText(t: (s: string) => string, m: StarMoment): string {
  switch (m) {
    case "signed_in":
      return t(
        "Welcome. nanoMuse is free, open source and non-profit — a personal agent for anyone who runs it. If that is worth something to you, a star on GitHub is how the next person finds it.",
      );
    case "first_task":
      return t("First task done. If nanoMuse helped, a star on GitHub tells the people building it that it did.");
    case "tenth_task":
      return t("Ten tasks together. If nanoMuse has become part of your day, a star on GitHub tells others it is worth a try.");
    case "new_look":
      return t("A new face, drawn for you. If you like where nanoMuse is going, a star on GitHub helps more people find it.");
  }
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const write = (k: string) => {
  try {
    localStorage.setItem(k, "1");
  } catch {
    /* private mode: the ask may come back; it is still only a card */
  }
};

/** Still worth asking at this moment: not asked before, and the person has not gone to star it. */
export const starDue = (m: StarMoment): boolean => !read(STARRED_KEY) && !read(momentKey(m));
/** The card was shown (or waved away): the moment is spent. */
export const starShown = (m: StarMoment): void => write(momentKey(m));
/** The person has been to GitHub from one of the asks. */
export const starred = (): boolean => read(STARRED_KEY);

/** Off to GitHub, and no more asking anywhere. */
export function openStar(repoUrl?: string): void {
  write(STARRED_KEY);
  window.open(repoUrl || REPO_URL, "_blank", "noopener,noreferrer");
}

/**
 * The relay's public figures (relay 0.15, `/api/cloud/config`): the allowance a new account
 * gets, the invite bonus, the repository — read once per page load and shared, so the copy
 * prints what the relay's operator set today rather than a number baked into the build.
 * Empty until it answers, and from an older relay; callers keep their fallbacks.
 */
let cached: CloudConfig | null = null;
let pending: Promise<CloudConfig> | null = null;
export function useCloudConfig(): CloudConfig {
  const [cfg, setCfg] = useState<CloudConfig>(cached ?? {});
  useEffect(() => {
    if (cached) return;
    pending ??= api
      .cloudConfig()
      .then((c) => (cached = c && typeof c === "object" ? c : {}))
      .catch(() => (cached = {}));
    let live = true;
    pending.then((c) => live && setCfg(c));
    return () => {
      live = false;
    };
  }, []);
  return cfg;
}

/** One card: the star, a line saying why, "Star on GitHub" and "Not now". */
export function StarNudge({ text, onDone, className }: { text: string; onDone: () => void; className?: string }) {
  const t = useT();
  const cfg = useCloudConfig();
  return (
    <section className={cx("rounded-[22px] border border-amber-400/40 bg-amber-50/70 p-4 dark:bg-amber-400/[0.08]", className)}>
      <div className="flex items-start gap-2.5">
        <Star size={18} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-snug">{t("A star on GitHub helps")}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-fg/85">{text}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-7">
        <button
          type="button"
          className={cx(primaryBtn, "!w-auto !py-1.5 !px-3.5 text-[13px]")}
          onClick={() => {
            openStar(cfg.repo_url);
            onDone();
          }}
        >
          {t("Star on GitHub")}
        </button>
        <button type="button" className={cx(secondaryBtn, "!w-auto !py-1.5 !px-3.5 text-[13px]")} onClick={onDone}>
          {t("Not now")}
        </button>
      </div>
    </section>
  );
}

/**
 * The card for a moment, shown once: `due` says the moment has come (the account was just
 * seen signed in; a task just finished). Marks the moment spent as soon as it is drawn.
 */
export function StarNudgeOnce({ moment, text, className, due = true }: { moment: StarMoment; text?: string; className?: string; due?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!due || open || !starDue(moment)) return;
    starShown(moment);
    setOpen(true);
  }, [due, moment, open]);
  if (!open) return null;
  return <StarNudge text={text ?? starText(t, moment)} onDone={() => setOpen(false)} className={className} />;
}
