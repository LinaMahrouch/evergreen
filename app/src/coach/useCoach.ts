// The conversation with the coach: what was said, what it changed, and the loop that lets it
// look things up and edit the plan before it answers.
import { create } from 'zustand'
import { KEYS, readJson, readSecret, writeJson, writeSecret } from '@/store/storage'
import { useStore } from '@/store/useStore'
import { CoachError, DEFAULT_MODEL, MODELS, ask, type Block, type Message, type Model } from './client'
import { TOOLS, runTool, snapshot } from './tools'

/** One line of the chat as it is shown. */
export interface Line {
  id: string
  /** you: the person. coach: its words. change: something it did to the plan. error: a failed turn. */
  kind: 'you' | 'coach' | 'change' | 'error'
  text: string
}

interface Saved { messages: Message[]; lines: Line[]; model: Model }

// How many times in one turn the coach may look something up or change something before it
// has to answer. A whole week of routines takes four or five.
const MAX_ROUNDS = 12
// Past this, the oldest exchanges are dropped: each turn sends the conversation again, and
// the plan itself is always read fresh, so nothing the coach needs is lost with them.
const KEEP_MESSAGES = 40

const INSTRUCTIONS = `You are the coach inside Evergreen, a gym tracker. You plan the user's training by reading their profile and changing it with your tools: routines, the weekly schedule, single-day changes, weigh-ins.

How to work:
- The profile as it is right now follows these instructions. Read it before you answer. Use get_training_log or get_exercise_history when the request depends on what they have actually been doing.
- When the user asks for a change, make it with the tools in this same turn, then say what you did. Do not describe a plan and ask them to enter it themselves.
- Ask one short question first only when you cannot plan without the answer (how many days they can train, what equipment they have, an injury). If they have routines and a log, infer what you can from those instead of asking.
- Exercises are identified by id. Always find ids with search_exercises; never guess one.
- Leave the weight out of a new exercise unless the user gave you a number or their history shows one: the app carries weights over from the last session.
- Never delete a routine unless the user asked for that. New routines are added beside the existing ones; say so if the old ones are now unused.
- You cannot log, edit or delete workouts, and you cannot change settings. Say so if asked.

How to write:
- Plain text only: no markdown, no asterisks, no headings, no tables. This is a small phone screen.
- Be brief. After a change, two or three sentences: what you set up and why it fits them. The app shows the routines themselves, so do not list every exercise back unless asked.
- Weights are in the profile's unit.
- You are a training coach, not a doctor. For pain or injury, suggest seeing a professional and plan around it conservatively.`

const uid = () => Math.random().toString(36).slice(2, 10)

interface Coach {
  ready: boolean
  hasKey: boolean
  model: Model
  lines: Line[]
  busy: boolean
  /** what the coach is doing while busy, for the line under the chat */
  doing: string

  boot(): Promise<void>
  setKey(key: string | null): Promise<void>
  setModel(model: Model): void
  send(text: string): Promise<void>
  clear(): void
}

let key: string | null = null
let messages: Message[] = []

/** Drop the oldest exchanges, never splitting a tool call from its result. */
function trim(list: Message[]): Message[] {
  if (list.length <= KEEP_MESSAGES) return list
  let from = list.length - KEEP_MESSAGES
  while (from < list.length && !(list[from].role === 'user' && typeof list[from].content === 'string')) from++
  return from < list.length ? list.slice(from) : list
}

const DOING: Record<string, string> = {
  search_exercises: 'Looking through the exercises',
  get_training_log: 'Reading your log',
  get_exercise_history: 'Reading your history',
  create_plan: 'Writing your plan',
  create_routine: 'Writing a routine',
  update_routine: 'Changing a routine',
  delete_routine: 'Removing a routine',
  set_week_plan: 'Setting your week',
  set_day_override: 'Moving a day',
  log_bodyweight: 'Logging your weight',
}

export const useCoach = create<Coach>((set, get) => {
  const save = () => { void writeJson(KEYS.coach, { messages, lines: get().lines, model: get().model } satisfies Saved) }
  const say = (kind: Line['kind'], text: string) => set(s => ({ lines: [...s.lines, { id: uid(), kind, text }] }))

  return {
    ready: false,
    hasKey: false,
    model: DEFAULT_MODEL,
    lines: [],
    busy: false,
    doing: '',

    async boot() {
      if (get().ready) return
      const [storedKey, saved] = await Promise.all([readSecret(KEYS.coachKey), readJson<Saved>(KEYS.coach)])
      key = storedKey || null
      messages = Array.isArray(saved?.messages) ? saved!.messages : []
      set({
        ready: true,
        hasKey: !!key,
        lines: Array.isArray(saved?.lines) ? saved!.lines : [],
        model: MODELS.some(m => m.value === saved?.model) ? saved!.model : DEFAULT_MODEL,
      })
    },

    async setKey(next) {
      key = next && next.trim() ? next.trim() : null
      await writeSecret(KEYS.coachKey, key)
      set({ hasKey: !!key })
    },

    setModel(model) { set({ model }); save() },

    async send(text) {
      const said = text.trim()
      if (!said || get().busy || !key) return
      // Where the conversation stood, to go back to if this turn fails half-way: a tool call
      // left without its result would make every later request invalid.
      const before = messages.length
      messages = trim([...messages, { role: 'user', content: said }])
      const base = Math.min(before, messages.length - 1)
      say('you', said)
      set({ busy: true, doing: 'Thinking' })
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const res = await ask({
            key,
            model: get().model,
            system: [INSTRUCTIONS, 'The profile right now:\n' + JSON.stringify(snapshot(useStore.getState().S))],
            messages,
            tools: TOOLS,
          })
          if (!res.content.length) break
          messages = [...messages, { role: 'assistant', content: res.content }]
          const words = res.content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map(b => b.text.trim()).filter(Boolean).join('\n\n')
          if (words) say('coach', words)

          const calls = res.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
          if (res.stop !== 'tool_use' || !calls.length) {
            // Cut off mid-call: an unanswered call cannot stay in the conversation.
            if (calls.length) messages = messages.slice(0, -1)
            break
          }
          const results: Block[] = calls.map(call => {
            set({ doing: DOING[call.name] || 'Working' })
            const out = runTool(call.name, call.input)
            if (out.changed) say('change', out.changed)
            return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out.result), ...(out.failed ? { is_error: true } : {}) }
          })
          messages = [...messages, { role: 'user', content: results }]
          set({ doing: 'Thinking' })
        }
        // Ran out of rounds on a tool result: the next request must not start from one.
        const last = messages[messages.length - 1]
        if (last && last.role === 'user' && typeof last.content !== 'string') {
          messages = [...messages, { role: 'assistant', content: [{ type: 'text', text: 'I stopped there. Tell me if you want me to carry on.' }] }]
          say('coach', 'I stopped there. Tell me if you want me to carry on.')
        }
      } catch (e) {
        messages = messages.slice(0, base)
        say('error', e instanceof CoachError ? e.message : 'Something went wrong. Try again.')
      } finally {
        set({ busy: false, doing: '' })
        save()
      }
    },

    clear() {
      if (get().busy) return
      messages = []
      set({ lines: [] })
      save()
    },
  }
})
