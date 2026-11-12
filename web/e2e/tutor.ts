// What the tutor's journeys share: finding things on the tutor page by what a
// learner sees.
import { expect, type Locator, type Page } from '@playwright/test'

// Where the front face's center Sticker is drawn, as a fraction of the 3D
// view's width and height. The camera is fixed (spec #3, story 11), so this
// only moves if the camera does; the "Selected" check below then fails and
// says so.
const FRONT_CENTER = { x: 0.375, y: 0.59 }

/**
 * Clicks the front face's center Sticker, which selects it. The 3D view is
 * on the page a moment before the Cube is drawn in it, and a click in that
 * moment selects nothing, so this clicks again until the selection shows.
 * Selecting the same Sticker twice changes nothing.
 */
export async function clickFrontCenter(page: Page): Promise<void> {
  const view = page.getByRole('img', { name: 'The Cube' })
  await expect(async () => {
    const box = await view.boundingBox()
    if (box === null) throw new Error('the 3D view is not visible')
    await view.click({ position: { x: box.width * FRONT_CENTER.x, y: box.height * FRONT_CENTER.y } })
    await expect(page.getByText('Selected: front face, center')).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
}

/** Each Move in the Move history. */
export const moveHistory = (page: Page): Locator =>
  page.getByRole('list', { name: 'Move history' }).getByRole('listitem')

/** The Scramble, as 25 outer-Layer Turns in standard notation. */
export const scramble = (page: Page): Locator =>
  page.getByRole('region', { name: 'Scramble' }).getByText(/^(?:[RLUDFB][2']? ){24}[RLUDFB][2']?$/)

/** The Solution panel: the Solve button, the Stage list and Playback. */
export const solutionPanel = (page: Page): Locator => page.getByRole('region', { name: 'Solution' })

/** Each Stage in the loaded Solution's Stage list, by name. */
export const stages = (page: Page): Locator =>
  solutionPanel(page).getByRole('list', { name: 'Stages' }).getByRole('listitem')
