import { trademillAudio } from '../audio/TrademillAudio';

/*
  TRADEMILL 모바일 플레이 전용 입력 UI
  -----------------------------------
  - 터치 가능한 세로 화면에서만 표시한다.
  - 왼쪽 / 오른쪽 버튼은 각각 실제 화면 가로폭의 정확히 1/3 크기 정사각형이다.
  - Phaser Canvas 내부 버튼이 아니라 브라우저 DOM 버튼으로 만들어,
    카메라 scroll / canvas scale과 관계없이 터치 위치가 어긋나지 않게 한다.
  - GameScene은 아래 held / tap 상태만 읽는다.

  모바일 게임 논리 해상도:
  720 x 960

  기존 데스크톱 해상도:
  1280 x 720

  게임 물리 튜닝값은 전혀 건드리지 않는다.
*/

export const DESKTOP_GAME_WIDTH = 1280;
export const DESKTOP_GAME_HEIGHT = 720;
export const MOBILE_GAME_WIDTH = 720;
export const MOBILE_GAME_HEIGHT = 960;

const ROOT_ID = 'trademill-mobile-controls';
const STYLE_ID = 'trademill-mobile-controls-style';
const ACTIVE_BODY_CLASS = 'trademill-mobile-gameplay-active';

const state = {
    leftHeld: false,
    rightHeld: false,
    leftTapped: false,
    rightTapped: false,
    enabled: false,
    leftPointerId: null,
    rightPointerId: null
};

let controlsRoot = null;
let leftButton = null;
let rightButton = null;
let globalSafetyListenersInstalled = false;

export function isMobilePortraitEnvironment() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false;
    }

    const touchCapable =
        Number(navigator.maxTouchPoints || 0) > 0 ||
        window.matchMedia?.('(pointer: coarse)')?.matches;

    return !!touchCapable && window.innerHeight >= window.innerWidth;
}

