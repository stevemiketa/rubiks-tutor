import { expect, test, type Page } from '@playwright/test'
import { solutionPanel, stages } from './tutor.ts'

test.use({ reducedMotion: 'reduce' })

// One Stage in the Stage list, by its name: its goal, its Algorithm cards and its Moves.
const stage = (page: Page, name: string) =>
  solutionPanel(page)
    .getByRole('list', { name: 'Stages' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name, exact: true }) })
// A Stage's Algorithm cards, each with the Algorithm's name and notation.
const cards = (page: Page, name: string) =>
  solutionPanel(page).getByRole('list', { name: `${name} Algorithms` }).getByRole('listitem')
// The Move Playback has reached, with its note or the Algorithm it is part of.
const reached = (page: Page) => solutionPanel(page).getByRole('status').filter({ hasText: /\S/ })
const stepForward = (page: Page) =>
  solutionPanel(page).getByRole('group', { name: 'Playback' }).getByRole('button', { name: 'Step forward', exact: true })

test('each Stage of a real Solution shows its goal and a card for each Algorithm it uses', async ({ page }) => {
  await page.goto('/app')
  await solutionPanel(page).getByRole('button', { name: 'Solve' }).click()
  await expect(stages(page)).toHaveText([
    'White cross',
    'White corners',
    'Middle layer',
    'Yellow cross',
    'Yellow face',
    'Yellow corners',
    'Yellow edges',
  ])

  await expect(stage(page, 'White cross')).toContainText(
    'Make a white cross on top, with each edge matching the center beside it.',
  )
  await expect(stage(page, 'White corners')).toContainText('Fill in the white corners to finish the first layer.')
  await expect(stage(page, 'Middle layer')).toContainText(
    'Rotate the Cube so white is on the bottom, then place the four middle-layer edges.',
  )
  await expect(stage(page, 'Yellow cross')).toContainText('Make a yellow cross on top.')
  await expect(stage(page, 'Yellow face')).toContainText('Twist the top corners until the whole top is yellow.')
  await expect(stage(page, 'Yellow corners')).toContainText('Move the top corners to their correct spots.')
  await expect(stage(page, 'Yellow edges')).toContainText('Move the top edges to their correct spots to finish the Cube.')

  // The white cross is solved by intuition, with no Algorithms.
  await expect(cards(page, 'White cross')).toHaveCount(0)
  // A Scramble's corners all need the Corner trigger, however often: one card.
  await expect(cards(page, 'White corners')).toHaveText(["Corner trigger R' D' R D"])
  const inserts = await cards(page, 'Middle layer').allTextContents()
  expect(inserts.length).toBeGreaterThan(0)
  for (const card of inserts) expect(["Right insert U R U' R' U' F' U F", "Left insert U' L' U L U F U' F'"]).toContain(card)
  // Each yellow Stage repeats one Algorithm: one card, or none when earlier
  // Stages happen to finish it.
  for (const [name, card] of [
    ['Yellow cross', "Edge flip F R U R' U' F'"],
    ['Yellow face', "Sune R U R' U R U2 R'"],
    ['Yellow corners', "A-perm R' F R' B2 R F' R' B2 R2"],
    ['Yellow edges', "U-perm R U' R U R U R U' R' U' R2"],
  ] as const) {
    expect([[], [card]]).toContainEqual(await cards(page, name).allTextContents())
  }
})

test.describe('with a hand-written Solution', () => {
  // A hand-written Solution stands in for the solver's, so the journey knows
  // which Moves have notes and where the Algorithm is.
  test.beforeEach(async ({ page }) => {
    const body = {
      solved: false,
      stages: [
        {
          id: 'white-cross',
          name: 'White cross',
          goal: 'Make a white cross on top, with each edge matching the center beside it.',
          moves: "x2 U'",
          notes: [
            { at: 0, text: 'turn the Cube over so the white center is on top' },
            { at: 1, text: 'put the white-green edge in place, white on top, next to the green center' },
          ],
          algorithms: [],
          pieces: ['white-green edge', 'white-red edge', 'white-blue edge', 'white-orange edge'],
        },
        {
          id: 'white-corners',
          name: 'White corners',
          goal: 'Fill in the white corners to finish the first layer.',
          moves: "y R' D' R D",
          notes: [{ at: 0, text: 'rotate so the white-green-red corner’s place is at front-right' }],
          algorithms: [{ name: 'Corner trigger', notation: "R' D' R D", start: 1, length: 4 }],
          pieces: ['white-green-red corner', 'white-green-orange corner', 'white-blue-red corner', 'white-blue-orange corner'],
        },
      ],
    }
    await page.route('**/api/solve', (route) => route.fulfill({ json: body }))
    await page.goto('/app')
    await solutionPanel(page).getByRole('button', { name: 'Solve' }).click()
    await expect(stages(page)).toHaveText(['White cross', 'White corners'])
  })

  test('Playback shows each Move’s note, and highlights the Algorithm being performed', async ({ page }) => {
    const card = cards(page, 'White corners')
    await expect(card).toHaveText(["Corner trigger R' D' R D"])
    await expect(card).not.toHaveAttribute('aria-current')
    await expect(reached(page)).toHaveCount(0)

    await stepForward(page).click()
    await expect(reached(page)).toHaveText('x2: turn the Cube over so the white center is on top')
    await stepForward(page).click()
    await expect(reached(page)).toHaveText("U': put the white-green edge in place, white on top, next to the green center")
    await stepForward(page).click()
    await expect(reached(page)).toHaveText('y: rotate so the white-green-red corner’s place is at front-right')
    await expect(card).not.toHaveAttribute('aria-current')

    await stepForward(page).click()
    await expect(card).toHaveAttribute('aria-current', 'true')
    await expect(reached(page)).toHaveText("R': Corner trigger, Move 1 of 4")
    for (let i = 0; i < 3; i++) await stepForward(page).click()
    await expect(reached(page)).toHaveText('D: Corner trigger, Move 4 of 4')
    await expect(card).toHaveAttribute('aria-current', 'true')
  })
})
