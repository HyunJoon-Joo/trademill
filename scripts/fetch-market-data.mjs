import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YahooFinance from 'yahoo-finance2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const publicDataDir = path.join(rootDir, 'public', 'data');
const mapsDir = path.join(publicDataDir, 'maps');
const indexFile = path.join(mapsDir, 'index.json');
const legacyOutFile = path.join(publicDataDir, 'market-terrain.json');

const yahooFinance = new YahooFinance();

const TRADING_TIME_ZONE = 'America/New_York';

/*
  1분봉 우선.
  ^IXIC 1m 실패 시 QQQ 1m fallback.
*/
const CANDIDATES = [
    {
        symbol: '^IXIC',
        label: 'NASDAQ Composite',
        interval: '1m',
        daysBack: 7,
        maxBars: 420
    },
    {
        symbol: 'QQQ',
        label: 'QQQ',
        interval: '1m',
        daysBack: 7,
        maxBars: 420
    },
    {
        symbol: '^IXIC',
        label: 'NASDAQ Composite',
        interval: '5m',
        daysBack: 7,
        maxBars: 390
    },
    {
        symbol: 'QQQ',
        label: 'QQQ',
        interval: '5m',
        daysBack: 7,
        maxBars: 390
    }
];

/*
  진짜 체감 튜닝 포인트.
  STEP_X가 작을수록 같은 높이 변화도 더 급경사로 느껴짐.
*/
const STEP_X = 18;
const BASE_Y = 520;
const MIN_Y = 335;
const MAX_Y = 655;

const TERRAIN_TUNING = {
    intraday: {
        pctMul: 90000,
        gapMul: 45000,
        bodyMul: 52000,
        wickMul: 85000,
        rangeMul: 52000,

        power: 1.18,
        boost: 1.85,

        minMagnitude: 1.8,
        minDelta: 8,
        deltaClamp: 95,

        shockThreshold: 0.0008,
        shockExtra: 1.85,

        edgeBounce: 0.42
    },

    daily: {
        pctMul: 26000,
        gapMul: 12000,
        bodyMul: 9000,
        wickMul: 16000,
        rangeMul: 10000,

        power: 1.22,
        boost: 2.1,

        minMagnitude: 3.0,
        minDelta: 14,
        deltaClamp: 120,

        shockThreshold: 0.012,
        shockExtra: 1.8,

        edgeBounce: 0.35
    }
};

function round(value, digits = 4) {
    const m = 10 ** digits;
    return Math.round(value * m) / m;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function safeSymbol(symbol) {
    return symbol
        .replace(/^\^/, '')
        .replace(/[^a-zA-Z0-9]+/g, '')
        .toUpperCase();
}

function formatDateInTimeZone(dateLike, timeZone) {
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike);

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;

    return `${y}-${m}-${d}`;
}

function toIsoString(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);

    if (Number.isNaN(d.getTime())) {
        return String(dateLike);
    }

    return d.toISOString();
}

function deterministicNoise(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
}

function downsampleEvenly(items, maxCount) {
    if (items.length <= maxCount) {
        return items;
    }

    const out = [];
    const step = (items.length - 1) / (maxCount - 1);

    for (let i = 0; i < maxCount; i++) {
        const idx = Math.round(i * step);
        out.push(items[idx]);
    }

    return out;
}

