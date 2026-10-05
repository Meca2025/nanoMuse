import { describe, expect, it } from "vitest";
import {
  askDue,
  askId,
  canAsk,
  DEFAULT_POLICY,
  KEYS,
  type KV,
  migrateLedger,
  normalizePolicy,
  readLedger,
  recordAsk,
  recordDay,
  recordStarred,
  recordTask,
} from "./nudges";

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 9, 5, 12);

function mem(seed: Record<string, string> = {}): KV {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe("normalizePolicy", () => {
  it("keeps the defaults where the relay makes no sense", () => {
    expect(normalizePolicy(null)).toEqual(DEFAULT_POLICY);
    expect(normalizePolicy({ star: [] })).toEqual(DEFAULT_POLICY);
    const p = normalizePolicy({
      version: 4,
      star: { enabled: false, url: "ftp://x", cooldown_days: 1, max_asks: 99, moments: { tasks: [10, 3, 3], days_used: "7", goal_done: false } },
    });
    expect(p.version).toBe(4);
    expect(p.star.enabled).toBe(false);
    expect(p.star.url).toBe(DEFAULT_POLICY.star.url);
    expect(p.star.cooldown_days).toBe(1);
    expect(p.star.max_asks).toBe(4);
    expect(p.star.moments.tasks).toEqual([3, 10]);
    expect(p.star.moments.days_used).toEqual([7, 30]);
    expect(p.star.moments.goal_done).toBe(false);
    expect(p.star.moments.signed_in).toBe(true);
  });
});

describe("the gate", () => {
  it("asks at the policy's steps, once each, with the cooldown and the cap", () => {
    const kv = mem();
    let l = readLedger(kv);
    expect(askDue("tasks", DEFAULT_POLICY, l, T0, 2)).toBe(false);
    expect(askDue("tasks", DEFAULT_POLICY, l, T0, 3)).toBe(true);
    l = recordAsk(kv, askId("tasks", 3), T0);
    expect(l.asks).toBe(1);
    expect(askDue("tasks", DEFAULT_POLICY, l, T0, 3)).toBe(false); // asked already
    // within the cooldown nothing else is asked, whatever the moment
    expect(askDue("goal_done", DEFAULT_POLICY, l, T0 + 3 * DAY)).toBe(false);
    expect(askDue("goal_done", DEFAULT_POLICY, l, T0 + 7 * DAY)).toBe(true);
    recordAsk(kv, "goal_done", T0 + 7 * DAY);
    recordAsk(kv, "new_look", T0 + 14 * DAY);
    recordAsk(kv, askId("days_used", 7), T0 + 21 * DAY);
    l = readLedger(kv);
    expect(l.asks).toBe(4);
    // the lifetime cap: the tenth task comes and goes without a word
    expect(askDue("tasks", DEFAULT_POLICY, l, T0 + 60 * DAY, 10)).toBe(false);
    expect(canAsk({ ...DEFAULT_POLICY, star: { ...DEFAULT_POLICY.star, max_asks: 5 } }, l, T0 + 60 * DAY)).toBe(true);
  });

  it("stops for good once the person went to GitHub, and when the relay turns it off", () => {
    const kv = mem();
    recordStarred(kv);
    expect(askDue("signed_in", DEFAULT_POLICY, readLedger(kv), T0)).toBe(false);
    const off = normalizePolicy({ star: { enabled: false } });
    expect(askDue("signed_in", off, readLedger(mem()), T0)).toBe(false);
    const noGoal = normalizePolicy({ star: { moments: { goal_done: false } } });
    expect(askDue("goal_done", noGoal, readLedger(mem()), T0)).toBe(false);
    expect(askDue("exhausted", noGoal, readLedger(mem()), T0)).toBe(true);
  });

  it("recording an ask the second time changes nothing", () => {
    const kv = mem();
    recordAsk(kv, "signed_in", T0);
    const again = recordAsk(kv, "signed_in", T0 + DAY);
    expect(again.asks).toBe(1);
    expect(again.lastAsk).toBe(T0);
  });
});

describe("the counters", () => {
  it("counts tasks", () => {
    const kv = mem();
    expect(recordTask(kv)).toBe(1);
    expect(recordTask(kv)).toBe(2);
    expect(readLedger(kv).tasks).toBe(2);
  });

  it("counts distinct calendar days the app was opened", () => {
    const kv = mem();
    const monday = new Date(2026, 9, 5, 9);
    expect(recordDay(kv, monday)).toEqual({ days: 1, fresh: true });
    expect(recordDay(kv, new Date(2026, 9, 5, 22))).toEqual({ days: 1, fresh: false });
    expect(recordDay(kv, new Date(2026, 9, 6, 0, 5))).toEqual({ days: 2, fresh: true });
    for (let d = 7; d <= 11; d++) recordDay(kv, new Date(2026, 9, d));
    const { days } = recordDay(kv, new Date(2026, 9, 12));
    expect(days).toBe(8);
    expect(askDue("days_used", DEFAULT_POLICY, readLedger(kv), T0, 7)).toBe(true);
    expect(askDue("days_used", DEFAULT_POLICY, readLedger(kv), T0, 8)).toBe(false);
  });
});

describe("migration from the first version", () => {
  it("turns the per-moment flags into asks made, keeps the task count, runs once", () => {
    const kv = mem({ "nm.star.first_task": "1", "nm.star.signed_in": "1", "nm.star.tasks": "6", "nm.star.starred": "0" });
    const l = migrateLedger(kv);
    expect(l.tasks).toBe(6);
    expect(l.asks).toBe(2);
    expect(l.shown.sort()).toEqual(["first_task", "signed_in"]);
    expect(l.lastAsk).toBeNull(); // unknown when: the cooldown does not pretend to know
    expect(kv.getItem("nm.star.first_task")).toBeNull();
    expect(kv.getItem(KEYS.migrated)).toBe("1");
    // the old flag does not come back as a new ask; the next steps still do
    expect(askDue("signed_in", DEFAULT_POLICY, l, T0)).toBe(false);
    expect(askDue("tasks", DEFAULT_POLICY, l, T0, 10)).toBe(true);
    // running again changes nothing, even if an old key reappears
    kv.setItem("nm.star.new_look", "1");
    expect(migrateLedger(kv).asks).toBe(2);
  });

  it("keeps a starred browser starred", () => {
    const kv = mem({ "nm.star.starred": "1" });
    expect(migrateLedger(kv).starred).toBe(true);
    expect(readLedger(kv).starred).toBe(true);
  });
});
