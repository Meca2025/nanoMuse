import { getLocale } from '@/os/locale';
import { useAppStrings } from '@/os/useAppStrings';

/**
 * The app's words, in Chinese and English, the way every MobileGym app keeps them
 * (`res/strings.ts` + `res/strings.en.ts`, `useAppStrings`). The phone's language decides;
 * code outside React (the bridge, the stage) asks `t()` for the current set. Where the Android
 * app has the same string (`nm_hands_*`, `nm_welcome_*`) the wording is its.
 */
export const strings = {
  // ---- the setup page
  setup_title_hosted: '认识你的 Muse',
  setup_title_own: '连接你的 Muse',
  setup_sub_hosted: '一个属于你的 nanoMuse，跑在体验服务器上。它可以操作这台手机里的应用。',
  setup_sub_own: 'nanoMuse 运行在你的电脑上，把这台手机指向它。',
  setup_or_own: '或者连接你自己的 nanoMuse',
  setup_address: '服务器地址或链接',
  setup_token: '访问令牌（链接里没有时填）',
  setup_token_hint: 'nanomuse serve 启动时会打印',
  setup_need_address: '请输入服务器地址。',
  setup_refused: '服务器拒绝了这个令牌。请从 nanomuse serve 打印的链接里复制。',
  setup_unreachable: '连不上 %s。这台电脑上的 nanomuse serve 在运行吗？',
  setup_connecting: '连接中…',
  setup_connect: '连接',
  setup_gui_title: '允许 nanoMuse 操作这台手机',
  setup_gui_detail:
    '它可以读取这块屏幕，在这里的应用里点击、输入、滑动——前提是它自己的「手机」开关（设置 → 手机）也打开了。付款、发送、删除之前它会先问你。',
  setup_computer_title: '在电脑上',
  setup_computer_detail:
    'nanomuse serve 会打印一个带一次性令牌的链接和二维码，把链接粘贴到这里。之后，待确认、提问和后台结果也会出现在这台手机的通知栏里。',
  hosted_title: '你在体验服务器上的 Muse',
  hosted_minutes: '%d 分钟内归你',
  hosted_a_while: '有一段时间归你',
  hosted_then_gone: '，之后它和里面的一切都会消失。',
  hosted_thinks_with: ' 用 %s 思考',
  hosted_in_use: '；现在 %d/%d 个在用。',
  hosted_own_key: '用我自己的模型密钥',
  hosted_own_key_detail: '这样就没有额度限制。密钥只在这个会话期间留在体验服务器上，不会被保存。',
  hosted_base_url: 'API 地址，例如 https://api.deepseek.com',
  hosted_model: '模型，例如 deepseek-flash',
  hosted_api_key: 'API 密钥',
  hosted_providers: '支持的服务商：%s。OpenAI 兼容的 chat completions。',
  hosted_failed: '启动你的 Muse 时出了点问题。',
  // the showcase server's refusals, by code (its own words are English)
  demo_unreachable: '连不上体验服务器。',
  demo_already_running: '你已经有一个 Muse 在跑了，先用完那个吧。',
  demo_full: '现在每个体验 Muse 都有人在用，过几分钟再试。',
  demo_daily_limit: '今天从这里开始的体验次数用完了。',
  demo_no_model: '这个体验服务器没有配置演示模型，请用你自己的密钥。',
  demo_byok_off: '这个体验服务器不接受自带密钥。',
  demo_provider_not_allowed: '不支持这个模型服务商。',
  demo_bad_provider: '模型 API 地址不对。',
  demo_start_failed: '你的 Muse 没能启动，再试一次。',
  demo_start_timeout: '你的 Muse 启动超时了，再试一次。',
  hosted_starting: '正在启动你的 Muse…',
  hosted_retry: '再试一次',
  hosted_start: '开始',
  // ---- the Muse page
  muse_demo_over: '你在体验服务器上的 Muse 已经结束，里面的一切也随之消失。',
  muse_refused: '服务器拒绝了这台手机的令牌。',
  muse_unreachable: '连不上 %s 上的 Muse，正在重试…',
  muse_new: '新的 Muse',
  muse_change_server: '更换服务器',
  // ---- notifications (the server's own titles, in the phone's language)
  notify_approval: '%s 等你确认',
  notify_question: '%s 有个问题想问你',
  notify_for: '用途：%s',
  notify_check_in: '%s · 跟进',
  notify_reminder: '%s · 提醒',
  notify_new_mail: '%s · 新邮件',
  notify_coming_up: '%s · 即将到来',
  notify_webhook: '%s · Webhook',
  // ---- the capsule and the stage (nm_hands_* on Android)
  hands_working: '%s 正在操作这台手机',
  hands_step: '第 %d 步',
  hands_looking: '正在看屏幕…',
  hands_stop: '停止',
  hands_continue: '继续',
  hands_open: '打开',
  hands_your_turn: '轮到你了',
  hands_your_turn_detail: '这一步请你自己完成，然后点「继续」。',
  hands_secret_field: '这是密码或验证码输入框，请你自己填好，然后点「继续」。',
  hands_approval_title: '等你确认',
  hands_approval_detail: '要点「%s」——请在 nanoMuse 里或通知中回答。',
  hands_approval_detail_plain: '请在 nanoMuse 里或通知中回答。',
  hands_question: '%s 有话要问你',
  hands_done: '完成',
  hands_stopped: '已停止',
  hands_typing: '输入 · %d 个字符',
  hands_tap: '点击',
  hands_double_tap: '双击',
  hands_long_press: '长按',
  hands_swipe: '滑动',
  hands_type: '输入',
  hands_enter: '回车',
  hands_back: '返回',
  hands_home: '回到桌面',
  hands_recents: '最近任务',
  hands_open_app: '打开应用',
  hands_wait: '等一下',
};

