import {
    formatElapsedMs,
    normalizePlayerName,
    readLocalPlayerName,
    saveLocalPlayerName
} from '../utils/localRecords';
import { normalizeMapId } from '../utils/mapDataUtils';

const RANKING_API_BASE_URL = 'https://trademill-ranking-api.hyunjoonjoo.workers.dev';
const REQUEST_TIMEOUT_MS = 10000;
const REQUIRED_NAME_POLICY = 'auto-suffix-always-v4';
const REQUIRED_RANKING_POLICY = 'finish-distance-time-reason-v5';

export const RANKING_MODE = 'online-cloudflare-d1';
export { formatElapsedMs };

function normalizeRankingElapsedMs(value) {
    /*
      JSON null에 Number(null)을 적용하면 0이 된다.
      예전 클라이언트는 이 때문에 서버의 '시간 없음(NULL)' 기록까지
      0:00.0으로 표시했다.

      실제 게임 랭킹에서 0ms 완주는 불가능하므로 0 이하 값도
      과거 오류 데이터로 보고 null 처리한다. UI에서는 --:--.- 로 표시된다.
    */
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return Math.floor(parsed);
}

function normalizeLeaderboardEntry(entry) {
    return {
        playerName: normalizePlayerName(entry?.playerName),
        bestDistance: Math.max(0, Math.floor(Number(entry?.bestDistance) || 0)),
        bestFinished: !!entry?.bestFinished,
        bestElapsedMs: normalizeRankingElapsedMs(entry?.bestElapsedMs),
        bestReason: String(entry?.bestReason || '').slice(0, 40),
        bestAt: String(entry?.bestAt || ''),
        lastDistance: Math.max(0, Math.floor(Number(entry?.lastDistance) || 0)),
        lastFinished: !!entry?.lastFinished,
        lastElapsedMs: normalizeRankingElapsedMs(entry?.lastElapsedMs),
        lastReason: String(entry?.lastReason || '').slice(0, 40),
        updatedAt: String(entry?.updatedAt || '')
    };
}

async function requestJson(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const method = String(options.method || 'GET').toUpperCase();
    const headers = {
        Accept: 'application/json',
        ...(options.headers || {})
    };

    if (options.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(`${RANKING_API_BASE_URL}${path}`, {
            ...options,
            method,
            headers,
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal
        });

        let json = null;

        try {
            json = await response.json();
        } catch {
            json = null;
        }

        if (!response.ok || !json?.ok) {
            const message =
                json?.error ||
                json?.detail ||
                `Ranking API error: HTTP ${response.status}`;

            throw new Error(message);
        }

        return json;
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error('랭킹 서버 요청 시간이 초과되었습니다.');
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function requireMapId(mapId) {
    const normalized = normalizeMapId(mapId);

    if (!normalized) {
        throw new Error('올바른 mapId가 없습니다.');
    }

    return normalized;
}

export async function getPlayerName() {
    return readLocalPlayerName();
}

export async function savePlayerName(name) {
    return saveLocalPlayerName(name);
}

/*
  UI에서 "랭킹 없음"과 "서버 오류"를 구분할 수 있도록
  배열만 반환하지 않고 상태를 함께 반환한다.
*/
export async function getLeaderboardResult(mapId) {
    try {
        const safeMapId = requireMapId(mapId);
        const json = await requestJson(
            `/leaderboard?mapId=${encodeURIComponent(safeMapId)}`
        );

        if (json.rankingPolicy !== REQUIRED_RANKING_POLICY) {
            throw new Error(
                '랭킹 서버가 구버전입니다. 시간 랭킹 Worker를 다시 배포해주세요.'
            );
        }

        const leaderboard = Array.isArray(json.leaderboard)
            ? json.leaderboard.map(normalizeLeaderboardEntry).slice(0, 10)
            : [];

        return {
            ok: true,
            leaderboard,
            error: ''
        };
    } catch (error) {
        console.error('온라인 랭킹 조회 실패:', error);

        return {
            ok: false,
            leaderboard: [],
            error: String(error?.message || error)
        };
    }
}

/* 기존 호출부와의 호환을 위한 간단한 배열 반환 함수 */
export async function getLeaderboard(mapId) {
    const result = await getLeaderboardResult(mapId);
    return result.leaderboard;
}

export async function getPlayerBest(mapId, playerName = null) {
    const name = normalizePlayerName(playerName || readLocalPlayerName());
    const result = await getLeaderboardResult(mapId);

    if (!result.ok) {
        return null;
    }

    return (
        result.leaderboard.find((entry) => entry.playerName === name) ||
        null
    );
}

export function formatRankingReason(reason, finished = false) {
    const normalized = String(reason || '').trim().toUpperCase();

    if (finished || normalized === 'FINISH') {
        return 'FIN';
    }

    if (normalized === 'GIVE UP') {
        return 'GUP';
    }

    if (normalized === 'FREE FALL') {
        return 'FALL';
    }

    if (normalized === 'OUT OF MARKET') {
        return 'OUT';
    }

    if (normalized === 'MARKET CRASH') {
        return 'CRASH';
    }

    return 'OVER';
}

export async function submitScore({
    mapId,
    distance,
    reason,
    finished = false,
    elapsedMs = null,
    playerName = null
}) {
    try {
        const safeMapId = requireMapId(mapId);
        const name = normalizePlayerName(playerName || readLocalPlayerName());
        const safeReason = String(reason || 'GAME OVER').slice(0, 40);

        const payload = {
            mapId: safeMapId,
            playerName: name,
            distance: Math.max(0, Math.floor(Number(distance) || 0)),
            reason: safeReason,
            finished: !!finished || safeReason === 'FINISH',
            elapsedMs: Number.isFinite(Number(elapsedMs))
                ? Math.max(0, Math.floor(Number(elapsedMs)))
                : null
        };

        const json = await requestJson('/submit', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        /*
          중복 이름 정책은 서버(D1)에서 처리된다.
          Worker가 구버전이면 KKK가 이미 있을 때 기존 KKK 기록을 갱신해버리므로,
          조용히 잘못 저장하지 말고 여기서 명확하게 실패시킨다.

          이 메시지가 보이면 ranking-api/src/index.js를 교체한 뒤
          Cloudflare Worker를 다시 deploy해야 한다.
        */
        if (json.namePolicy !== REQUIRED_NAME_POLICY) {
            throw new Error(
                '랭킹 서버가 구버전입니다. ranking-api Worker를 새 버전으로 배포해주세요.'
            );
        }

        if (json.rankingPolicy !== REQUIRED_RANKING_POLICY) {
            throw new Error(
                '랭킹 서버가 구버전입니다. 시간 랭킹 Worker를 다시 배포해주세요.'
            );
        }

        return {
            ok: true,
            playerName: normalizePlayerName(json.playerName || name),
            nameAdjusted: !!json.nameAdjusted,
            record: json.record ? normalizeLeaderboardEntry(json.record) : null,
            leaderboard: Array.isArray(json.leaderboard)
                ? json.leaderboard.map(normalizeLeaderboardEntry).slice(0, 10)
                : [],
            rank: json.rank ?? null,
            isNewBest: !!json.isNewBest,
            mode: RANKING_MODE,
            error: ''
        };
    } catch (error) {
        console.error('온라인 점수 저장 실패:', error);

        return {
            ok: false,
            playerName: '',
            nameAdjusted: false,
            record: null,
            leaderboard: [],
            rank: null,
            isNewBest: false,
            mode: RANKING_MODE,
            error: String(error?.message || error)
        };
    }
}
