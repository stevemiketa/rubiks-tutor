import { expect, test, type Page } from '@playwright/test'

// Where the front face's center Sticker is drawn, as a fraction of the 3D
// view's width and height. The camera is fixed (spec #3, story 11), so this
// only moves if the camera does; the "Selected" check below then fails and
// says so.
const FRONT_CENTER = { x: 0.375, y: 0.59 }

async function clickFrontCenter(page: Page): Promise<void> {
  const view = page.getByRole('img', { name: 'The Cube' })
  const box = await view.boundingBox()
  if (box === null) throw new Error('the 3D view is not visible')
  await view.click({ position: { x: box.width * FRONT_CENTER.x, y: box.height * FRONT_CENTER.y } })
  await expect(page.getByText('Selected: front face, center')).toBeVisible()
}

const moveHistory = (page: Page) => page.getByRole('list', { name: 'Move history' }).getByRole('listitem')

test.beforeEach(async ({ page }) => {
  await page.goto('/app')
})

test('selecting a Sticker and pressing an arrow key turns a Layer', async ({ page }) => {
  await expect(page.getByText('Solved', { exact: true })).toBeVisible()

  await clickFrontCenter(page)
  await page.keyboard.press('ArrowUp')

  await expect(moveHistory(page)).toHaveText(["M'"])
  await expect(page.getByText('Solved', { exact: true })).toBeHidden()
})

test('key presses made during an animation are all kept, in order', async ({ page }) => {
  await clickFrontCenter(page)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')

  await expect(moveHistory(page)).toHaveText(['E', "M'", "E'", 'M'])
})

test('an arrow key with nothing selected asks for a Sticker', async ({ page }) => {
  await page.keyboard.press('ArrowRight')

  await expect(page.getByText('Select a Sticker first')).toBeVisible()
  await expect(moveHistory(page)).toHaveCount(0)
})

test('the on-screen buttons turn the selected Sticker’s Layers', async ({ page }) => {
  await clickFrontCenter(page)

  await page.getByRole('button', { name: "Turn right: E" }).click()
  await page.getByRole('button', { name: "Turn left: E'" }).click()

  await expect(moveHistory(page)).toHaveText(['E', "E'"])
  await expect(page.getByText('Solved', { exact: true })).toBeVisible()
})
