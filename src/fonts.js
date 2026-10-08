// Fonts bundled with the app (public/fonts). Registered here rather than in
// the stylesheet so the URL follows the page's base; the browser only
// downloads a font once some text uses it.
export const BUNDLED_FONTS = { Virgil: 'fonts/Virgil.woff2' }

export function registerFonts() {
  if (typeof FontFace === 'undefined') return
  for (const [family, path] of Object.entries(BUNDLED_FONTS)) {
    document.fonts.add(new FontFace(family, `url(${new URL(path, document.baseURI).href})`))
  }
}
