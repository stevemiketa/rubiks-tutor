// What the 3D view shows when the browser can't render WebGL: a short
// explanation in place of the Cube, so the page around it still works.
import { Component, type ReactNode } from 'react'

let available: boolean | undefined

/**
 * Whether this browser can render the 3D Cube. three.js needs WebGL 2, which
 * is missing when it's turned off, unsupported or blocked for the GPU.
 */
export function canRenderWebGL(): boolean {
  available ??= probe()
  return available
}

function probe(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (gl === null) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/**
 * Renders children, or the fallback when WebGL is unavailable: either known
 * up front, or found out when the renderer fails to start.
 */
export function WebGLGate({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  if (!canRenderWebGL()) return fallback
  return <RendererFailed fallback={fallback}>{children}</RendererFailed>
}

class RendererFailed extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** The explanation shown instead of the 3D Cube. */
export function NoWebGL({ className }: { className?: string }) {
  return (
    <div className={['cube-unavailable', className].filter(Boolean).join(' ')} role="note">
      <p>
        <strong>Your browser can't show the 3D Cube.</strong> WebGL is turned off or not supported. Try a current
        version of Chrome, Firefox, Safari or Edge, or turn on hardware acceleration in your browser's settings.
      </p>
    </div>
  )
}
