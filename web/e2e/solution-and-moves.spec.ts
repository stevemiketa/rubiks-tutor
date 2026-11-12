// What happens when the learner acts while a Solution is loaded: Turns,
// Cube rotations, undo and redo, closing it, reloading and sharing.
import { expect, test, type Page } from '@playwright/test'
import { clickFrontCenter, moveHistory, progress, solutionPanel, stages } from './tutor.ts'

test.use({ reducedMotion: 'reduce' })

const playback = (page: Page) => solutionPanel(page).getByRole('group', { name: 'Playback' })
const button = (page: Page, name: string) => solutionPanel(page).getByRole('button', { name, exact: true })
const currentMove = (page: Page) => solutionPanel(page).locator('[aria-current="step"]')
const undoButton = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true })
const redoButton = (page: Page) => page.getByRole('button', { name: 'Redo', exact: true })

/** Opens the tutor, presses Solve and steps forward n Moves. Returns every Move of the Solution, in notation. */
async function solveAndStep(page: Page, n: number): Promise<string[]> {
  await page.goto('/app')
  await button(page, 'Solve').click()
  await expect(stages(page).first()).toBeVisible()
  const moves = await solutionPanel(page).getByRole('list', { name: / Moves$/ }).getByRole('listitem').allTextContents()
  for (let i = 0; i < n; i++) await button(page, 'Step forward').click()
  await expect(progress(page)).toHaveText(`${n} of ${moves.length} Moves played`)
  return moves
}

test('a Turn makes the Solution stale, keeps the Moves played in the Move history, and Solve again replaces it', async ({
  page,
}) => {
  const moves = await solveAndStep(page, 2)
  await expect(moveHistory(page)).toHaveCount(0)

  await clickFrontCenter(page)
  await page.keyboard.press('ArrowUp')

  await expect(moveHistory(page)).toHaveText([moves[0]!, moves[1]!, "M'"])
  const banner = solutionPanel(page).getByRole('alert')
  await expect(banner).toContainText('no longer fits the Cube')
  await expect(playback(page)).toBeHidden()
  // Undo is the learner's own again: it takes back the Turn.
  await undoButton(page).click()
  await expect(moveHistory(page)).toHaveText([moves[0]!, moves[1]!])
  await expect(banner).toBeVisible()

  await banner.getByRole('button', { name: 'Solve again' }).click()

  await expect(banner).toBeHidden()
  await expect(progress(page)).toHaveText(/^0 of \d+ Moves played$/)
  await expect(playback(page)).toBeVisible()
})

test('a Cube rotation goes into the Solution, and undo and redo step back past it and forward again', async ({ page }) => {
  const moves = await solveAndStep(page, 2)
  const total = moves.length + 1

  await page.keyboard.press('Shift+ArrowLeft')

  await expect(progress(page)).toHaveText(`3 of ${total} Moves played`)
  await expect(currentMove(page)).toHaveText('y')
  await expect(moveHistory(page)).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(progress(page)).toHaveText(`2 of ${total} Moves played`)
  await page.keyboard.press('Control+Shift+Z')
  await expect(progress(page)).toHaveText(`3 of ${total} Moves played`)
  await undoButton(page).click()
  await undoButton(page).click()
  await expect(progress(page)).toHaveText(`1 of ${total} Moves played`)
  await redoButton(page).click()
  await expect(progress(page)).toHaveText(`2 of ${total} Moves played`)
  await expect(moveHistory(page)).toHaveCount(0)
})

test('closing the Solution keeps the Cube and the Moves played; undo then undoes the learner’s own Moves', async ({
  page,
}) => {
  const moves = await solveAndStep(page, 2)

  await button(page, 'Close Solution').click()

  await expect(stages(page)).toHaveCount(0)
  await expect(moveHistory(page)).toHaveText([moves[0]!, moves[1]!])
  await undoButton(page).click()
  await expect(moveHistory(page)).toHaveText([moves[0]!])
})

test('a reload restores the Solution, where Playback was, its speed and its auto-pause setting', async ({ page }) => {
  const moves = await solveAndStep(page, 3)
  await button(page, '2×').click()
  const autoPause = playback(page).getByRole('switch', { name: 'Pause at the end of each Stage' })
  await autoPause.click()
  await expect(autoPause).not.toBeChecked()

  await page.reload()

  await expect(progress(page)).toHaveText(`3 of ${moves.length} Moves played`)
  await expect(currentMove(page)).toHaveText(moves[2]!)
  await expect(button(page, '2×')).toHaveAttribute('aria-pressed', 'true')
  await expect(autoPause).not.toBeChecked()
  await expect(moveHistory(page)).toHaveCount(0)
})

test('sharing mid-Playback shares the Moves played as the Move history, and not the Solution', async ({
  page,
  browser,
}) => {
  const moves = await solveAndStep(page, 2)

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const link = page.getByRole('dialog', { name: 'Share this Cube' }).getByRole('textbox', { name: 'Share link' })
  await expect(link).toHaveValue(/\/s\/[\w-]{10}$/)
  const url = await link.inputValue()

  const recipientContext = await browser.newContext({ reducedMotion: 'reduce' })
  const recipient = await recipientContext.newPage()
  await recipient.goto(url)
  await expect(moveHistory(recipient)).toHaveText([moves[0]!, moves[1]!])
  await expect(stages(recipient)).toHaveCount(0)
  await recipientContext.close()
})
