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
          =========================
          절차적 러너 설정
          =========================

          사람은 햄스터 휠 안쪽 림을 밟고 달린다.
          발과 손은 림의 한 점을 잡고 함께 뒤로 실려 갔다가 다시 앞으로 돌아온다.
          보행 위상이 바퀴 회전량에 고정되어 있어 발이 미끄러지지 않는다.

          조정 순서 권장
          1) 크기와 비율 (bodyScale ~ toeRatio)
          2) 보행 (strideArcRatio, stanceRatio, swingLiftRatio)
          3) 자세 (baseLean ~ slumpHeadDrop)
          4) 관성 반응 (accel* / impact* / lean* / head*)
          5) 실루엣 (bulk, outline*, rearLimbAlpha)

          중요한 기하학적 제약:
          팔 길이(upperArmRatio + foreArmRatio) * bodyScale * radius 가
          어깨에서 림까지의 거리보다 짧으면 손이 림에 닿지 않는다.
          effortHipShift / brakeHipShift 로 몸을 앞뒤로 옮겨 그 거리를 줄인다.
          손이 허공을 젓는 것처럼 보이면 이 세 값을 먼저 의심한다.
        */
        proceduralHuman: {
            enabled: true,

            /* ---- 크기와 비율 (radius 기준 배율) ---- */
            bodyScale: 1.0,
            thighRatio: 0.4,
            shinRatio: 0.4,
            torsoRatio: 0.46,
            neckRatio: 0.055,
            headRadiusRatio: 0.155,
            /*
              팔 길이 — "팔이 길다/짧다"는 여기서 조절한다.

              합계(upperArmRatio + foreArmRatio)가 팔 전체 길이이며,
              radius * bodyScale 에 곱해진다. 지금은 0.60.

              길이 판단 기준 (합계 값):
                0.67  다리의 84%. 고릴라처럼 길다.
                0.60  다리의 75%. 사람 표준. ← 현재
                0.54  다리의 68%. 짧고 아기 같은 비율.

              팔을 크게 줄이면 손이 림에 닿지 않게 되므로,
              아래 effortHipShift / brakeHipShift 로 몸을 앞뒤로 옮겨 보정한다.
              (팔 합계 0.60 기준으로 0.10 / 0.32 가 맞춰져 있다.)
            */
            upperArmRatio: 0.27,
            foreArmRatio: 0.21,
            toeRatio: 0.1,

            /* 앞뒤 팔다리를 벌려 두는 정도. 0이면 완전히 겹쳐 보인다. */
            limbSeparation: 0.045,

            /*
              어깨 간격 = limbSeparation * 이 값.

              앞뒤 어깨 간격이 몸통 반지름보다 좁으면 두 팔이 모두 몸통에 파묻혀
              뒤팔이 안 보인다. 실측 기준 2.0 이상이면 확실히 분리된다.
            */
            shoulderSeparationRatio: 2.0,

            /* ---- 바퀴와의 접촉 ---- */

            /*
              발이 닿는 안쪽 림 위치. radius 대비 안쪽으로 들어온 비율.
              0이면 바퀴 바깥선을 밟아 자개 링과 겹쳐 보인다.
              0.08 ~ 0.16 권장.
            */
            rimInsetRatio: 0.11,

            /*
              걷기 기준 보폭(림 호 길이) / radius.
              키우면 성큼성큼 걷고 케이던스가 느려진다.
            */
            strideArcRatio: 0.62,

            /* 속도가 붙을수록 보폭이 커지는 정도. 0이면 항상 같은 보폭이다. */
            strideSpeedGain: 1.6,

            /*
              보폭이 목표치를 따라가는 속도.
              높이면 가감속에 즉각 반응하지만 걸음 도중 보폭이 바뀌어
              발이 조금씩 미끄러진다. 3 ~ 8 권장.
            */
            strideSmoothing: 5,

            /*
              한 걸음이 훑는 림 각도의 상한(라디안).
              너무 키우면 다리가 닿지 않아 IK가 잘려 보인다. 1.6 ~ 2.1 권장.
            */
            maxSweepAngle: 1.9,

            /*
              보폭 상한을 정하는 다리 최대 신전 비율.

              1.0이면 무릎이 완전히 펴진 자세까지 허용해 뻣뻣해 보인다.
              0.9 아래로 내리면 보폭이 눈에 띄게 짧아진다. 0.93 ~ 0.98 권장.

              이 값은 "다리가 실제로 닿을 수 있는 최대 보폭"을 계산하는 데 쓰이며,
              보행 위상도 같은 보폭에서 유도되므로 발 미끄러짐이 생기지 않는다.
            */
            maxLegExtension: 0.97,

            /* 한 주기 중 발이 림에 붙어 있는 비율. 0.5보다 크면 걷기, 작으면 뛰기에 가깝다. */
            stanceRatio: 0.58,

            /* 스윙 중 발이 림에서 안쪽으로 떨어지는 최대 거리 / radius. */
            swingLiftRatio: 0.3,

            /* 정지 상태에서 두 발을 벌려 두는 각도(라디안). */
            idleStanceAngle: 0.3,

            /* 초당 최대 걸음 수. 실질적으로는 보폭 상한이 먼저 걸린다. */
            maxStepsPerSecond: 11,

            /* moveAmount(=달리는 정도) 1.0에 도달하는 림 속도 기준 / radius. */
            moveReferenceRatio: 3.0,

            /* ---- 팔 ---- */

            /* 팔 위상을 다리보다 늦춘다. 0이면 몸 전체가 한 덩어리로 움직인다. */
            armPhaseOffset: 0.12,

            /*
              자유 스윙(림을 잡지 않을 때) 팔의 뻗은 정도.
              팔 전체 길이 대비 어깨~손 거리다.

                0.85  거의 편 팔. 팔꿈치 약 130도.
                0.72  팔꿈치 약 92도. 달리는 자세로 자연스럽다. ← 현재
                0.55  많이 접힘. 팔꿈치 약 50도.

              이 값이 너무 작으면 팔이 갈 곳을 잃고 접혀서 닭 날개처럼 보인다.
            */
            freeArmExtension: 0.72,

            /* 스윙의 중심 각도(라디안). 양수면 손이 진행 방향 앞쪽으로 간다. */
            freeArmBaseAngle: 0.2,

            /* 자유 스윙 진폭(라디안). 0.5면 앞뒤로 약 29도씩 흔든다. */
            armSwingAmount: 0.5,

            /*
              스윙 중 뻗은 정도가 변하는 폭.
              0이면 팔꿈치 각도가 내내 같아 팔이 통짜로 흔들린다.
              0.18이면 팔꿈치가 약 72~116도 사이를 오간다.
            */
            armReachSwing: 0.18,

            /* 림을 잡을 때 손이 훑는 각도 = sweepAngle * 이 값. */
            armSweepRatio: 0.55,

            /*
              힘줄 때 손이 잡는 림 각도(라디안, 바닥에서 앞쪽으로).
              1.57이 정확히 바퀴 정면이다. 여기서 크게 벗어나면 팔이 닿지 않는다.
            */
            forwardGripAngle: 1.45,

            /* 브레이크에서 손이 잡는 뒤쪽 림 각도. */
            backwardGripAngle: -1.45,

            /*
              팔이 뻗을 수 있는 최대 비율.

              1.0이면 손이 닿지 않는 자세에서 팔이 완전한 직선이 되어
              팔꿈치가 사라지고 막대기처럼 보인다.
              0.9면 항상 약 128도 정도의 팔꿈치가 남는다. 0.86 ~ 0.94 권장.
            */
            maxArmExtension: 0.9,

            /* ---- 자세 ---- */
            standExtension: 0.88,
            crouchDepth: 0.3,
            baseCrouch: 0.1,
            effortCrouch: 0.35,
            brakeCrouch: 0.22,
            gripCrouch: 0.18,
            airCrouch: 0.3,
            slumpCrouch: 0.5,

            baseLean: 0.1,
            effortLean: 0.55,
            uphillLean: 0.12,
            brakeLean: 0.55,
            slumpLean: 0.25,
            slumpHeadDrop: 0.35,

            /*
              골반 전후 이동.

              팔 길이가 바퀴 반지름보다 짧아서, 몸이 바퀴 정중앙에 있으면
              손이 림에 닿지 않는다. 힘줄 때는 몸을 앞으로, 브레이크에서는
              뒤로 옮겨 어깨-림 거리를 좁힌다.

              팔 길이를 바꾸면 이 두 값도 같이 조절해야 한다.
              손이 허공을 젓거나 팔꿈치가 일직선이면 값을 키운다.
            */
            hipForwardShift: 0.0,
            effortHipShift: 0.1,
            brakeHipShift: 0.32,

            /* 달릴 때 상하 진동 폭 / scale. */
            bobAmount: 0.05,
            breathingAmount: 0.03,
            idleSwayAmount: 0.025,

            /* ---- 상태 전이 속도 ---- */
            driverSmoothing: 11,

            /*
              브레이크 / 힘주기 전이 속도.
              손이 몸에서 림까지 멀리 이동하므로 일반 전이보다 느려야 한다.
              키우면 반응은 빨라지지만 손이 튀고, 낮추면 자세가 늦게 잡힌다. 5 ~ 9 권장.
            */
            gripSmoothing: 7,

            /*
              무릎·팔꿈치가 꺾이는 쪽을 뒤집는 문턱값(0~1).

              0이면 속도가 0을 스칠 때마다 관절이 좌우로 튄다.
              키우면 방향을 확실히 바꾼 뒤에야 뒤집히지만,
              그 사이에는 관절이 반대쪽으로 접힌 채로 있다. 0.25 ~ 0.5 권장.
            */
            bendFlipThreshold: 0.35,

            /*
              |facing| 이 이 값 이하인 동안 팔다리를 완전히 편 상태로 둔다.

              반드시 bendFlipThreshold 보다 커야 한다.
              같거나 작으면 관절이 뒤집히는 그 프레임에 이미 다시 접히기 시작해
              팔꿈치가 튄다. facing 은 한 프레임에 0.07 정도 움직이므로
              여유를 두고 0.1 이상 크게 잡는다.
            */
            turnStraightenHold: 0.5,

            /*
              방향 전환 구간을 벗어나며 다시 접히는 데 걸리는 폭.

              |facing| 이 bendFlipThreshold 이하인 동안에는 완전히 펴져 있고,
              거기서 이 값만큼 더 벗어나면 원래 자세로 돌아온다.

              중요: 관절이 뒤집히는 시점(bendFlipThreshold)에 팔다리가
              이미 펴져 있어야 튐이 보이지 않는다. 그래서 범위가 아니라
              문턱값 바깥의 여유폭으로 정의한다.
            */
            turnStraightenFade: 0.3,

            /* 그 구간에서 도달하는 신전 비율. 1에 가까울수록 완전히 편 자세다. */
            turnStraightenExtension: 0.99,
            airSmoothing: 14,
            finishSmoothing: 4,
            velocitySmoothing: 9,
            facingSmoothing: 12,
            facingDeadzone: 0.12,

            /* ---- 관성 반응(2차 모션) ---- */

            /*
              accelReference: 이 가속도에서 관성 반응이 최대가 된다.
              Matter 속도는 프레임당 px이므로 값이 커 보이는 것이 정상이다.
              상체가 너무 심하게 출렁이면 이 값을 키운다.
            */
            accelReference: 900,
            accelSmoothing: 9,
            accelLeanAmount: 0.3,
            leanStiffness: 150,
            leanDamping: 21,

            /* 머리가 상체를 따라오는 비율과 지연. 1이면 목이 굳는다. */
            headFollowRatio: 0.72,
            headStiffness: 190,
            headDamping: 22,

            /* ---- 착지 충격 ---- */
            impactCrouchKick: 5.5,
            impactHeadKick: 2.2,
            impactArmKick: 3.0,
            impactStiffness: 230,
            impactDamping: 20,

            /* ---- 실루엣 ---- */

            /* 몸 전체 두께 배율. 1보다 작으면 마른 체형, 크면 두꺼워진다. */
            bulk: 1.0,

            /* 어두운 외곽선. 흑칠 배경에서 인물이 묻히면 키운다. */
            outlineEnabled: true,
            outlineWidth: 1.6,

            /*
              뒤쪽 팔다리를 그림자색 쪽으로 섞는 정도(0~1).

              알파를 낮추는 방식이 아니라 불투명한 어두운 색으로 칠한다.
              반투명이면 아래 외곽선이 비쳐서 팔이 실제보다 얇아 보인다.
              0.45 ~ 0.7 권장. 1에 가까우면 뒤팔이 실루엣에서 사라진다.
            */
            rearLimbShade: 0.55,

            /* ---- 힘주기 합성 (RIGHT + 피로 + 오르막) ---- */
            effortFromPush: 0.35,
            effortFromFatigue: 0.65,
            effortFromUphill: 0.45
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
