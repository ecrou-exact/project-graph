// Icons offered for tag badges: a curated set of Font Awesome Free icons
// (https://fontawesome.com, icons under CC BY 4.0), bundled as SVG path data so
// nothing is fetched at runtime and the user never types a URL.
import {
  faBell, faBolt, faBook, faBug, faBuilding, faChartLine, faCheck, faCircleInfo,
  faCircleQuestion, faClock, faCloud, faCode, faCube, faDatabase, faEye, faFileLines,
  faFingerprint, faFire, faFlag, faGear, faGlobe, faGraduationCap, faHandshake, faHeart,
  faKey, faLightbulb, faLink, faLock, faMagnifyingGlass, faMoneyBill, faNetworkWired,
  faRobot, faRocket, faScaleBalanced, faServer, faShieldHalved, faSkull, faStar, faTag,
  faTerminal, faTriangleExclamation, faUser, faUsers, faVirus, faWrench, faXmark,
} from '@fortawesome/free-solid-svg-icons'
import {
  faAndroid, faApple, faAws, faDiscord, faDocker, faGithub, faGitlab, faGoogle, faJs,
  faLinux, faMastodon, faPython, faRust, faSlack, faWindows,
} from '@fortawesome/free-brands-svg-icons'

const SOLID = [
  faShieldHalved, faBug, faVirus, faSkull, faLock, faKey, faFingerprint, faTriangleExclamation,
  faCircleInfo, faCircleQuestion, faCheck, faXmark, faStar, faFlag, faTag, faHeart, faFire,
  faBolt, faBell, faLightbulb, faEye, faMagnifyingGlass, faDatabase, faServer, faCloud,
  faNetworkWired, faGlobe, faLink, faCode, faTerminal, faGear, faWrench, faCube, faRobot,
  faRocket, faChartLine, faClock, faBook, faFileLines, faGraduationCap, faUser, faUsers,
  faBuilding, faHandshake, faScaleBalanced, faMoneyBill,
]
const BRANDS = [
  faGithub, faGitlab, faPython, faJs, faRust, faDocker, faLinux, faWindows, faApple,
  faAndroid, faAws, faGoogle, faSlack, faDiscord, faMastodon,
]

/** name -> { width, height, path, brand } — names are Font Awesome's (e.g. "shield-halved"). */
export const BADGE_ICONS = Object.fromEntries([
  ...SOLID.map((icon) => [icon.iconName, toEntry(icon, false)]),
  ...BRANDS.map((icon) => [icon.iconName, toEntry(icon, true)]),
])

function toEntry({ icon: [width, height, , , path] }, brand) {
  return { width, height, path: Array.isArray(path) ? path.join(' ') : path, brand }
}

/** The icon as standalone SVG markup in the given colour, or undefined if unknown. */
export function badgeIconSvg(name, color = '#ffffff') {
  const icon = BADGE_ICONS[name]
  if (!icon) return undefined
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width} ${icon.height}"><path fill="${color}" d="${icon.path}"/></svg>`
}
