/* In-browser predictions.json checker — a TypeScript port of
 * scripts/validate_submission.py.
 *
 * VALIDATION ONLY. This file checks that a submission is well-formed and legal under the
 * contract in CONTRIBUTING.md. It does not score, and nothing in web/ ever will: the
 * Python scorer is the single source of truth and submissions stay a GitHub-PR flow.
 *
 * Parity with the Python validator is enforced, not hoped for:
 * scripts/gen_validator_fixtures.py runs the real validator over a fixed set of files and
 * records its verdicts in test/fixtures/validator-parity.json; the unit tests require
 * this port to return the same valid/invalid answer and the same (code, row) errors and
 * warnings, in the same order. The checks below are written in the validator's order on
 * purpose — keep them that way.
 *
 * No data is imported here: the caller passes the ids of the scored data version. */

export type IssueCode =
  | 'invalid_json'
  | 'not_array'
  | 'empty'
  | 'row_not_object'
  | 'missing_id'
  | 'id_not_string'
  | 'unknown_id'
  | 'duplicate_id'
  | 'gold_leakage'
  | 'abstain_not_true'
  | 'abstain_with_answer'
  | 'missing_confidence'
  | 'confidence_not_number'
  | 'confidence_out_of_range'
  | 'missing_answer'
  | 'extra_keys'
  | 'gold_echo'
  | 'coverage'

export interface ValidationIssue {
  code: IssueCode
  /** Zero-based index into the predictions array; null for file-level issues. */
  row: number | null
  message: string
}

export interface ValidationStats {
  /** Rows in the predictions array. */
  rows: number
  /** Rows shaped as an answer / as an abstention (well-formed object rows only). */
  answerRows: number
  abstainRows: number
  /** Distinct data ids the file lists, out of `total`. */
  listed: number
  total: number
  /** Data ids the file does not list — scored as abstentions. */
  missing: number
  /** Answer rows whose confidence is below the abstain threshold: legal, but the scorer
   *  treats each as an abstention. Informational only. */
  lowConfidenceAnswers: number
}

export interface ValidationReport {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  /** null when the file could not be read as a predictions array at all. */
  stats: ValidationStats | null
}

export interface ValidationContext {
  /** Every item id in the scored data version. */
  ids: readonly string[]
  /** Gold field of each unanswerable item (always the sentinel "ABSTAIN"), keyed by id.
   *  Needed for the validator's gold-echo leak check. */
  unanswerableGold: Readonly<Record<string, string>>
  /** The scorer's abstain threshold (0.5). Used only for the informational count of
   *  low-confidence answers — it never affects the verdict. */
  abstainThreshold: number
}

// Fields that only exist in the gold dataset (validate_submission.GOLD_ONLY_FIELDS).
export const GOLD_ONLY_FIELDS = ['gold_answer', 'split', 'evidence_spans', 'answer_topic', 'source_id'] as const

const ALLOWED_ANSWER_KEYS = new Set(['id', 'answer', 'confidence'])
const ALLOWED_ABSTAIN_KEYS = new Set(['id', 'abstain'])
const GOLD_SET = new Set<string>(GOLD_ONLY_FIELDS)

const CONF_MIN = 0
const CONF_MAX = 1

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A short, readable rendering of a JSON value for messages. */
function show(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (v === undefined) return 'undefined'
  const s = JSON.stringify(v)
  return s.length > 60 ? `${s.slice(0, 57)}...` : s
}

function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function fail(code: IssueCode, message: string): ValidationReport {
  return { valid: false, errors: [{ code, row: null, message }], warnings: [], stats: null }
}

/** Validate the text of a predictions.json file. */
export function validatePredictionsText(text: string, ctx: ValidationContext): ValidationReport {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return fail('invalid_json', `predictions file is not valid JSON: ${(e as Error).message}`)
  }
  return validatePredictions(raw, ctx)
}

