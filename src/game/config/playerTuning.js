export const PLAYER_TUNING = {
    /*
      =========================
      1. 수레바퀴/공 기본 물성
      =========================
    */
    wheel: {
        /*
          radius:
          현재 공의 반지름.
          나중에 수레바퀴 캐릭터로 바꿀 때도 이 값이 충돌 크기 기준이 됨.
        */
        radius: 28,

        /*
          spawnY:
          시작할 때 공이 생성되는 y 위치.
          맵 시작점보다 너무 위면 떨어지고,
          너무 아래면 지형에 파묻힐 수 있음.
        */
        spawnY: 300,

        /*
          friction / frictionStatic:
          공이 지형에 붙는 정도.
          너무 낮으면 미끄러지고,
          너무 높으면 언덕에서 잘 안 굴러갈 수 있음.
        */
        friction: 0.54,
        frictionStatic: 44,

        /*
          frictionAir:
          공중/이동 중 속도가 자연스럽게 줄어드는 정도.
          높을수록 둔해짐.
        */
        frictionAir: 0.02,

        /*
          density:
          무게감.
          높이면 둔해지고, 낮추면 가벼워짐.
        */
        density: 0.0027,

        restitution: 0.0
    },

    /*
      =========================
      2. 오른쪽 이동
      =========================

      오른쪽은 현재 좋은 방향:
      - hold: 기본 전진
      - tap: 부스트
      - 산을 넘으려면 연타 필요
    */
    right: {
        holdForceGround: 0.00042,
        holdForceAir: 0.00010,

        holdAngularGround: 0.007,
        holdAngularAir: 0.002,

        tapBoostGround: 0.62,
        tapBoostAir: 0.22,

        tapAngularGround: 0.22,
        tapAngularAir: 0.08,

        /*
          minForwardVelocity:
          오른쪽을 누르고 있는데 너무 멈춰버릴 때 최소 전진 보정.
          너무 높으면 자동으로 밀리는 느낌이 강해짐.
        */
        minForwardVelocity: 0.025
    },

    /*
      =========================
      3. 왼쪽 이동 / 역회전 / 감속
      =========================

      이제 LEFT는 단순 브레이크 버튼이 아니라 실제 후진/역회전.
      지면에 닿아 있을 때만 강한 감속 효과가 의미 있음.
    */
    left: {
        /*
          holdForceGround:
          지면에서 왼쪽을 누를 때 실제 왼쪽으로 미는 힘.
          더 음수면 더 강하게 후진함.
        */
        holdForceGround: -0.00058,

        /*
          holdForceGroundWithGrip:
          LEFT + DOWN일 때.
          내리막에서 더 강한 역방향 힘.
        */
        holdForceGroundWithGrip: -0.00082,

        /*
          holdForceAir:
          공중에서 왼쪽 이동.
          너무 강하면 자유낙하를 회피하는 느낌이 되므로 약하게.
        */
        holdForceAir: -0.00008,

        /*
          angularGround:
          지면에서 왼쪽 역회전.
          음수값.
        */
        angularGround: -0.010,

        /*
          angularGroundWithGrip:
          LEFT + DOWN일 때 더 강한 역회전.
        */
        angularGroundWithGrip: -0.015,

        angularAir: -0.002,

        /*
          reverseBrakeMultiplier:
          오른쪽으로 가는 중 LEFT를 누를 때 x속도를 줄이는 비율.
          작을수록 강하게 감속.
        */
        reverseBrakeMultiplier: 0.965,

        /*
          LEFT + DOWN일 때 더 강하게 감속.
        */
        reverseBrakeMultiplierWithGrip: 0.915,

        /*
          내리막에서 y속도를 조금 줄여주는 정도.
          단, 자유낙하를 구원하면 안 되므로 너무 작게 하지 말 것.
        */
        reverseVerticalDamping: 0.985,
        reverseVerticalDampingWithGrip: 0.96,

        /*
          이미 왼쪽으로 가고 있을 때 추가 후진 가속.
        */
        backwardAccel: 0.010,
        backwardAccelWithGrip: 0.020
    },

    /*
      =========================
      4. 아래 방향키 / Grip
      =========================

      DOWN은 지면에서 자세를 낮추고 버티는 느낌.
      공중에서는 생존 버튼이 아님.
    */
    downGrip: {
        horizontalDamping: 0.975,
        verticalDamping: 0.94,
        angularDamping: 0.93
    },

    /*
      =========================
      5. 점프
      =========================
    */
    jump: {
        velocityY: -10.2,

        /*
          true:
          DOWN을 누르고 있으면 점프 불가.
          DOWN을 grip 자세로 분리하기 위함.
        */
        disableJumpWhileDownHeld: true
    },

    /*
      =========================
      6. 낙하 / 사망
      =========================
    */
    fall: {
        /*
          자유낙하 즉사 기준.
          LEFT/DOWN으로 구원 불가.
        */
        fatalVelocityY: 17.5,
        fatalFallDistance: 330,

        /*
          hard landing:
          즉사는 아니지만 착지 충격을 받는 기준.
        */
        hardLandingVelocityY: 10.5,
        hardLandingFallDistance: 150,

        hardLandingXMultiplier: 0.88,
        hardLandingYMultiplier: 0.78,
        hardLandingYMax: 8.2,
        hardLandingAngularMultiplier: 0.8
    },

    /*
      =========================
      7. 속도 제한
      =========================
    */
    limits: {
        angularLimit: 2.8,
        velocityXMin: -4.5,
        velocityXMax: 6
    }
};