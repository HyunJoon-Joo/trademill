export const PLAYER_TUNING = {
    /*
      =========================
      1. 공 / 수레바퀴 기본 물성
      =========================
    */
    wheel: {
        /*
          충돌체 반지름.
          나중에 수레바퀴 캐릭터를 넣어도 물리 기준은 이 값.
        */
        radius: 28,

        /*
          시작 y 비상값.
          실제 시작 위치는 GameScene에서 지형 높이를 계산해 결정함.
        */
        spawnY: 300,

        /*
          움직이는 동안의 마찰.
        */
        friction: 0.54,

        /*
          정지 상태에서 미끄러지지 않게 버티는 마찰.
        */
        frictionStatic: 44,

        /*
          공기 저항.
          높이면 공중과 지상 모두 더 빨리 감속함.
        */
        frictionAir: 0.02,

        /*
          물체 밀도.
          높이면 무겁고 둔해짐.
        */
        density: 0.0027,

        /*
          착지 시 튀어 오르는 정도.
          0이면 거의 튀지 않음.
        */
        restitution: 0.0
    },

    /*
      =========================
      2. 오른쪽 방향키
      =========================
    */
    right: {
        /*
          지상에서 오른쪽 키를 누르고 있을 때 지속적으로 가하는 힘.
        */
        holdForceGround: 0.00042,

        /*
          공중에서 오른쪽 키를 누르고 있을 때 가하는 힘.
        */
        holdForceAir: 0.00010,

        /*
          지상에서 오른쪽 키를 누르고 있을 때 회전 가속.
        */
        holdAngularGround: 0.007,

        /*
          공중에서 오른쪽 키를 누르고 있을 때 회전 가속.
        */
        holdAngularAir: 0.002,

        /*
          지상에서 오른쪽 키를 한 번 눌렀을 때 순간 전진량.
          오르막 연타의 기본 힘.
        */
        tapBoostGround: 0.62,

        /*
          공중에서 오른쪽 키를 한 번 눌렀을 때 순간 전진량.
        */
        tapBoostAir: 0.22,

        /*
          지상에서 오른쪽 키를 한 번 눌렀을 때 순간 회전량.
        */
        tapAngularGround: 0.22,

        /*
          공중에서 오른쪽 키를 한 번 눌렀을 때 순간 회전량.
        */
        tapAngularAir: 0.08,

        /*
          오른쪽 키를 누르고 있는데 속도가 너무 낮을 때 적용되는 최소 속도.
        */
        minForwardVelocity: 0.025
    },

    /*
      =========================
      3. 왼쪽 방향키 / 후진
      =========================
    */
    left: {
        /*
          지상에서 왼쪽 키를 계속 누를 때 가하는 역방향 힘.
        */
        holdForceGround: -0.00058,

        /*
          LEFT + DOWN을 같이 누를 때 역방향 힘.
        */
        holdForceGroundWithGrip: -0.00082,

        /*
          공중에서 왼쪽 키를 누를 때의 약한 이동 힘.
        */
        holdForceAir: -0.00008,

        /*
          지상에서 왼쪽 방향으로 회전시키는 힘.
        */
        angularGround: -0.010,

        /*
          LEFT + DOWN 상태의 강한 역회전.
        */
        angularGroundWithGrip: -0.015,

        /*
          공중에서의 약한 역회전.
        */
        angularAir: -0.002,

        /*
          오른쪽으로 굴러가는 중 LEFT를 계속 누를 때 적용되는 감속 비율.

          1에 가까울수록 천천히 감속함.
          이번에는 연타 브레이크를 의미 있게 만들기 위해 이전보다 약하게 설정.
        */
        reverseBrakeMultiplier: 0.992,

        /*
          LEFT + DOWN 상태의 지속 감속 비율.
        */
        reverseBrakeMultiplierWithGrip: 0.978,

        /*
          내리막에서 LEFT를 계속 누를 때 세로 속도를 조금 줄이는 비율.
        */
        reverseVerticalDamping: 0.992,

        /*
          LEFT + DOWN 상태에서 세로 속도를 줄이는 비율.
        */
        reverseVerticalDampingWithGrip: 0.975,

        /*
          이미 왼쪽으로 움직이는 중 LEFT를 누르면 추가되는 후진 가속.
        */
        backwardAccel: 0.010,

        /*
          LEFT + DOWN 상태에서의 추가 후진 가속.
        */
        backwardAccelWithGrip: 0.020
    },

    /*
      =========================
      4. 왼쪽 키 연타 브레이크
      =========================
    */
    brakeTap: {
        /*
          연타 브레이크 기능 사용 여부.
        */
        enabled: true,

        /*
          왼쪽 키를 한 번 눌렀을 때 제거되는 x 속도.

          일정한 양을 빼기 때문에:
          - 속도 2라면 적은 연타로 정지
          - 속도 10이라면 훨씬 많은 연타가 필요
        */
        velocityReductionPerTap: 0.52,

        /*
          LEFT + DOWN 상태에서 브레이크 한 번의 세기를 몇 배로 할지.
        */
        gripMultiplier: 1.45,

        /*
          브레이크 연타 시 줄어드는 회전 속도.
        */
        angularReductionPerTap: 0.18,

        /*
          이보다 느리게 전진 중이면 연타 브레이크를 적용하지 않음.
          이후 LEFT를 계속 누르면 실제 후진으로 전환됨.
        */
        minimumForwardSpeed: 0.05
    },

    /*
      =========================
      5. 내리막 가속
      =========================
    */
    downhill: {
        /*
          내리막 추가 가속 사용 여부.
        */
        enabled: true,

        /*
          이 경사보다 완만하면 내리막 가속을 적용하지 않음.

          경사 계산:
          양수 = 오른쪽으로 내려가는 길
          음수 = 오른쪽으로 올라가는 길
        */
        minSlope: 0.06,

        /*
          이 경사에 도달하면 slopeForce가 거의 최대치로 적용됨.
        */
        fullEffectSlope: 0.65,

        /*
          내리막에 진입했을 때 기본으로 더해지는 힘.
        */
        baseForce: 0.00003,

        /*
          경사가 가팔라질수록 추가되는 힘.
        */
        slopeForce: 0.00022,

        /*
          현재 속도가 빠를수록 추가되는 힘.
          이 값 때문에 내리막에서 점점 가속되는 느낌이 생김.
        */
        speedForce: 0.0001,

        /*
          속도 가속 계산의 기준점.
          현재 속도가 이 값에 가까우면 speedForce가 강하게 적용됨.
        */
        speedReference: 7,

        /*
          한 프레임에 적용할 수 있는 내리막 최대 힘.
        */
        maxForce: 0.0007,

        /*
          내리막에서 자동으로 증가하는 회전 속도.
        */
        angularAcceleration: 0.0032,

        /*
          내리막 추가 가속이 적용되는 최대 전진 속도.
          자연 중력 때문에 이 값보다 조금 더 빨라질 수는 있음.
        */
        maxSpeed: 11.5
    },

    /*
      =========================
      6. 오르막 피로
      =========================
    */
    uphillFatigue: {
        /*
          오르막 피로 기능 사용 여부.
        */
        enabled: true,

        /*
          이 경사보다 가파른 오르막에서 피로가 누적됨.
          오르막은 음수 경사이므로 코드에서는 -minSlope과 비교함.
        */
        minSlope: 0.05,

        /*
          오르막에서 오른쪽 키를 누르고 있는 동안
          초당 누적되는 피로도.

          피로도 전체 범위는 0~1.
        */
        gainPerSecond: 0.5,

        /*
          오르막에서 오른쪽 키를 한 번 누를 때 추가되는 피로도.
          연타를 많이 할수록 빠르게 지침.
        */
        gainPerTap: 0.1,

        /*
          빠른 속도로 올라갈 때 피로 누적량을 더 늘리는 정도.
        */
        speedGainMultiplier: 0.35,

        /*
          피로 계산에 사용하는 기준 속도.
        */
        speedReference: 5,

        /*
          평지나 내리막에서 초당 회복되는 피로도.
        */
        recoveryPerSecond: 0.16,

        /*
          공중에 있을 때 피로 회복 속도 배율.
          1보다 작으면 공중에서는 천천히 회복함.
        */
        airborneRecoveryMultiplier: 0.45,

        /*
          피로도가 최대일 때 오른쪽 홀드 힘이 남는 최소 비율.

          0.28이면 원래 힘의 28%만 남음.
        */
        minHoldEffectiveness: 0.28,

        /*
          피로도가 최대일 때 오른쪽 연타 힘이 남는 최소 비율.

          0.35이면 한 번의 연타가 원래 힘의 35%가 됨.
          따라서 같은 언덕을 오르려면 더 많이 연타해야 함.
        */
        minTapEffectiveness: 0.35,

        /*
          화면에 FATIGUE 상태를 표시하기 시작할 피로도.
        */
        statusThreshold: 0.18
    },

    /*
      =========================
      7. 경사 측정
      =========================
    */
    slope: {
        /*
          플레이어 앞뒤 어느 범위의 지형 높이를 비교할지.

          작으면 아주 작은 요철에도 반응하고,
          크면 큰 산과 계곡 위주로 반응함.
        */
        sampleDistanceX: 140
    },

    /*
      =========================
      8. 아래 방향키 / Grip
      =========================
    */
    downGrip: {
        /*
          DOWN을 누를 때 가로 속도 감쇠.
        */
        horizontalDamping: 0.975,

        /*
          DOWN을 누를 때 세로 하강 속도 감쇠.
          공중에서는 적용되지 않음.
        */
        verticalDamping: 0.94,

        /*
          DOWN을 누를 때 회전 속도 감쇠.
        */
        angularDamping: 0.93
    },

    /*
      =========================
      9. 점프
      =========================
    */
    jump: {
        /*
          점프 순간의 y 속도.
          음수일수록 더 높이 점프함.
        */
        velocityY: -10.2,

        /*
          DOWN을 누르는 동안 점프를 막을지.
        */
        disableJumpWhileDownHeld: true
    },

    /*
      =========================
      10. 낙하 / 착지
      =========================
    */
    fall: {
        /*
          이 세로 속도 이상으로 착지하면 FREE FALL 사망.
        */
        fatalVelocityY: 17.5,

        /*
          이 거리 이상 떨어진 후 착지하면 FREE FALL 사망.
        */
        fatalFallDistance: 330,

        /*
          HARD LANDING이 발생하는 세로 속도.
        */
        hardLandingVelocityY: 10.5,

        /*
          HARD LANDING이 발생하는 낙하 거리.
        */
        hardLandingFallDistance: 150,

        /*
          HARD LANDING 후 가로 속도 배율.
        */
        hardLandingXMultiplier: 0.88,

        /*
          HARD LANDING 후 세로 속도 배율.
        */
        hardLandingYMultiplier: 0.78,

        /*
          HARD LANDING 처리 후 허용되는 최대 세로 속도.
        */
        hardLandingYMax: 8.2,

        /*
          HARD LANDING 후 회전 속도 배율.
        */
        hardLandingAngularMultiplier: 0.8
    },

    /*
      =========================
      11. 속도 제한
      =========================
    */
    limits: {
        /*
          최대 회전 속도.
        */
        angularLimit: 2.8,

        /*
          입력으로 설정할 수 있는 최대 후진 속도.
        */
        velocityXMin: -4.5,

        /*
          입력으로 설정할 수 있는 최대 전진 속도.
          내리막 자연 가속은 이 값을 조금 넘어갈 수 있음.
        */
        velocityXMax: 6
    }
};