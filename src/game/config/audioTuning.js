/*
  ============================================================
  TRADEMILL AUDIO TUNING
  ============================================================

  이 파일은 "소리의 크기와 성격"만 조절하는 곳이다.
  게임 물리 / 캐릭터 조종 / 자개 색상 수치는 건드리지 않는다.

  볼륨 값은 기본적으로 0.0 ~ 1.0 범위를 사용한다.

  예)
  0.00 = 완전 무음
  0.25 = 작음
  0.50 = 중간
  0.75 = 큼
  1.00 = 매우 큼

  Web Audio 합성음은 여러 음이 동시에 겹치면 체감 볼륨이 커질 수 있으므로
  처음에는 아래 기본값으로 플레이하고, 실제 스피커 / 이어폰에서 조절하는 것이 좋다.
*/

export const AUDIO_TUNING = {
    enabled: true,

    /*
      ----------------------------------------------------------
      전체 볼륨
      ----------------------------------------------------------

      master
      - 모든 소리에 마지막으로 곱해지는 전체 볼륨.
      - 게임 전체가 너무 크거나 작을 때 가장 먼저 조절한다.

      sfx
      - 플레이 입력, 충돌, 골인, 저장 성공 등의 효과음 전체 볼륨.

      ui
      - 버튼 hover / click 전용 볼륨.
      - UI가 너무 시끄러우면 이 값만 낮추면 된다.

      bgm
      - 배경음악 전용 볼륨.
      - TRADEMILL에서는 방향키 코인음이 주인공이므로 BGM은 작게 두는 것을 권장한다.
    */
    volume: {
        master: 0.82,
        sfx: 0.92,
        ui: 0.42,
        bgm: 0.5,

        /* 개별 효과음 미세 조절 */
        rightCoin: 0.95,
        leftCoin: 0.88,
        uiHover: 0.32,
        uiClick: 0.72,
        hardLanding: 0.52,
        deathHit: 0.92,
        giveUpHit: 0.88,
        finish: 0.95,
        scoreSaved: 0.72,
        topTenBonus: 0.66
    },

    /*
      ----------------------------------------------------------
      RIGHT / LEFT 코인
      ----------------------------------------------------------

      baseFrequency
      - 기본 코인 음 높이(Hz).
      - 높이면 더 얇고 반짝이는 8-bit 코인.
      - 낮추면 더 두껍고 무거운 코인.

      secondRatio
      - 첫 음과 두 번째 음의 음정 간격.
      - 1.5 정도면 "팅-팅↑" 느낌이 잘 난다.

      durationMs
      - 코인 1회의 길이.
      - 너무 길면 연타할 때 소리가 뭉친다.

      fatiguePitchDrop / fatigueVolumeDrop
      - 오르막 피로도가 1.0에 가까워질수록 RIGHT 코인도 지쳐 보이게 만든다.
      - 0이면 피로도와 무관하게 항상 같은 소리.
    */
    coin: {
        baseFrequency: 760,
        secondRatio: 1.52,
        durationMs: 88,
        secondNoteDelayMs: 34,
        attackMs: 2,
        releaseMs: 50,
        fatiguePitchDrop: 0.18,
        fatigueVolumeDrop: 0.24,
        fatigueLowpassDropHz: 5200,

        /*
          fatigue가 거의 100%에 도달한 뒤에도 RIGHT를 계속 연타하면
          음정이 더 이상 바닥에서 멈추지 않고 매 입력마다 계속 내려간다.

          endlessDropStartFatigue
          - 이 피로도 이상에서 '끝없는 하강' 모드가 시작된다.
          - 0.995 = 사실상 100%에 도달했을 때 시작.

          endlessDropResetFatigue
          - 피로도가 이 값 아래로 충분히 회복되면 추가 하강 누적을 초기화한다.
          - 너무 높이면 경사 변화만으로 음정이 갑자기 원래대로 튈 수 있다.

          endlessDropSemitonesPerTap
          - 피로도 100% 이후 RIGHT 1회 입력마다 추가로 내려가는 반음 수.
          - 0.55면 약 22회 추가 연타할 때 1옥타브 정도 더 내려간다.
          - 음정 하한을 두지 않으므로 오래 연타하면 결국 가청 주파수 아래까지 내려간다.
        */
        endlessDropStartFatigue: 0.995,
        endlessDropResetFatigue: 0.92,
        endlessDropSemitonesPerTap: 0.55,

        /*
          LEFT는 밝은 코인의 단순 역순이 아니라,
          아주 낮은 8-bit 코인을 '뒤집어 재생한 듯한' 음색으로 만든다.

          reverseStartFrequency -> reverseEndFrequency 순으로 내려가며,
          reverseAttackMs를 길게 잡아 앞이 살짝 빨려 들어오고
          끝이 짧게 끊기는 reverse 느낌을 낸다.
        */
        reverseStartFrequency: 188,
        reverseEndFrequency: 78,
        reverseDurationMs: 118,
        reverseAttackMs: 44,
        reverseCutoffMs: 18,
        reverseFilterHz: 1900
    },

    /*
      ----------------------------------------------------------
      UI 코인
      ----------------------------------------------------------

      hover는 아주 짧은 한 음, click은 짧은 두 음이다.
      버튼 위를 계속 오갈 때 피곤하면 hoverDurationMs 또는 uiHover 볼륨을 낮춘다.
    */
    ui: {
        hoverFrequency: 1320,
        hoverDurationMs: 28,
        clickFrequency: 980,
        clickSecondRatio: 1.42,
        clickDurationMs: 72,
        hoverCooldownMs: 45
    },

    /*
      ----------------------------------------------------------
      충돌 / 추락 / 포기
      ----------------------------------------------------------

      hardLanding은 "툭", death / giveUp은 "퍽"에 가깝게 설계했다.
      pitchStart / pitchEnd를 모두 낮추면 더 무겁다.
      noiseAmount를 높이면 8-bit 노이즈가 더 거칠어진다.
    */
    impact: {
        hardLandingPitchStart: 145,
        hardLandingPitchEnd: 62,
        hardLandingDurationMs: 105,
        hardLandingNoiseAmount: 0.24,

        deathPitchStart: 235,
        deathPitchEnd: 48,
        deathDurationMs: 235,
        deathNoiseAmount: 0.52,

        giveUpPitchStart: 185,
        giveUpPitchEnd: 42,
        giveUpDurationMs: 285,
        giveUpNoiseAmount: 0.42
    },

    /*
      ----------------------------------------------------------
      FINISH
      ----------------------------------------------------------

      코인 음이 계단처럼 올라가며 연타되고, 뒤로 갈수록 작아진다.

      noteCount
      - 골인 때 울리는 코인 개수.

      intervalMs
      - 각 코인 사이 간격.
      - 낮추면 더 빠르게 쏟아진다.

      fadePower
      - 뒤쪽 음이 얼마나 빨리 작아지는지.
      - 높이면 끝부분이 더 빨리 사라진다.
    */
    finish: {
        noteCount: 18,
        intervalMs: 92,
        startMidi: 72,
        scaleSemitones: [0, 2, 4, 7, 9, 12],
        octaveRiseEvery: 6,
        fadePower: 1.45,
        coinDurationMs: 92,
        bgmDuckLevel: 0.10,
        bgmDuckMs: 2300
    },

    /*
      ----------------------------------------------------------
      점수 저장
      ----------------------------------------------------------

      일반 저장 성공은 짧은 2음.
      1~10위에 들어가면 뒤에 짧은 보너스 코인 3음이 추가된다.
    */
    score: {
        savedMidi: [79, 84],
        savedGapMs: 82,
        topTenMidi: [84, 88, 91],
        topTenGapMs: 72
    },

    /*
      ----------------------------------------------------------
      BGM : "COMPOUND INTEREST"
      ----------------------------------------------------------

      컨셉:
      - 낮은 triangle bass가 시장의 기계적인 바닥을 만든다.
      - square pulse가 장부 / 시세 ticker처럼 반복된다.
      - 8마디 동안 요소가 조금씩 누적되다가 다시 1단계로 리셋된다.
      - 방향키 코인 연타가 실제 주 멜로디가 되도록 BGM 자체는 일부러 얌전하게 둔다.

      bpm
      - 음악 속도.
      - 80~105 정도가 현재 게임에는 무난하다.

      barsPerCycle
      - 몇 마디 동안 사운드가 축적된 뒤 다시 리셋되는지.

      pulseVolume / bassVolume / accentVolume
      - BGM 내부 각 악기의 상대 볼륨.
      - BGM이 코인 연타를 가리면 여기보다 먼저 volume.bgm을 낮추는 것을 권장한다.
    */
    bgm: {
        enabled: true,
        bpm: 92,
        barsPerCycle: 8,
        stepsPerBar: 16,
        schedulerIntervalMs: 25,
        scheduleAheadSec: 0.12,
        startDelaySec: 0.04,
        fadeInSec: 0.7,
        fadeOutSec: 0.12,

        bassVolume: 0.30,
        pulseVolume: 0.18,
        accentVolume: 0.10,
        noiseVolume: 0.045,

        /* 8마디의 저음 진행. MIDI 번호이며 A2, C3, G2, E2 계열이다. */
        bassRoots: [45, 45, 48, 48, 43, 43, 40, 40],

        /* 메인 pulse는 A minor pentatonic 기반. 저작권 없는 단순 생성 패턴이다. */
        pulseScale: [57, 60, 62, 64, 67, 69],

        /* BGM을 pause/resume할 때 너무 갑자기 끊기지 않게 하는 짧은 fade. */
        pauseFadeSec: 0.055,
        resumeFadeSec: 0.22
    }
};
