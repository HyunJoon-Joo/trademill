const MAX_NAME_LENGTH = 12;
const MAX_MAP_ID_LENGTH = 120;
const MAX_DISTANCE = 9999999;
const MAX_ELAPSED_MS = 30 * 60 * 1000;
const MIN_FINISH_ELAPSED_MS = 3000;
const MAX_BODY_BYTES = 2048;

// 클라이언트가 실제로 새 중복 이름 정책이 배포된 서버인지 확인하는 버전 표식.
const RANKING_API_VERSION = "2026-08-21-v5";
const NAME_POLICY_VERSION = "auto-suffix-always-v4";
const RANKING_POLICY_VERSION = "finish-distance-time-reason-v5";

const MAP_DATA_BASE_URL = "https://HyunJoon-Joo.github.io/trademill";
const MAP_INDEX_URL = `${MAP_DATA_BASE_URL}/data/maps/index.json`;

const SUBMIT_RATE_WINDOW_SECONDS = 60;
const SUBMIT_RATE_LIMIT = 12;

const allowedOriginRules = [
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i,
  /^https:\/\/hyunjoon-joo\.github\.io$/i,
  /^https:\/\/trademill-theta\.vercel\.app$/i,
  /^https:\/\/.*\.itch\.io$/i,
  /^https:\/\/.*\.itch\.zone$/i,
  /^https:\/\/.*\.hwcdn\.net$/i
];

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return handleOptions(request);
      }

      if (!isOriginAllowed(request)) {
        return jsonError(request, "Origin not allowed", 403);
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/health") {
        return json(request, {
          ok: true,
          service: "trademill-ranking-api",
          mode: "hardened",
          apiVersion: RANKING_API_VERSION,
          namePolicy: NAME_POLICY_VERSION,
          rankingPolicy: RANKING_POLICY_VERSION
        });
      }

      if (request.method === "GET" && pathname === "/leaderboard") {
        const mapId = normalizeMapId(url.searchParams.get("mapId"));

        if (!mapId) {
          return jsonError(request, "mapId is required", 400);
        }

        const leaderboard = await getLeaderboard(env.DB, mapId);

        return json(request, {
          ok: true,
          apiVersion: RANKING_API_VERSION,
          namePolicy: NAME_POLICY_VERSION,
          rankingPolicy: RANKING_POLICY_VERSION,
          mapId,
          leaderboard
        });
      }

      if (request.method === "POST" && pathname === "/submit") {
        const contentLength = Number(request.headers.get("Content-Length") || 0);

        if (contentLength > MAX_BODY_BYTES) {
          return jsonError(request, "Request body too large", 413);
        }

        const body = await readJson(request);

        const mapId = normalizeMapId(body.mapId);
        const playerName = normalizePlayerName(body.playerName);
        const distance = normalizeDistance(body.distance);
        const reason = normalizeReason(body.reason);

        /*
          완주 여부는 클라이언트가 보낸 boolean을 신뢰하지 않고 종료 사유로 결정한다.
          GIVE UP 같은 미완주 기록이 finished=true로 위조되어 완주 랭킹으로 들어가는 것을 막는다.
        */
        const finished = reason === "FINISH";
        const elapsedMs = normalizeElapsedMs(body.elapsedMs);

        if (!mapId) {
          return jsonError(request, "Invalid mapId", 400);
        }

        if (!playerName) {
          return jsonError(request, "Invalid playerName", 400);
        }

        if (!Number.isFinite(distance)) {
          return jsonError(request, "Invalid distance", 400);
        }

        /*
          v5부터 시간은 모든 랭킹의 정식 정렬 기준이다.
          GameScene / GIVE UP snapshot 모두 elapsedMs를 이미 보내므로,
          새 기록은 종료 사유와 관계없이 반드시 시간을 가져야 한다.
        */
        if (elapsedMs === null || elapsedMs <= 0) {
          return jsonError(request, "elapsedMs must be greater than 0 for ranking records", 400);
        }

        const rate = await checkRateLimit(env.DB, env, request, "submit");

        if (!rate.ok) {
          return jsonError(request, "Too many submissions. Try again later.", 429, {
            retryAfterSeconds: rate.retryAfterSeconds
          });
        }

        const mapValidation = await validateMapAndScore({
          mapId,
          distance,
          finished,
          elapsedMs,
          reason
        });

        if (!mapValidation.ok) {
          return jsonError(request, mapValidation.error, 400, {
            detail: mapValidation.detail || null
          });
        }

        const result = await submitScore(env.DB, {
          mapId,
          playerName,
          distance,
          reason,
          finished,
          elapsedMs
        });

        return json(request, {
          ok: true,
          apiVersion: RANKING_API_VERSION,
          namePolicy: NAME_POLICY_VERSION,
          rankingPolicy: RANKING_POLICY_VERSION,
          validation: {
            maxDistance: mapValidation.maxDistance,
            finishDistance: mapValidation.finishDistance
          },
          ...result
        });
      }

      return jsonError(request, "Not found", 404);
    } catch (error) {
      console.error(error);

      return jsonError(request, "Internal error", 500, {
        detail: String(error?.message || error)
      });
    }
  }
};

