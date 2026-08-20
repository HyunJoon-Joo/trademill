import {
    formatElapsedMs,
    normalizePlayerName,
    readLocalPlayerName,
    saveLocalPlayerName
} from '../utils/localRecords';
import { normalizeMapId } from '../utils/mapDataUtils';

const RANKING_API_BASE_URL = 'https://trademill-ranking-api.hyunjoonjoo.workers.dev';
const REQUEST_TIMEOUT_MS = 10000;

export const RANKING_MODE = 'online-cloudflare-d1';
export { formatElapsedMs };

function normalizeLeaderboardEntry(entry) {
    return {
        playerName: normalizePlayerName(entry?.playerName),
        bestDistance: Math.max(0, Math.floor(Number(entry?.bestDistance) || 0)),
        bestFinished: !!entry?.bestFinished,
        bestElapsedMs: Number.isFinite(Number(entry?.bestElapsedMs))
            ? Math.max(0, Math.floor(Number(entry.bestElapsedMs)))
            : null,
        bestReason: String(entry?.bestReason || '').slice(0, 40),
        bestAt: String(entry?.bestAt || ''),
        lastDistance: Math.max(0, Math.floor(Number(entry?.lastDistance) || 0)),
        lastFinished: !!entry?.lastFinished,
        lastElapsedMs: Number.isFinite(Number(entry?.lastElapsedMs))
            ? Math.max(0, Math.floor(Number(entry.lastElapsedMs)))
            : null,
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

        return {
            ok: true,
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
            record: null,
            leaderboard: [],
            rank: null,
            isNewBest: false,
            mode: RANKING_MODE,
            error: String(error?.message || error)
        };
    }
}
