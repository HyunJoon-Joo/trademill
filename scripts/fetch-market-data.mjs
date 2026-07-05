import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YahooFinance from 'yahoo-finance2';
import { MARKET_MAP_TUNING } from './config/marketMapTuning.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const publicDataDir = path.join(rootDir, 'public', 'data');
const mapsDir = path.join(publicDataDir, 'maps');
const indexFile = path.join(mapsDir, 'index.json');
const legacyOutFile = path.join(publicDataDir, 'market-terrain.json');

const yahooFinance = new YahooFinance();

function getActiveProfile() {
    const profile = MARKET_MAP_TUNING.profiles[MARKET_MAP_TUNING.activeProfile];

    if (!profile) {
        throw new Error(`알 수 없는 activeProfile: ${MARKET_MAP_TUNING.activeProfile}`);
    }

    return profile;
}

function makeCandidates() {
    const profile = getActiveProfile();

    return profile.candidates.map((candidate) => ({
        ...candidate,
        interval: MARKET_MAP_TUNING.interval,
        daysBack: MARKET_MAP_TUNING.daysBack,
        maxBars: MARKET_MAP_TUNING.maxBars
    }));
}

const CANDIDATES = makeCandidates();

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

function movingAverage(values, windowSize) {
    const out = [];
    const half = Math.max(1, Math.floor(windowSize / 2));

    for (let i = 0; i < values.length; i++) {
        let sum = 0;
        let count = 0;

        for (let j = i - half; j <= i + half; j++) {
            if (j >= 0 && j < values.length) {
                sum += values[j];
                count += 1;
            }
        }

        out.push(count > 0 ? sum / count : values[i]);
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
        const marketDate = formatDateInTimeZone(bar.time, candidate.timeZone);

        if (!groups.has(marketDate)) {
            groups.set(marketDate, []);
        }

        groups.get(marketDate).push(bar);
    }

    const dates = [...groups.keys()].sort();

    if (dates.length === 0) {
        throw new Error('시장 날짜 그룹을 만들 수 없습니다.');
    }

    let selectedDate = dates[dates.length - 1];
    let selectedBars = groups.get(selectedDate);

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
                timeZone: candidate.timeZone,
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

function shapeYValues(rawYValues) {
    if (rawYValues.length <= 1) {
        return rawYValues;
    }

    const shaped = [rawYValues[0]];

    for (let i = 1; i < rawYValues.length; i++) {
        const rawPrev = rawYValues[i - 1];
        const rawCurrent = rawYValues[i];
        const rawDy = rawCurrent - rawPrev;

        let dy = rawDy * MARKET_MAP_TUNING.stepDyGain;

        if (
            Math.abs(rawDy) > 1.5 &&
            Math.abs(dy) < MARKET_MAP_TUNING.minVisibleStepY
        ) {
            dy = Math.sign(dy || rawDy) * MARKET_MAP_TUNING.minVisibleStepY;
        }

        dy = clamp(
            dy,
            -MARKET_MAP_TUNING.maxStepY,
            MARKET_MAP_TUNING.maxStepY
        );

        const stepBasedY = shaped[i - 1] + dy;

        const blendedY =
            stepBasedY * (1 - MARKET_MAP_TUNING.rawBlend) +
            rawCurrent * MARKET_MAP_TUNING.rawBlend;

        const finalY = MARKET_MAP_TUNING.hardClamp
            ? clamp(blendedY, MARKET_MAP_TUNING.minY, MARKET_MAP_TUNING.maxY)
            : blendedY;

        shaped.push(finalY);
    }

    return shaped;
}

function buildTerrainData(result) {
    const bars = result.bars;
    const first = bars[0];
    const referencePrice = first.open || first.close;

    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        throw new Error('기준 가격을 만들 수 없습니다.');
    }

    const mapId = `${result.marketDate}_${result.safeSymbol}_${result.interval}_${MARKET_MAP_TUNING.mapAlgorithmVersion}`;

    const closeMoves = bars.map((bar) => {
        return (bar.close - referencePrice) / referencePrice;
    });

    const trendMoves = movingAverage(
        closeMoves,
        MARKET_MAP_TUNING.movingAverageWindow
    );

    const rawYValues = [];

    let minClose = Number.POSITIVE_INFINITY;
    let maxClose = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        const prevClose = i > 0 ? bars[i - 1].close : bar.open;

        const closeMove = closeMoves[i];
        const trendMove = trendMoves[i];
        const localMove = closeMove - trendMove;

        const deltaMove = (bar.close - prevClose) / referencePrice;
        const bodyMove = (bar.close - bar.open) / referencePrice;

        const upperWick =
            (bar.high - Math.max(bar.open, bar.close)) / referencePrice;

        const lowerWick =
            (Math.min(bar.open, bar.close) - bar.low) / referencePrice;

        const wickBias = lowerWick - upperWick;
        const noise = deterministicNoise(i + Math.floor(bar.close * 100));

        let y =
            MARKET_MAP_TUNING.baseY -
            closeMove * MARKET_MAP_TUNING.trendToPx -
            localMove * MARKET_MAP_TUNING.localDeviationToPx -
            deltaMove * MARKET_MAP_TUNING.deltaToPx -
            bodyMove * MARKET_MAP_TUNING.bodyToPx -
            wickBias * MARKET_MAP_TUNING.wickToPx +
            noise * MARKET_MAP_TUNING.microNoisePx;

        if (MARKET_MAP_TUNING.hardClamp) {
            y = clamp(y, MARKET_MAP_TUNING.minY, MARKET_MAP_TUNING.maxY);
        }

        minClose = Math.min(minClose, bar.close);
        maxClose = Math.max(maxClose, bar.close);

        rawYValues.push(y);
    }

    const shapedYValues = shapeYValues(rawYValues);

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const points = shapedYValues.map((y, i) => {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);

        return {
            index: i,
            time: bars[i].time,
            x: i * MARKET_MAP_TUNING.stepX,
            y: round(y, 2)
        };
    });

    const priceRangePct = ((maxClose - minClose) / referencePrice) * 100;
    const heightRangePx = maxY - minY;

    const difficulty = calculateDifficulty(points, {
        priceRangePct,
        heightRangePx
    });

    return {
        schemaVersion: 4,
        mapId,
        date: result.marketDate,
        marketDate: result.marketDate,
        source: result.source,
        symbol: result.symbol,
        label: result.label,
        interval: result.interval,
        mode: result.mode,
        timeZone: result.timeZone,
        barsUsed: bars.length,
        stepX: MARKET_MAP_TUNING.stepX,
        generatedAt: new Date().toISOString(),
        minY: MARKET_MAP_TUNING.minY,
        maxY: MARKET_MAP_TUNING.maxY,
        baseY: MARKET_MAP_TUNING.baseY,
        chartMode: 'price-anchored-volatility-shaped',
        mapAlgorithmVersion: MARKET_MAP_TUNING.mapAlgorithmVersion,
        activeProfile: MARKET_MAP_TUNING.activeProfile,
        terrainTuning: {
            stepX: MARKET_MAP_TUNING.stepX,
            trendToPx: MARKET_MAP_TUNING.trendToPx,
            localDeviationToPx: MARKET_MAP_TUNING.localDeviationToPx,
            deltaToPx: MARKET_MAP_TUNING.deltaToPx,
            bodyToPx: MARKET_MAP_TUNING.bodyToPx,
            wickToPx: MARKET_MAP_TUNING.wickToPx,
            movingAverageWindow: MARKET_MAP_TUNING.movingAverageWindow,
            stepDyGain: MARKET_MAP_TUNING.stepDyGain,
            minVisibleStepY: MARKET_MAP_TUNING.minVisibleStepY,
            maxStepY: MARKET_MAP_TUNING.maxStepY,
            rawBlend: MARKET_MAP_TUNING.rawBlend
        },
        priceScale: {
            reference: 'first open',
            priceRangePct: round(priceRangePct, 4),
            heightRangePx: round(heightRangePx, 2)
        },
        difficulty,
        points
    };
}

