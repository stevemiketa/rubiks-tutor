// How the Cube looks, wherever it is drawn: the 3D view (CubeView) and the
// still picture (CubePicture) share the camera and the colors.
import type { Color } from '../cube/index.ts'

/** Where the fixed camera sits, looking at the Cube's center, and its vertical field of view in degrees. */
export const CAMERA = { position: [5, 4.6, 7.6] as const, fov: 37 }

/** The paint of each Sticker color. */
export const PAINT: Readonly<Record<Color, string>> = {
  white: '#f4f5f7',
  yellow: '#ffd400',
  green: '#00a650',
  blue: '#0b5fd3',
  red: '#c8102e',
  orange: '#ff6a00',
}

/** The Pieces' black plastic, between the Stickers. */
export const PLASTIC = '#16181d'

/** How wide a Sticker is, as a share of its Piece. */
export const STICKER_SIZE = 0.8
