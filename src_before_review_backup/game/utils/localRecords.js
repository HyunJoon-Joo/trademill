const PLAYER_NAME_KEY = 'tm_player_name';
const MAX_PLAYER_NAME_LENGTH = 12;

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
  랭킹 서버와 같은 규칙으로 이름을 정리한다.
  허용 문자: 영문 대문자, 숫자, _, -
  브라우저 UI에서 한 번, 서버에서 다시 한 번 검증하는 구조가 안전하다.
*/
export function normalizePlayerName(name) {
    const cleaned = String(name || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, MAX_PLAYER_NAME_LENGTH);

    return cleaned || 'YOU';
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
        return 'YOU';
    }

    try {
        return normalizePlayerName(storage.getItem(PLAYER_NAME_KEY));
    } catch {
        return 'YOU';
    }
}

export function saveLocalPlayerName(name) {
    const normalized = normalizePlayerName(name);
    const storage = getStorage();

    if (!storage) {
        return normalized;
    }

    try {
        storage.setItem(PLAYER_NAME_KEY, normalized);
    } catch {
        /*
          사생활 보호 모드, 저장 공간 부족 등으로 localStorage가 실패해도
          게임과 온라인 랭킹 저장 자체는 계속 진행한다.
        */
    }

    return normalized;
}
