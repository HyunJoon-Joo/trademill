const PLAYER_NAME_KEY = 'tm_player_name';
const PREFERRED_PLAYER_NAME_KEY = 'tm_player_name_preferred_v2';
const MAX_PLAYER_NAME_LENGTH = 12;

/*
  과거 빌드가 날짜를 붙여 자동으로 만들었던 임시 이름 형식.
  예: NEW_260611

  이런 값은 사용자가 직접 정한 닉네임이 아니므로 새 입력창에 다시 보여주지 않는다.
  한 번 발견하면 localStorage에서도 제거하여 이후에도 재등장하지 않게 한다.
*/
const LEGACY_AUTO_NAME_PATTERN = /^NEW_\d{6}$/;

function getStorage() {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.localStorage || null;
    } catch {
        return null;
    }
}

/*
  입력창에 표시할 수 있는 문자만 남긴다.

  주의:
  - 이 함수는 빈 문자열을 그대로 허용한다.
  - 사용자가 아직 이름을 입력하지 않은 상태를 UI에서 빈칸으로 유지하기 위함이다.
  - 서버 제출 직전에는 normalizePlayerName()이 빈칸을 YOU로 바꾼다.
*/
export function sanitizePlayerNameInput(name) {
    return String(name || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, MAX_PLAYER_NAME_LENGTH);
}

/*
  랭킹 서버로 보낼 최종 이름 규칙.
  허용 문자: 영문 대문자, 숫자, _, -
  비어 있으면 안전한 기본 이름 YOU를 사용한다.
*/
export function normalizePlayerName(name) {
    return sanitizePlayerNameInput(name) || 'YOU';
}

export function formatElapsedMs(ms) {
    const value = Math.max(0, Math.floor(Number(ms) || 0));
    const totalSeconds = Math.floor(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((value % 1000) / 100);

    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

export function readLocalPlayerName() {
    const storage = getStorage();

    if (!storage) {
        return '';
    }

    try {
        /*
          v2부터는 "사용자가 직접 입력한 기본 이름"과
          "서버가 중복 회피를 위해 최종 배정한 이름"을 분리한다.

          예:
            사용자가 ABC 입력
            서버가 ABC2로 저장

          다음 판 입력창에는 ABC가 다시 보여야 한다.
          그래야 다음 중복이 ABC3가 되고 ABC22처럼 번호가 겹치지 않는다.

          과거 tm_player_name에는 서버가 배정한 ABC2 같은 값이 들어 있을 수 있어
          최초 마이그레이션 때는 그 값을 자동으로 가져오지 않는다.
          이 빌드에서 이름을 한 번 저장하면 preferred_v2 키가 생기고 이후부터 기억된다.
        */
        const preferredName = sanitizePlayerNameInput(
            storage.getItem(PREFERRED_PLAYER_NAME_KEY)
        );

        if (LEGACY_AUTO_NAME_PATTERN.test(preferredName)) {
            storage.removeItem(PREFERRED_PLAYER_NAME_KEY);
            return '';
        }

        return preferredName;
    } catch {
        return '';
    }
}

export function saveLocalPlayerName(name) {
    const normalized = normalizePlayerName(name);
    const storage = getStorage();

    if (!storage) {
        return normalized;
    }

    try {
        /* 새 코드가 읽는 기본 이름 */
        storage.setItem(PREFERRED_PLAYER_NAME_KEY, normalized);

        /*
          구버전과의 호환을 위해 기존 키도 같은 기본 이름으로 맞춰둔다.
          단, readLocalPlayerName()은 preferred_v2만 읽는다.
        */
        storage.setItem(PLAYER_NAME_KEY, normalized);
    } catch {
        /*
          사생활 보호 모드, 저장 공간 부족 등으로 localStorage가 실패해도
          게임과 온라인 랭킹 저장 자체는 계속 진행한다.
        */
    }

    return normalized;
}
