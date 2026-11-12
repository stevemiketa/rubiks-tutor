import { expect, test, type Page } from '@playwright/test'
import { shareButton, shareDialog } from './tutor.ts'

const themeControl = (page: Page) => page.getByRole('combobox', { name: 'Theme' })

// The spec files have no DOM types, so the page runs these as strings.
const rootStyle = (page: Page, property: 'backgroundColor' | 'colorScheme'): Promise<string> =>
  page.evaluate(`getComputedStyle(document.documentElement).${property}`).then(String)

/** The theme the page shows, told by its background: light or dark. */
async function shownTheme(page: Page): Promise<'light' | 'dark'> {
  const [r = 0, g = 0, b = 0] = ((await rootStyle(page, 'backgroundColor')).match(/[\d.]+/g) ?? []).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? 'light' : 'dark'
}

test.use({ reducedMotion: 'reduce' })

test.describe('with the browser set to light', () => {
  test.use({ colorScheme: 'light' })

  test('the app opens light, on the System setting', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Cubular' })).toBeVisible()
    expect(await shownTheme(page)).toBe('light')

    await page.goto('/app')
    await expect(themeControl(page)).toHaveValue('system')
    await expect(themeControl(page).getByRole('option')).toHaveText(['System', 'Light', 'Dark'])
    expect(await shownTheme(page)).toBe('light')
  })

  test('choosing Dark applies at once and survives a reload, on the splash page too', async ({ page }) => {
    await page.goto('/app')
    await themeControl(page).selectOption('Dark')
    await expect.poll(() => shownTheme(page)).toBe('dark')
    // Native controls follow the theme too.
    expect(await rootStyle(page, 'colorScheme')).toBe('dark')

    await page.reload()
    await expect(themeControl(page)).toHaveValue('dark')
    expect(await shownTheme(page)).toBe('dark')

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Cubular' })).toBeVisible()
    expect(await shownTheme(page)).toBe('dark')
  })

  test('a saved Dark shows before the app’s script runs, so a reload never flashes light', async ({ page }) => {
    await page.goto('/app')
    await themeControl(page).selectOption('Dark')

    // Only index.html and the CSS load: the app never starts.
    await page.route('**/assets/*.js', (route) => route.abort())
    await page.reload()

    expect(await shownTheme(page)).toBe('dark')
    await expect(themeControl(page)).toHaveCount(0)
  })

  test('a share link doesn’t carry the theme: its recipient sees their own', async ({ page, browser }) => {
    await page.goto('/app')
    await themeControl(page).selectOption('Dark')
    await expect(shareButton(page)).toBeEnabled()
    await shareButton(page).click()
    const link = shareDialog(page).getByRole('textbox', { name: 'Share link' })
    await expect(link).toHaveValue(/\/s\/[\w-]{10}$/)

    const recipientContext = await browser.newContext({ colorScheme: 'light', reducedMotion: 'reduce' })
    const recipient = await recipientContext.newPage()
    await recipient.goto(await link.inputValue())
    await expect(themeControl(recipient)).toHaveValue('system')
    expect(await shownTheme(recipient)).toBe('light')
    await recipientContext.close()
  })
})

test('choosing System follows the browser: dark while it’s set to dark, and live as it changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/app')
  await themeControl(page).selectOption('Light')
  await page.emulateMedia({ colorScheme: 'dark' })
  // Light overrides the browser.
  expect(await shownTheme(page)).toBe('light')

  await themeControl(page).selectOption('System')
  await expect.poll(() => shownTheme(page)).toBe('dark')
  // System keeps no saved choice.
  expect(await page.evaluate('localStorage.getItem("cubular.theme")')).toBeNull()

  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => shownTheme(page)).toBe('light')
})
