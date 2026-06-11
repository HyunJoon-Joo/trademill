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
  맵 핵심 튜닝값

  이전 버전:
  - 그날의 최고/최저를 화면 높이에 강제 정규화

  이번 버전:
  - 기준 가격 대비 실제 변동률을 고정 스케일로 변환
  - 조용한 날은 조용하고, 크게 흔들린 날은 실제로 더 험해짐
*/
const STEP_X = 18;

const BASE_Y = 520;
const MIN_Y = 300;
const MAX_Y = 675;

/*
  1.0% 가격 변화가 몇 px 높이 변화가 될지.
  18000이면 0.01 * 18000 = 180px.
*/
const PRICE_PERCENT_TO_PX = 18000;

/*
  고가/저가의 꼬리, 캔들 몸통에서 오는 작은 요철.
  너무 크게 하면 실제 차트보다 게임적 노이즈가 강해짐.
*/
const WICK_TO_PX = 9000;
const BODY_TO_PX = 4500;
const MICRO_NOISE_PX = 5;

/*
  화면 밖으로 너무 나가면 부드럽게 압축.
  normalize가 아니라 overflow만 soft compression.
*/
const SOFT_LIMIT_POWER = 1.0;

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

    let selectedDate = dates[dates.length - 1];
    let selectedBars = groups.get(selectedDate);

    /*
      장 시작 직후 너무 짧은 데이터면 직전 거래일 사용.
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

function softLimitY(y) {
    /*
      여기서 중요한 점:
      전체 데이터의 min/max로 normalize하지 않는다.
      단지 화면 밖으로 너무 나가는 극단값만 부드럽게 압축한다.
    */
    if (y >= MIN_Y && y <= MAX_Y) {
        return y;
    }

    if (y < MIN_Y) {
        const overflow = MIN_Y - y;
        const compressed = Math.pow(overflow, SOFT_LIMIT_POWER) * 0.32;
        return clamp(MIN_Y + compressed, MIN_Y, BASE_Y);
    }

    const overflow = y - MAX_Y;
    const compressed = Math.pow(overflow, SOFT_LIMIT_POWER) * 0.32;
    return clamp(MAX_Y - compressed, BASE_Y, MAX_Y);
}

function buildTerrainData(result) {
    const bars = result.bars;

    const first = bars[0];
    const referencePrice = first.open || first.close;

    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        throw new Error('기준 가격을 만들 수 없습니다.');
    }

    const mapId = `${result.marketDate}_${result.safeSymbol}_${result.interval}`;

    let minClose = Number.POSITIVE_INFINITY;
    let maxClose = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const points = [];

    for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];

        const closeMove = (bar.close - referencePrice) / referencePrice;
        const bodyMove = (bar.close - bar.open) / referencePrice;

        const upperWick = (bar.high - Math.max(bar.open, bar.close)) / referencePrice;
        const lowerWick = (Math.min(bar.open, bar.close) - bar.low) / referencePrice;
        const wickBias = lowerWick - upperWick;

        const noise = deterministicNoise(i + Math.floor(bar.close * 100));

        /*
          차트형 지형:
          - 가격이 오르면 화면상 위로 감(y 감소)
          - 가격이 내리면 화면상 아래로 감(y 증가)
          - 고정 비율 스케일이라 날마다 진폭이 달라짐
        */
        let y =
            BASE_Y -
            closeMove * PRICE_PERCENT_TO_PX -
            bodyMove * BODY_TO_PX -
            wickBias * WICK_TO_PX +
            noise * MICRO_NOISE_PX;

        y = softLimitY(y);
        y = clamp(y, MIN_Y, MAX_Y);

        minClose = Math.min(minClose, bar.close);
        maxClose = Math.max(maxClose, bar.close);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);

        points.push({
            index: i,
            time: bar.time,
            x: i * STEP_X,
            y: round(y, 2)
        });
    }

    const priceRangePct = ((maxClose - minClose) / referencePrice) * 100;
    const heightRangePx = maxY - minY;

    const difficulty = calculateDifficulty(points, {
        priceRangePct,
        heightRangePx
    });

    return {
        schemaVersion: 2,
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
        baseY: BASE_Y,
        chartMode: 'price-anchored',
        priceScale: {
            reference: 'first open',
            pricePercentToPx: PRICE_PERCENT_TO_PX,
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
    console.log('가격 기준 1분봉 시장 맵 생성 시작...');

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
    console.log(`date=${terrain.date}`);
    console.log(`symbol=${terrain.symbol}`);
    console.log(`interval=${terrain.interval}`);
    console.log(`barsUsed=${terrain.barsUsed}`);
    console.log(`points=${terrain.points.length}`);
    console.log(`difficulty=${terrain.difficulty.score}`);
    console.log(`priceRangePct=${terrain.priceScale.priceRangePct}%`);
    console.log(`heightRangePx=${terrain.priceScale.heightRangePx}px`);
    console.log(`파일 생성: ${mapFile}`);
    console.log(`인덱스 갱신: ${indexFile}`);
}

main().catch((err) => {
    console.error('');
    console.error('실패');
    console.error(err);
    process.exit(1);
});