function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #${ROOT_ID} {
            display: none;
        }

        body.${ACTIVE_BODY_CLASS} {
            overflow: hidden;
            overscroll-behavior: none;
        }

        body.${ACTIVE_BODY_CLASS} #game-container {
            position: fixed !important;
            top: 0;
            left: 0;
            right: 0;
            bottom: calc(33.333333vw + env(safe-area-inset-bottom, 0px) + 8px);
            width: auto !important;
            height: auto !important;
            margin: 0 !important;
            overflow: hidden;
        }

        body.${ACTIVE_BODY_CLASS} #game-container canvas {
            display: block;
        }

        body.${ACTIVE_BODY_CLASS} #${ROOT_ID} {
            position: fixed;
            left: 0;
            right: 0;
            bottom: env(safe-area-inset-bottom, 0px);
            z-index: 10000;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            width: 100vw;
            height: 33.333333vw;
            pointer-events: none;
            padding: 0;
            margin: 0;
        }

        #${ROOT_ID} .trademill-mobile-arrow {
            box-sizing: border-box;
            width: 33.333333vw;
            height: 33.333333vw;
            min-width: 0;
            min-height: 0;
            margin: 0;
            padding: 0;
            border: 1px solid rgba(228, 238, 255, 0.72);
            border-radius: 0;
            background:
                linear-gradient(145deg, rgba(20, 25, 30, 0.98), rgba(0, 0, 0, 0.98));
            color: rgba(245, 248, 255, 0.96);
            font-family: monospace;
            font-size: clamp(46px, 15vw, 88px);
            font-weight: 700;
            line-height: 1;
            text-align: center;
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
            user-select: none;
            touch-action: none;
            pointer-events: auto;
            outline: none;
        }

        #${ROOT_ID} .trademill-mobile-arrow::selection {
            background: transparent;
        }

        #${ROOT_ID} .trademill-mobile-arrow.is-held {
            transform: translateY(1px);
            border-color: rgba(255, 255, 255, 0.98);
            background:
                radial-gradient(circle at 50% 35%, rgba(86, 118, 138, 0.34), transparent 56%),
                linear-gradient(145deg, rgba(15, 20, 24, 1), rgba(0, 0, 0, 1));
        }

        #${ROOT_ID} .trademill-mobile-arrow:disabled {
            opacity: 0.28;
            pointer-events: none;
        }

        @media (orientation: landscape) {
            body.${ACTIVE_BODY_CLASS} #${ROOT_ID} {
                display: none;
            }

            body.${ACTIVE_BODY_CLASS} #game-container {
                position: static !important;
                width: 100% !important;
                height: 100% !important;
            }
        }
    `;

    document.head.appendChild(style);
}

function resetButtonVisuals() {
    leftButton?.classList.remove('is-held');
    rightButton?.classList.remove('is-held');
}

export function resetMobileGameplayInput() {
    state.leftHeld = false;
    state.rightHeld = false;
    state.leftTapped = false;
    state.rightTapped = false;
    state.leftPointerId = null;
    state.rightPointerId = null;
    resetButtonVisuals();
}

function releaseDirection(direction, pointerId = null) {
    if (direction === 'left') {
        if (
            pointerId !== null &&
            state.leftPointerId !== null &&
            pointerId !== state.leftPointerId
        ) {
            return;
        }

        state.leftHeld = false;
        state.leftPointerId = null;
        leftButton?.classList.remove('is-held');
        return;
    }

    if (
        pointerId !== null &&
        state.rightPointerId !== null &&
        pointerId !== state.rightPointerId
    ) {
        return;
    }

    state.rightHeld = false;
    state.rightPointerId = null;
    rightButton?.classList.remove('is-held');
}

function pressDirection(direction, event) {
    if (!state.enabled) {
        return;
    }

    event.preventDefault();

    const button = event.currentTarget;

    try {
        button.setPointerCapture?.(event.pointerId);
    } catch {
        // iOS / 일부 임베디드 브라우저에서 pointer capture가 거부되어도
        // held 상태 자체는 정상 동작하므로 무시한다.
    }

    if (direction === 'left') {
        if (state.leftPointerId !== null) {
            return;
        }

        state.leftPointerId = event.pointerId;
        state.leftHeld = true;
        state.leftTapped = true;
        leftButton?.classList.add('is-held');
        return;
    }

    if (state.rightPointerId !== null) {
        return;
    }

    state.rightPointerId = event.pointerId;
    state.rightHeld = true;
    state.rightTapped = true;
    rightButton?.classList.add('is-held');
}

function wireButton(button, direction) {
    /*
      모바일 Web Audio unlock 핵심.

      GameScene.update()에서 효과음을 재생하려고 기다리면 최초 user gesture가
      끝난 뒤가 될 수 있다. 그래서 실제 DOM 방향키에 손가락이 닿는 바로 이 순간
      AudioContext를 직접 생성/resume/prime한다.

      touchstart는 iOS Safari용 선행 보강이고, pointerdown은 실제 게임 입력이다.
      두 이벤트가 모두 와도 TrademillAudio 내부 Promise guard가 중복 resume을 막는다.
    */
    button.addEventListener(
        'touchstart',
        () => {
            void trademillAudio.unlockFromUserGesture();
        },
        { passive: true }
    );

    button.addEventListener('pointerdown', (event) => {
        void trademillAudio.unlockFromUserGesture();
        pressDirection(direction, event);
    });

    const release = (event) => {
        event.preventDefault?.();
        releaseDirection(direction, event.pointerId ?? null);
    };

    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);

    button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });
}

function installGlobalSafetyListeners() {
    if (globalSafetyListenersInstalled || typeof window === 'undefined') {
        return;
    }

    globalSafetyListenersInstalled = true;

    window.addEventListener('blur', resetMobileGameplayInput);
    window.addEventListener('pagehide', resetMobileGameplayInput);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            resetMobileGameplayInput();
        }
    });
}

function ensureControlsDom() {
    if (typeof document === 'undefined') {
        return null;
    }

    ensureStyle();
    installGlobalSafetyListeners();

    controlsRoot = document.getElementById(ROOT_ID);

    if (controlsRoot) {
        leftButton = controlsRoot.querySelector('[data-direction="left"]');
        rightButton = controlsRoot.querySelector('[data-direction="right"]');
        return controlsRoot;
    }

    controlsRoot = document.createElement('div');
    controlsRoot.id = ROOT_ID;
    controlsRoot.setAttribute('aria-label', 'Mobile game controls');

    leftButton = document.createElement('button');
    leftButton.type = 'button';
    leftButton.className = 'trademill-mobile-arrow';
    leftButton.dataset.direction = 'left';
    leftButton.setAttribute('aria-label', 'Brake or reverse');
    leftButton.textContent = '←';

    rightButton = document.createElement('button');
    rightButton.type = 'button';
    rightButton.className = 'trademill-mobile-arrow';
    rightButton.dataset.direction = 'right';
    rightButton.setAttribute('aria-label', 'Climb forward');
    rightButton.textContent = '→';

    controlsRoot.append(leftButton, rightButton);
    document.body.appendChild(controlsRoot);

    wireButton(leftButton, 'left');
    wireButton(rightButton, 'right');

    return controlsRoot;
}

export function activateMobileGameplayControls() {
    if (!isMobilePortraitEnvironment() || typeof document === 'undefined') {
        deactivateMobileGameplayControls();
        return false;
    }

    ensureControlsDom();
    resetMobileGameplayInput();
    state.enabled = true;

    if (leftButton) {
        leftButton.disabled = false;
    }

    if (rightButton) {
        rightButton.disabled = false;
    }

    document.body.classList.add(ACTIVE_BODY_CLASS);
    return true;
}

export function deactivateMobileGameplayControls() {
    resetMobileGameplayInput();
    state.enabled = false;

    if (leftButton) {
        leftButton.disabled = true;
    }

    if (rightButton) {
        rightButton.disabled = true;
    }

    if (typeof document !== 'undefined') {
        document.body.classList.remove(ACTIVE_BODY_CLASS);
    }
}

export function setMobileGameplayControlsEnabled(enabled) {
    if (!controlsRoot || !document.body.classList.contains(ACTIVE_BODY_CLASS)) {
        return;
    }

    resetMobileGameplayInput();
    state.enabled = !!enabled;

    if (leftButton) {
        leftButton.disabled = !state.enabled;
    }

    if (rightButton) {
        rightButton.disabled = !state.enabled;
    }
}

export function isMobileLeftHeld() {
    return state.enabled && state.leftHeld;
}

export function isMobileRightHeld() {
    return state.enabled && state.rightHeld;
}

export function consumeMobileLeftTap() {
    if (!state.enabled || !state.leftTapped) {
        return false;
    }

    state.leftTapped = false;
    return true;
}

export function consumeMobileRightTap() {
    if (!state.enabled || !state.rightTapped) {
        return false;
    }

    state.rightTapped = false;
    return true;
}
