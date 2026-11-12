import { expect, test, type Page } from '@playwright/test'

const moveHistory = (page: Page) => page.getByRole('list', { name: 'Move history' }).getByRole('listitem')
const solved = (page: Page) => page.getByText('Solved', { exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto('/app')
})

test('Shift + the arrow keys rotate the whole Cube, recorded as Moves', async ({ page }) => {
  for (const key of ['Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown']) {
    await page.keyboard.press(key)
  }

  await expect(moveHistory(page)).toHaveText(['y', "y'", 'x', "x'"])
  await expect(solved(page)).toBeVisible()
})

test('the on-screen buttons make all six Cube rotations', async ({ page }) => {
  const names = ['Rotate left: y', "Rotate right: y'", 'Rotate up: x', "Rotate down: x'"]
  for (const name of [...names, 'Roll clockwise: z', "Roll counterclockwise: z'"]) {
    await page.getByRole('button', { name }).click()
  }

  await expect(moveHistory(page)).toHaveText(['y', "y'", 'x', "x'", 'z', "z'"])
})

test('a Sticker can be chosen from the keyboard, and Esc clears it', async ({ page }) => {
  await page.keyboard.press('d')
  await expect(page.getByText('Selected: front face, center')).toBeVisible()
  await page.keyboard.press('w')
  await page.keyboard.press('w')
  await expect(page.getByText('Selected: top face, front')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.getByText('No Sticker selected.')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Turn the selected Sticker’s Layers' })).toBeHidden()
})

test('after y, the controls refer to the Cube as it is now seen', async ({ page }) => {
  // The front face's right column.
  await page.keyboard.press('d')
  await page.keyboard.press('d')
  await expect(page.getByText('Selected: front face, right')).toBeVisible()

  await page.keyboard.press('Shift+ArrowLeft')
  await expect(page.getByRole('button', { name: 'Turn up: R' })).toBeVisible()
  await page.keyboard.press('ArrowUp')

  await expect(moveHistory(page)).toHaveText(['y', 'R'])
})

test('undo and redo work on Moves, from the keys and the buttons', async ({ page }) => {
  await page.keyboard.press('d')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('ArrowRight')
  await expect(moveHistory(page)).toHaveText(["M'", 'y', 'E'])

  await page.keyboard.press('ControlOrMeta+z')
  await expect(moveHistory(page)).toHaveText(["M'", 'y'])
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(moveHistory(page)).toHaveText(["M'", 'y', 'E'])

  const undo = page.getByRole('button', { name: 'Undo' })
  const redo = page.getByRole('button', { name: 'Redo' })
  for (let i = 0; i < 3; i++) await undo.click()
  await expect(moveHistory(page)).toHaveCount(0)
  await expect(solved(page)).toBeVisible()
  await expect(undo).toBeDisabled()

  await redo.click()
  await expect(moveHistory(page)).toHaveText(["M'"])

  // A new Move clears the redo stack.
  await page.keyboard.press('ArrowDown')
  await expect(moveHistory(page)).toHaveText(["M'", 'M'])
  await expect(redo).toBeDisabled()
})

test('dragging the empty space around the Cube rotates it, snapping square-on', async ({ page }) => {
  const view = page.getByRole('img', { name: 'The Cube' })
  const box = await view.boundingBox()
  if (box === null) throw new Error('the 3D view is not visible')
  // The view's top-left corner is clear of the Cube.
  const start = { x: box.x + box.width * 0.06, y: box.y + box.height * 0.06 }
  const drag = async (dx: number) => {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + box.width * dx, start.y, { steps: 12 })
    await page.mouse.up()
  }

  // A short drag springs back and records nothing; dragging right across
  // half the view turns the front a quarter turn to the right.
  await drag(0.15)
  await drag(0.55)

  await expect(moveHistory(page)).toHaveText(["y'"])
  await expect(solved(page)).toBeVisible()
})

test('the notation cheat sheet is one click away', async ({ page }) => {
  await page.getByRole('button', { name: 'Notation cheat sheet' }).click()

  const sheet = page.getByRole('dialog', { name: 'Notation' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('The middle Layer between L and R. It turns the same way as L.')).toBeVisible()
  await expect(sheet.getByText('The whole Cube turns the way U does: the front goes to the left.')).toBeVisible()

  // Keys inside the sheet stay there, and Esc closes it.
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(moveHistory(page)).toHaveCount(0)
})
