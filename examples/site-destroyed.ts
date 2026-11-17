// Stat prototype: how often each site is destroyed after reaching the realm, over a folder of replays.
//   npx tsx examples/site-destroyed.ts fixtures/replays
// Each stay on the realm counts once. Destroyed means the site went from the realm to the cemetery or banished; a site
// taken back to a hand or pile (often a misplay undone) is counted apart, and one still on the realm when the replay
// ends was not destroyed.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { frames } from '@pso-analytics/replay'
import type { CardObject, ContributorReplay } from '@pso-analytics/replay'

const folder = process.argv[2] ?? path.resolve(import.meta.dirname, '../replays')
const files = readdirSync(folder).filter((name) => name.startsWith('replay_') && name.endsWith('.json'))
if (!files.length) {
  console.error(`No replays in ${folder}. Pass fixtures/replays.`)
  process.exit(1)
}

type Outcome = 'destroyed' | 'left another way' | 'stayed'
const stays: Array<{ name: string; outcome: Outcome }> = []
for (const file of files) {
  const { manifest } = JSON.parse(readFileSync(path.join(folder, file), 'utf8')) as ContributorReplay
  const onRealm = new Map<string, string>()
  for (const { view } of frames(manifest)) {
    const cards = new Map(view.objects.filter((object): object is CardObject => object.kind === 'card')
      .map((card) => [card.objectId, card]))
    for (const [objectId, name] of onRealm) {
      const card = cards.get(objectId)
      if (card?.zone === 'grid') continue
      stays.push({ name, outcome: card?.zone === 'cemetery' || card?.zone === 'banished' ? 'destroyed' : 'left another way' })
      onRealm.delete(objectId)
    }
    for (const card of cards.values()) {
      if (card.zone === 'grid' && card.card?.type === 'Site' && !onRealm.has(card.objectId)) onRealm.set(card.objectId, card.card.name)
    }
  }
  for (const name of onRealm.values()) stays.push({ name, outcome: 'stayed' })
}

const share = (count: number, total: number) => `${(100 * count / total).toFixed(1)}%`
const count = (list: typeof stays, outcome: Outcome) => list.filter((stay) => stay.outcome === outcome).length
console.log(`${files.length} replays, ${stays.length} sites on the realm, ${share(count(stays, 'destroyed'), stays.length || 1)} destroyed`)
if (!stays.length) process.exit(0)

const bySite = new Map<string, typeof stays>()
for (const stay of stays) bySite.set(stay.name, [...(bySite.get(stay.name) ?? []), stay])
console.table([...bySite].sort((left, right) => right[1].length - left[1].length).slice(0, 25).map(([site, siteStays]) => ({
  site, onRealm: siteStays.length, destroyed: count(siteStays, 'destroyed'),
  destroyedShare: share(count(siteStays, 'destroyed'), siteStays.length),
  leftAnotherWay: share(count(siteStays, 'left another way'), siteStays.length),
})))
