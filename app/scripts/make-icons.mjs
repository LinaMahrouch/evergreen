#!/usr/bin/env node
/* Draws the app's icons from one mark: a white barbell on a dark green disc, on black.
 *
 *   npm run icons
 *
 * Writes assets/icon.png (iOS + store), the Android adaptive layers, the splash mark and the
 * web favicon. Change the mark here, not the PNGs.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets')
const BLACK = '#000000'
const GREEN = '#14532D'
const WHITE = '#FFFFFF'

// The barbell, on a 1024 canvas, centred. `s` scales it about the centre.
const barbell = (s = 1, color = WHITE) => `
  <g transform="translate(512 512) scale(${s}) translate(-512 -512)" fill="${color}">
    <rect x="252" y="498" width="520" height="28" rx="14"/>
    <rect x="336" y="388" width="48" height="248" rx="18"/>
    <rect x="640" y="388" width="48" height="248" rx="18"/>
    <rect x="276" y="430" width="40" height="164" rx="16"/>
    <rect x="708" y="430" width="40" height="164" rx="16"/>
  </g>`
const disc = (r = 318) => `<circle cx="512" cy="512" r="${r}" fill="${GREEN}"/>`
const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`)

const write = (name, body, size = 1024) =>
  sharp(svg(body)).resize(size, size).png().toFile(path.join(OUT, name))

await Promise.all([
  // Full-bleed, no transparency: iOS rounds the corners itself.
  write('icon.png', `<rect width="1024" height="1024" fill="${BLACK}"/>${disc()}${barbell()}`),
  // Android adaptive icon: the launcher crops to its own shape, so the mark stays inside the
  // middle two thirds. The background colour comes from app.json.
  write('android-icon-foreground.png', `${disc(236)}${barbell(0.74)}`),
  write('android-icon-monochrome.png', barbell(0.86)),
  write('android-icon-background.png', `<rect width="1024" height="1024" fill="${BLACK}"/>`),
  write('splash-icon.png', `${disc(318)}${barbell()}`),
  write('favicon.png', `<rect width="1024" height="1024" rx="200" fill="${BLACK}"/>${disc(400)}${barbell(1.25)}`, 96),
])
console.log('icons written to', OUT)
