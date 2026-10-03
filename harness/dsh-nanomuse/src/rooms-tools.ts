/**
 * The rooms, from inside a chat: the tools that let the agent write into the
 * person's Goals, Feed and Library (`goals_room_update`, `feed_post`, `library_add`),
 * and the prompt context that tells it what the goals are, so "how is my
 * flight-price goal doing?" needs no room open. A preset row, like Reach; it
 * needs the rooms service (`dsh-nanomuse/rooms`) and does nothing without it.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from './rooms.ts'
import { AREAS } from './rooms.ts'

export const name = 'nanomuse-rooms-tools'
export const inject = ['tools', 'nanomuseRooms']

export function apply(ctx: Context): void {
  const rooms = ctx.nanomuseRooms

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'goals_room_update',
          description: "Update one of the person's goals in their Goals room (nanoMuse's room, not this session's own goal — that is update_goal): the one-line status, a timeline entry, the title, or mark it done/paused/tracking. Call it whenever something happens on a goal worth noting — a check done, a price seen, a step finished. The goals and their ids are in your context.",
          parameters: {
            goal_id: { type: 'string', required: true, description: 'The goal id from your context, or its exact title.' },
            summary: { type: 'string', description: "The goal's status in one line, as it should read under the title (e.g. 'Lowest fare today USD 879.90, still above the ¥4,000 line')." },
            activity_title: { type: 'string', description: 'A timeline entry, one line (what happened).' },
            activity_text: { type: 'string', description: 'The entry’s detail, one or two sentences.' },
            title: { type: 'string', description: 'A better title for the goal.' },
            status: { type: 'string', description: 'tracking, done or paused.' },
          },
          output: {
            schema: { type: 'object', properties: { goal_id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' } }, additionalProperties: false },
            render: (_args, value) => [{ type: 'text', text: `Goal "${value.title}" updated (${value.status}).` }],
          },
          async execute(args) {
            const goal = await rooms.updateGoal(args.goal_id, {
              ...(args.summary ? { summary: args.summary } : {}),
              ...(args.title ? { title: args.title } : {}),
              ...(args.status ? { status: args.status } : {}),
              ...(args.activity_title ? { activity: { title: args.activity_title, text: args.activity_text ?? '' } } : {}),
            })
            return { goal_id: goal.id, title: goal.title, status: goal.status }
          },
          presentCall: (args) => ({ card: 'generic', title: `Update goal ${args.goal_id || ''}`, kind: 'other', rawInput: args }),
        }),
      ),
    'nanomuse rooms: goals_room_update',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'feed_post',
          description: "Write a post into the person's Feed (their 动态 room): something they asked you to put there, a digest you made, a finding worth keeping. Markdown body, links inline. Not for ordinary replies.",
          parameters: {
            title: { type: 'string', required: true, description: 'At most 12 words.' },
            body: { type: 'string', required: true, description: '60-200 words of Markdown; no heading.' },
            area: { type: 'string', description: `One of ${AREAS.join(', ')}.` },
            emoji: { type: 'string', description: 'One emoji that fits.' },
            image: { type: 'string', description: 'A direct https image URL to show with it, if there is one.' },
          },
          output: {
            schema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } }, additionalProperties: false },
            render: (_args, value) => [{ type: 'text', text: `Posted to the feed: ${value.title}` }],
          },
          async execute(args) {
            const post = await rooms.addPost({ title: args.title, body: args.body, ...(args.area ? { area: args.area } : {}), ...(args.emoji ? { emoji: args.emoji } : {}), ...(args.image ? { image: args.image } : {}) })
            return { id: post.id, title: post.title }
          },
          presentCall: (args) => ({ card: 'generic', title: `Post to the feed: ${args.title || ''}`, kind: 'other', rawInput: args }),
        }),
      ),
    'nanomuse rooms: feed_post',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'library_add',
          description: "Put a file into the person's Library (their 构件 room): a document, a web page, an image, a video or audio you made or found for them. `present` does this too for files you deliver at the end of a task; use this for files you want listed without delivering them.",
          parameters: {
            path: { type: 'string', required: true, description: 'Absolute path, or relative to the working directory.' },
            description: { type: 'string', description: 'What it is, in a few words.' },
          },
          output: {
            schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string' } }, additionalProperties: false },
            render: (_args, value) => [{ type: 'text', text: `In the Library: ${value.name} (${value.kind}).` }],
          },
          async execute(args, exec) {
            const item = await rooms.addToLibrary(args.path, args.description ?? '', exec.agent?.session.id ?? '', exec.agent?.session.header.cwd)
            if (!item) throw new Error(`No file at ${args.path}.`)
            return { id: item.id, name: item.name, kind: item.kind }
          },
          presentCall: (args) => ({ card: 'generic', title: `Add to the Library: ${args.path || ''}`, kind: 'other', rawInput: args }),
        }),
      ),
    'nanomuse rooms: library_add',
  )

  ctx.inject(['systemPrompt'], (ctx) => {
    ctx.effect(
      () =>
        ctx.systemPrompt.context({
          name: 'nanomuse-rooms',
          order: 55,
          text: () => {
            const goals = rooms.goals
            const lines: string[] = []
            if (goals.length) {
              lines.push("The person's goals (their Goals room; update them with goals_room_update):")
              for (const goal of goals.slice(0, 12)) lines.push(`- ${goal.id} · ${goal.title} (${goal.category}, ${goal.status})${goal.summary ? `: ${goal.summary}` : ''}`)
            } else {
              lines.push('The person has no goals in their Goals room yet; when they state a long-term aim, offer to track it there (they create it from the room; you then keep it updated with goals_room_update).')
            }
            if (rooms.feedInstructions) lines.push(`What the person wants in their Feed: ${rooms.feedInstructions.slice(0, 300)}`)
            return lines.join('\n')
          },
        }),
      'nanomuse rooms: prompt context',
    )
  })
}