function handleOptions(request) {
  if (!isOriginAllowed(request)) {
    return new Response(null, {
      status: 403,
      headers: makeCorsHeaders(request)
    });
  }

  return new Response(null, {
    status: 204,
    headers: makeCorsHeaders(request)
  });
}

function getAllowedOrigin(request) {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return "*";
  }

  try {
    const parsed = new URL(origin);
    const normalized = `${parsed.protocol}//${parsed.host}`;

    for (const rule of allowedOriginRules) {
      if (rule.test(normalized)) {
        return normalized;
      }
    }

    return "";
  } catch {
    return "";
  }
}

function isOriginAllowed(request) {
  return !!getAllowedOrigin(request);
}

function makeCorsHeaders(request) {
  const allowedOrigin = getAllowedOrigin(request);

  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  return headers;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...makeCorsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function jsonError(request, message, status = 400, extra = {}) {
  return json(request, {
    ok: false,
    error: message,
    ...extra
  }, status);
}

function normalizeMapId(value) {
  const raw = String(value || "").trim();

  if (!raw || raw.length > MAX_MAP_ID_LENGTH) {
    return "";
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(raw)) {
    return "";
  }

  return raw;
}

function normalizePlayerName(value) {
  const raw = String(value || "").trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9_-]/g, "").slice(0, MAX_NAME_LENGTH);

  return cleaned || "YOU";
}

function normalizeDistance(value) {
  const n = Math.floor(Number(value));

  if (!Number.isFinite(n)) {
    return NaN;
  }

  return Math.max(0, Math.min(MAX_DISTANCE, n));
}

function normalizeElapsedMs(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Math.floor(Number(value));

  if (!Number.isFinite(n)) {
    return null;
  }

  return Math.max(0, Math.min(MAX_ELAPSED_MS, n));
}

function normalizeReason(value) {
  const raw = String(value || "GAME OVER").trim().toUpperCase();

  const allowed = new Set([
    "FINISH",
    "GIVE UP",
    "OUT OF MARKET",
    "FREE FALL",
    "MARKET CRASH",
    "GAME OVER"
  ]);

  return allowed.has(raw) ? raw : "GAME OVER";
}

async function sha256Hex(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getClientKey(env, request) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown-ip";

  const ua = request.headers.get("User-Agent") || "unknown-ua";
  const secret = env.RATE_LIMIT_SECRET || "local-dev-secret-change-me";

  return sha256Hex(`${secret}|${ip}|${ua.slice(0, 160)}`);
}

