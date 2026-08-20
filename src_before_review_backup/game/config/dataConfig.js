const DEFAULT_REMOTE_DATA_BASE_URL = 'https://hyunjoon-joo.github.io/trademill';
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;

/*
  =========================
  맵 데이터 출처 선택
  =========================

  평소 실행:
      npm run dev
  → GitHub Pages의 최신 맵 데이터를 읽는다.

  로컬에서 방금 생성한 public/data를 시험할 때만:
      VITE_USE_LOCAL_MARKET_DATA=true npm run dev
  → 현재 프로젝트의 /public/data를 읽는다.

  이전처럼 소스의 true/false를 직접 바꾸지 않으므로,
  로컬 index.json이 오래되어 결과 화면 날짜가 과거에 멈추는 실수를 줄인다.
*/
const useLocalDataInDev =
    import.meta.env.DEV &&
    String(import.meta.env.VITE_USE_LOCAL_MARKET_DATA || '').toLowerCase() === 'true';

function normalizeRemoteBaseUrl(value) {
    const candidate = String(value || '').trim();

    if (!candidate) {
        return DEFAULT_REMOTE_DATA_BASE_URL;
    }

    try {
        const url = new URL(candidate);

        const isHttps = url.protocol === 'https:';
        const isLocalHttp =
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname);

        if (!isHttps && !isLocalHttp) {
            return DEFAULT_REMOTE_DATA_BASE_URL;
        }

        return url.toString().replace(/\/+$/, '');
    } catch {
        return DEFAULT_REMOTE_DATA_BASE_URL;
    }
}

const remoteDataBaseUrl = normalizeRemoteBaseUrl(
    import.meta.env.VITE_MARKET_DATA_BASE_URL
);

export const DATA_SOURCE_MODE = useLocalDataInDev ? 'local' : 'remote';
export const DATA_BASE_URL = useLocalDataInDev ? '' : remoteDataBaseUrl;

export const MAP_INDEX_PATH = '/data/maps/index.json';
export const LEGACY_MAP_PATH = '/data/market-terrain.json';

function normalizeDataPath(path) {
    const rawPath = String(path || '').trim();
    const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

    /*
      index.json 안의 path가 외부 URL이나 상위 폴더를 가리키지 못하게 한다.
      현재 게임 데이터는 반드시 /data/*.json 아래에 있어야 한다.
    */
    if (
        !cleanPath.startsWith('/data/') ||
        cleanPath.includes('..') ||
        !cleanPath.endsWith('.json')
    ) {
        throw new Error(`허용되지 않은 데이터 경로입니다: ${rawPath}`);
    }

    return cleanPath;
}

export function getDataUrl(path, { cacheBust = true } = {}) {
    const cleanPath = normalizeDataPath(path);
    const base = String(DATA_BASE_URL || '').replace(/\/+$/, '');
    const url = base ? `${base}${cleanPath}` : cleanPath;

    if (!cacheBust) {
        return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${Date.now()}`;
}

/*
  모든 맵 JSON 요청이 같은 타임아웃·캐시 정책을 쓰게 하는 공용 함수다.
  응답이 무한정 대기하면 Scene 전환이 멈춘 것처럼 보이므로 타임아웃을 둔다.
*/
export async function fetchDataJson(
    path,
    {
        timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
        signal = null,
        cacheBust = true
    } = {}
) {
    const controller = new AbortController();
    const safeTimeoutMs = Math.max(1000, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS);
    const timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);

    const abortFromParent = () => controller.abort();

    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener('abort', abortFromParent, { once: true });
        }
    }

    try {
        const response = await fetch(getDataUrl(path, { cacheBust }), {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`${path} 로드 실패: HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';

        if (!contentType.includes('application/json')) {
            throw new Error(`${path} 응답이 JSON이 아닙니다.`);
        }

        return await response.json();
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`${path} 요청이 취소되었거나 시간 초과되었습니다.`);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);

        if (signal) {
            signal.removeEventListener('abort', abortFromParent);
        }
    }
}
