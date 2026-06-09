const MAX_NAME_LENGTH = 12;
const MAX_MAP_ID_LENGTH = 120;
const MAX_DISTANCE = 9999999;
const MAX_ELAPSED_MS = 30 * 60 * 1000;
const MIN_FINISH_ELAPSED_MS = 3000;
const MAX_BODY_BYTES = 2048;

const MAP_DATA_BASE_URL = "https://HyunJoon-Joo.github.io/TM_Phaser";
const MAP_INDEX_URL = `${MAP_DATA_BASE_URL}/data/maps/index.json`;

const SUBMIT_RATE_WINDOW_SECONDS = 60;
const SUBMIT_RATE_LIMIT = 12;

const allowedOriginRules = [
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i,
  /^https:\/\/hyunjoon-joo\.github\.io$/i,
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
          mode: "hardened"
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
        const finished = !!body.finished || reason === "FINISH";
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

        if (finished && elapsedMs === null) {
          return jsonError(request, "elapsedMs is required for FINISH records", 400);
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

async function loadMapData(mapMeta) {
  if (!mapMeta?.path) {
    return null;
  }

  const url = new URL(mapMeta.path, MAP_DATA_BASE_URL).toString();

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
  const finishDistance = Math.max(0, Math.floor((lastX - finishMarginPx - startX) / 10));

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

async function submitScore(db, input) {
  const now = new Date().toISOString();

  const existing = await db
    .prepare(`
      SELECT *
      FROM scores
      WHERE map_id = ? AND player_name = ?
      LIMIT 1
    `)
    .bind(input.mapId, input.playerName)
    .first();

  const candidate = {
    distance: input.distance,
    finished: input.finished,
    elapsedMs: input.elapsedMs
  };

  const isNewBest = isCandidateBetter(candidate, existing);

  if (!existing) {
    await db
      .prepare(`
        INSERT INTO scores (
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
        input.playerName,

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
  } else if (isNewBest) {
    await db
      .prepare(`
        UPDATE scores
        SET
          best_distance = ?,
          best_finished = ?,
          best_elapsed_ms = ?,
          best_reason = ?,
          best_at = ?,

          last_distance = ?,
          last_finished = ?,
          last_elapsed_ms = ?,
          last_reason = ?,

          updated_at = ?
        WHERE map_id = ? AND player_name = ?
      `)
      .bind(
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
        input.mapId,
        input.playerName
      )
      .run();
  } else {
    await db
      .prepare(`
        UPDATE scores
        SET
          last_distance = ?,
          last_finished = ?,
          last_elapsed_ms = ?,
          last_reason = ?,
          updated_at = ?
        WHERE map_id = ? AND player_name = ?
      `)
      .bind(
        input.distance,
        input.finished ? 1 : 0,
        input.elapsedMs,
        input.reason,
        now,
        input.mapId,
        input.playerName
      )
      .run();
  }

  const leaderboard = await getLeaderboard(db, input.mapId);
  const rankIndex = leaderboard.findIndex((entry) => entry.playerName === input.playerName);

  return {
    mapId: input.mapId,
    playerName: input.playerName,
    isNewBest,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    leaderboard,
    record: leaderboard[rankIndex] || null
  };
}

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
        CASE
          WHEN best_finished = 1 THEN best_elapsed_ms
          ELSE 999999999
        END ASC,
        best_distance DESC,
        best_at ASC
      LIMIT 10
    `)
    .bind(mapId)
    .all();

  const rows = result.results || [];

  return rows.map((row) => ({
    playerName: row.player_name,
    bestDistance: Number(row.best_distance) || 0,
    bestFinished: !!row.best_finished,
    bestElapsedMs: row.best_elapsed_ms === null ? null : Number(row.best_elapsed_ms),
    bestReason: row.best_reason || "",
    bestAt: row.best_at || "",
    lastDistance: Number(row.last_distance) || 0,
    lastFinished: !!row.last_finished,
    lastElapsedMs: row.last_elapsed_ms === null ? null : Number(row.last_elapsed_ms),
    lastReason: row.last_reason || "",
    updatedAt: row.updated_at || ""
  }));
}