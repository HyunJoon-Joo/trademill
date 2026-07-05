const REMOTE_DATA_BASE_URL = 'https://hyunjoon-joo.github.io/trademill';

/*
  개발 중에는 true 유지.
  true:
  - npm run dev에서 /public/data/maps/index.json을 읽음
  - 맵 튜닝값 바꾸고 node scripts/fetch-market-data.mjs 하면 바로 반영됨

  false:
  - 개발 중에도 GitHub Pages의 원격 JSON을 읽음
*/
const USE_LOCAL_DATA_IN_DEV = true;

export const DATA_BASE_URL =
    import.meta.env.DEV && USE_LOCAL_DATA_IN_DEV
        ? ''
        : REMOTE_DATA_BASE_URL;

export const MAP_INDEX_PATH = '/data/maps/index.json';
export const LEGACY_MAP_PATH = '/data/market-terrain.json';

export function getDataUrl(path) {
    const cleanPath = String(path || '').startsWith('/')
        ? String(path || '')
        : `/${path}`;

    const base = String(DATA_BASE_URL || '').replace(/\/+$/, '');
    const url = base ? `${base}${cleanPath}` : cleanPath;

    const separator = url.includes('?') ? '&' : '?';

    return `${url}${separator}t=${Date.now()}`;
}