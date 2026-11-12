import type { ComponentPropsWithoutRef, MouseEvent } from 'react'
import { navigate } from './navigation.ts'

type LinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { to: string }

/**
 * An in-app link. A plain click changes the page without a reload; a
 * modified click (new tab, new window) is left to the browser.
 */
export function Link({ to, onClick, ...props }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (props.target && props.target !== '_self')
    ) {
      return
    }
    event.preventDefault()
    navigate(to)
  }

  return <a href={to} onClick={handleClick} {...props} />
}
