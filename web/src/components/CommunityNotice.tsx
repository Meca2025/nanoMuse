import { Bug, Github, HeartHandshake } from "lucide-react";
import { useT } from "../i18n";
import { cx } from "../util";

export const REPO_URL = "https://github.com/nano-muse/nanoMuse";
export const ISSUES_URL = "https://github.com/nano-muse/nanoMuse/issues/new/choose";

/**
 * The community notice, said plainly wherever the project is introduced: free, open source,
 * non-profit; what the daily allowance is and who pays; what is kept; and the invitation to
 * report bugs, ask for features and send fixes — with the repository one click away.
 */
export function CommunityNotice({ compact = false, className }: { compact?: boolean; className?: string }) {
  const t = useT();
  return (
    <section className={cx("rounded-[22px] border border-accent/25 bg-accent/[0.06] p-4 dark:bg-accent/[0.10]", className)}>
      <div className="flex items-center gap-2 text-[13.5px] font-semibold">
        <HeartHandshake size={16} className="text-accent" />
        {t("Free, open source, non-profit")}
      </div>
      <p className={cx("mt-1.5 leading-relaxed text-fg/85", compact ? "text-[12.5px]" : "text-[13px]")}>
        {t(
          "nanoMuse is a non-profit open-source community project — free, forever. Sign in with an e-mail and the model comes with a free allowance: ¥10 per account, paid by the developer; invite a friend for ¥5 more, join the co-creation programme for ¥10 more; when it is gone, use your own key (Alibaba Cloud Bailian is a good start). Messages are not stored unless you choose to contribute them; nothing is sold. Delete the account whenever you like.",
        )}
      </p>
      <p className={cx("mt-1.5 leading-relaxed text-fg/85", compact ? "text-[12.5px]" : "text-[13px]")}>
        {t("Found a bug, want a feature, or wrote a fix? Issues and pull requests are welcome — let's build it together.")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-medium">
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1.5 text-bg hover:opacity-90">
          <Github size={13} /> {t("Star on GitHub")}
        </a>
        <a href={ISSUES_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-fg hover:bg-surface-2">
          <Bug size={13} /> {t("Report a bug or ask for a feature")}
        </a>
      </div>
    </section>
  );
}
