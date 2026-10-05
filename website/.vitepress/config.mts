// The nanoMuse docs site: VitePress over ../docs. Nothing is copied — the pages under
// docs/ are the source, and this file only says how they are arranged and where the
// links that leave docs/ go.
//
//   npm run docs:dev      # http://127.0.0.1:5173/<base>
//   npm run docs:build    # .vitepress/dist, also the dead-link check
//   DOCS_BASE=/docs/ npm run docs:build   # for nanomuse.cn/docs/
//
// DOCS_BASE defaults to /nanoMuse/docs/ — the project pages at nano-muse.github.io keep
// site/index.html (the redirect to nanomuse.cn) and site/legacy.html at the root, and the
// docs sit beside them under /docs/.
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type DefaultTheme } from 'vitepress'

const REPO = 'https://github.com/nano-muse/nanoMuse'
const base = process.env.DOCS_BASE ?? '/nanoMuse/docs/'

// Directories under docs/ that are not pages of the site: task briefs and traces are
// working notes, the archive is the Python line's record, the release notes and the
// translated READMEs are read on GitHub. Links into them become GitHub links.
const notOnTheSite = ['tasks/', 'archive/', 'traces/', 'briefs/', 'releases/', 'readme/']
const notPages = ['release-notes-template.md', 'launch-checklist.md']

