import { AUDIO_TUNING } from '../config/audioTuning';

function clamp01(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.max(0, Math.min(1, number));
}

function midiToFrequency(midi) {
    return 440 * Math.pow(2, (Number(midi) - 69) / 12);
}

function nowMs() {
    return typeof performance !== 'undefined'
        ? performance.now()
        : Date.now();
}

class TrademillAudio {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.uiGain = null;
        this.bgmGain = null;

        this.noiseBuffer = null;
        this.isUnlocked = false;
        this.unlockInstalled = false;
        this.unlockHandler = null;
        this.unlockInFlight = null;
        this.visibilityHandler = null;

        /*
          RIGHT 코인이 피로도 100% 이후에도 계속 낮아지도록
          '추가 음정 하강량'을 런 단위 상태로 보관한다.

          게임 플레이 수치에는 전혀 관여하지 않고 오디오에만 사용한다.
        */
        this.rightCoinEndlessMode = false;
        this.rightCoinEndlessDropSemitones = 0;

        /*
          LEFT reverse coin도 한 판 안에서 누를수록 계속 낮아지게 한다.
          첫 입력은 기존 음정을 그대로 사용하고, 재생이 끝난 뒤 누적값을
          증가시키므로 두 번째 입력부터 실제 하강이 시작된다.
        */
        this.leftCoinDropSemitones = 0;

        this.bgmRequested = false;
        this.bgmPaused = false;
        this.bgmTimer = null;
        this.bgmStep = 0;
        this.bgmNextStepTime = 0;
        this.bgmDuckRestoreTimer = null;