async function fetchChartWithFallback(candidate) {
    const query = {
        period1: new Date(Date.now() - candidate.daysBack * 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: candidate.interval,
        includePrePost: false
    };

    try {
        return await yahooFinance.chart(candidate.symbol, query);
    } catch (error) {
        console.warn('');
        console.warn(`[1차 시도 실패] ${candidate.symbol} ${candidate.interval}`);
        console.warn(`${error.name}: ${error.message}`);
        console.warn('validateResult=false 로 한 번 더 시도합니다...');

        return yahooFinance.chart(candidate.symbol, query, { validateResult: false });
    }
}

function extractAllBars(chartResult, candidate) {
    const quotes = Array.isArray(chartResult?.quotes) ? chartResult.quotes : [];

    const bars = quotes
        .map((q) => ({
            time: toIsoString(q.date),
            open: Number(q.open),
            high: Number(q.high),
            low: Number(q.low),
            close: Number(q.close),
            volume: Number(q.volume ?? 0)
        }))
        .filter(
            (b) =>
                Number.isFinite(b.open) &&
                Number.isFinite(b.high) &&
                Number.isFinite(b.low) &&
                Number.isFinite(b.close)
        )
        .sort((a, b) => new Date(a.time) - new Date(b.time));

    if (bars.length < 20) {
        throw new Error(
            `${candidate.symbol} ${candidate.interval} 데이터가 너무 적습니다. bars=${bars.length}`
        );
    }

    return bars;
}

function selectLatestMarketDayBars(allBars, candidate) {
    const groups = new Map();

    for (const bar of allBars) {
        const marketDate = formatDateInTimeZone(bar.time, TRADING_TIME_ZONE);

        if (!groups.has(marketDate)) {
            groups.set(marketDate, []);
        }

        groups.get(marketDate).push(bar);
    }

    const dates = [...groups.keys()].sort();

    if (dates.length === 0) {
        throw new Error('시장 날짜 그룹을 만들 수 없습니다.');
    }

    /*
      최신 날짜 그룹을 선택.
      장중 실행이면 당일 partial map이 될 수 있음.
      매일 고정맵 운영에서는 장 마감 후 자동 실행하면 됨.
    */
    let selectedDate = dates[dates.length - 1];
    let selectedBars = groups.get(selectedDate);

    /*
      너무 이른 장중 데이터가 들어와서 포인트가 너무 적으면,
      직전 거래일을 사용.
    */
    if (selectedBars.length < 60 && dates.length >= 2) {
        selectedDate = dates[dates.length - 2];
        selectedBars = groups.get(selectedDate);
    }

    selectedBars = downsampleEvenly(selectedBars, candidate.maxBars);

    if (selectedBars.length < 60) {
        throw new Error(
            `${candidate.symbol} ${candidate.interval} 선택된 날짜 데이터가 너무 적습니다. date=${selectedDate}, bars=${selectedBars.length}`
        );
    }

    return {
        marketDate: selectedDate,
        bars: selectedBars
    };
}

async function getMarketBars() {
    const errors = [];

    for (const candidate of CANDIDATES) {
        try {
            console.log('');
            console.log(`시도 중: ${candidate.symbol} / ${candidate.interval}`);

            const result = await fetchChartWithFallback(candidate);
            const allBars = extractAllBars(result, candidate);
            const selected = selectLatestMarketDayBars(allBars, candidate);

            console.log(
                `성공: ${candidate.symbol} / ${candidate.interval} / date=${selected.marketDate} / bars=${selected.bars.length}`
            );

            return {
                source: 'Yahoo Finance via yahoo-finance2',
                symbol: candidate.symbol,
                safeSymbol: safeSymbol(candidate.symbol),
                label: candidate.label,
                interval: candidate.interval,
                mode: candidate.interval.endsWith('m') ? 'intraday' : 'daily',
                marketDate: selected.marketDate,
                bars: selected.bars
            };
        } catch (error) {
            const message = `${candidate.symbol} ${candidate.interval} 실패: ${error.name}: ${error.message}`;
            console.warn(message);
            errors.push(message);
        }
    }

    throw new Error(
        [
            '모든 후보 심볼/interval이 실패했습니다.',
            '',
            ...errors
        ].join('\n')
    );
}

function reflectIntoRange(y, edgeBounce) {
    if (y < MIN_Y) {
        const overflow = MIN_Y - y;
        return MIN_Y + overflow * edgeBounce;
    }

    if (y > MAX_Y) {
        const overflow = y - MAX_Y;
        return MAX_Y - overflow * edgeBounce;
    }

    return y;
}

function buildTerrainData(result) {
    const cfg = TERRAIN_TUNING[result.mode];
    const bars = result.bars;

    let currentY = BASE_Y;

    const mapId = `${result.marketDate}_${result.safeSymbol}_${result.interval}`;

    const points = [
        {
            index: 0,
            time: bars[0].time,
            x: 0,
            y: round(currentY, 2)
        }
    ];

    for (let i = 1; i < bars.length; i++) {
        const prev = bars[i - 1];
        const bar = bars[i];

        const prevClose = Math.max(prev.close, 1);

        const pctChange = (bar.close - prev.close) / prevClose;
        const gapPct = (bar.open - prev.close) / prevClose;
        const bodyPct = (bar.close - bar.open) / prevClose;
        const rangePct = (bar.high - bar.low) / prevClose;

        const upperWick = (bar.high - Math.max(bar.open, bar.close)) / prevClose;
        const lowerWick = (Math.min(bar.open, bar.close) - bar.low) / prevClose;
        const wickBias = lowerWick - upperWick;

        const noise = deterministicNoise(i + Math.floor(bar.close * 100));

        /*
          price up => y 감소 => 화면상 언덕 위로 올라감
          price down => y 증가 => 화면상 아래로 떨어짐
        */
        let signedMoveRaw =
            pctChange * cfg.pctMul +
            gapPct * cfg.gapMul +
            bodyPct * cfg.bodyMul +
            wickBias * cfg.wickMul;

        const rangeChaos =
            rangePct *
            cfg.rangeMul *
            (0.65 + Math.abs(noise) * 0.75) *
            (bodyPct >= 0 ? 1 : -1);

        signedMoveRaw += rangeChaos;

        if (Math.abs(pctChange) > cfg.shockThreshold) {
            signedMoveRaw *= cfg.shockExtra;
        }

        const fallbackSign =
            Math.sign(pctChange) ||
            Math.sign(bodyPct) ||
            Math.sign(wickBias) ||
            (noise >= 0 ? 1 : -1);

        const sign = Math.sign(signedMoveRaw) || fallbackSign;

        let magnitude = Math.abs(signedMoveRaw);
        magnitude = Math.max(magnitude, cfg.minMagnitude);

        magnitude = Math.pow(magnitude, cfg.power) * cfg.boost;
        magnitude += Math.abs(noise) * 6;

        magnitude = Math.max(magnitude, cfg.minDelta);
        magnitude = Math.min(magnitude, cfg.deltaClamp);

        const deltaY = sign * magnitude;

        currentY -= deltaY;
        currentY = reflectIntoRange(currentY, cfg.edgeBounce);
        currentY = clamp(currentY, MIN_Y, MAX_Y);

        points.push({
            index: i,
            time: bar.time,
            x: i * STEP_X,
            y: round(currentY, 2)
        });
    }

    const difficulty = calculateDifficulty(points);

    return {
        schemaVersion: 1,
        mapId,
        date: result.marketDate,
        marketDate: result.marketDate,
        source: result.source,
        symbol: result.symbol,
        label: result.label,
        interval: result.interval,
        mode: result.mode,
        barsUsed: bars.length,
        stepX: STEP_X,
        generatedAt: new Date().toISOString(),
        minY: MIN_Y,
        maxY: MAX_Y,
        difficulty,
        points
    };
}

function calculateDifficulty(points) {
    let totalUphill = 0;
    let totalDrop = 0;
    let maxUphillStep = 0;
    let maxDropStep = 0;
    let totalAbs = 0;

    for (let i = 1; i < points.length; i++) {
        const dy = points[i].y - points[i - 1].y;
        const abs = Math.abs(dy);

        totalAbs += abs;

        /*
          y 감소 = 화면상 위로 올라감 = 오르막
          y 증가 = 화면상 아래로 떨어짐 = 낙하 위험
        */
        if (dy < 0) {
            totalUphill += Math.abs(dy);
            maxUphillStep = Math.max(maxUphillStep, Math.abs(dy));
        } else {
            totalDrop += dy;
            maxDropStep = Math.max(maxDropStep, dy);
        }
    }

    const avgAbs = totalAbs / Math.max(points.length - 1, 1);

    const rawScore =
        avgAbs * 0.12 +
        maxUphillStep * 0.035 +
        maxDropStep * 0.045 +
        totalUphill * 0.0015 +
        totalDrop * 0.0012;

    const score = clamp(rawScore, 1, 10);

    return {
        score: round(score, 2),
        avgStep: round(avgAbs, 2),
        maxUphillStep: round(maxUphillStep, 2),
        maxDropStep: round(maxDropStep, 2),
        totalUphill: round(totalUphill, 2),
        totalDrop: round(totalDrop, 2)
    };
}

async function readIndex() {
    try {
        const text = await fs.readFile(indexFile, 'utf8');
        const json = JSON.parse(text);

        if (!json || !Array.isArray(json.maps)) {
            throw new Error('index.json 구조가 올바르지 않습니다.');
        }

        return json;
    } catch {
        return {
            schemaVersion: 1,
            updatedAt: null,
            latestMapId: null,
            maps: []
        };
    }
}

function upsertMapEntry(index, terrain) {
    const pathForClient = `/data/maps/${terrain.mapId}.json`;

    const entry = {
        mapId: terrain.mapId,
        date: terrain.date,
        marketDate: terrain.marketDate,
        symbol: terrain.symbol,
        label: terrain.label,
        interval: terrain.interval,
        mode: terrain.mode,
        barsUsed: terrain.barsUsed,
        difficulty: terrain.difficulty,
        generatedAt: terrain.generatedAt,
        path: pathForClient
    };

    const maps = index.maps.filter((m) => m.mapId !== terrain.mapId);
    maps.push(entry);

    maps.sort((a, b) => {
        if (a.date === b.date) {
            return String(b.generatedAt).localeCompare(String(a.generatedAt));
        }

        return String(b.date).localeCompare(String(a.date));
    });

    return {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        latestMapId: terrain.mapId,
        maps
    };
}

async function main() {
    console.log('1분봉 시장 맵 생성 시작...');

    const market = await getMarketBars();
    const terrain = buildTerrainData(market);

    await fs.mkdir(mapsDir, { recursive: true });

    const mapFile = path.join(mapsDir, `${terrain.mapId}.json`);
    await fs.writeFile(mapFile, JSON.stringify(terrain, null, 2), 'utf8');

    /*
      기존 GameScene 호환용.
      나중에는 없어도 되지만 당분간 유지.
    */
    await fs.writeFile(legacyOutFile, JSON.stringify(terrain, null, 2), 'utf8');

    const currentIndex = await readIndex();
    const nextIndex = upsertMapEntry(currentIndex, terrain);

    await fs.writeFile(indexFile, JSON.stringify(nextIndex, null, 2), 'utf8');

    console.log('');
    console.log('완료');
    console.log(`mapId=${terrain.mapId}`);
    console.log(`date=${terrain.date}`);
    console.log(`symbol=${terrain.symbol}`);
    console.log(`interval=${terrain.interval}`);
    console.log(`barsUsed=${terrain.barsUsed}`);
    console.log(`points=${terrain.points.length}`);
    console.log(`difficulty=${terrain.difficulty.score}`);
    console.log(`파일 생성: ${mapFile}`);
    console.log(`인덱스 갱신: ${indexFile}`);
}

main().catch((err) => {
    console.error('');
    console.error('실패');
    console.error(err);
    process.exit(1);
});