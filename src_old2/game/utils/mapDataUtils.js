const MAP_ID_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;
const DATA_PATH_PATTERN = /^\/data\/[A-Za-z0-9._\/-]+\.json$/;
const DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:_|$)/;
const MAX_MAP_COUNT = 5000;
const MAX_TERRAIN_POINTS = 5000;

function asFiniteNumber(value, fallback = null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeMapId(value, fallback = '') {
    const mapId = String(value || '').trim();

    if (!MAP_ID_PATTERN.test(mapId)) {
        return fallback;
    }

    return mapId;
}

export function normalizeDataPath(value, fallback = '') {
    const path = String(value || '').trim();

    if (!DATA_PATH_PATTERN.test(path) || path.includes('..')) {
        return fallback;
    }

    return path;
}

export function extractDateFromMapId(mapId) {
    const match = String(mapId || '').match(DATE_PREFIX_PATTERN);
    return match ? match[1] : '';
}

/*
  맵 날짜를 표시할 때 사용하는 단일 기준 함수다.

  우선순위:
  1. 실제 맵 JSON의 marketDate
  2. 실제 맵 JSON의 date
  3. index.json 안의 mapMeta.marketDate
  4. index.json 안의 mapMeta.date
  5. mapId 앞부분의 YYYY-MM-DD

  결과 화면에서 임의로 "오늘 날짜"를 쓰면 과거 맵 랭킹과 섞일 수 있다.
  반드시 실제 플레이한 mapId/맵 데이터에서 날짜를 구해야 한다.
*/
export function getMapDate(mapData = null, mapMeta = null) {
    const candidates = [
        mapData?.marketDate,
        mapData?.date,
        mapMeta?.marketDate,
        mapMeta?.date,
        extractDateFromMapId(mapData?.mapId || mapMeta?.mapId)
    ];

    const found = candidates.find((value) => {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    });

    return found || 'unknown date';
}

export function normalizeMapMeta(rawMeta, fallbackPath = '') {
    if (!rawMeta || typeof rawMeta !== 'object') {
        return null;
    }

    const mapId = normalizeMapId(rawMeta.mapId);
    const path = normalizeDataPath(rawMeta.path, fallbackPath);

    if (!mapId || !path) {
        return null;
    }

    const marketDate = getMapDate(rawMeta, rawMeta);

    return {
        mapId,
        date: marketDate,
        marketDate,
        symbol: String(rawMeta.symbol || '').slice(0, 40),
        label: String(rawMeta.label || '').slice(0, 80),
        interval: String(rawMeta.interval || '').slice(0, 20),
        mode: String(rawMeta.mode || '').slice(0, 30),
        timeZone: String(rawMeta.timeZone || '').slice(0, 50),
        barsUsed: Math.max(0, Math.floor(asFiniteNumber(rawMeta.barsUsed, 0))),
        difficulty:
            rawMeta.difficulty && typeof rawMeta.difficulty === 'object'
                ? { ...rawMeta.difficulty }
                : null,
        generatedAt: String(rawMeta.generatedAt || ''),
        path
    };
}

/*
  외부 JSON은 신뢰하지 않고 필요한 필드만 새 객체로 복사한다.
  이렇게 하면 잘못된 path, 비정상적으로 큰 배열, 깨진 latestMapId가
  게임 전체 상태로 그대로 들어오는 것을 막을 수 있다.
*/
export function normalizeMapIndex(rawIndex) {
    if (!rawIndex || typeof rawIndex !== 'object') {
        throw new Error('맵 인덱스 형식이 올바르지 않습니다.');
    }

    const rawMaps = Array.isArray(rawIndex.maps)
        ? rawIndex.maps.slice(0, MAX_MAP_COUNT)
        : [];

    const seen = new Set();
    const maps = [];

    for (const rawMeta of rawMaps) {
        const meta = normalizeMapMeta(rawMeta);

        if (!meta || seen.has(meta.mapId)) {
            continue;
        }

        seen.add(meta.mapId);
        maps.push(meta);
    }

    if (maps.length === 0) {
        throw new Error('맵 인덱스에 사용할 수 있는 맵이 없습니다.');
    }

    const requestedLatestMapId = normalizeMapId(rawIndex.latestMapId);
    const latestMapId = maps.some((map) => map.mapId === requestedLatestMapId)
        ? requestedLatestMapId
        : maps[0].mapId;

    return {
        schemaVersion: Math.max(1, Math.floor(asFiniteNumber(rawIndex.schemaVersion, 1))),
        updatedAt: String(rawIndex.updatedAt || ''),
        latestMapId,
        maps
    };
}

export function buildLegacyMapIndex(rawMap, legacyPath) {
    const mapId = normalizeMapId(rawMap?.mapId, 'legacy-market-terrain');
    const path = normalizeDataPath(legacyPath);

    if (!path) {
        throw new Error('legacy map 경로가 올바르지 않습니다.');
    }

    const meta = normalizeMapMeta(
        {
            ...rawMap,
            mapId,
            path,
            generatedAt: rawMap?.generatedAt || new Date().toISOString()
        },
        path
    );

    if (!meta) {
        throw new Error('legacy map을 인덱스로 변환하지 못했습니다.');
    }

    return {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        latestMapId: meta.mapId,
        maps: [meta]
    };
}

export function getLatestMapMeta(index) {
    if (!index || !Array.isArray(index.maps) || index.maps.length === 0) {
        return null;
    }

    return (
        index.maps.find((map) => map.mapId === index.latestMapId) ||
        index.maps[0]
    );
}

/*
  지형 포인트 정리 규칙:
  - x/y가 숫자인 포인트만 사용
  - x 오름차순 정렬
  - 같은 x가 중복되면 마지막 값을 사용
  - 지나치게 큰 데이터는 상한을 둠

  Matter 충돌체는 x가 반드시 증가하는 선분을 전제로 하므로
  이 검증을 GameScene 밖의 공용 함수로 고정한다.
*/
export function normalizeTerrainPoints(rawPoints) {
    if (!Array.isArray(rawPoints)) {
        throw new Error('맵 points가 배열이 아닙니다.');
    }

    const byX = new Map();

    for (const rawPoint of rawPoints.slice(0, MAX_TERRAIN_POINTS)) {
        const x = asFiniteNumber(rawPoint?.x);
        const y = asFiniteNumber(rawPoint?.y);

        if (x === null || y === null) {
            continue;
        }

        byX.set(x, { x, y });
    }

    const points = [...byX.values()].sort((a, b) => a.x - b.x);

    if (points.length < 2) {
        throw new Error('유효한 지형 포인트가 2개보다 적습니다.');
    }

    for (let index = 1; index < points.length; index += 1) {
        if (points[index].x <= points[index - 1].x) {
            throw new Error('지형 x 좌표가 증가하지 않습니다.');
        }
    }

    return points;
}

export function normalizeTerrainMap(rawMap, expectedMeta = null) {
    if (!rawMap || typeof rawMap !== 'object') {
        throw new Error('맵 JSON 형식이 올바르지 않습니다.');
    }

    const expectedMapId = normalizeMapId(expectedMeta?.mapId);
    const mapId = normalizeMapId(rawMap.mapId, expectedMapId);

    if (!mapId) {
        throw new Error('맵 JSON에 올바른 mapId가 없습니다.');
    }

    if (expectedMapId && mapId !== expectedMapId) {
        throw new Error(
            `맵 파일과 index.json의 mapId가 다릅니다: ${expectedMapId} / ${mapId}`
        );
    }

    const points = normalizeTerrainPoints(rawMap.points);
    const marketDate = getMapDate(rawMap, expectedMeta);

    /*
      rawMap 전체를 spread하지 않고 게임에서 실제로 쓰는 필드만 복사한다.
      자체 GitHub Pages 데이터이더라도 클라이언트 경계에서는 최소 필드 원칙을 지킨다.
    */
    return {
        schemaVersion: Math.max(1, Math.floor(asFiniteNumber(rawMap.schemaVersion, 1))),
        mapId,
        date: marketDate,
        marketDate,
        source: String(rawMap.source || '').slice(0, 120),
        symbol: String(rawMap.symbol || expectedMeta?.symbol || '').slice(0, 40),
        label: String(rawMap.label || expectedMeta?.label || '').slice(0, 80),
        interval: String(rawMap.interval || expectedMeta?.interval || '').slice(0, 20),
        mode: String(rawMap.mode || expectedMeta?.mode || '').slice(0, 30),
        timeZone: String(rawMap.timeZone || expectedMeta?.timeZone || '').slice(0, 50),
        barsUsed: Math.max(
            0,
            Math.floor(asFiniteNumber(rawMap.barsUsed, points.length))
        ),
        stepX: asFiniteNumber(rawMap.stepX, null),
        generatedAt: String(rawMap.generatedAt || ''),
        minY: asFiniteNumber(rawMap.minY, null),
        maxY: asFiniteNumber(rawMap.maxY, null),
        baseY: asFiniteNumber(rawMap.baseY, null),
        chartMode: String(rawMap.chartMode || '').slice(0, 80),
        mapAlgorithmVersion: String(rawMap.mapAlgorithmVersion || '').slice(0, 40),
        activeProfile: String(rawMap.activeProfile || '').slice(0, 40),
        terrainTuning:
            rawMap.terrainTuning && typeof rawMap.terrainTuning === 'object'
                ? { ...rawMap.terrainTuning }
                : null,
        priceScale:
            rawMap.priceScale && typeof rawMap.priceScale === 'object'
                ? { ...rawMap.priceScale }
                : null,
        difficulty:
            rawMap.difficulty && typeof rawMap.difficulty === 'object'
                ? { ...rawMap.difficulty }
                : expectedMeta?.difficulty || null,
        points
    };
}

export function sortMapsOldestToNewest(maps) {
    return [...(Array.isArray(maps) ? maps : [])].sort((a, b) => {
        const dateCompare = getMapDate(a, a).localeCompare(getMapDate(b, b));

        if (dateCompare !== 0) {
            return dateCompare;
        }

        return String(a.generatedAt || '').localeCompare(String(b.generatedAt || ''));
    });
}
