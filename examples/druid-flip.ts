// Stat prototype: on which of their own turns players flip the Druid, over a folder of replays.
//   npx tsx examples/druid-flip.ts fixtures/replays
// Flipping the Druid summons Bruin, so the flip turn is the turn Bruin first reaches the realm for the Druid's player.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { frames } from '@pso-analytics/replay'
import type { CardObject, ContributorReplay, Seat } from '@pso-analytics/replay'

const folder = process.argv[2] ?? path.resolve(import.meta.dirname, '../replays')
const files = readdirSync(folder).filter((name) => name.startsWith('replay_') && name.endsWith('.json'))
if (!files.length) {
  console.error(`No replays in ${folder}. Pass fixtures/replays.`)
  process.exit(1)
}

interface Druid { seat: Seat; flip: { ownTurn: number | null; onOwnTurn: boolean | null } | null }

const druids: Druid[] = []
for (const file of files) {
  const { manifest } = JSON.parse(readFileSync(path.join(folder, file), 'utf8')) as ContributorReplay
  const bySeat = new Map<Seat, Druid>()
  const ownTurns = new Map<Seat, number>()
  for (const { event, view } of frames(manifest)) {
    const cards = view.objects.filter((object): object is CardObject => object.kind === 'card' && object.zone === 'grid')
    const activeSeat = view.turn?.activeSeat ?? null
    if (event?.turnBoundary && activeSeat) ownTurns.set(activeSeat, (ownTurns.get(activeSeat) ?? 0) + 1)
    for (const card of cards) {
      if (card.card?.name === 'Druid' && card.card.type === 'Avatar' && !bySeat.has(card.controllerSeat)) {
        bySeat.set(card.controllerSeat, { seat: card.controllerSeat, flip: null })
      }
      const druid = bySeat.get(card.controllerSeat)
      if (card.card?.name === 'Bruin' && druid && !druid.flip) {
        druid.flip = { ownTurn: ownTurns.get(druid.seat) || null, onOwnTurn: activeSeat ? activeSeat === druid.seat : null }
      }
    }
  }
  druids.push(...bySeat.values())
}

const share = (count: number, total: number) => `${(100 * count / total).toFixed(1)}%`
const flipped = druids.filter((druid) => druid.flip)
const known = flipped.filter((druid) => druid.flip!.ownTurn !== null)
console.log(`${files.length} replays, ${druids.length} Druids, ${flipped.length} flipped (${known.length} on a known turn)`)
if (!druids.length) process.exit(0)

const byTurn = new Map<number, number>()
for (const druid of known) byTurn.set(druid.flip!.ownTurn!, (byTurn.get(druid.flip!.ownTurn!) ?? 0) + 1)
let cumulative = 0
console.table([...byTurn].sort((left, right) => left[0] - right[0]).map(([ownTurn, count]) => {
  cumulative += count
  return { ownTurn, count, share: share(count, druids.length), byThisTurn: share(cumulative, druids.length) }
}))
console.table([
  { result: 'never flipped', count: druids.length - flipped.length },
  { result: 'flipped, turn unknown (turn button not used)', count: flipped.length - known.length },
  { result: "flipped on the opponent's turn", count: flipped.filter((druid) => druid.flip!.onOwnTurn === false).length },
].map((row) => ({ ...row, share: share(row.count, druids.length) })))
