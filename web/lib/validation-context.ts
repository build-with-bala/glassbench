import { getItems } from './items-data'
import { getResults } from './results-data'
import { UNANSWERABLE_SPLITS } from './outcomes'
import type { ValidationContext } from './validate-predictions'

/** What the in-browser checker needs to know about the scored data version: the item
 *  ids, and the gold field of the unanswerable items (always the sentinel "ABSTAIN" —
 *  no real answer is shipped to the browser). Built on the server from the frozen data. */
export function getValidationContext(): ValidationContext {
  const unanswerableGold: Record<string, string> = {}
  const items = getItems()
  for (const it of items) {
    if (UNANSWERABLE_SPLITS.includes(it.split)) unanswerableGold[it.id] = it.gold_answer
  }
  return {
    ids: items.map((it) => it.id),
    unanswerableGold,
    abstainThreshold: getResults().thresholds.abstain_confidence,
  }
}
