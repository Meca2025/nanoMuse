import { getLocale } from '@/os/locale';
import { useAppStrings } from '@/os/useAppStrings';

/**
 * The app's words, in Chinese and English, the way every MobileGym app keeps them
 * (`res/strings.ts` + `res/strings.en.ts`, `useAppStrings`). The phone's language decides;
 * code outside React (the bridge, the stage) asks `t()` for the current set. Where the Android
 * app has the same string (`nm_hands_*`, `nm_welcome_*`) the wording is its.
 */
export const strings = {
  // ---- the welcome page (nm_setup_* / nm_welcome_* on Android)
  setup_title: '欢迎使用 nanoMuse',
  welcome_tagline: '一个开源的个人智能体，装在你的每一台设备上。',
  welcome_feat_chat: '对话、图片、视频',
  welcome_feat_chat_sub: '能力不错的模型，图片与视频生成，工具、技能和记忆，都在你的手机上',
  welcome_feat_hands: 'Hands：替你操作手机',
  welcome_feat_hands_sub: '订车票、点外卖、在应用里查东西——你全程看着，随时可以停',
  welcome_feat_reach: 'Reach：从手机使用你的电脑',
  welcome_feat_reach_sub: '配对一台 Mac、Windows 或 Linux 电脑，在手机上派活给它',
  setup_start: '开始',
  setup_own_key: '我有自己的 API key',
  setup_own_server: '连接自己的 nanoMuse',
  // the Muse on the showcase server
  hosted_fine_print: '体验服务器上的 Muse，%d 分钟内归你，之后连同里面的一切一起消失。',
  hosted_fine_print_a_while: '体验服务器上的 Muse，归你一段时间，之后连同里面的一切一起消失。',
  hosted_showcase_model: '用体验服务器的模型',
  hosted_key_fine_print: 'key 只在这次会话期间留在体验服务器上，不保存；也没有额度限制。',
  hosted_base_url: 'API 地址，例如 https://api.deepseek.com',
  hosted_model: '模型，例如 deepseek-flash',
  hosted_api_key: 'API key',
  hosted_failed: '启动你的 Muse 时出了点问题。',
  // ---- a nanoMuse of one's own
  setup_title_own: '连接你的 Muse',
  setup_sub_own: '把这台手机指向你电脑上的 nanoMuse。',
  setup_address: '服务器地址或链接',
  setup_token: '访问令牌（链接里没有时填）',
  setup_token_hint: 'nanomuse serve 启动时会打印',
  setup_own_fine_print: 'nanomuse serve 打印的链接里带着令牌，粘贴链接就够了。',
  setup_need_address: '请输入服务器地址。',
  setup_refused: '服务器拒绝了这个令牌。请从 nanomuse serve 打印的链接里复制。',
  setup_unreachable: '连不上 %s。这台电脑上的 nanomuse serve 在运行吗？',
  setup_connecting: '连接中…',
  setup_connect: '连接',
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
  hands_scroll_up: '向上滚动',
  hands_scroll_down: '向下滚动',
  hands_scroll_left: '向左滚动',
  hands_scroll_right: '向右滚动',
  hands_type: '输入',
  hands_enter: '回车',
  hands_back: '返回',
  hands_home: '回主屏',
  hands_recents: '最近任务',
  hands_open_app: '打开 %s',
  hands_wait: '等 %d 秒',
};

export type NanoMuseStringKey = keyof typeof strings;

export const stringsEn: Record<NanoMuseStringKey, string> = {
  setup_title: 'Welcome to nanoMuse',
  welcome_tagline: 'An open-source personal agent for every device you own.',
  welcome_feat_chat: 'Chat, pictures, video',
  welcome_feat_chat_sub: 'A capable model, image and video generation, tools, skills and memory — on your phone',
  welcome_feat_hands: 'Hands: it uses your phone',
  welcome_feat_hands_sub: 'Books the train, orders the meal, looks something up in an app — you watch, and can stop it any time',
  welcome_feat_reach: 'Reach: your computers, from here',
  welcome_feat_reach_sub: 'Pair a Mac, Windows or Linux machine and give it work from the phone',
  setup_start: 'Start',
  setup_own_key: 'I have my own API key',
  setup_own_server: 'Connect your own nanoMuse',
  hosted_fine_print: 'A Muse on the showcase server, yours for %d minutes; then it is gone with everything in it.',
  hosted_fine_print_a_while: 'A Muse on the showcase server, yours for a while; then it is gone with everything in it.',
  hosted_showcase_model: "Use the showcase's model",
  hosted_key_fine_print: 'The key stays on the showcase server for this session only and is not stored; no budget either.',
  hosted_base_url: 'API base URL, e.g. https://api.deepseek.com',
  hosted_model: 'Model, e.g. deepseek-flash',
  hosted_api_key: 'API key',
  hosted_failed: 'Something went wrong starting your Muse.',
  setup_title_own: 'Connect your Muse',
  setup_sub_own: 'Point this phone at the nanoMuse on your computer.',
  setup_address: 'Server address or link',
  setup_token: 'Access token (if the link has none)',
  setup_token_hint: 'printed by nanomuse serve',
  setup_own_fine_print: 'The link nanomuse serve prints carries the token; pasting the link is enough.',
  setup_need_address: 'Enter the server address.',
  setup_refused: 'The server refused the token. Copy it from the link nanomuse serve prints.',
  setup_unreachable: 'Could not reach %s. Is nanomuse serve running on this machine?',
  setup_connecting: 'Connecting…',
  setup_connect: 'Connect',
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
  hands_long_press: 'Hold',
  hands_swipe: 'Swipe',
  hands_scroll_up: 'Scroll up',
  hands_scroll_down: 'Scroll down',
  hands_scroll_left: 'Scroll left',
  hands_scroll_right: 'Scroll right',
  hands_type: 'Type',
  hands_enter: 'Enter',
  hands_back: 'Back',
  hands_home: 'Home',
  hands_recents: 'Recents',
  hands_open_app: 'Open %s',
  hands_wait: 'Wait %d s',
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
};

const SCROLL_KEYS: Record<string, NanoMuseStringKey> = {
  up: 'hands_scroll_up',
  down: 'hands_scroll_down',
  left: 'hands_scroll_left',
  right: 'hands_scroll_right',
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
    hands_scroll: (direction: string) => s[SCROLL_KEYS[direction] ?? 'hands_swipe'],
    hands_open_app: (app: string) => fmt(s.hands_open_app, app),
    hands_wait: (seconds: number) => fmt(s.hands_wait, seconds),
    hands_key: (action: string) => KEY_CAPS[action] ?? action,
  };
}
