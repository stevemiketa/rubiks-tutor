// The shared cube test cases (ADR 0002). The Go suite in
// internal/cube/shared_cases_test.go loads the same files, so the two models
// can't drift apart. Every file in testdata/cube is loaded; a file of an
// unknown kind, or a field this suite doesn't know, fails the run rather than
// being skipped.
import { describe, expect, it } from 'vitest'
import {
  Cube,
  PIECE_NAMES,
  ParseError,
  SLOTS,
  formatMove,
  formatMoves,
  invert,
  parseMove,
  parseMoves,
  relabel,
  stickerName,
  type Sticker,
} from './index.ts'

const files = import.meta.glob<unknown>('../../../testdata/cube/*.json', {
  eager: true,
  import: 'default',
})

// Every Move in the notation, which the case files must cover.
const EVERY_MOVE =
  "R R' R2 L L' L2 U U' U2 D D' D2 F F' F2 B B' B2 " +
  "M M' M2 E E' E2 S S' S2 x x' x2 y y' y2 z z' z2"
const EVERY_ROTATION = "x x' x2 y y' y2 z z' z2"

type Json = Record<string, unknown>

function object(value: unknown): Json {
  expect(typeof value === 'object' && value !== null && !Array.isArray(value)).toBe(true)
  return value as Json
}

// fields checks that a case has only known fields, and has the required ones,
// so a misspelled expectation can't be silently ignored.
function fields(value: unknown, required: string[], optional: string[] = []): Json {
  const json = object(value)
  for (const key of Object.keys(json)) {
    expect([...required, ...optional], `unknown field "${key}"`).toContain(key)
  }
  for (const key of required) {
    expect(json, `missing field "${key}"`).toHaveProperty(key)
  }
  return json
}

function str(json: Json, key: string): string {
  const value = json[key] ?? ''
  expect(typeof value, `field "${key}"`).toBe('string')
  return value as string
}

// eachCase registers one test per named case, failing on missing or repeated
// names.
function eachCase(
  file: Json,
  required: string[],
  optional: string[],
  check: (c: Json) => void,
): void {
  const cases = file.cases as unknown[]
  it('has uniquely named cases', () => {
    expect(cases.length).toBeGreaterThan(0)
    const names = cases.map((c) => (c as Json).name)
    expect(names.every((n) => typeof n === 'string' && n !== '')).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })
  for (const c of cases) {
    const name = String((c as Json).name)
    it(name, () => check(fields(c, ['name', ...required], optional)))
  }
}