function calculateDifficulty(points, extra = {}) {
    let totalUphill = 0;
    let totalDrop = 0;
    let maxUphillStep = 0;
    let maxDropStep = 0;
    let totalAbs = 0;

    for (let i = 1; i < points.length; i++) {
        const dy = points[i].y - points[i - 1].y;
        const abs = Math.abs(dy);

        totalAbs += abs;

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
        totalDrop * 0.0012 +
        Number(extra.priceRangePct || 0) * 0.18 +
        Number(extra.heightRangePx || 0) * 0.01;

    const score = clamp(rawScore, 1, 10);

    return {
        score: round(score, 2),
        avgStep: round(avgAbs, 2),
        maxUphillStep: round(maxUphillStep, 2),
        maxDropStep: round(maxDropStep, 2),
        totalUphill: round(totalUphill, 2),
        totalDrop: round(totalDrop, 2),
        priceRangePct: round(extra.priceRangePct || 0, 4),
        heightRangePx: round(extra.heightRangePx || 0, 2)
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
        timeZone: terrain.timeZone,
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
    console.log('변동성 강화 시장 맵 생성 시작...');
    console.log(`activeProfile=${MARKET_MAP_TUNING.activeProfile}`);

    const market = await getMarketBars();
    const terrain = buildTerrainData(market);

    await fs.mkdir(mapsDir, { recursive: true });

    const mapFile = path.join(mapsDir, `${terrain.mapId}.json`);
    await fs.writeFile(mapFile, JSON.stringify(terrain, null, 2), 'utf8');

    await fs.writeFile(legacyOutFile, JSON.stringify(terrain, null, 2), 'utf8');

    const currentIndex = await readIndex();
    const nextIndex = upsertMapEntry(currentIndex, terrain);

    await fs.writeFile(indexFile, JSON.stringify(nextIndex, null, 2), 'utf8');

    console.log('');
    console.log('완료');
    console.log(`mapId=${terrain.mapId}`);
    console.log(`profile=${terrain.activeProfile}`);
    console.log(`date=${terrain.date}`);
    console.log(`symbol=${terrain.symbol}`);
    console.log(`interval=${terrain.interval}`);
    console.log(`timeZone=${terrain.timeZone}`);
    console.log(`barsUsed=${terrain.barsUsed}`);
    console.log(`points=${terrain.points.length}`);
    console.log(`difficulty=${terrain.difficulty.score}`);
    console.log(`priceRangePct=${terrain.priceScale.priceRangePct}%`);
    console.log(`heightRangePx=${terrain.priceScale.heightRangePx}px`);
    console.log(`stepX=${terrain.stepX}`);
    console.log(`파일 생성: ${mapFile}`);
    console.log(`인덱스 갱신: ${indexFile}`);
}

main().catch((err) => {
    console.error('');
    console.error('실패');
    console.error(err);
    process.exit(1);
});