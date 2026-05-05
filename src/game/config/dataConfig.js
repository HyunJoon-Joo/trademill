export const DATA_BASE_URL = 'https://hyunjoon-joo.github.io/trademill';

export const MAP_INDEX_PATH = '/data/maps/index.json';
export const LEGACY_MAP_PATH = '/data/market-terrain.json';

export function getDataUrl(path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    if (!DATA_BASE_URL) {
        return `${normalizedPath}?t=${Date.now()}`;
    }

    return `${DATA_BASE_URL}${normalizedPath}?t=${Date.now()}`;
}