const BOARD_PREFIX = 'tm_board_';
const PLAYER_NAME_KEY = 'tm_player_name';

function getStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }

    return window.localStorage;
}

function normalizeName(name) {
    const raw = String(name || '').trim();

    if (!raw) {
        return 'YOU';
    }

    return raw.slice(0, 12).toUpperCase();
}

export function formatElapsedMs(ms) {
    const value = Math.max(0, Math.floor(Number(ms) || 0));
    const totalSeconds = Math.floor(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((value % 1000) / 100);

    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function entryFinished(entry) {
    return !!entry?.bestFinished;
}

function entryElapsed(entry) {
    const elapsed = Number(entry?.bestElapsedMs);

    if (!Number.isFinite(elapsed) || elapsed <= 0) {
        return Number.POSITIVE_INFINITY;
    }

    return elapsed;
}

function isEntryABetter(a, b) {
    if (!b) {
        return true;
    }

    if (!a) {
        return false;
    }

    const aFinished = entryFinished(a);
    const bFinished = entryFinished(b);

    if (aFinished && !bFinished) {
        return true;
    }

    if (!aFinished && bFinished) {
        return false;
    }

    if (aFinished && bFinished) {
        const aTime = entryElapsed(a);
        const bTime = entryElapsed(b);

        if (aTime !== bTime) {
            return aTime < bTime;
        }
    }

    const aDistance = Number(a.bestDistance) || 0;
    const bDistance = Number(b.bestDistance) || 0;

    if (aDistance !== bDistance) {
        return aDistance > bDistance;
    }

    return String(a.bestAt || '').localeCompare(String(b.bestAt || '')) < 0;
}

function sortLeaderboard(entries) {
    return [...entries]
        .filter((entry) => entry && Number.isFinite(Number(entry.bestDistance)))
        .sort((a, b) => {
            if (isEntryABetter(a, b)) {
                return -1;
            }

            if (isEntryABetter(b, a)) {
                return 1;
            }

            return 0;
        })
        .slice(0, 10);
}

function dedupeLeaderboardByName(entries) {
    const bestByName = new Map();

    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        const name = normalizeName(entry.playerName || 'YOU');

        const normalizedEntry = {
            ...entry,
            playerName: name,
            bestDistance: Math.max(0, Math.floor(Number(entry.bestDistance) || 0)),
            bestFinished: !!entry.bestFinished,
            bestElapsedMs: Number.isFinite(Number(entry.bestElapsedMs))
                ? Math.max(0, Math.floor(Number(entry.bestElapsedMs)))
                : null,
            bestAt: entry.bestAt || new Date().toISOString(),
            bestReason: entry.bestReason || entry.lastReason || '',
            lastDistance: Math.max(0, Math.floor(Number(entry.lastDistance) || Number(entry.bestDistance) || 0)),
            lastReason: entry.lastReason || entry.bestReason || '',
            lastFinished: !!entry.lastFinished,
            lastElapsedMs: Number.isFinite(Number(entry.lastElapsedMs))
                ? Math.max(0, Math.floor(Number(entry.lastElapsedMs)))
                : null,
            updatedAt: entry.updatedAt || entry.bestAt || new Date().toISOString()
        };

        const existing = bestByName.get(name);

        if (isEntryABetter(normalizedEntry, existing)) {
            bestByName.set(name, normalizedEntry);
        }
    }

    return sortLeaderboard([...bestByName.values()]);
}

export function getLeaderboardKey(mapId) {
    return `${BOARD_PREFIX}${mapId}`;
}

export function readLocalPlayerName() {
    const store = getStorage();

    if (!store) {
        return 'YOU';
    }

    try {
        return normalizeName(store.getItem(PLAYER_NAME_KEY) || 'YOU');
    } catch {
        return 'YOU';
    }
}

export function saveLocalPlayerName(name) {
    const store = getStorage();

    if (!store) {
        return 'YOU';
    }

    const normalized = normalizeName(name);

    try {
        store.setItem(PLAYER_NAME_KEY, normalized);
    } catch {
        // ignore localStorage errors
    }

    return normalized;
}

function readRawLeaderboard(mapId) {
    const store = getStorage();

    if (!store || !mapId) {
        return [];
    }

    try {
        const raw = store.getItem(getLeaderboardKey(mapId));
        const parsed = raw ? JSON.parse(raw) : [];

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed;
    } catch {
        return [];
    }
}

function writeRawLeaderboard(mapId, entries) {
    const store = getStorage();

    if (!store || !mapId) {
        return;
    }

    try {
        store.setItem(getLeaderboardKey(mapId), JSON.stringify(dedupeLeaderboardByName(entries)));
    } catch {
        // ignore localStorage errors
    }
}

export function readLocalLeaderboard(mapId) {
    if (!mapId) {
        return [];
    }

    return dedupeLeaderboardByName(readRawLeaderboard(mapId));
}

export function readLocalRecord(mapId, playerName = null) {
    const board = readLocalLeaderboard(mapId);

    if (board.length === 0) {
        return null;
    }

    const targetName = normalizeName(playerName || readLocalPlayerName());

    const ownRecord = board.find((entry) => {
        return normalizeName(entry.playerName) === targetName;
    });

    return ownRecord || null;
}

export function saveLocalRunResult({
    mapId,
    distance,
    reason,
    finished = false,
    elapsedMs = null,
    playerName = null,
    mapMeta = null,
    mapData = null
}) {
    const store = getStorage();

    if (!store || !mapId) {
        return {
            record: null,
            previous: null,
            leaderboard: [],
            rank: null,
            isNewBest: false,
            previousBest: 0
        };
    }

    const normalizedName = normalizeName(playerName || readLocalPlayerName() || 'YOU');

    const numericDistance = Math.max(0, Math.floor(Number(distance) || 0));
    const numericElapsed = Number.isFinite(Number(elapsedMs))
        ? Math.max(0, Math.floor(Number(elapsedMs)))
        : null;

    const isFinished = !!finished || reason === 'FINISH';
    const now = new Date().toISOString();

    const boardBefore = readLocalLeaderboard(mapId);

    const previousForThisName = boardBefore.find((entry) => {
        return normalizeName(entry.playerName) === normalizedName;
    }) || null;

    const currentRunEntry = {
        playerName: normalizedName,

        bestDistance: numericDistance,
        bestReason: reason,
        bestAt: now,
        bestFinished: isFinished,
        bestElapsedMs: numericElapsed,

        lastDistance: numericDistance,
        lastReason: reason,
        lastFinished: isFinished,
        lastElapsedMs: numericElapsed,

        updatedAt: now,

        date: mapData?.date || mapData?.marketDate || mapMeta?.date || mapMeta?.marketDate || 'unknown',
        marketDate: mapData?.marketDate || mapData?.date || mapMeta?.marketDate || mapMeta?.date || 'unknown',
        symbol: mapData?.symbol || mapMeta?.symbol || '',
        label: mapData?.label || mapMeta?.label || '',
        interval: mapData?.interval || mapMeta?.interval || '',
        mode: mapData?.mode || mapMeta?.mode || '',
        difficulty: mapData?.difficulty || mapMeta?.difficulty || null
    };

    /*
      핵심 수정:
      이전 맵 전체 최고기록을 참조하지 않는다.
      오직 같은 닉네임의 기존 기록과만 비교한다.
    */
    const bestForThisName = isEntryABetter(currentRunEntry, previousForThisName)
        ? currentRunEntry
        : {
            ...previousForThisName,
            lastDistance: numericDistance,
            lastReason: reason,
            lastFinished: isFinished,
            lastElapsedMs: numericElapsed,
            updatedAt: now
        };

    const boardWithoutSameName = boardBefore.filter((entry) => {
        return normalizeName(entry.playerName) !== normalizedName;
    });

    const boardAfter = dedupeLeaderboardByName([
        ...boardWithoutSameName,
        bestForThisName
    ]);

    writeRawLeaderboard(mapId, boardAfter);

    const rankIndex = boardAfter.findIndex((entry) => {
        return normalizeName(entry.playerName) === normalizedName;
    });

    const isNewBest = isEntryABetter(currentRunEntry, previousForThisName);

    return {
        record: bestForThisName,
        previous: previousForThisName,
        leaderboard: boardAfter,
        rank: rankIndex >= 0 ? rankIndex + 1 : null,
        isNewBest,
        previousBest: previousForThisName?.bestDistance || 0
    };
}

export function readAllLocalRecords(mapMetas = []) {
    const records = [];

    for (const meta of mapMetas) {
        if (!meta?.mapId) {
            continue;
        }

        const leaderboard = readLocalLeaderboard(meta.mapId);
        const ownRecord = readLocalRecord(meta.mapId);

        if (ownRecord) {
            records.push({
                ...ownRecord,
                mapId: meta.mapId,
                date: meta.date || ownRecord.date || 'unknown',
                marketDate: meta.marketDate || meta.date || ownRecord.marketDate || 'unknown',
                symbol: meta.symbol || ownRecord.symbol || '',
                label: meta.label || ownRecord.label || '',
                interval: meta.interval || ownRecord.interval || '',
                mode: meta.mode || ownRecord.mode || '',
                difficulty: meta.difficulty || ownRecord.difficulty || null,
                leaderboard
            });
        }
    }

    records.sort((a, b) => {
        const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));

        if (dateCompare !== 0) {
            return dateCompare;
        }

        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

    return records;
}

/*
  실제 게임 UI에는 노출하지 않는다.
  개발 중 콘솔/디버그용으로만 사용.
*/
export function clearLocalRecord(mapId) {
    const store = getStorage();

    if (!store || !mapId) {
        return;
    }

    store.removeItem(getLeaderboardKey(mapId));
}

export function clearAllLocalRecords() {
    const store = getStorage();

    if (!store) {
        return;
    }

    const keysToRemove = [];

    for (let i = 0; i < store.length; i++) {
        const key = store.key(i);

        if (
            key &&
            (
                key.startsWith(BOARD_PREFIX) ||
                key.startsWith('tm_best_')
            )
        ) {
            keysToRemove.push(key);
        }
    }

    for (const key of keysToRemove) {
        store.removeItem(key);
    }
}