async function checkRateLimit(db, env, request, route) {
  const clientKey = await getClientKey(env, request);
  const nowEpoch = Math.floor(Date.now() / 1000);
  const windowStart =
    Math.floor(nowEpoch / SUBMIT_RATE_WINDOW_SECONDS) *
    SUBMIT_RATE_WINDOW_SECONDS;

  const nowIso = new Date().toISOString();

  await db
    .prepare(`
      INSERT INTO rate_limits (
        client_key,
        route,
        window_start,
        count,
        updated_at
      )
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(client_key, route, window_start)
      DO UPDATE SET
        count = count + 1,
        updated_at = excluded.updated_at
    `)
    .bind(clientKey, route, windowStart, nowIso)
    .run();

  const row = await db
    .prepare(`
      SELECT count
      FROM rate_limits
      WHERE client_key = ? AND route = ? AND window_start = ?
      LIMIT 1
    `)
    .bind(clientKey, route, windowStart)
    .first();

  if (Math.random() < 0.03) {
    const cutoff = windowStart - SUBMIT_RATE_WINDOW_SECONDS * 10;

    db.prepare(`
      DELETE FROM rate_limits
      WHERE window_start < ?
    `).bind(cutoff).run();
  }

  const count = Number(row?.count || 0);

  if (count > SUBMIT_RATE_LIMIT) {
    const retryAfterSeconds =
      windowStart + SUBMIT_RATE_WINDOW_SECONDS - nowEpoch;

    return {
      ok: false,
      retryAfterSeconds: Math.max(1, retryAfterSeconds)
    };
  }

  return {
    ok: true,
    count
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cf: {
      cacheTtl: 300,
      cacheEverything: true
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function findMapMeta(mapId) {
  const index = await fetchJson(MAP_INDEX_URL);
  const maps = Array.isArray(index?.maps) ? index.maps : [];

  return maps.find((map) => map?.mapId === mapId) || null;
}

function joinDataUrl(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");

  return `${base}/${normalizedPath}`;
}

async function loadMapData(mapMeta) {
  if (!mapMeta?.path) {
    return null;
  }

  const url = joinDataUrl(MAP_DATA_BASE_URL, mapMeta.path);

  return fetchJson(url);
}

async function validateMapAndScore({
  mapId,
  distance,
  finished,
  elapsedMs,
  reason
}) {
  const mapMeta = await findMapMeta(mapId);

  if (!mapMeta) {
    return {
      ok: false,
      error: "Unknown mapId",
      detail: "The submitted mapId is not present in the public map index."
    };
  }

  const mapData = await loadMapData(mapMeta);
  const points = Array.isArray(mapData?.points) ? mapData.points : [];

  if (points.length < 2) {
    return {
      ok: false,
      error: "Invalid map data"
    };
  }

  const lastPoint = points[points.length - 1];
  const lastX = Number(lastPoint?.x);

  if (!Number.isFinite(lastX)) {
    return {
      ok: false,
      error: "Invalid map distance"
    };
  }

  const startX = 180;
  const finishMarginPx = 80;

  const maxDistance = Math.max(0, Math.floor((lastX - startX) / 10));
  const finishDistance = Math.max(
    0,
    Math.floor((lastX - finishMarginPx - startX) / 10)
  );

  if (distance > maxDistance + 80) {
    return {
      ok: false,
      error: "Distance exceeds map length",
      maxDistance,
      finishDistance
    };
  }

  if (reason === "FINISH" && !finished) {
    return {
      ok: false,
      error: "FINISH reason requires finished=true",
      maxDistance,
      finishDistance
    };
  }

  if (finished) {
    if (distance < finishDistance - 20) {
      return {
        ok: false,
        error: "FINISH distance is too short for this map",
        maxDistance,
        finishDistance
      };
    }

    if (elapsedMs < MIN_FINISH_ELAPSED_MS || elapsedMs > MAX_ELAPSED_MS) {
      return {
        ok: false,
        error: "FINISH elapsedMs is out of valid range",
        maxDistance,
        finishDistance
      };
    }
  }

  return {
    ok: true,
    maxDistance,
    finishDistance
  };
}

function isCandidateBetter(candidate, existing) {
  if (!existing) {
    return true;
  }

  const candidateFinished = !!candidate.finished;
  const existingFinished = !!existing.best_finished;

  if (candidateFinished && !existingFinished) {
    return true;
  }

  if (!candidateFinished && existingFinished) {
    return false;
  }

  if (candidateFinished && existingFinished) {
    const candidateTime = Number(candidate.elapsedMs);
    const existingTime = Number(existing.best_elapsed_ms);

    if (Number.isFinite(candidateTime) && Number.isFinite(existingTime)) {
      if (candidateTime !== existingTime) {
        return candidateTime < existingTime;
      }
    }
  }

  const candidateDistance = Number(candidate.distance) || 0;
  const existingDistance = Number(existing.best_distance) || 0;

  return candidateDistance > existingDistance;
}

async function getRawScoreCaseInsensitive(db, mapId, playerName) {
  const normalized = normalizePlayerName(playerName);

  return db
    .prepare(`
      SELECT *
      FROM scores
      WHERE map_id = ? AND UPPER(player_name) = ?
      LIMIT 1
    `)
    .bind(mapId, normalized)
    .first();
}

function makeSuffixedPlayerName(baseName, suffixNumber) {
  const suffix = String(Math.max(2, Math.floor(Number(suffixNumber) || 2)));
  const maxBaseLength = Math.max(1, MAX_NAME_LENGTH - suffix.length);
  const base = normalizePlayerName(baseName).slice(0, maxBaseLength);

  return `${base}${suffix}`.slice(0, MAX_NAME_LENGTH);
}

/*
  사용자가 이미 숫자가 붙은 이름을 직접 입력한 경우도 자연스럽게 이어간다.

  KKK   -> base KKK / suffix 2부터
  KKK2  -> base KKK / suffix 3부터
  KKK9  -> base KKK / suffix 10부터

  따라서 KKK2가 이미 있을 때 KKK22처럼 되지 않는다.
*/
function getSuffixSeries(name) {
  const normalized = normalizePlayerName(name);
  const match = normalized.match(/^(.*?)(\d+)$/);

  if (!match || !match[1]) {
    return {
      baseName: normalized,
      firstSuffix: 2
    };
  }

  const parsed = Math.floor(Number(match[2]));

  if (!Number.isFinite(parsed) || parsed < 2) {
    return {
      baseName: normalized,
      firstSuffix: 2
    };
  }

  return {
    baseName: match[1],
    firstSuffix: parsed + 1
  };
}

/*
  한 후보 이름을 '새 레코드'로만 삽입한다.

  핵심:
  - 기존 이름을 UPDATE하지 않는다.
  - INSERT OR IGNORE + D1Result.meta.changes를 사용한다.
  - 이미 같은 이름이 있거나, 동시에 다른 요청이 같은 이름을 먼저 차지하면
    changes=0이 되고 호출부가 다음 번호를 시도한다.

  그래서 같은 맵에서 KKK가 이미 있으면 두 번째 KKK 제출은 KKK2가 되고,
  KKK2까지 있으면 KKK3가 된다.
*/
async function tryInsertFreshScore(db, input, playerName, now) {
  const result = await db
    .prepare(`
      INSERT OR IGNORE INTO scores (
        map_id,
        player_name,

        best_distance,
        best_finished,
        best_elapsed_ms,
        best_reason,
        best_at,

        last_distance,
        last_finished,
        last_elapsed_ms,
        last_reason,

        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.mapId,
      playerName,

      input.distance,
      input.finished ? 1 : 0,
      input.elapsedMs,
      input.reason,
      now,

      input.distance,
      input.finished ? 1 : 0,
      input.elapsedMs,
      input.reason,

      now,
      now
    )
    .run();

  return Number(result?.meta?.changes || 0) > 0;
}

/*
  중복 이름 배정 정책 v4

  같은 map_id 안에서 매 제출을 별도의 랭킹 참가자로 취급한다.

    첫 KKK      -> KKK
    두 번째 KKK -> KKK2
    세 번째 KKK -> KKK3

  이전 구현처럼 '이 이름이 이미 있으니 기존 점수를 갱신'하는 경로가 없다.

  또한 과거 DB에 소문자 이름이 남아 있어도 UPPER(player_name)으로 먼저 확인해서
  화면상 같은 이름인데 서버가 못 찾는 문제도 방지한다.

  동시 제출까지 고려해 실제 INSERT가 성공했는지를 확인하고,
  충돌하면 다음 숫자를 계속 시도한다.
*/
async function insertScoreWithUniqueName(db, input) {
  const now = new Date().toISOString();
  const requestedPlayerName = normalizePlayerName(input.playerName);
  const suffixSeries = getSuffixSeries(requestedPlayerName);

  let suffix = suffixSeries.firstSuffix;
  let firstCandidate = true;

  for (let attempts = 0; attempts < 1000000; attempts += 1) {
    let candidate;

    if (firstCandidate) {
      candidate = requestedPlayerName;
      firstCandidate = false;
    } else {
      candidate = makeSuffixedPlayerName(suffixSeries.baseName, suffix);
      suffix += 1;
    }

    /*
      기존 데이터가 대/소문자 혼합으로 남아 있을 가능성까지 막는다.
      새 데이터는 항상 대문자로 저장되지만 과거 데이터와의 호환용이다.
    */
    const existing = await getRawScoreCaseInsensitive(
      db,
      input.mapId,
      candidate
    );

    if (existing) {
      continue;
    }

    const inserted = await tryInsertFreshScore(db, input, candidate, now);

    if (inserted) {
      return {
        playerName: candidate,
        requestedPlayerName,
        nameAdjusted: candidate !== requestedPlayerName
      };
    }

    /*
      pre-check 뒤 다른 요청이 같은 이름을 먼저 차지한 race라면
      INSERT OR IGNORE가 0 changes를 반환한다. 다음 번호로 계속 간다.
    */
  }

  throw new Error("Could not allocate a unique player name");
}

async function submitScore(db, input) {
  const resolvedName = await insertScoreWithUniqueName(db, input);
  const playerName = resolvedName.playerName;

  /*
    이 정책에서는 매 저장이 새 고유 이름의 레코드이므로 기존 레코드를 갱신하지 않는다.
    따라서 저장 성공 자체가 이 새 참가자의 최초(best) 기록이다.
  */
  const isNewBest = true;

  const [leaderboard, rank, playerRecord] = await Promise.all([
    getLeaderboard(db, input.mapId),
    getExactRank(db, input.mapId, playerName),
    getPlayerRecord(db, input.mapId, playerName)
  ]);

  return {
    mapId: input.mapId,
    playerName,
    requestedPlayerName: resolvedName.requestedPlayerName,
    nameAdjusted: resolvedName.nameAdjusted,
    isNewBest,
    rank,
    leaderboard,
    record: playerRecord
  };
}

/*
  랭킹 표는 1~10위만 반환한다.

  v5 순위 규칙
  -----------------------------
  [완주자]
  1) FINISH 기록은 미완주 기록보다 우선
  2) 완주자끼리는 elapsedMs가 빠를수록 우선
  3) 완주 시간이 같으면 distance가 긴 쪽 우선

  [미완주자]
  1) distance가 긴 쪽 우선
  2) 같은 distance면 elapsedMs가 빠른 쪽 우선
  3) distance와 elapsedMs가 모두 같으면
       GIVE UP > FREE FALL > 그 외 종료 사유
  4) 그래도 같으면 먼저 기록된 쪽, 마지막으로 player_name

  과거 데이터 중 elapsedMs가 NULL인 기록은 같은 거리의 정상 시간 기록보다 뒤로 보낸다.
*/
async function getLeaderboard(db, mapId) {
  const result = await db
    .prepare(`
      SELECT
        player_name,
        best_distance,
        best_finished,
        best_elapsed_ms,
        best_reason,
        best_at,
        last_distance,
        last_finished,
        last_elapsed_ms,
        last_reason,
        updated_at
      FROM scores
      WHERE map_id = ?
      ORDER BY
        best_finished DESC,

        /* FINISH: 시간 우선 */
        CASE
          WHEN best_finished = 1 AND best_elapsed_ms > 0 THEN best_elapsed_ms
          WHEN best_finished = 1 THEN 999999999
          ELSE 0
        END ASC,
        CASE
          WHEN best_finished = 1 THEN best_distance
          ELSE 0
        END DESC,

        /* 미완주: 거리 우선 */
        CASE
          WHEN best_finished = 0 THEN best_distance
          ELSE -1
        END DESC,

        /* 같은 거리: 시간 우선. NULL 시간은 뒤로 */
        CASE
          WHEN best_finished = 0 AND (best_elapsed_ms IS NULL OR best_elapsed_ms <= 0) THEN 1
          ELSE 0
        END ASC,
        CASE
          WHEN best_finished = 0 AND best_elapsed_ms > 0 THEN best_elapsed_ms
          WHEN best_finished = 0 THEN 999999999
          ELSE 0
        END ASC,

        /* 같은 거리 + 같은 시간: GIVE UP > 낙하 > 기타 */
        CASE
          WHEN best_finished = 1 THEN 0
          WHEN best_reason = 'GIVE UP' THEN 1
          WHEN best_reason = 'FREE FALL' THEN 2
          ELSE 3
        END ASC,

        best_at ASC,
        player_name ASC
      LIMIT 10
    `)
    .bind(mapId)
    .all();

  const rows = result.results || [];
  return rows.map(mapScoreRow);
}

async function getPlayerRecord(db, mapId, playerName) {
  const row = await db
    .prepare(`
      SELECT
        player_name,
        best_distance,
        best_finished,
        best_elapsed_ms,
        best_reason,
        best_at,
        last_distance,
        last_finished,
        last_elapsed_ms,
        last_reason,
        updated_at
      FROM scores
      WHERE map_id = ? AND player_name = ?
      LIMIT 1
    `)
    .bind(mapId, playerName)
    .first();

  return row ? mapScoreRow(row) : null;
}

/*
  TOP 10 바깥도 정확한 순위를 반환한다.
  반드시 getLeaderboard()와 완전히 같은 ORDER BY를 사용해야 한다.
*/
async function getExactRank(db, mapId, playerName) {
  const row = await db
    .prepare(`
      WITH ranked AS (
        SELECT
          player_name,
          ROW_NUMBER() OVER (
            ORDER BY
              best_finished DESC,

              CASE
                WHEN best_finished = 1 AND best_elapsed_ms > 0 THEN best_elapsed_ms
                WHEN best_finished = 1 THEN 999999999
                ELSE 0
              END ASC,
              CASE
                WHEN best_finished = 1 THEN best_distance
                ELSE 0
              END DESC,

              CASE
                WHEN best_finished = 0 THEN best_distance
                ELSE -1
              END DESC,

              CASE
                WHEN best_finished = 0 AND (best_elapsed_ms IS NULL OR best_elapsed_ms <= 0) THEN 1
                ELSE 0
              END ASC,
              CASE
                WHEN best_finished = 0 AND best_elapsed_ms > 0 THEN best_elapsed_ms
                WHEN best_finished = 0 THEN 999999999
                ELSE 0
              END ASC,

              CASE
                WHEN best_finished = 1 THEN 0
                WHEN best_reason = 'GIVE UP' THEN 1
                WHEN best_reason = 'FREE FALL' THEN 2
                ELSE 3
              END ASC,

              best_at ASC,
              player_name ASC
          ) AS exact_rank
        FROM scores
        WHERE map_id = ?
      )
      SELECT exact_rank
      FROM ranked
      WHERE player_name = ?
      LIMIT 1
    `)
    .bind(mapId, playerName)
    .first();

  const rank = Math.floor(Number(row?.exact_rank));

  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function mapScoreRow(row) {
  return {
    playerName: row.player_name,
    bestDistance: Number(row.best_distance) || 0,
    bestFinished: !!row.best_finished,
    bestElapsedMs:
      row.best_elapsed_ms === null ? null : Number(row.best_elapsed_ms),
    bestReason: row.best_reason || "",
    bestAt: row.best_at || "",
    lastDistance: Number(row.last_distance) || 0,
    lastFinished: !!row.last_finished,
    lastElapsedMs:
      row.last_elapsed_ms === null ? null : Number(row.last_elapsed_ms),
    lastReason: row.last_reason || "",
    updatedAt: row.updated_at || ""
  };
}
