/*
  TRADEMILL 시각 테마 설정

  이 파일은 게임 규칙이나 물리값을 바꾸지 않고,
  흑칠 배경 · 디지털 자개 · UI · 플레이어 외형만 관리한다.

  조정 원칙
  - 색과 빛의 강도는 여기에서 조절한다.
  - 물리와 충돌은 gameTuning.js / playerTuning.js에서 조절한다.
  - 자개 효과를 너무 강하게 하면 지형의 실제 접촉선이 안 보일 수 있으므로
    terrain.coreWidth는 terrain.glowWidth보다 항상 훨씬 작게 유지한다.
*/

export const VISUAL_THEME = {
    canvas: {
        width: 1280,
        height: 720
    },

    /*
      =========================
      1. 흑칠 배경
      =========================

      완전한 단색 검정이 아니라,
      아주 어두운 회색 막이 천천히 이동하는 흑칠 표면을 만든다.
      배경이 너무 밝아지면 자개 선과 UI가 묻히므로 값은 낮게 유지한다.
    */
    lacquer: {
        base: 0x020304,
        lower: 0x050607,
        panel: 0x07090b,
        panelStrong: 0x020304,

        /* 화면 전체에 깔리는 미세 입자 수. 너무 높이면 저사양에서 부담이 생긴다. */
        grainCount: 120,
        grainColor: 0xaeb6bf,
        grainAlphaMin: 0.012,
        grainAlphaMax: 0.038,
        grainRadiusMax: 1.35,

        /* 천천히 일렁이는 어두운 광택 덩어리 수. */
        sheenCount: 6,
        sheenColors: [
            0x1a2026,
            0x22262c,
            0x13191e,
            0x252930
        ],
        sheenAlphaMin: 0.018,
        sheenAlphaMax: 0.052,
        sheenDurationMinMs: 9000,
        sheenDurationMaxMs: 18000,

        /* 가장자리 비네팅. 높일수록 화면 중심만 남고 가장자리가 어두워진다. */
        vignetteAlpha: 0.42
    },

    /*
      =========================
      2. 디지털 자개 팔레트
      =========================

      실제 자개처럼 한 색이 아니라,
      청록 → 보라 → 분홍 → 금빛 → 녹빛 → 백색이 반복되게 한다.
    */
    nacre: {
        palette: [
            0x6feeff,
            0x9fa8ff,
            0xd59cff,
            0xff8fcf,
            0xffd58a,
            0xdffb9b,
            0x78ffd2,
            0xf4fdff
        ],

        /*
          모든 자개 색은 palette의 한 색에서 다음 색으로 "연속 보간"된다.
          이전처럼 특정 순간에 색이 딱 바뀌지 않고, 오랜 시간에 걸쳐 은은하게 흐른다.

          timePhaseSpeed:
          - 0.00010: 매우 느림. 팔레트 1바퀴에 약 80초
          - 0.00018: 현재 기본. 약 44초
          - 0.00030: 눈에 띄게 빠름. 약 27초

          UI와 지형이 같은 속도로 완전히 동기화되면 인공적으로 보일 수 있어
          uiTimeMultiplier / wheelTimeMultiplier로 약간씩 다른 속도를 쓴다.
        */
        timePhaseSpeed: 0.005,
        uiTimeMultiplier: 0.82,
        wheelTimeMultiplier: 1.12,

        /*
          일반적인 월드 위치 기반 위상.
          FINISH 선, 먼지 등 위치마다 색이 조금 다르게 보이도록 사용한다.
        */
        worldPhaseScale: 0.0045,

        /*
          지형선은 원본 데이터의 한 선분을 다시 짧은 조각으로 나눈 뒤
          각 조각에 서로 다른 자개색을 적용한다.

          terrainColorSegmentLength:
          - 작을수록 한 라인 안에 더 많은 색이 섞인다.
          - 너무 작으면 렌더링 선분 수가 늘어난다.
          - 14~24px 권장.

          terrainPathPhaseScale:
          - 지형을 따라 이동할 때 색 변화 밀도.
          - 0.010이면 색 띠가 넓고,
          - 0.020이면 한 데이터 선분 안에도 여러 색이 나타난다.
        */
        terrainColorSegmentLength: 18,
        terrainPathPhaseScale: 0.018,
        terrainGlowWidth: 12,
        terrainCoreWidth: 5,
        terrainHighlightWidth: 1.5,
        terrainGlowAlpha: 0.17,
        terrainCoreAlpha: 0.96,
        terrainHighlightAlpha: 0.82,

        /*
          자개 표면의 반사광이 숨 쉬듯 밝아졌다 어두워지는 정도.
          색 자체의 이동과 별도로 알파가 아주 미세하게 변한다.
        */
        shimmerSpatialScale: 0.026,
        shimmerTimeSpeed: 0.00105,
        shimmerAmount: 0.16,

        /*
          버튼·패널 테두리도 매 프레임 아주 조금씩 색이 흐른다.
          borderColorSegmentLength를 줄이면 한 변 안의 색 조각이 더 촘촘해진다.
        */
        borderColorSegmentLength: 24,
        borderPhaseStep: 0.72,
        buttonGlowWidth: 8,
        buttonCoreWidth: 2,
        buttonGlowAlpha: 0.16,
        buttonCoreAlpha: 0.92,
        panelGlowAlpha: 0.1,

        /*
          플레이어 바퀴 역시 자개 아크가 시간에 따라 색을 바꾼다.
          arcCount를 높이면 바퀴 안에 더 많은 색 조각이 보인다.
        */
        wheelArcCount: 12,
        wheelGlowWidth: 9,
        wheelCoreWidth: 4.5,
        wheelHighlightWidth: 1.4,
        wheelGlowAlpha: 0.2,
        wheelCoreAlpha: 0.98
    },

    /*
      =========================
      3. 글자와 UI 가독성
      =========================

      모든 글자를 무지개로 만들면 읽기 어려워진다.
      제목·선택·핵심 숫자만 자개색을 쓰고,
      설명문은 밝은 회백색으로 유지한다.
    */
    text: {
        displayFont: 'Trebuchet MS, Arial, sans-serif',
        bodyFont: 'Arial, sans-serif',
        monoFont: 'Courier New, monospace',
        primary: '#f4f7f8',
        secondary: '#b6bcc2',
        muted: '#697078',
        subtle: '#454b52',
        danger: '#ff8f9d',
        success: '#dffb9b',
        shadow: '#000000'
    },

    /*
      =========================
      4. 플레이어 외형
      =========================

      바퀴는 코드가 자개 링으로 그린다.
      안쪽 사람은 지금은 코드 실루엣으로 표시하고,
      나중에 아래 sprite.enabled를 true로 바꾸면 스프라이트를 사용한다.

      스프라이트 제작 규격
      - 각 파일은 가로형 스프라이트시트
      - 프레임 크기 96x96
      - 배경 완전 투명 PNG
      - 사람만 그린다. 바퀴는 넣지 않는다.
      - 사람의 중심은 매 프레임 동일해야 흔들리지 않는다.
    */
    player: {
        humanColor: 0xe7ecef,
        humanShadowColor: 0x111417,
        cageColor: 0x353a40,
        dustEnabled: true,
        dustSpeedThreshold: 1.2,

        /*
          코드 졸라맨 애니메이션 설정

          별도 PNG 없이도 상태별로 자연스러운 2D 동작을 만든다.
          인물의 몸통·팔·다리는 각각 관절을 가진 2개 선분으로 계산하며,
          상태가 바뀔 때 즉시 포즈가 튀지 않도록 내부적으로 보간한다.

          poseSmoothing:
          - 높을수록 상태 전환이 빠르고 즉각적이다.
          - 낮을수록 부드럽지만 입력 반응이 늦어 보일 수 있다.

          gaitBaseSpeed / gaitSpeedGain:
          - 실제 이동 속도에 따라 달리기 주기가 빨라지는 정도.
        */
        proceduralHuman: {
            enabled: true,
            poseSmoothing: 10.5,
            velocitySmoothing: 7.5,
            gaitBaseSpeed: 3.8,
            gaitSpeedGain: 1.15,
            bodyScale: 0.92,
            shadowWidthExtra: 3,
            jointRadius: 1.15,
            headRadiusRatio: 0.145,
            breathingAmount: 0.018,
            idleSwayAmount: 0.025
        },

        sprite: {
            enabled: false,
            frameWidth: 96,
            frameHeight: 96,
            scale: 0.58,
            yOffset: 0,

            sheets: {
                idle: {
                    key: 'human-idle',
                    path: 'assets/player/human-idle.png',
                    frameRate: 5,
                    repeat: -1,
                    frameCount: 4
                },
                run: {
                    key: 'human-run',
                    path: 'assets/player/human-run.png',
                    frameRate: 12,
                    repeat: -1,
                    frameCount: 8
                },
                strain: {
                    key: 'human-strain',
                    path: 'assets/player/human-strain.png',
                    frameRate: 10,
                    repeat: -1,
                    frameCount: 8
                },
                brake: {
                    key: 'human-brake',
                    path: 'assets/player/human-brake.png',
                    frameRate: 10,
                    repeat: -1,
                    frameCount: 6
                },
                reverse: {
                    key: 'human-reverse',
                    path: 'assets/player/human-reverse.png',
                    frameRate: 10,
                    repeat: -1,
                    frameCount: 8
                },
                air: {
                    key: 'human-air',
                    path: 'assets/player/human-air.png',
                    frameRate: 7,
                    repeat: -1,
                    frameCount: 4
                },
                land: {
                    key: 'human-land',
                    path: 'assets/player/human-land.png',
                    frameRate: 12,
                    repeat: 0,
                    frameCount: 5
                },
                finish: {
                    key: 'human-finish',
                    path: 'assets/player/human-finish.png',
                    frameRate: 8,
                    repeat: -1,
                    frameCount: 6
                }
            }
        }
    },

    /*
      =========================
      5. 장면별 깊이값
      =========================
    */
    depth: {
        background: -200,
        backgroundSheen: -190,
        terrain: 0,
        finish: 5,
        wheel: 10,
        human: 11,
        hud: 100
    }
};