        this.lastUiHoverAt = Number.NEGATIVE_INFINITY;
    }

    get enabled() {
        return !!AUDIO_TUNING.enabled;
    }

    installGlobalUnlockListeners() {
        if (this.unlockInstalled || typeof document === 'undefined') {
            return;
        }

        this.unlockInstalled = true;

        /*
          Web Audio autoplay 제한은 mouse hover만으로는 풀리지 않는다.
          실제 사용자 activation으로 인정되는 click / pointer / key / touch 계열을
          문서 capture 단계에서 폭넓게 잡아 첫 입력에서 최대한 확실하게 resume한다.

          이벤트를 여러 개 거는 이유는 브라우저/iframe/게임 포털마다
          최초 입력 이벤트가 조금씩 다르게 전달될 수 있기 때문이다.
        */
        this.unlockHandler = () => {
            /*
              중요: 모바일 Safari/WebKit에서는 AudioContext.resume()을
              실제 사용자 gesture 안에서 직접 호출하는 것이 가장 안전하다.
              전역 capture listener가 pointer/touch/click보다 먼저 이 경로를 탄다.
            */
            void this.unlockFromUserGesture();
        };

        this.getUnlockEventNames().forEach((eventName) => {
            document.addEventListener(
                eventName,
                this.unlockHandler,
                true
            );
        });

        /*
          한번 사용자 activation으로 AudioContext가 풀린 뒤
          탭을 백그라운드에 뒀다가 돌아왔을 때 브라우저가 context를
          다시 suspended 시키는 경우를 보완한다.
        */
        this.visibilityHandler = () => {
            if (
                document.visibilityState === 'visible' &&
                this.isUnlocked &&
                this.context &&
                this.context.state !== 'running' &&
                this.context.state !== 'closed'
            ) {
                /* iOS Safari는 suspended 외에 interrupted 상태가 될 수도 있다. */
                void this.ensureUnlocked();
            }
        };

        document.addEventListener(
            'visibilitychange',
            this.visibilityHandler,
            true
        );
    }

    getUnlockEventNames() {
        return [
            /* iOS Safari에서 첫 손가락 접촉 순간을 가장 먼저 잡는다. */
            'touchstart',
            'pointerdown',
            'mousedown',
            'pointerup',
            'mouseup',
            'click',
            'touchend',
            'keydown',
            'keyup'
        ];
    }

    removeGlobalUnlockListeners() {
        if (typeof document === 'undefined') {
            return;
        }

        if (this.unlockInstalled && this.unlockHandler) {
            this.getUnlockEventNames().forEach((eventName) => {
                document.removeEventListener(
                    eventName,
                    this.unlockHandler,
                    true
                );
            });
        }

        this.unlockInstalled = false;
        this.unlockHandler = null;
    }

    removeVisibilityListener() {
        if (
            typeof document === 'undefined' ||
            !this.visibilityHandler
        ) {
            return;
        }

        document.removeEventListener(
            'visibilitychange',
            this.visibilityHandler,
            true
        );
        this.visibilityHandler = null;
    }

    ensureContext() {
        if (!this.enabled || this.context || typeof window === 'undefined') {
            return this.context;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
            return null;
        }

        const context = new AudioContextClass();
        const masterGain = context.createGain();
        const sfxGain = context.createGain();
        const uiGain = context.createGain();
        const bgmGain = context.createGain();

        sfxGain.connect(masterGain);
        uiGain.connect(masterGain);
        bgmGain.connect(masterGain);
        masterGain.connect(context.destination);

        this.context = context;
        this.masterGain = masterGain;
        this.sfxGain = sfxGain;
        this.uiGain = uiGain;
        this.bgmGain = bgmGain;

        this.applyConfiguredVolumes({ immediate: true });
        return context;
    }

    primeContextFromUserGesture(context = this.context) {
        if (!context || context.state === 'closed') {
            return;
        }

        /*
          iOS/WebKit unlock 보강용 무음 1-sample source.

          - 사용자 touch/pointer 이벤트 안에서 즉시 start()한다.
          - 실제 소리는 0 sample이라 들리지 않는다.
          - AudioContext를 '실제로 재생을 시도한 context'로 만들어
            resume()만 호출하는 것보다 모바일 브라우저에서 안정적이다.
          - 게임 효과음/볼륨/튜닝값에는 아무 영향이 없다.
        */
        try {
            const buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);
            source.start(0);
        } catch {
            // unlock 보조 source 생성 실패는 resume 시도 자체를 막지 않는다.
        }
    }

    unlockFromUserGesture() {
        const context = this.ensureContext();

        if (!context) {
            return Promise.resolve(false);
        }

        /* 반드시 현재 touch/pointer/key gesture call stack 안에서 실행. */
        this.primeContextFromUserGesture(context);
        return this.ensureUnlocked({ fromUserGesture: true });
    }

    async ensureUnlocked({ fromUserGesture = false } = {}) {
        const context = this.ensureContext();

        if (!context) {
            return false;
        }

        if (context.state === 'running') {
            this.isUnlocked = true;
            this.removeGlobalUnlockListeners();

            if (this.bgmRequested && !this.bgmPaused) {
                this.startBgmScheduler();
            }

            return true;
        }

        /*
          pointerdown과 click처럼 한 번의 실제 클릭에서 여러 activation 이벤트가
          연달아 들어와도 resume()를 중복 호출하지 않도록 하나의 Promise를 공유한다.
        */
        if (this.unlockInFlight) {
            return this.unlockInFlight;
        }

        this.unlockInFlight = (async () => {
            try {
                if (fromUserGesture) {
                    this.primeContextFromUserGesture(context);
                }

                if (context.state !== 'running') {
                    await context.resume();
                }

                /*
                  일부 iOS 버전은 resume 직후 user gesture 안에서 source가 한 번 더
                  시작되면 안정적으로 running 상태가 유지되는 편이라 한 번 보강한다.
                */
                if (fromUserGesture && context.state === 'running') {
                    this.primeContextFromUserGesture(context);
                }
            } catch {
                return false;
            }

            this.isUnlocked = context.state === 'running';

            if (this.isUnlocked) {
                this.removeGlobalUnlockListeners();

                if (this.bgmRequested && !this.bgmPaused) {
                    this.startBgmScheduler();
                }
            }

            return this.isUnlocked;
        })();

        try {
            return await this.unlockInFlight;
        } finally {
            this.unlockInFlight = null;
        }
    }

    runWhenReady(callback) {
        if (!this.enabled) {
            return;
        }

        /*
          아직 첫 사용자 activation이 오지 않았다면 hover 같은 비활성 이벤트 때문에
          AudioContext를 미리 생성하지 않는다. 모바일 Safari에서 특히 중요하다.

          StartGame이 설치한 capture unlock listener가 실제 click/touch/key 순간 먼저
          unlockFromUserGesture()를 실행하고, 그 뒤 발생한 SFX 요청은 아래에서
          unlock Promise를 기다렸다가 정상 재생된다.
        */
        if (!this.context) {
            this.installGlobalUnlockListeners();
            return;
        }

        const context = this.context;

        if (context.state === 'running') {
            this.isUnlocked = true;
            callback(context);
            return;
        }

        this.ensureUnlocked().then((ready) => {
            if (ready && this.context) {
                callback(this.context);
            }
        });
    }

    applyConfiguredVolumes({ immediate = false } = {}) {
        if (!this.context) {
            return;
        }

        const time = this.context.currentTime;
        const smoothing = immediate ? 0.001 : 0.035;

        this.setGainTarget(
            this.masterGain,
            AUDIO_TUNING.volume.master,
            time,
            smoothing
        );
        this.setGainTarget(
            this.sfxGain,
            AUDIO_TUNING.volume.sfx,
            time,
            smoothing
        );
        this.setGainTarget(
            this.uiGain,
            AUDIO_TUNING.volume.ui,
            time,
            smoothing
        );

        if (!this.bgmPaused) {
            this.setGainTarget(
                this.bgmGain,
                AUDIO_TUNING.volume.bgm,
                time,
                smoothing
            );
        }
    }

    setGainTarget(gainNode, value, time, smoothing = 0.02) {
        if (!gainNode) {
            return;
        }

        const target = clamp01(value);
        gainNode.gain.cancelScheduledValues(time);
        gainNode.gain.setTargetAtTime(target, time, Math.max(0.001, smoothing));
    }

    /*
      런타임에서도 볼륨을 바꿀 수 있도록 API를 열어 둔다.
      실제 기본값은 config/audioTuning.js에서 조절하는 것이 가장 간단하다.
    */
    setMasterVolume(value) {
        AUDIO_TUNING.volume.master = clamp01(value);
        this.applyConfiguredVolumes();
    }

    setSfxVolume(value) {
        AUDIO_TUNING.volume.sfx = clamp01(value);
        this.applyConfiguredVolumes();
    }

    setUiVolume(value) {
        AUDIO_TUNING.volume.ui = clamp01(value);
        this.applyConfiguredVolumes();
    }

    setBgmVolume(value) {
        AUDIO_TUNING.volume.bgm = clamp01(value);
        this.applyConfiguredVolumes();
    }

    createGain(bus, volume, time) {
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(Math.max(0.0001, Number(volume) || 0.0001), time);
        gain.connect(bus);
        return gain;
    }

    scheduleEnvelope(
        gainNode,
        {
            startTime,
            attackSec = 0.002,
            sustainLevel = 1,
            releaseStartTime,
            endTime
        }
    ) {
        const gain = gainNode.gain;
        const safeAttackEnd = Math.min(
            endTime,
            startTime + Math.max(0.001, attackSec)
        );
        const safeReleaseStart = Math.max(safeAttackEnd, releaseStartTime);

        gain.cancelScheduledValues(startTime);
        gain.setValueAtTime(0.0001, startTime);
        gain.linearRampToValueAtTime(
            Math.max(0.0001, sustainLevel),
            safeAttackEnd
        );
        gain.setValueAtTime(
            Math.max(0.0001, sustainLevel),
            safeReleaseStart
        );
        gain.exponentialRampToValueAtTime(0.0001, endTime);
    }

    playSteppedCoin({
        startFrequency,
        endFrequency,
        volume,
        durationMs,
        secondNoteDelayMs,
        filterHz = 12000,
        startTime = null,
        destination = null
    }) {
        if (!this.context) {
            return;
        }

        const context = this.context;
        const time = startTime ?? context.currentTime + 0.002;
        const durationSec = Math.max(0.035, durationMs / 1000);
        const secondTime = time + Math.min(
            durationSec * 0.7,
            Math.max(0.008, secondNoteDelayMs / 1000)
        );
        const endTime = time + durationSec;
        const bus = destination || this.sfxGain;

        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(
            Math.max(0.01, startFrequency),
            time
        );
        oscillator.frequency.setValueAtTime(
            Math.max(0.01, endFrequency),
            secondTime
        );

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(
            Math.max(500, filterHz),
            time
        );
        filter.Q.setValueAtTime(0.35, time);

        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(bus);

        this.scheduleEnvelope(gain, {
            startTime: time,
            attackSec: AUDIO_TUNING.coin.attackMs / 1000,
            sustainLevel: Math.max(0.0001, volume),
            releaseStartTime:
                Math.max(secondTime, endTime - AUDIO_TUNING.coin.releaseMs / 1000),
            endTime
        });

        oscillator.start(time);
        oscillator.stop(endTime + 0.01);
    }

    playLowReverseCoin({
        startFrequency,
        endFrequency,
        volume,
        durationMs,
        attackMs,
        cutoffMs,
        filterHz
    }) {
        if (!this.context) {
            return;
        }

        const context = this.context;
        const time = context.currentTime + 0.002;
        const durationSec = Math.max(0.05, durationMs / 1000);
        const endTime = time + durationSec;
        const attackEnd = Math.min(
            endTime - 0.01,
            time + Math.max(0.01, attackMs / 1000)
        );
        const cutoffStart = Math.max(
            attackEnd,
            endTime - Math.max(0.008, cutoffMs / 1000)
        );

        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();

        oscillator.type = 'square';

        /*
          실제 audio file reverse가 아니라 코드 합성이므로
          '낮은 코인의 뒤집힌 인상'을 주도록:
          1) 낮은 음역에서 더 낮은 음역으로 내려가고
          2) 앞부분이 서서히 차오른 뒤
          3) 마지막이 짧게 잘리는 envelope를 사용한다.
        */
        oscillator.frequency.setValueAtTime(
            Math.max(0.01, startFrequency),
            time
        );
        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(0.01, endFrequency),
            cutoffStart
        );

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(
            Math.max(120, filterHz),
            time
        );
        filter.Q.setValueAtTime(0.65, time);

        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        gain.gain.cancelScheduledValues(time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(
            Math.max(0.0001, volume * 0.72),
            attackEnd
        );
        gain.gain.linearRampToValueAtTime(
            Math.max(0.0001, volume),
            cutoffStart
        );
        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            endTime
        );

        oscillator.start(time);
        oscillator.stop(endTime + 0.01);
    }

    resetRunState() {
        /*
          새 GameScene이 시작되면 이전 런에서 누적된 방향키 코인 음정만 초기화한다.

          RIGHT
          - 피로도 100% 이후 추가로 내려간 음정 누적을 초기화.

          LEFT
          - 연타할수록 내려간 reverse coin 음정 누적을 초기화.
          - 따라서 새 판의 첫 LEFT는 항상 사용자가 정해 둔 현재 기본음으로 시작한다.

          BGM 진행 상태나 사용자가 조절한 기존 볼륨/튜닝값에는 손대지 않는다.
        */
        this.rightCoinEndlessMode = false;
        this.rightCoinEndlessDropSemitones = 0;
        this.leftCoinDropSemitones = 0;
    }

    playCoinForward({ fatigue = 0 } = {}) {
        this.runWhenReady(() => {
            const coin = AUDIO_TUNING.coin;
            const fatigueAmount = clamp01(fatigue);

            /*
              피로도 100% 이후에도 음이 더 이상 멈추지 않게 한다.

              - fatigue가 endlessDropStartFatigue에 도달하면 endless mode ON.
              - 그 상태에서 RIGHT를 한 번 누를 때마다 semitone 누적값이 증가.
              - 2^(-semitones/12)를 곱하므로 이론상 하한 없이 계속 내려간다.
              - 아주 오래 누르면 결국 인간의 가청 주파수 아래로 내려가며
                사실상 '돈 소리가 소멸하는' 상태가 된다.
              - 피로도가 충분히 회복되면 누적값을 초기화한다.
            */
            if (
                fatigueAmount >=
                Number(coin.endlessDropStartFatigue ?? 0.995)
            ) {
                this.rightCoinEndlessMode = true;
            } else if (
                fatigueAmount <=
                Number(coin.endlessDropResetFatigue ?? 0.92)
            ) {
                this.rightCoinEndlessMode = false;
                this.rightCoinEndlessDropSemitones = 0;
            }

            if (this.rightCoinEndlessMode) {
                this.rightCoinEndlessDropSemitones += Math.max(
                    0,
                    Number(coin.endlessDropSemitonesPerTap || 0)
                );
            }

            const fatiguePitchMultiplier =
                1 - fatigueAmount * coin.fatiguePitchDrop;
            const endlessPitchMultiplier = Math.pow(
                2,
                -this.rightCoinEndlessDropSemitones / 12
            );
            const pitchMultiplier = Math.max(
                0.000001,
                fatiguePitchMultiplier * endlessPitchMultiplier
            );

            const volumeMultiplier = Math.max(
                0.3,
                1 - fatigueAmount * coin.fatigueVolumeDrop
            );
            const startFrequency =
                coin.baseFrequency * pitchMultiplier;
            const endFrequency =
                startFrequency * coin.secondRatio;
            const filterHz = Math.max(
                1500,
                12000 - fatigueAmount * coin.fatigueLowpassDropHz
            );

            this.playSteppedCoin({
                startFrequency,
                endFrequency,
                volume:
                    AUDIO_TUNING.volume.rightCoin * volumeMultiplier,
                durationMs: coin.durationMs,
                secondNoteDelayMs: coin.secondNoteDelayMs,
                filterHz
            });
        });
    }

    playCoinReverse() {
        this.runWhenReady(() => {
            const coin = AUDIO_TUNING.coin;

            /*
              LEFT도 RIGHT의 '계속 낮아지는 돈 소리'와 같은 문법으로 간다.

              중요한 순서:
              1) 현재 누적 semitone으로 이번 소리를 먼저 재생한다.
              2) 재생 예약 뒤 누적 semitone을 증가시킨다.

              그래서 첫 LEFT 입력은 기존에 사용자가 맞춰 둔
              reverseStartFrequency / reverseEndFrequency를 정확히 유지하고,
              두 번째 입력부터 점점 더 낮아진다.
            */
            const pitchMultiplier = Math.pow(
                2,
                -this.leftCoinDropSemitones / 12
            );

            this.playLowReverseCoin({
                startFrequency:
                    coin.reverseStartFrequency * pitchMultiplier,
                endFrequency:
                    coin.reverseEndFrequency * pitchMultiplier,
                volume: AUDIO_TUNING.volume.leftCoin,
                durationMs: coin.reverseDurationMs,
                attackMs: coin.reverseAttackMs,
                cutoffMs: coin.reverseCutoffMs,
                filterHz: Math.max(120, coin.reverseFilterHz * pitchMultiplier)
            });

            /*
              별도 수치값을 새로 만들지 않고 RIGHT의 기존
              endlessDropSemitonesPerTap을 그대로 공유한다.
              따라서 사용자가 이미 조정해 둔 기존 오디오 튜닝값을
              하나도 바꾸지 않으면서 두 방향의 하강 속도를 같은 문법으로 맞춘다.
            */
            this.leftCoinDropSemitones += Math.max(
                0,
                Number(coin.endlessDropSemitonesPerTap || 0)
            );
        });
    }

    playUiHover() {
        if (!this.isUnlocked || !this.context || this.context.state !== 'running') {
            return;
        }

        const timeNow = nowMs();

        if (timeNow - this.lastUiHoverAt < AUDIO_TUNING.ui.hoverCooldownMs) {
            return;
        }

        this.lastUiHoverAt = timeNow;
        const time = this.context.currentTime + 0.001;
        const duration = AUDIO_TUNING.ui.hoverDurationMs / 1000;
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(
            AUDIO_TUNING.ui.hoverFrequency,
            time
        );
        oscillator.connect(gain);
        gain.connect(this.uiGain);

        this.scheduleEnvelope(gain, {
            startTime: time,
            attackSec: 0.001,
            sustainLevel: AUDIO_TUNING.volume.uiHover,
            releaseStartTime: time + duration * 0.35,
            endTime: time + duration
        });

        oscillator.start(time);
        oscillator.stop(time + duration + 0.01);
    }

    playUiClick() {
        this.runWhenReady(() => {
            const ui = AUDIO_TUNING.ui;

            this.playSteppedCoin({
                startFrequency: ui.clickFrequency,
                endFrequency: ui.clickFrequency * ui.clickSecondRatio,
                volume: AUDIO_TUNING.volume.uiClick,
                durationMs: ui.clickDurationMs,
                secondNoteDelayMs: 28,
                filterHz: 11000,
                destination: this.uiGain
            });
        });
    }

    getNoiseBuffer() {
        if (this.noiseBuffer || !this.context) {
            return this.noiseBuffer;
        }

        const sampleRate = this.context.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * 0.5));
        const buffer = this.context.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        /*
          완전한 white noise보다 8-bit 게임기 같은 거친 질감을 내기 위해
          몇 샘플 동안 같은 값을 유지하는 간단한 sample-and-hold 노이즈를 만든다.
        */
        let held = 0;
        let holdCount = 0;

        for (let index = 0; index < data.length; index += 1) {
            if (holdCount <= 0) {
                held = Math.random() * 2 - 1;
                holdCount = 3 + Math.floor(Math.random() * 7);
            }

            data[index] = held;
            holdCount -= 1;
        }

        this.noiseBuffer = buffer;
        return buffer;
    }

    playImpact({
        pitchStart,
        pitchEnd,
        durationMs,
        noiseAmount,
        volume
    }) {
        this.runWhenReady(() => {
            const context = this.context;
            const time = context.currentTime + 0.002;
            const duration = Math.max(0.06, durationMs / 1000);
            const endTime = time + duration;

            const oscillator = context.createOscillator();
            const oscillatorGain = context.createGain();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(pitchStart, time);
            oscillator.frequency.exponentialRampToValueAtTime(
                Math.max(30, pitchEnd),
                endTime
            );
            oscillator.connect(oscillatorGain);
            oscillatorGain.connect(this.sfxGain);

            this.scheduleEnvelope(oscillatorGain, {
                startTime: time,
                attackSec: 0.001,
                sustainLevel: volume,
                releaseStartTime: time + duration * 0.18,
                endTime
            });

            oscillator.start(time);
            oscillator.stop(endTime + 0.015);

            const noiseBuffer = this.getNoiseBuffer();

            if (noiseBuffer && noiseAmount > 0) {
                const noise = context.createBufferSource();
                const noiseFilter = context.createBiquadFilter();
                const noiseGain = context.createGain();

                noise.buffer = noiseBuffer;
                noiseFilter.type = 'bandpass';
                noiseFilter.frequency.setValueAtTime(620, time);
                noiseFilter.Q.setValueAtTime(0.7, time);

                noise.connect(noiseFilter);
                noiseFilter.connect(noiseGain);
                noiseGain.connect(this.sfxGain);

                this.scheduleEnvelope(noiseGain, {
                    startTime: time,
                    attackSec: 0.001,
                    sustainLevel: volume * noiseAmount,
                    releaseStartTime: time + duration * 0.12,
                    endTime: time + duration * 0.72
                });

                noise.start(time, 0, duration * 0.72);
            }
        });
    }

    playHardLanding(power = 1) {
        const impact = AUDIO_TUNING.impact;
        const strength = Math.max(0.25, clamp01(power));

        this.playImpact({
            pitchStart: impact.hardLandingPitchStart,
            pitchEnd: impact.hardLandingPitchEnd,
            durationMs: impact.hardLandingDurationMs,
            noiseAmount: impact.hardLandingNoiseAmount,
            volume: AUDIO_TUNING.volume.hardLanding * strength
        });
    }

    playDeath() {
        const impact = AUDIO_TUNING.impact;

        this.duckBgmFor(800, 0.16);
        this.playImpact({
            pitchStart: impact.deathPitchStart,
            pitchEnd: impact.deathPitchEnd,
            durationMs: impact.deathDurationMs,
            noiseAmount: impact.deathNoiseAmount,
            volume: AUDIO_TUNING.volume.deathHit
        });
    }

    playGiveUp() {
        const impact = AUDIO_TUNING.impact;

        this.playImpact({
            pitchStart: impact.giveUpPitchStart,
            pitchEnd: impact.giveUpPitchEnd,
            durationMs: impact.giveUpDurationMs,
            noiseAmount: impact.giveUpNoiseAmount,
            volume: AUDIO_TUNING.volume.giveUpHit
        });
    }

    playFinish() {
        this.runWhenReady(() => {
            const finish = AUDIO_TUNING.finish;
            const context = this.context;
            const baseTime = context.currentTime + 0.018;

            this.duckBgmFor(
                finish.bgmDuckMs,
                finish.bgmDuckLevel
            );

            for (let index = 0; index < finish.noteCount; index += 1) {
                const scaleIndex = index % finish.scaleSemitones.length;
                const octaveRise = Math.floor(
                    index / Math.max(1, finish.octaveRiseEvery)
                ) * 12;
                const midi =
                    finish.startMidi +
                    finish.scaleSemitones[scaleIndex] +
                    octaveRise;
                const progress = finish.noteCount <= 1
                    ? 0
                    : index / (finish.noteCount - 1);
                const fade = Math.pow(1 - progress, finish.fadePower);
                const volume =
                    AUDIO_TUNING.volume.finish *
                    Math.max(0.045, fade);
                const frequency = midiToFrequency(midi);

                this.playSteppedCoin({
                    startFrequency: frequency,
                    endFrequency: frequency * 1.35,
                    volume,
                    durationMs: finish.coinDurationMs,
                    secondNoteDelayMs: 27,
                    filterHz: 12500,
                    startTime:
                        baseTime + index * finish.intervalMs / 1000
                });
            }
        });
    }

    playScoreSaved(rank = null) {
        this.runWhenReady(() => {
            const context = this.context;
            const score = AUDIO_TUNING.score;
            const baseTime = context.currentTime + 0.015;

            score.savedMidi.forEach((midi, index) => {
                const frequency = midiToFrequency(midi);

                this.playSteppedCoin({
                    startFrequency: frequency,
                    endFrequency: frequency * 1.24,
                    volume: AUDIO_TUNING.volume.scoreSaved,
                    durationMs: 76,
                    secondNoteDelayMs: 23,
                    startTime: baseTime + index * score.savedGapMs / 1000,
                    filterHz: 11800
                });
            });

            const parsedRank = Math.floor(Number(rank));

            if (Number.isFinite(parsedRank) && parsedRank >= 1 && parsedRank <= 10) {
                const bonusStart =
                    baseTime +
                    score.savedMidi.length * score.savedGapMs / 1000 +
                    0.05;

                score.topTenMidi.forEach((midi, index) => {
                    const frequency = midiToFrequency(midi);

                    this.playSteppedCoin({
                        startFrequency: frequency,
                        endFrequency: frequency * 1.18,
                        volume: AUDIO_TUNING.volume.topTenBonus,
                        durationMs: 74,
                        secondNoteDelayMs: 22,
                        startTime:
                            bonusStart + index * score.topTenGapMs / 1000,
                        filterHz: 12500
                    });
                });
            }
        });
    }

    requestBgmStart() {
        if (!AUDIO_TUNING.bgm.enabled || !this.enabled) {
            return;
        }

        this.bgmRequested = true;

        /*
          중요: AudioContext를 페이지 로드 시 미리 만들지 않는다.
          특히 iOS Safari에서는 사용자 gesture 전에 생성된 context가
          계속 suspended/interrupted로 남는 경우가 있어, 첫 실제 터치/클릭/키 입력
          순간 ensureContext()가 실행되도록 지연한다.
        */
        if (this.context?.state === 'running' && !this.bgmPaused) {
            this.startBgmScheduler();
        }
    }

    startBgmScheduler() {
        if (
            !this.context ||
            this.context.state !== 'running' ||
            !AUDIO_TUNING.bgm.enabled ||
            this.bgmPaused ||
            this.bgmTimer
        ) {
            return;
        }

        const bgm = AUDIO_TUNING.bgm;
        const now = this.context.currentTime;
        this.bgmNextStepTime = Math.max(
            this.bgmNextStepTime,
            now + bgm.startDelaySec
        );

        this.setGainTarget(
            this.bgmGain,
            AUDIO_TUNING.volume.bgm,
            now,
            Math.max(0.01, bgm.fadeInSec / 3)
        );

        this.bgmTimer = window.setInterval(
            () => this.scheduleBgmAhead(),
            Math.max(10, bgm.schedulerIntervalMs)
        );

        this.scheduleBgmAhead();
    }

    stopBgmScheduler() {
        if (this.bgmTimer && typeof window !== 'undefined') {
            window.clearInterval(this.bgmTimer);
        }

        this.bgmTimer = null;
    }

    getBgmStepDuration() {
        const bpm = Math.max(20, AUDIO_TUNING.bgm.bpm);
        return (60 / bpm) / 4;
    }

    scheduleBgmAhead() {
        if (!this.context || this.bgmPaused) {
            return;
        }

        const bgm = AUDIO_TUNING.bgm;
        const horizon = this.context.currentTime + bgm.scheduleAheadSec;
        const stepDuration = this.getBgmStepDuration();

        while (this.bgmNextStepTime < horizon) {
            this.scheduleBgmStep(this.bgmStep, this.bgmNextStepTime);
            this.bgmStep += 1;
            this.bgmNextStepTime += stepDuration;
        }
    }

    scheduleBgmStep(globalStep, time) {
        const bgm = AUDIO_TUNING.bgm;
        const stepsPerBar = Math.max(4, bgm.stepsPerBar);
        const barsPerCycle = Math.max(1, bgm.barsPerCycle);
        const stepInBar = globalStep % stepsPerBar;
        const bar = Math.floor(globalStep / stepsPerBar);
        const cycleBar = bar % barsPerCycle;
        const accumulation = cycleBar / Math.max(1, barsPerCycle - 1);
        const rootMidi = bgm.bassRoots[
            cycleBar % bgm.bassRoots.length
        ];
        const stepDuration = this.getBgmStepDuration();

        /* 마디 첫 박: 낮은 triangle bass */
        if (stepInBar === 0 || stepInBar === 8) {
            const bassMidi = stepInBar === 0 ? rootMidi : rootMidi + 7;
            this.scheduleBgmTone({
                midi: bassMidi,
                time,
                duration: stepDuration * 3.4,
                type: 'triangle',
                volume: bgm.bassVolume * (0.84 + accumulation * 0.16),
                filterHz: 1300
            });
        }

        /* 기본 장부 pulse: 4분음표 간격으로 매우 짧게 */
        if (stepInBar % 4 === 0) {
            const pulseIndex =
                (cycleBar + Math.floor(stepInBar / 4)) %
                bgm.pulseScale.length;

            this.scheduleBgmTone({
                midi: bgm.pulseScale[pulseIndex],
                time,
                duration: stepDuration * 0.72,
                type: 'square',
                volume: bgm.pulseVolume,
                filterHz: 2300
            });
        }

        /*
          복리처럼 마디가 지날수록 중간 음이 하나씩 추가된다.
          8마디가 끝나면 cycleBar가 0으로 돌아가며 다시 단순해진다.
        */
        const extraPattern = [
            [6],
            [6, 14],
            [2, 6, 14],
            [2, 6, 10, 14],
            [2, 5, 9, 13],
            [1, 5, 9, 13],
            [1, 4, 7, 10, 13],
            [1, 3, 5, 7, 9, 11, 13, 15]
        ];
        const pattern = extraPattern[
            Math.min(extraPattern.length - 1, cycleBar)
        ];

        if (pattern.includes(stepInBar)) {
            const scaleIndex =
                (stepInBar + cycleBar * 2) % bgm.pulseScale.length;
            const octave = cycleBar >= 5 ? 12 : 0;

            this.scheduleBgmTone({
                midi: bgm.pulseScale[scaleIndex] + octave,
                time,
                duration: stepDuration * 0.44,
                type: 'square',
                volume: bgm.accentVolume * (0.72 + accumulation * 0.28),
                filterHz: 3000 + cycleBar * 180
            });
        }

        /* 아주 작은 8-bit ticker noise. 코인 연타를 가리지 않을 정도로만. */
        if (stepInBar === 4 || stepInBar === 12) {
            this.scheduleBgmNoise(
                time,
                stepDuration * 0.16,
                bgm.noiseVolume
            );
        }
    }

    scheduleBgmTone({
        midi,
        time,
        duration,
        type,
        volume,
        filterHz
    }) {
        if (!this.context) {
            return;
        }

        const oscillator = this.context.createOscillator();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        const endTime = time + Math.max(0.025, duration);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(midiToFrequency(midi), time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterHz, time);
        filter.Q.setValueAtTime(0.45, time);

        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);

        this.scheduleEnvelope(gain, {
            startTime: time,
            attackSec: 0.004,
            sustainLevel: volume,
            releaseStartTime: time + duration * 0.35,
            endTime
        });

        oscillator.start(time);
        oscillator.stop(endTime + 0.01);
    }

    scheduleBgmNoise(time, duration, volume) {
        const buffer = this.getNoiseBuffer();

        if (!buffer || !this.context) {
            return;
        }

        const source = this.context.createBufferSource();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        const endTime = time + Math.max(0.015, duration);

        source.buffer = buffer;
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(3200, time);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);

        this.scheduleEnvelope(gain, {
            startTime: time,
            attackSec: 0.001,
            sustainLevel: volume,
            releaseStartTime: time + duration * 0.12,
            endTime
        });

        source.start(time, 0, duration);
    }

    pauseBgm() {
        this.bgmPaused = true;
        this.stopBgmScheduler();

        if (!this.context || !this.bgmGain) {
            return;
        }

        const time = this.context.currentTime;
        this.bgmGain.gain.cancelScheduledValues(time);
        this.bgmGain.gain.setTargetAtTime(
            0.0001,
            time,
            Math.max(0.005, AUDIO_TUNING.bgm.pauseFadeSec / 3)
        );
    }

    resumeBgm({ delaySec = 0, fadeInSec = null } = {}) {
        const wasPaused = this.bgmPaused;
        this.bgmRequested = true;
        this.bgmPaused = false;

        /*
          이미 정상 재생 중이면 gain automation을 건드리지 않는다.
          특히 FINISH cascade가 BGM을 잠시 duck하고 있을 때 ResultScene이
          resumeBgm()을 호출해 duck 효과를 지워버리는 것을 막는다.
        */
        if (!wasPaused && this.bgmTimer) {
            return;
        }

        this.runWhenReady(() => {
            const context = this.context;
            const startAt = context.currentTime + Math.max(0, delaySec);
            const fade = fadeInSec ?? AUDIO_TUNING.bgm.resumeFadeSec;

            this.bgmNextStepTime = Math.max(
                this.bgmNextStepTime,
                startAt + 0.02
            );

            this.bgmGain.gain.cancelScheduledValues(context.currentTime);
            this.bgmGain.gain.setValueAtTime(
                Math.max(0.0001, this.bgmGain.gain.value),
                context.currentTime
            );
            this.bgmGain.gain.setTargetAtTime(
                AUDIO_TUNING.volume.bgm,
                startAt,
                Math.max(0.01, fade / 3)
            );

            this.startBgmScheduler();
        });
    }

    duckBgmFor(durationMs, level = 0.15) {
        if (!this.context || !this.bgmGain || this.bgmPaused) {
            return;
        }

        if (this.bgmDuckRestoreTimer && typeof window !== 'undefined') {
            window.clearTimeout(this.bgmDuckRestoreTimer);
            this.bgmDuckRestoreTimer = null;
        }

        const time = this.context.currentTime;
        const target = AUDIO_TUNING.volume.bgm * clamp01(level);
        this.bgmGain.gain.cancelScheduledValues(time);
        this.bgmGain.gain.setTargetAtTime(target, time, 0.025);

        if (typeof window !== 'undefined') {
            this.bgmDuckRestoreTimer = window.setTimeout(() => {
                this.bgmDuckRestoreTimer = null;

                if (
                    this.context &&
                    this.bgmGain &&
                    !this.bgmPaused
                ) {
                    this.setGainTarget(
                        this.bgmGain,
                        AUDIO_TUNING.volume.bgm,
                        this.context.currentTime,
                        0.12
                    );
                }
            }, Math.max(0, durationMs));
        }
    }

    stopBgm({ resetCycle = false } = {}) {
        this.bgmRequested = false;
        this.bgmPaused = false;
        this.stopBgmScheduler();

        if (resetCycle) {
            this.bgmStep = 0;
            this.bgmNextStepTime = 0;
        }

        if (this.context && this.bgmGain) {
            const time = this.context.currentTime;
            this.bgmGain.gain.cancelScheduledValues(time);
            this.bgmGain.gain.setTargetAtTime(
                0.0001,
                time,
                Math.max(0.005, AUDIO_TUNING.bgm.fadeOutSec / 3)
            );
        }
    }

    async shutdown() {
        this.stopBgm({ resetCycle: true });
        this.removeGlobalUnlockListeners();
        this.removeVisibilityListener();
        this.resetRunState();

        if (this.bgmDuckRestoreTimer && typeof window !== 'undefined') {
            window.clearTimeout(this.bgmDuckRestoreTimer);
            this.bgmDuckRestoreTimer = null;
        }

        const context = this.context;

        this.context = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.uiGain = null;
        this.bgmGain = null;
        this.noiseBuffer = null;
        this.isUnlocked = false;

        if (context && context.state !== 'closed') {
            try {
                await context.close();
            } catch {
                // 브라우저 종료 시 close 실패는 무시한다.
            }
        }
    }
}

export const trademillAudio = new TrademillAudio();
