import { Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Sheet } from "../components/Sheet";
import { TabHeader } from "../components/TabHeader";
import { useT } from "../i18n";
import { useStore } from "../store";
import type { Idea, IdeasData } from "../types";
import { relativeTime } from "../util";

/** The areas an idea can belong to, in the order they are listed; the emoji Muse puts in front of a row, and the label. */
const AREAS: Array<{ id: string; label: string; emoji: string }> = [
  { id: "planning", label: "Planning", emoji: "🗓️" },
  { id: "goals", label: "Goals", emoji: "🎯" },
  { id: "research", label: "Research", emoji: "🔍" },
  { id: "money", label: "Money", emoji: "💰" },
  { id: "health", label: "Health", emoji: "🌿" },
  { id: "home", label: "Home", emoji: "🏠" },
  { id: "learning", label: "Learning", emoji: "📚" },
  { id: "people", label: "People", emoji: "👥" },
  { id: "files", label: "Files & tools", emoji: "📄" },
  { id: "fun", label: "Just for you", emoji: "🎈" },
];

/** Muse "always thinks about what it can do for you" — suggestions from goals, memory and recent chat. */
export function IdeasScreen() {
  const { state, send, openThread, toast } = useStore();
  const [data, setData] = useState<IdeasData | null>(null);
  const [loading, setLoading] = useState(false);
  const name = state.profile?.name ?? "nanoMuse";
  const t = useT();

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const d = await api.ideas(refresh);
      setData(d);
      if (d.error) toast(t("Could not refresh ideas: {error}", { error: d.error }));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = groupByArea(data?.ideas ?? []);
  const [selected, setSelected] = useState<{ idea: Idea; emoji: string } | null>(null);
  // The runtime's starter ideas are English; the dictionary carries them, model-written ones pass through.
  const sendIdea = (idea: Idea) => {
    setSelected(null);
    void send("main", t(idea.prompt));
    openThread("main");
  };

  // Muse's Ideas page: a big title, then rows of "emoji · bold pitch · grey detail" grouped under
  // section headers (the first group has none). Tapping a row opens a small sheet that says what
  // the idea will do and offers to do it.
  return (
    <div className="flex h-full flex-col">
      <TabHeader title={t("Ideas")}>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          aria-label={t("Refresh ideas")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-fg shadow-[0_1px_4px_rgba(0,0,0,0.14)] disabled:opacity-60 dark:border dark:border-border dark:shadow-none"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={19} />}
        </button>
      </TabHeader>
      <div className="flex-1 overflow-y-auto pb-6">
        {groups.map(({ area, ideas }, index) => (
          <section key={area.id}>
            {index > 0 && <h2 className="px-5 pt-[22px] pb-1 text-[20px] font-bold">{t(area.label)}</h2>}
            <ul>
              {ideas.map((idea) => (
                <li key={idea.title}>
                  <button type="button" onClick={() => setSelected({ idea, emoji: area.emoji })} className="flex w-full items-start gap-4 px-5 py-3.5 text-left active:bg-surface-2/70">
                    <span className="flex w-10 shrink-0 justify-center text-[28px] leading-[34px]">{area.emoji}</span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-[16px] font-semibold leading-[22px]">{t(idea.title)}</span>
                      {idea.detail && <span className="line-clamp-4 block text-[13.5px] leading-[19px] text-muted">{t(idea.detail)}</span>}
                    </span>
                  </button>
                  <div className="ml-[76px] mr-5 border-b border-border/70" />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {data && (
          <div className="px-5 pt-4 text-[12.5px] text-muted">
            {data.source === "model" ? t("Generated {when}", { when: relativeTime(data.generated_at) }) : t("Starter ideas — refresh once {name} knows you better.", { name })}
          </div>
        )}
        {!data && loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted">
            <Loader2 className="animate-spin" size={18} /> {t("Thinking about what I could do for you…")}
          </div>
        )}
      </div>

      <Sheet open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <div className="px-1 pb-2">
            <div className="flex items-center gap-3">
              <span className="text-[30px] leading-none">{selected.emoji}</span>
              <h3 className="flex-1 text-[18px] font-bold leading-6">{t(selected.idea.title)}</h3>
            </div>
            {selected.idea.detail && <p className="mt-3 text-[15px] leading-[22px]">{t(selected.idea.detail)}</p>}
            <div className="mt-3.5 flex items-center gap-1.5 text-[13px] text-muted">
              <MessageCircle size={16} /> {t("Starts a conversation")}
            </div>
            <button type="button" onClick={() => sendIdea(selected.idea)} className="mt-[22px] flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-accent-fg">
              <MessageCircle size={18} /> {t("Send to chat")}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function groupByArea(ideas: Idea[]): Array<{ area: (typeof AREAS)[number]; ideas: Idea[] }> {
  const fallback = AREAS[AREAS.length - 1];
  const out = AREAS.map((area) => ({ area, ideas: [] as Idea[] }));
  for (const idea of ideas) {
    const hit = out.find((g) => g.area.id === (idea.area || fallback.id)) ?? out[out.length - 1];
    hit.ideas.push(idea);
  }
  return out.filter((g) => g.ideas.length > 0);
}