function notationCases(file: Json): void {
  eachCase(file, ['input'], ['printed', 'error'], (c) => {
    const input = str(c, 'input')
    if (c.error !== undefined) {
      const want = fields(c.error, ['offset', 'token'])
      let thrown: unknown
      try {
        parseMoves(input)
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(ParseError)
      const err = thrown as ParseError
      expect({ offset: err.offset, token: err.token }).toEqual(want)
      return
    }
    const printed = c.printed === undefined ? input : str(c, 'printed')
    expect(formatMoves(parseMoves(input))).toBe(printed)
  })
}

// state parses a case's state, or returns a solved Cube for "".
function state(text: string): Cube {
  if (text === '') return Cube.solved()
  const cube = Cube.parse(text)
  expect(cube.toString()).toBe(text)
  return cube
}

function moveCases(file: Json): void {
  it('applies every Move alone to a solved Cube', () => {
    const fromSolved = (file.cases as Json[]).filter((c) => c.start === undefined).map((c) => c.moves)
    for (const move of EVERY_MOVE.split(' ')) expect(fromSolved).toContain(move)
  })
  eachCase(file, ['moves', 'expect', 'solved'], ['start'], (c) => {
    const got = state(str(c, 'start')).apply(parseMoves(str(c, 'moves')))
    expect(got.toString()).toBe(state(str(c, 'expect')).toString())
    expect(got.isSolved()).toBe(c.solved)
  })
}

function inverseCases(file: Json): void {
  eachCase(file, ['moves', 'inverse'], ['start'], (c) => {
    const moves = parseMoves(str(c, 'moves'))
    const inverse = invert(moves)
    expect(formatMoves(inverse)).toBe(c.inverse)
    const start = state(str(c, 'start'))
    expect(start.apply(moves).apply(inverse).toString()).toBe(start.toString())
  })
}

function equivalenceCases(file: Json): void {
  eachCase(file, ['a', 'b'], ['start'], (c) => {
    const start = state(str(c, 'start'))
    const a = start.apply(parseMoves(str(c, 'a')))
    const b = start.apply(parseMoves(str(c, 'b')))
    expect(a.toString()).toBe(b.toString())
  })
}

function relabelCases(file: Json): void {
  it('relabels every Move through every Cube rotation', () => {
    const cases = file.cases as Json[]
    for (const c of cases) expect(c.moves).toBe(EVERY_MOVE)
    const rotations = cases.map((c) => c.rotation)
    for (const r of EVERY_ROTATION.split(' ')) expect(rotations).toContain(r)
  })
  eachCase(file, ['rotation', 'moves', 'relabeled'], ['start'], (c) => {
    const rotation = parseMove(str(c, 'rotation'))
    const moves = parseMoves(str(c, 'moves'))
    const want = parseMoves(str(c, 'relabeled'))
    expect(want).toHaveLength(moves.length)
    const start = state(str(c, 'start'))
    moves.forEach((move, i) => {
      const got = relabel(move, rotation)
      expect(got, `${formatMove(move)} through ${c.rotation}`).toEqual(want[i])
      expect(start.apply([move, rotation]).toString()).toBe(start.apply([rotation, got]).toString())
    })
  })
}

const stickerNames = (stickers: readonly Sticker[]): string => stickers.map(stickerName).join(' ')

// slotOf names the Slot that holds the given Stickers, such as "UFR" for
// "R0 U8 F2".
function slotOf(stickers: string): string {
  const names = stickers.split(' ')
  const slot = SLOTS.find(
    (s) => s.stickers.length === names.length && s.stickers.every((st) => names.includes(stickerName(st))),
  )
  expect(slot, `a Slot with Stickers ${stickers}`).toBeDefined()
  return slot?.name ?? ''
}

function pieceCases(file: Json): void {
  it('lists every Slot', () => {
    const want = (file.slots as unknown[]).map((s) => fields(s, ['slot', 'stickers', 'position']))
    expect(
      SLOTS.map((s) => ({ slot: s.name, stickers: stickerNames(s.stickers), position: s.position })),
    ).toEqual(want)
  })
  it('names every Piece', () => {
    expect(PIECE_NAMES).toEqual(file.names)
  })
  it('rejects names that are not Pieces', () => {
    for (const name of file.invalidNames as string[]) {
      expect(() => Cube.solved().locate(name), JSON.stringify(name)).toThrow()
    }
  })
  eachCase(file, ['moves', 'at', 'locate'], ['start'], (c) => {
    const cube = state(str(c, 'start')).apply(parseMoves(str(c, 'moves')))
    for (const [slot, piece] of Object.entries(object(c.at))) {
      expect(cube.pieceAt(slot), `Piece at ${slot}`).toBe(piece)
    }
    for (const [piece, stickers] of Object.entries(object(c.locate))) {
      const location = cube.locate(piece)
      expect(stickerNames(location.stickers), `Stickers of ${piece}`).toBe(stickers)
      expect(location.slot, `Slot of ${piece}`).toBe(slotOf(String(stickers)))
    }
  })
}

// runners maps each case-file kind to the function that checks its cases,
// with the top-level fields its files may have besides kind and description.
const runners: Record<string, { fields: string[]; run: (file: Json) => void }> = {
  notation: { fields: ['cases'], run: notationCases },
  moves: { fields: ['cases'], run: moveCases },
  inverse: { fields: ['cases'], run: inverseCases },
  equivalences: { fields: ['cases'], run: equivalenceCases },
  relabel: { fields: ['cases'], run: relabelCases },
  pieces: { fields: ['slots', 'names', 'invalidNames', 'cases'], run: pieceCases },
}

const loaded = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))

describe('shared cube test cases', () => {
  it('finds case files of every kind', () => {
    expect(loaded.length).toBeGreaterThan(0)
    const kinds = loaded.map(([, file]) => (file as Json).kind)
    for (const kind of kinds) expect(Object.keys(runners)).toContain(kind)
    for (const kind of Object.keys(runners)) expect(kinds).toContain(kind)
  })

  for (const [path, value] of loaded) {
    const file = value as Json
    const runner = runners[String(file.kind)]
    if (runner === undefined) continue
    describe(path.slice(path.lastIndexOf('/') + 1), () => {
      it('has only known top-level fields', () => {
        fields(file, ['kind', 'description', ...runner.fields])
      })
      runner.run(file)
    })
  }
})
