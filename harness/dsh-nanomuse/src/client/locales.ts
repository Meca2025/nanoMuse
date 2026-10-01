/** The words of the nanoMuse browser half, English and Chinese. */

export const en = {
  nav: 'nanoMuse Cloud',
  brand: 'nanoMuse',
  title: 'nanoMuse Cloud',
  intro: 'One account, every device. Sign in with a mainland phone number or an e-mail; the model comes with the account.',
  identifier: 'Phone number or e-mail',
  identifierHint: 'A mainland China number gets an SMS; anything else, an e-mail.',
  sendCode: 'Send code',
  sending: 'Sending…',
  code: 'Six-digit code',
  codeSentTo: 'A code was sent to {identifier}.',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  back: 'Use another number or address',
  signedInAs: 'Signed in as {hint} ({channel})',
  member: 'member',
  tokensLeft: '{remaining} tokens left of {granted}',
  tokensUnlimited: 'Model use is not metered on this account.',
  models: 'Models the account offers: {models}',
  modelsNone: 'The account offers no chat model right now.',
  pickerNote: 'They are in the model picker as “nanoMuse Cloud”; selecting one makes it the default for new sessions.',
  refresh: 'Refresh',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  relay: 'Relay: {baseURL}',
  loading: 'Loading…',
  failed: 'That did not work: {message}',
  phone: 'phone',
  email: 'e-mail',
}

export const zh: typeof en = {
  nav: 'nanoMuse 账号',
  brand: 'nanoMuse',
  title: 'nanoMuse 账号',
  intro: '一个账号，每台设备。用中国大陆手机号或邮箱登录，模型跟着账号来。',
  identifier: '手机号或邮箱',
  identifierHint: '中国大陆手机号收短信验证码，其他的发到邮箱。',
  sendCode: '发送验证码',
  sending: '发送中…',
  code: '六位验证码',
  codeSentTo: '验证码已发到 {identifier}。',
  signIn: '登录',
  signingIn: '登录中…',
  back: '换一个手机号或邮箱',
  signedInAs: '已登录：{hint}（{channel}）',
  member: '会员',
  tokensLeft: '额度还剩 {remaining} / {granted} tokens',
  tokensUnlimited: '这个账号的模型用量不计费。',
  models: '账号提供的模型：{models}',
  modelsNone: '账号目前没有可用的对话模型。',
  pickerNote: '它们在模型选择器里叫「nanoMuse Cloud」；选一个，新会话就默认用它。',
  refresh: '刷新',
  signOut: '退出登录',
  signingOut: '退出中…',
  relay: '中转：{baseURL}',
  loading: '加载中…',
  failed: '没成功：{message}',
  phone: '手机号',
  email: '邮箱',
}

export type Words = keyof typeof en

/** Fill `{name}` holes; the harness translator does the same, this is for our own strings. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (hole, key: string) => (key in values ? String(values[key]) : hole))
}