/** Validate an already-parsed predictions document. */
export function validatePredictions(doc: unknown, ctx: ValidationContext): ValidationReport {
  let raw = doc
  if (isPlainObject(raw) && has(raw, 'predictions')) raw = raw.predictions
  if (!Array.isArray(raw)) {
    return fail('not_array', "predictions must be a JSON array (or {'predictions': [...]})")
  }
  if (raw.length === 0) {
    return fail('empty', 'predictions array is empty — no predictions to score')
  }

  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  const validIds = new Set(ctx.ids)
  const seen = new Set<string>()
  const listed = new Set<string>()

  let unanswerableGoldEcho = 0
  let unanswerableAnswered = 0
  let answerRows = 0
  let abstainRows = 0
  let lowConfidenceAnswers = 0

  raw.forEach((row: unknown, idx: number) => {
    let loc = `row ${idx}`
    if (!isPlainObject(row)) {
      errors.push({
        code: 'row_not_object',
        row: idx,
        message: `${loc}: each prediction must be a JSON object, got ${typeName(row)}`,
      })
      return
    }

    // id present
    if (!has(row, 'id')) {
      errors.push({ code: 'missing_id', row: idx, message: `${loc}: missing required 'id'` })
      return
    }
    const itemId = row.id
    loc = `row ${idx} (id=${show(itemId)})`

    // id is a string
    if (typeof itemId !== 'string') {
      errors.push({
        code: 'id_not_string',
        row: idx,
        message: `${loc}: 'id' must be a string, got ${typeName(itemId)}`,
      })
      return
    }
    listed.add(itemId)

    // id is in the scored data version
    if (!validIds.has(itemId)) {
      errors.push({ code: 'unknown_id', row: idx, message: `${loc}: id is not present in the scored data version` })
    }

    // duplicate id
    if (seen.has(itemId)) {
      errors.push({ code: 'duplicate_id', row: idx, message: `${loc}: duplicate id (each id may appear at most once)` })
    }
    seen.add(itemId)

    // gold leakage: prediction row carries a gold-only field
    const leaked = GOLD_ONLY_FIELDS.filter((k) => has(row, k))
    if (leaked.length) {
      errors.push({
        code: 'gold_leakage',
        row: idx,
        message: `${loc}: gold leakage — prediction carries label field(s) ${leaked.join(', ')}; predictions may only contain id/answer/confidence/abstain`,
      })
    }

    // shape check: abstain vs answer
    const isAbstain = row.abstain === true
    const hasAbstainKey = has(row, 'abstain')

    if (hasAbstainKey && row.abstain !== true) {
      errors.push({
        code: 'abstain_not_true',
        row: idx,
        message: `${loc}: 'abstain' must be the literal true; got ${show(row.abstain)} (omit the key to answer)`,
      })
    }

    const keys = Object.keys(row)
    if (isAbstain) {
      abstainRows++
      // Abstain shape: only id (+ abstain). Extra non-gold keys are flagged.
      let extra = keys.filter((k) => !ALLOWED_ABSTAIN_KEYS.has(k) && !GOLD_SET.has(k))
      if (has(row, 'answer') || has(row, 'confidence')) {
        warnings.push({
          code: 'abstain_with_answer',
          row: idx,
          message: `${loc}: abstain row also has answer/confidence; they are ignored (scored as confidence 0)`,
        })
        extra = extra.filter((k) => k !== 'answer' && k !== 'confidence')
      }
      if (extra.length) {
        warnings.push({
          code: 'extra_keys',
          row: idx,
          message: `${loc}: unexpected extra key(s) ${extra.sort().join(', ')} ignored`,
        })
      }
      return
    }

    // Answer shape: must have a confidence in [0,1].
    answerRows++
    if (!has(row, 'confidence')) {
      errors.push({
        code: 'missing_confidence',
        row: idx,
        message: `${loc}: answered prediction is missing 'confidence' (your calibrated P(answer correct) in [0,1])`,
      })
    } else {
      const conf = row.confidence
      if (typeof conf !== 'number') {
        errors.push({
          code: 'confidence_not_number',
          row: idx,
          message: `${loc}: 'confidence' must be a number in [0,1], got ${show(conf)}`,
        })
      } else if (!(CONF_MIN <= conf && conf <= CONF_MAX)) {
        errors.push({
          code: 'confidence_out_of_range',
          row: idx,
          message: `${loc}: 'confidence' ${conf} is outside [0,1]`,
        })
      } else if (conf < ctx.abstainThreshold) {
        lowConfidenceAnswers++
      }
    }
    if (!has(row, 'answer')) {
      warnings.push({
        code: 'missing_answer',
        row: idx,
        message: `${loc}: answered prediction has no 'answer' field (it will be scored as an empty/incorrect answer)`,
      })
    }
    const extra = keys.filter((k) => !ALLOWED_ANSWER_KEYS.has(k) && !GOLD_SET.has(k))
    if (extra.length) {
      warnings.push({
        code: 'extra_keys',
        row: idx,
        message: `${loc}: unexpected extra key(s) ${extra.sort().join(', ')} ignored`,
      })
    }

    // Gold-echo leakage signal: this row answered an *unanswerable* item with text exactly
    // equal to that item's gold field. Unanswerable items have gold "ABSTAIN" (there is no
    // answer to legitimately produce), so reproducing the gold is a leak signal.
    if (has(ctx.unanswerableGold, itemId)) {
      unanswerableAnswered++
      const gold = ctx.unanswerableGold[itemId]
      const ans = row.answer
      if (gold != null && ans != null && String(ans).trim() === String(gold).trim()) {
        unanswerableGoldEcho++
      }
    }
  })

  // Aggregate gold-echo signal: only meaningful if it answered unanswerable items and
  // *every* such answer reproduces the gold string verbatim (>= 2 items), which a
  // label-free system cannot do. A single coincidence is not flagged.
  if (unanswerableGoldEcho >= 2 && unanswerableGoldEcho === unanswerableAnswered) {
    errors.push({
      code: 'gold_echo',
      row: null,
      message: `gold leakage — all ${unanswerableGoldEcho} answered unanswerable-split items reproduce the gold field verbatim; this is only possible by reading labels`,
    })
  }

  // Coverage warning (NOT an error — missing ids are scored as abstentions).
  let listedValid = 0
  for (const id of validIds) if (listed.has(id)) listedValid++
  const missing = validIds.size - listedValid
  if (missing > 0) {
    warnings.push({
      code: 'coverage',
      row: null,
      message: `${missing} of ${validIds.size} data ids are not listed; they will be scored as abstentions (allowed by the contract)`,
    })
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      rows: raw.length,
      answerRows,
      abstainRows,
      listed: listedValid,
      total: validIds.size,
      missing,
      lowConfidenceAnswers,
    },
  }
}

/** Decode the bytes of an uploaded file the way the Python validator reads it: strict
 *  UTF-8, byte-order mark kept (so a BOM is reported as invalid JSON, as Python does).
 *  Returns null when the bytes are not valid UTF-8. */
export function decodeUtf8Strict(bytes: ArrayBuffer | Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return null
  }
}