export type NanoMuseStringKey = keyof typeof strings;

export const stringsEn: Record<NanoMuseStringKey, string> = {
  setup_title_hosted: 'Meet your Muse',
  setup_title_own: 'Connect your Muse',
  setup_sub_hosted: 'A private nanoMuse for you, on the showcase server. It can operate the apps on this phone.',
  setup_sub_own: 'nanoMuse runs on your computer. Point this phone at it.',
  setup_or_own: 'or connect to your own nanoMuse',
  setup_address: 'Server address or link',
  setup_token: 'Access token (if the link has none)',
  setup_token_hint: 'printed by nanomuse serve',
  setup_need_address: 'Enter the server address.',
  setup_refused: 'The server refused the token. Copy it from the link nanomuse serve prints.',
  setup_unreachable: 'Could not reach %s. Is nanomuse serve running on this machine?',
  setup_connecting: 'Connecting…',
  setup_connect: 'Connect',
  setup_gui_title: 'Let nanoMuse operate this phone',
  setup_gui_detail:
    'The agent may read this screen and tap, type and swipe in the apps here — when its own Phone switch (Settings → Phone) is on. It asks before paying, sending or deleting.',
  setup_computer_title: 'On the computer',
  setup_computer_detail:
    "nanomuse serve prints a link with a one-time token and a QR code. Paste the link here. Approvals, questions and background results then also show up in this phone's notification shade.",
  hosted_title: 'Your Muse on the showcase server',
  hosted_minutes: 'Yours for %d minutes',
  hosted_a_while: 'Yours for a while',
  hosted_then_gone: ', then it is gone with everything in it.',
  hosted_thinks_with: ' Thinks with %s',
  hosted_in_use: '; %d of %d in use right now.',
  hosted_own_key: 'Use my own model key',
  hosted_own_key_detail: 'No budget then. The key stays on the showcase server for the session and is never stored.',
  hosted_base_url: 'API base URL, e.g. https://api.deepseek.com',
  hosted_model: 'Model, e.g. deepseek-flash',
  hosted_api_key: 'API key',
  hosted_providers: 'Providers: %s. OpenAI-compatible chat completions.',
  hosted_failed: 'Something went wrong starting your Muse.',
  demo_unreachable: 'The showcase server cannot be reached.',
  demo_already_running: 'You already have a demo running. Finish that one first.',
  demo_full: 'Every demo Muse is taken right now. Try again in a few minutes.',
  demo_daily_limit: 'That is all the demo sessions for today from here.',
  demo_no_model: 'This showcase has no demo model configured; bring your own key.',
  demo_byok_off: 'Bringing your own key is turned off on this showcase.',
  demo_provider_not_allowed: 'That model provider is not supported.',
  demo_bad_provider: 'The model API address is not right.',
  demo_start_failed: 'Your Muse did not start; try again.',
  demo_start_timeout: 'Your Muse took too long to start; try again.',
  hosted_starting: 'Starting your Muse…',
  hosted_retry: 'Try again',
  hosted_start: 'Start',
  muse_demo_over: 'Your Muse on the showcase server has ended, and everything in it with it.',
  muse_refused: "The server refused this phone's token.",
  muse_unreachable: "Can't reach your Muse at %s. Retrying…",
  muse_new: 'New Muse',
  muse_change_server: 'Change server',
  notify_approval: '%s needs your approval',
  notify_question: '%s has a question',
  notify_for: 'For: %s',
  notify_check_in: '%s · check-in',
  notify_reminder: '%s · reminder',
  notify_new_mail: '%s · new mail',
  notify_coming_up: '%s · coming up',
  notify_webhook: '%s · webhook',
  hands_working: '%s is using this phone',
  hands_step: 'Step %d',
  hands_looking: 'Looking at the screen…',
  hands_stop: 'Stop',
  hands_continue: 'Continue',
  hands_open: 'Open',
  hands_your_turn: 'Your turn',
  hands_your_turn_detail: 'Do this part yourself, then tap Continue.',
  hands_secret_field: 'A password or code field — please fill it in yourself, then tap Continue.',
  hands_approval_title: 'Waiting for your approval',
  hands_approval_detail: 'Tap “%s” — answer in nanoMuse or in the notification.',
  hands_approval_detail_plain: 'Answer in nanoMuse or in the notification.',
  hands_question: '%s has a question',
  hands_done: 'Done',
  hands_stopped: 'Stopped',
  hands_typing: 'Typing · %d characters',
  hands_tap: 'Tap',
  hands_double_tap: 'Double-tap',
  hands_long_press: 'Long press',
  hands_swipe: 'Swipe',
  hands_type: 'Type',
  hands_enter: 'Enter',
  hands_back: 'Back',
  hands_home: 'Home',
  hands_recents: 'Recents',
  hands_open_app: 'Open an app',
  hands_wait: 'Wait',
};

