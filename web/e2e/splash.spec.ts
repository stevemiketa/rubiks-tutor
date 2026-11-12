import { expect, test, type Page } from '@playwright/test'
import { scramble } from './tutor.ts'

const cubeView = (page: Page) => page.getByRole('img', { name: /^The Cube/ })

// A picture of the middle of the 3D view, where only the Cube is drawn: the
// name and the button sit above and below it. CSS animations (the background
// gradient) are held still, so only the Cube can change the picture.
async function cubePicture(page: Page): Promise<string> {
  const box = await cubeView(page).boundingBox()
  if (box === null) throw new Error('the 3D view is not visible')
  const clip = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3, width: box.width * 0.4, height: box.height * 0.4 }
  return (await page.screenshot({ clip, animations: 'disabled' })).toString('base64')
}

// Makes the browser report that it has no WebGL, as one with WebGL turned off
// or unsupported does.
const WITHOUT_WEBGL = `{
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return /webgl/i.test(String(type)) ? null : getContext.call(this, type, ...rest)
  }
}`

const NO_WEBGL_EXPLANATION = /can.t show the 3D Cube/

test('the splash page shows the Cube scrambling and solving itself, without calling the server', async ({ page, baseURL }) => {
  const requests: URL[] = []
  page.on('request', (request) => requests.push(new URL(request.url())))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Cubular' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start solving' })).toBeVisible()
  await expect(cubeView(page)).toBeVisible()

  // Before the first frame, the first frame, then the Cube moving.
  const pictures = new Set<string>()
  await expect
    .poll(async () => pictures.add(await cubePicture(page)).size, { timeout: 15_000, intervals: [200] })
    .toBeGreaterThanOrEqual(3)

  const origin = new URL(baseURL ?? '').origin
  const calls = requests.filter((url) => url.protocol.startsWith('http') && (url.origin !== origin || url.pathname.startsWith('/api/')))
  expect(calls.map(String)).toEqual([])
})

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the splash page shows a still image of the Cube instead of the animation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Cubular' })).toBeVisible()
    await expect(cubeView(page)).toBeVisible()

    // Once drawn, the picture stays the same for longer than the animation
    // waits before its first Move.
    let previous = ''
    await expect
      .poll(async () => {
        const [before, now] = [previous, await cubePicture(page)]
        previous = now
        return now === before
      }, { timeout: 10_000, intervals: [400] })
      .toBe(true)
    await page.waitForTimeout(2500)
    expect(await cubePicture(page)).toBe(previous)

    await page.getByRole('link', { name: 'Start solving' }).click()
    await expect(page.getByRole('heading', { name: 'Tutor' })).toBeVisible()
  })
})

test.describe('without WebGL', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ content: WITHOUT_WEBGL })
  })

  test('the splash page and the tutor explain why the Cube is missing', async ({ page }) => {
    const errors: Error[] = []
    page.on('pageerror', (error) => errors.push(error))

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Cubular' })).toBeVisible()
    await expect(page.getByText(NO_WEBGL_EXPLANATION)).toBeVisible()

    await page.getByRole('link', { name: 'Start solving' }).click()
    await expect(page.getByRole('heading', { name: 'Tutor' })).toBeVisible()
    await expect(page.getByText(NO_WEBGL_EXPLANATION)).toBeVisible()
    // With nothing to animate it, the Scramble is applied at once rather
    // than left playing for ever.
    await expect(scramble(page)).toBeVisible()
    await expect(page.getByText('Scrambling…')).toBeHidden()

    expect(errors).toEqual([])
  })
})

test("the product never says Rubik's", async ({ browser }) => {
  for (const webgl of [true, false]) {
    const context = await browser.newContext()
    const page = await context.newPage()
    if (!webgl) await page.addInitScript({ content: WITHOUT_WEBGL })
    for (const path of ['/', '/app']) {
      await page.goto(path)
      await expect(page.getByRole('heading').first()).toBeVisible()
      await expect(page).not.toHaveTitle(/rubik/i)
      await expect(page.locator('body')).not.toContainText(/rubik/i)
    }
    await context.close()
  }
})
