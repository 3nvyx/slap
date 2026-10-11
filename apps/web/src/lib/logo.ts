/** The logo, kept in one place: the mascot being slapped. It is traced from the last frame of the device's
 *  switch-on animation (screen/splash/6 in screen-lab/sprites.js, the mascot and the hand only), one square
 *  per pixel. `LogoArt` draws it on the page; `LOGO_ICON_HREF` is the same drawing as the browser-tab icon. */
const WIDTH = 76
const HEIGHT = 56

export const LOGO_VIEWBOX = `0 0 ${WIDTH} ${HEIGHT}`
export const LOGO_PATH =
  'M43 0h2v9h-2zM37 1h2v4h-2zM49 2h2v2h-2zM49 4h1v2h-1zM31 5h2v2h-2zM38 5h1v2h-1zM48 6h2v2h-2zM55 6h2v2h-2zM32 7h1v1h-1zM38 7h2v5h-2zM32 8h2v2h-2zM48 8h1v2h-1zM54 8h2v2h-2zM43 9h1v4h-1zM33 10h2v2h-2zM47 10h2v2h-2zM53 10h2v2h-2zM34 12h1v1h-1zM39 12h1v2h-1zM47 12h1v2h-1zM52 12h2v2h-2zM34 13h2v2h-2zM51 14h2v1h-2zM28 15h2v1h-2zM35 15h1v1h-1zM51 15h1v1h-1zM27 16h3v2h-3zM26 18h2v2h-2zM34 18h1v1h-1zM34 19h2v2h-2zM5 20h1v1h-1zM25 20h2v2h-2zM30 20h2v1h-2zM37 20h2v1h-2zM65 20h4v1h-4zM4 21h3v1h-3zM31 21h8v1h-8zM64 21h6v1h-6zM4 22h5v1h-5zM24 22h2v2h-2zM32 22h6v1h-6zM63 22h8v6h-8zM4 23h6v1h-6zM32 23h7v1h-7zM4 24h2v4h-2zM8 24h3v1h-3zM22 24h6v1h-6zM30 24h11v1h-11zM9 25h4v1h-4zM18 25h9v1h-9zM33 25h4v2h-4zM11 26h12v1h-12zM10 27h9v1h-9zM33 27h1v1h-1zM36 27h2v1h-2zM4 28h11v1h-11zM32 28h1v1h-1zM37 28h1v1h-1zM41 28h33v1h-33zM2 29h8v1h-8zM39 29h36v1h-36zM1 30h5v1h-5zM25 30h2v1h-2zM38 30h38v1h-38zM0 31h3v1h-3zM24 31h3v1h-3zM37 31h39v1h-39zM0 32h2v3h-2zM23 32h3v1h-3zM55 32h21v1h-21zM22 33h3v1h-3zM34 33h42v4h-42zM7 34h1v1h-1zM21 34h3v1h-3zM1 35h2v4h-2zM7 35h5v1h-5zM20 35h4v1h-4zM9 36h6v1h-6zM21 36h6v1h-6zM12 37h3v1h-3zM24 37h5v1h-5zM55 37h21v1h-21zM12 38h2v1h-2zM35 38h41v4h-41zM2 39h2v4h-2zM11 39h2v1h-2zM10 40h2v1h-2zM9 41h2v1h-2zM9 42h1v1h-1zM19 42h1v1h-1zM55 42h21v1h-21zM3 43h2v4h-2zM17 43h5v1h-5zM39 43h37v1h-37zM16 44h3v1h-3zM21 44h2v2h-2zM38 44h38v1h-38zM16 45h2v3h-2zM38 45h37v1h-37zM22 46h1v1h-1zM39 46h35v1h-35zM3 47h3v1h-3zM21 47h2v1h-2zM4 48h2v3h-2zM17 48h6v1h-6zM34 48h6v1h-6zM18 49h4v1h-4zM30 49h8v1h-8zM25 50h9v1h-9zM4 51h3v1h-3zM21 51h9v1h-9zM5 52h2v2h-2zM17 52h9v1h-9zM13 53h9v1h-9zM5 54h12v1h-12zM6 55h7v1h-7z'

// The tab icon has to be square, so the drawing sits in the middle of a WIDTH x WIDTH box. It is dark on a
// light tab bar and light on a dark one.
const ICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${(HEIGHT - WIDTH) / 2} ${WIDTH} ${WIDTH}">` +
  '<style>path{fill:#151515}@media(prefers-color-scheme:dark){path{fill:#ececea}}</style>' +
  `<path d="${LOGO_PATH}"/></svg>`

/** The logo as an address a `<link rel="icon">` can point at, with no file behind it. */
export const LOGO_ICON_HREF = `data:image/svg+xml,${encodeURIComponent(ICON_SVG)}`
