import { expect, test, type Page } from '@playwright/test'
import { moveHistory, progress, solutionPanel, stages } from './tutor.ts'

test.use({ reducedMotion: 'reduce' })

const playback = (page: Page) => solutionPanel(page).getByRole('group', { name: 'Playback' })
const button = (page: Page, name: string) => playback(page).getByRole('button', { name, exact: true })
const scrubber = (page: Page) => playback(page).getByRole('slider', { name: 'Position in the Solution' })
// The Move the Cube made last, highlighted in the Solution's notation.
const currentMove = (page: Page) => solutionPanel(page).locator('[aria-current="step"]')
// One Stage's Moves, in the Solution's notation.
const stageMoves = (page: Page, stage: string) =>
  solutionPanel(page).getByRole('list', { name: `${stage} Moves` }).getByRole('listitem')

/** Opens the tutor and presses Solve. Returns every Move of the Solution, in notation. */
async function solve(page: Page): Promise<string[]> {
  await page.goto('/app')
  await solutionPanel(page).getByRole('button', { name: 'Solve' }).click()
  await expect(stages(page).first()).toBeVisible()
  return solutionPanel(page).getByRole('list', { name: / Moves$/ }).getByRole('listitem').allTextContents()
}

test('Step, the scrubber, Reverse and the speed control, with the current Move highlighted', async ({ page }) => {
  const moves = await solve(page)
  const total = moves.length
  expect(total).toBeGreaterThan(3)
  await expect(progress(page)).toHaveText(`0 of ${total} Moves played`)
  await expect(currentMove(page)).toHaveCount(0)
  await expect(button(page, 'Step back')).toBeDisabled()
  await expect(button(page, 'Reverse')).toBeDisabled()

  await button(page, 'Step forward').click()
  await button(page, 'Step forward').click()
  await expect(progress(page)).toHaveText(`2 of ${total} Moves played`)
  await expect(currentMove(page)).toHaveText(moves[1]!)
  await button(page, 'Step back').click()
  await expect(progress(page)).toHaveText(`1 of ${total} Moves played`)
  await expect(currentMove(page)).toHaveText(moves[0]!)

  // Clicking the far end of the scrubber jumps to the end. Its own keys then
  // move it a Move at a time, and turn no Layer.
  const box = await scrubber(page).boundingBox()
  if (box === null) throw new Error('the scrubber is not visible')
  await scrubber(page).click({ position: { x: box.width - 1, y: box.height / 2 } })
  await expect(progress(page)).toHaveText(`${total} of ${total} Moves played`)
  await expect(currentMove(page)).toHaveText(moves[total - 1]!)
  await page.keyboard.press('Home')
  await expect(progress(page)).toHaveText(`0 of ${total} Moves played`)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(progress(page)).toHaveText(`2 of ${total} Moves played`)
  await page.keyboard.press('ArrowLeft')
  await expect(scrubber(page)).toHaveValue('1')
  await expect(moveHistory(page)).toHaveCount(0)
  await expect(page.getByText('Select a Sticker first', { exact: false })).toBeHidden()

  await button(page, '4×').click()
  await expect(button(page, '4×')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, '1×')).toHaveAttribute('aria-pressed', 'false')
  await button(page, 'Reverse').click()
  await expect(progress(page)).toHaveText(`0 of ${total} Moves played`)
  await expect(button(page, 'Reverse')).toBeDisabled()
  await expect(button(page, 'Play')).toBeEnabled()
})

test.describe('with a Solution of two short Stages', () => {
  // A hand-written Solution stands in for the solver's, so each journey
  // knows where every Stage ends. Playback doesn't need it to solve the Cube.
  test.beforeEach(async ({ page }) => {
    const stage = (id: string, name: string, moves: string) => ({
      id,
      name,
      goal: 'g',
      moves,
      notes: [],
      algorithms: [],
      pieces: [],
    })
    const stagesBody = [stage('white-cross', 'White cross', "R U R' U'"), stage('white-corners', 'White corners', 'F2 L')]
    await page.route('**/api/solve', (route) => route.fulfill({ json: { solved: false, stages: stagesBody } }))
  })

  test('Playback pauses at the end of each Stage, until auto-pause is turned off', async ({ page }) => {
    await solve(page)
    await expect(stages(page)).toHaveText(['White cross', 'White corners'])
    const autoPause = playback(page).getByRole('switch', { name: 'Pause at the end of each Stage' })
    await expect(autoPause).toBeChecked()

    await button(page, 'Play').click()
    await expect(progress(page)).toHaveText('4 of 6 Moves played')
    await expect(button(page, 'Play')).toBeVisible()
    await page.waitForTimeout(800)
    await expect(progress(page)).toHaveText('4 of 6 Moves played')

    await stages(page).filter({ hasText: /^White cross$/ }).click()
    await expect(progress(page)).toHaveText('0 of 6 Moves played')
    await autoPause.click()
    await expect(autoPause).not.toBeChecked()
    await button(page, 'Play').click()
    await expect(progress(page)).toHaveText('6 of 6 Moves played')
  })

  test('Space plays and pauses, even on a focused button, which it doesn’t press', async ({ page }) => {
    await solve(page)
    // Slowly, so the first Stage is still playing when Space pauses it.
    await button(page, '0.5×').click()
    await scrubber(page).focus()

    await page.keyboard.press('Space')
    await expect(button(page, 'Pause')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(button(page, 'Play')).toBeVisible()
    const paused = (await progress(page).textContent()) ?? ''
    await page.waitForTimeout(1200)
    await expect(progress(page)).toHaveText(paused)

    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    await expect(progress(page)).toHaveText('1 of 6 Moves played')
    await button(page, 'Step back').focus()
    await page.keyboard.press('Space')
    // Playback runs on to the end of the first Stage. Pressing Step back too
    // would have paused it at the start instead.
    await expect(progress(page)).toHaveText('4 of 6 Moves played')
    await expect(button(page, 'Play')).toBeVisible()
  })

  test('clicking a Stage jumps to its first Move', async ({ page }) => {
    await solve(page)
    await expect(stageMoves(page, 'White corners')).toHaveText(['F2', 'L'])

    await stages(page).filter({ hasText: /^White corners$/ }).click()

    await expect(progress(page)).toHaveText('4 of 6 Moves played')
    await expect(stageMoves(page, 'White cross').last()).toHaveAttribute('aria-current', 'step')
    await button(page, 'Step forward').click()
    await expect(currentMove(page)).toHaveText('F2')
  })
})
