import { describe, expect, it } from 'vitest'
import { isIconLoaded, loadIcon, tintedIcon } from '../src/icons.js'

const glyph = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24"/></svg>'
const dataUrl = `data:image/svg+xml,${encodeURIComponent(glyph)}`

describe('tintedIcon', () => {
  it('is undefined until the SVG source is loaded', () => {
    expect(tintedIcon('data:image/svg+xml,<svg/>', '#f00', 'circle')).toBeUndefined()
  })

  it('draws the glyph over a background of the node colour and shape', async () => {
    await loadIcon(dataUrl)
    expect(isIconLoaded(dataUrl)).toBe(true)
    const markup = decodeURIComponent(tintedIcon(dataUrl, '#0f9d8a', 'hexagon').split(',')[1])
    expect(markup).toContain('<g fill="#0f9d8a"><polygon')
    // The nested icon is resized: its own width/height are replaced.
    expect(markup).toContain('<svg x="5" y="5" width="22" height="22" xmlns=')
    expect(markup).not.toContain('width="24"')
  })

  it('ignores images that are not SVG', async () => {
    expect(await loadIcon('photo.png')).toBeNull()
    expect(tintedIcon('photo.png', '#000', 'circle')).toBeUndefined()
  })
})