/** `../nanomuse/config.py` from docs/cloud.md → a GitHub URL; a docs page stays a docs link. */
function githubFor(href: string, fromPage: string): string | undefined {
  if (/^([a-z]+:|\/\/|#)/i.test(href)) return undefined // absolute, mailto:, anchors
  const [path, rest = ''] = href.split(/(?=[#?])/, 2)
  if (!path) return undefined
  const inDocs = posix.normalize(posix.join(posix.dirname(fromPage), path))
  if (inDocs.startsWith('../')) {
    const inRepo = posix.normalize(posix.join('docs', inDocs))
    if (inRepo.startsWith('../')) return undefined
    const kind = inRepo.endsWith('/') || !posix.extname(inRepo) ? 'tree' : 'blob'
    return `${REPO}/${kind}/main/${inRepo}${rest}`
  }
  const excluded = notOnTheSite.some((d) => inDocs.startsWith(d)) || notPages.includes(inDocs)
  const notMarkdown = posix.extname(inDocs) !== '' && posix.extname(inDocs) !== '.md'
  const directory = inDocs.endsWith('/') || posix.extname(inDocs) === ''
  if (excluded || notMarkdown || directory) {
    const kind = directory ? 'tree' : 'blob'
    return `${REPO}/${kind}/main/docs/${inDocs}${rest}`
  }
  return undefined
}

// Vue reads `{{ … }}` in page text as an expression; the docs mean it literally
// (`{{vault:NAME}}`). Fences are already left alone by VitePress.
const literal = (html: string) => html.replaceAll('{{', '&#123;&#123;').replaceAll('}}', '&#125;&#125;')

// `<host>` or `<version>` in prose is a placeholder, not an element; Vue would want it closed.
// Real HTML in the pages (images, details, line breaks) passes through.
const htmlTags = new Set(['a', 'abbr', 'b', 'br', 'code', 'details', 'div', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'iframe', 'img', 'kbd', 'li', 'ol', 'p', 'picture', 'pre', 'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul', 'video'])
const bare = /^([a-z]+:|\/\/|\/|\.\.?\/|#)/i
const explicitSrc = (html: string) => html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (_, pre, src, post) => `${pre}${bare.test(src) ? src : `./${src}`}${post}`)
function placeholderOrHtml(raw: string): string {
  const tag = /^<\/?([a-zA-Z][\w-]*)/.exec(raw)?.[1]?.toLowerCase()
  if (raw.startsWith('<!--') || (tag && htmlTags.has(tag))) return explicitSrc(raw)
  return raw.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

const getStarted: DefaultTheme.SidebarItem[] = [
  { text: 'Android', link: '/android' },
  { text: 'iPhone and iPad', link: '/ios' },
  { text: 'The desktop app', link: '/desktop' },
  { text: 'Terminal and the web console', link: '/local-runtime' },
  { text: 'One account, all your devices', link: '/trial' },
  { text: 'Your own model key', link: '/own-key' },
  { text: 'Troubleshooting', link: '/troubleshooting' },
]

const useIt: DefaultTheme.SidebarItem[] = [
  { text: 'Every device', link: '/every-device' },
  { text: 'The screen as a hand', link: '/gui' },
  { text: 'Computer use, on the desktop', link: '/desktop-muse#computer-use' },
  { text: 'Feed, Ideas, Goals, Library', link: '/desktop-muse#the-rail-s-other-rooms-feed-ideas-goals-library' },
  { text: 'Memory and goals from the terminal', link: '/cli' },
  { text: 'Connectors', link: '/configuration#connectors' },
  { text: 'Chat apps: Feishu, DingTalk, WeCom, Telegram', link: '/channels' },
  { text: 'Coding agents', link: '/coding-agents' },
  { text: 'The avatar studio', link: '/avatar' },
  { text: 'The browser', link: '/browser' },
  { text: 'Chinese services without a screen', link: '/services' },
  { text: 'The showcase', link: '/showcase' },
]

const runIt: DefaultTheme.SidebarItem[] = [
  { text: 'Run nanoMuse yourself', link: '/self-hosting' },
  { text: 'The runtime in Docker', link: '/deployment' },
  { text: 'Configuration', link: '/configuration' },
  { text: 'nanoMuse Cloud, the relay', link: '/cloud' },
]

const understandIt: DefaultTheme.SidebarItem[] = [
  { text: 'Architecture', link: '/architecture' },
  { text: 'Sentinel', link: '/sentinel' },
  { text: 'Privacy', link: '/privacy' },
  { text: 'The hub', link: '/hub' },
  { text: 'What nanoMuse takes from Muse', link: '/design' },
  { text: 'nanoMuse on DeepSeek Harness', link: '/harness' },
  { text: 'The phone’s own capabilities', link: '/device' },
  { text: 'The app, as designed', link: '/app' },
  { text: 'Brand', link: '/brand' },
  { text: 'Calls (removed)', link: '/calls' },
]

const contribute: DefaultTheme.SidebarItem[] = [
  { text: 'Contributing', link: `${REPO}/blob/main/CONTRIBUTING.md` },
  { text: 'AGENTS.md', link: `${REPO}/blob/main/AGENTS.md` },
  { text: 'Roadmap', link: '/roadmap' },
  { text: 'Parity between the clients', link: '/parity' },
  { text: 'Release notes', link: `${REPO}/releases` },
  { text: 'Changelog', link: `${REPO}/blob/main/CHANGELOG.md` },
]

export default defineConfig({
  title: 'nanoMuse',
  description: 'An open-source personal agent for every device you own.',
  lang: 'en',
  base,
  srcDir: '../docs',
  srcExclude: ['tasks/**', 'archive/**', 'traces/**', 'briefs/**', 'releases/**', 'readme/**', ...notPages],
  cleanUrls: true,
  lastUpdated: false,
  // Vite's root is srcDir, which has no node_modules above it; point `vue` at ours.
  vite: { resolve: { alias: [{ find: /^vue(\/.*)?$/, replacement: `${fileURLToPath(new URL('../node_modules/vue', import.meta.url))}$1` }] } },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${REPO.replace('github.com', 'raw.githubusercontent.com')}/main/assets/brand/nanomuse-icon.svg` }],
  ],
  // Internal links are checked at build time. The link_open rule below turns every link that
  // leaves docs/ into a GitHub URL, so nothing should remain here; add a pattern only for a
  // code link the rule cannot resolve.
  ignoreDeadLinks: [],
  markdown: {
    config(md) {
      const renderText = md.renderer.rules.text!
      const renderCode = md.renderer.rules.code_inline!
      md.renderer.rules.text = (...args) => literal(renderText(...args))
      md.renderer.rules.code_inline = (...args) => literal(renderCode(...args))
      md.renderer.rules.html_inline = (tokens, idx) => literal(placeholderOrHtml(tokens[idx].content))
      md.renderer.rules.html_block = (tokens, idx, _options, env) => {
        const raw = tokens[idx].content
        const tag = /^<\/?([a-zA-Z][\w-]*)/.exec(raw)?.[1]?.toLowerCase()
        if (raw.startsWith('<!--') || (tag && htmlTags.has(tag))) return explicitSrc(raw)
        // a paragraph that happens to start with a placeholder: render it as prose
        return `<p>${md.renderInline(raw.trimEnd(), env)}</p>\n`
      }
      // `![](screenshots/x.png)` is a relative path to markdown; to Vite a bare specifier is a
      // package. Make the relative form explicit so the picture is bundled.
      const renderImage = md.renderer.rules.image!
      md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const src = tokens[idx].attrGet('src')
        if (src && !/^([a-z]+:|\/\/|\/|\.\.?\/)/i.test(src)) tokens[idx].attrSet('src', `./${src}`)
        return renderImage(tokens, idx, options, env, self)
      }
      const renderLink = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const href = token.attrGet('href')
        const page: string | undefined = env?.relativePath
        if (href && page) {
          const github = githubFor(href, page)
          if (github) {
            token.attrSet('href', github)
            token.attrSet('target', '_blank')
            token.attrSet('rel', 'noreferrer')
          }
        }
        return renderLink(tokens, idx, options, env, self)
      }
    },
  },
  themeConfig: {
    logo: `${REPO.replace('github.com', 'raw.githubusercontent.com')}/main/assets/brand/nanomuse-icon.svg`,
    siteTitle: 'nanoMuse docs',
    nav: [
      { text: 'Get started', link: '/android' },
      { text: 'Run it yourself', link: '/self-hosting' },
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'nanomuse.cn', link: 'https://nanomuse.cn/' },
    ],
    sidebar: [
      { text: 'Get started', items: getStarted },
      { text: 'Use it', items: useIt },
      { text: 'Run it yourself', items: runIt },
      { text: 'Understand it', collapsed: true, items: understandIt },
      { text: 'Contribute', collapsed: true, items: contribute },
    ],
    socialLinks: [{ icon: 'github', link: REPO }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    footer: {
      message: 'GPL-3.0-or-later. nanoMuse is an independent community project, not affiliated with Meta.',
      copyright: 'The nanoMuse contributors',
    },
  },
})
