import {
    formatElapsedMs,
    readLocalPlayerName,
    saveLocalPlayerName
} from '../utils/localRecords';

const RANKING_API_BASE_URL = 'https://trademill-ranking-api.hyunjoonjoo.workers.dev';

export const RANKING_MODE = 'online-cloudflare-d1';

export { formatElapsedMs };

function normalizeName(name) {
    const raw = String(name || '').trim();

    if (!raw) {
        return 'YOU';
    }

    return raw
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 12) || 'YOU';
}

function normalizeLeaderboardEntry(entry) {
    return {
        playerName: normalizeName(entry.playerName),
        bestDistance: Math.max(0, Math.floor(Number(entry.bestDistance) || 0)),
        bestFinished: !!entry.bestFinished,
        bestElapsedMs: Number.isFinite(Number(entry.bestElapsedMs))
            ? Math.max(0, Math.floor(Number(entry.bestElapsedMs)))
            : null,
        bestReason: entry.bestReason || '',
        bestAt: entry.bestAt || '',
        lastDistance: Math.max(0, Math.floor(Number(entry.lastDistance) || 0)),
        lastFinished: !!entry.lastFinished,
        lastElapsedMs: Number.isFinite(Number(entry.lastElapsedMs))
            ? Math.max(0, Math.floor(Number(entry.lastElapsedMs)))
            : null,
        lastReason: entry.lastReason || '',
        updatedAt: entry.updatedAt || ''
    };
}

async function requestJson(path, options = {}) {
    const url = `${RANKING_API_BASE_URL}${path}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
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
            `Ranking API error: ${response.status}`;

        throw new Error(message);
    }

    return json;
}

export async function getPlayerName() {
    return readLocalPlayerName();
}

export async function savePlayerName(name) {
    return saveLocalPlayerName(name);
}

export async function getLeaderboard(mapId) {
    if (!mapId) {
        return [];
    }

    try {
        const json = await requestJson(
            `/leaderboard?mapId=${encodeURIComponent(mapId)}`
        );

        const leaderboard = Array.isArray(json.leaderboard)
            ? json.leaderboard
            : [];

        return leaderboard.map(normalizeLeaderboardEntry);
    } catch (error) {
        console.error('온라인 랭킹 조회 실패:', error);
        return [];
    }
}

export async function getPlayerBest(mapId, playerName = null) {
    if (!mapId) {
        return null;
    }

    const name = normalizeName(playerName || readLocalPlayerName());
    const leaderboard = await getLeaderboard(mapId);

    return leaderboard.find((entry) => {
        return normalizeName(entry.playerName) === name;
    }) || null;
}

export async function submitScore({
    mapId,
    distance,
    reason,
    finished = false,
    elapsedMs = null,
    playerName = null,
    mapMeta = null,
    mapData = null
}) {
    const name = normalizeName(playerName || readLocalPlayerName());

    const payload = {
        mapId,
        playerName: name,
        distance: Math.max(0, Math.floor(Number(distance) || 0)),
        reason: reason || 'GAME OVER',
        finished: !!finished || reason === 'FINISH',
        elapsedMs: Number.isFinite(Number(elapsedMs))
            ? Math.max(0, Math.floor(Number(elapsedMs)))
            : null
    };

    try {
        const json = await requestJson('/submit', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        return {
            record: json.record ? normalizeLeaderboardEntry(json.record) : null,
            previous: null,
            leaderboard: Array.isArray(json.leaderboard)
                ? json.leaderboard.map(normalizeLeaderboardEntry)
                : [],
            rank: json.rank ?? null,
            isNewBest: !!json.isNewBest,
            previousBest: 0,
            mode: RANKING_MODE
        };
    } catch (error) {
        console.error('온라인 점수 저장 실패:', error);

        return {
            record: null,
            previous: null,
            leaderboard: [],
            rank: null,
            isNewBest: false,
            previousBest: 0,
            mode: RANKING_MODE,
            error: String(error?.message || error)
        };
    }
}