/** The strings for React: they follow the phone's language setting. */
export function useNanoMuseStrings() {
  return useAppStrings(strings, stringsEn);
}

/** The current set, for code that is not a component. */
export function current(): Record<NanoMuseStringKey, string> {
  return getLocale() === 'zh-Hans' ? strings : stringsEn;
}

/** `%s` / `%d` filled in, in order. */
export function fmt(template: string, ...args: Array<string | number>): string {
  let i = 0;
  return template.replace(/%[sd]/g, () => String(args[i++] ?? ''));
}

const ACTION_KEYS: Record<string, NanoMuseStringKey> = {
  tap: 'hands_tap',
  double_tap: 'hands_double_tap',
  long_press: 'hands_long_press',
  swipe: 'hands_swipe',
  type: 'hands_type',
  enter: 'hands_enter',
  back: 'hands_back',
  home: 'hands_home',
  recents: 'hands_recents',
  open_app: 'hands_open_app',
  wait: 'hands_wait',
};

const KEY_CAPS: Record<string, string> = { enter: '↵', back: '◁', home: '○', recents: '▢' };

/** The words the stage and the bridge need, with the numbers and names filled in. */
export function t() {
  const s = current();
  return {
    ...s,
    hands_working: (name: string) => fmt(s.hands_working, name),
    hands_step: (n: number) => fmt(s.hands_step, n),
    hands_typing: (n: number) => fmt(s.hands_typing, n),
    hands_approval_detail: (what: string) => fmt(s.hands_approval_detail, what),
    hands_question: (name: string) => fmt(s.hands_question, name),
    hands_action: (action: string) => (ACTION_KEYS[action] ? s[ACTION_KEYS[action]] : action),
    hands_key: (action: string) => KEY_CAPS[action] ?? action,
  };
}
