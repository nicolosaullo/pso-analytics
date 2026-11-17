// Stat prototype: how many turns cards survive on the realm, from reaching it to leaving it, over a folder of replays.
//   npx tsx examples/card-survival.ts fixtures/replays                 one row per card
//   npx tsx examples/card-survival.ts fixtures/replays "Root Spider"   histogram for one card
// Each stay on the realm counts once. Turns are table turns (both players'), so 0 means the card left in the turn it
// arrived and 1 that it left during the next player's turn. A card still on the realm when the replay ends stays until
// end of game. Sites, Avatars and Magic are left out.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { frames } from '@pso-analytics/replay'
import type { CardObject, ContributorReplay } from '@pso-analytics/replay'

const folder = process.argv[2] ?? path.resolve(import.meta.dirname, '../replays')
const only = process.argv[3]
const files = readdirSync(folder).filter((name) => name.startsWith('replay_') && name.endsWith('.json'))
if (!files.length) {
  console.error(`No replays in ${folder}. Pass fixtures/replays.`)
  process.exit(1)
}

const TYPES = new Set(['Minion', 'Artifact', 'Aura'])
const UNTIL_END = 'until end of game'
// null turns: the replay never used the turn button, or the card was already on the realm when recording started.
interface Stay { name: string; turns: number | typeof UNTIL_END | null }

const stays: Stay[] = []
for (const file of files) {
  const { manifest } = JSON.parse(readFileSync(path.join(folder, file), 'utf8')) as ContributorReplay
  const turnsKnown = manifest.events.some((event) => event.turnBoundary)
  const onRealm = new Map<string, { name: string; arrivedAt: number | null }>()
  let turnsStarted = 0
  for (const { event, view } of frames(manifest)) {
    if (event?.turnBoundary) turnsStarted += 1
    const grid = new Map(view.objects.filter((object): object is CardObject => object.kind === 'card' && object.zone === 'grid')
      .map((card) => [card.objectId, card]))
    for (const [objectId, stay] of onRealm) {
      if (grid.has(objectId)) continue
      stays.push({ name: stay.name, turns: stay.arrivedAt === null || !turnsKnown ? null : turnsStarted - stay.arrivedAt })
      onRealm.delete(objectId)
    }
    for (const card of grid.values()) {
      if (onRealm.has(card.objectId) || !card.card || !TYPES.has(card.card.type)) continue
      onRealm.set(card.objectId, { name: card.card.name, arrivedAt: event ? turnsStarted : null })
    }
  }
  for (const stay of onRealm.values()) stays.push({ name: stay.name, turns: UNTIL_END })
}

const share = (count: number, total: number) => `${(100 * count / total).toFixed(1)}%`
const selected = only ? stays.filter((stay) => stay.name === only) : stays
console.log(`${files.length} replays, ${selected.length} stays on the realm${only ? ` of ${only}` : ''}`)
if (!selected.length) process.exit(0)

if (only) {
  const counts = new Map<string, number>()
  for (const stay of selected) {
    const key = stay.turns === null ? 'unknown' : String(stay.turns)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const numeric = [...counts.keys()].filter((key) => /^\d+$/.test(key)).sort((left, right) => Number(left) - Number(right))
  const largest = Math.max(...counts.values())
  console.table([...numeric, UNTIL_END, 'unknown'].filter((key) => counts.has(key)).map((turns) => ({
    turns, count: counts.get(turns)!, share: share(counts.get(turns)!, selected.length),
    histogram: '█'.repeat(Math.max(1, Math.round(20 * counts.get(turns)! / largest))),
  })))
  process.exit(0)
}

const byCard = new Map<string, Stay[]>()
for (const stay of stays) byCard.set(stay.name, [...(byCard.get(stay.name) ?? []), stay])
const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null
}
console.table([...byCard].sort((left, right) => right[1].length - left[1].length).slice(0, 25).map(([card, cardStays]) => {
  const removed = cardStays.flatMap((stay) => typeof stay.turns === 'number' ? [stay.turns] : [])
  return {
    card, stays: cardStays.length, medianTurnsWhenRemoved: median(removed) ?? '—',
    removedSameTurn: share(removed.filter((turns) => turns === 0).length, cardStays.length),
    untilEndOfGame: share(cardStays.filter((stay) => stay.turns === UNTIL_END).length, cardStays.length),
    unknown: share(cardStays.filter((stay) => stay.turns === null).length, cardStays.length),
  }
}))
