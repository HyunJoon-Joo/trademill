export const PLAYER_TUNING = {
    /*
      =========================
      1. 수레바퀴 기본 물성
      =========================
    */
    wheel: {
        /*
          실제 Matter 원형 충돌체의 반지름(px).
          최종 수레바퀴 그림의 바깥 테두리도 이 크기에 맞추는 것이 좋다.

          높이면:
          - 작은 요철을 쉽게 넘음
          - 캐릭터가 커 보임
          - 좁은 골짜기에서 끼기 쉬움

          낮추면 반대다. 추천 범위: 24 ~ 40
        */
        radius: 28,

        /*
          정상적인 지형 계산이 실패했을 때만 사용하는 비상 y 좌표.
          실제 시작 위치는 GameScene이 지형 표면과 법선을 계산해 정한다.
        */
        fallbackSpawnY: 300,

        /*
          지면과 움직일 때의 마찰.
          높이면 미끄러움이 줄고, 낮추면 관성이 오래 남는다.
          추천 범위: 0.2 ~ 0.9
        */
        friction: 0.54,

        /*
          거의 멈춘 상태에서 버티는 정지 마찰.
          오르막에서 키를 놓았을 때 뒤로 미끄러지는 정도에 영향을 준다.
        */
        frictionStatic: 44,

        /*
          공기 저항. 지상/공중 모두 속도를 조금씩 줄인다.
          너무 높으면 내리막 가속과 점프가 둔해진다.
        */
        frictionAir: 0.02,

        /*
          물체 밀도. 높이면 같은 힘에 덜 반응한다.
          조작 힘을 함께 다시 조정해야 하므로 큰 폭 변경은 주의한다.
        */
        density: 0.0027,

        /*
          착지 반발. 0이면 거의 튀지 않는다.
        */
        restitution: 0,

        /*
          Matter 접촉 허용 오차.
          지형 쪽 collisionSlop과 함께 공-바닥 사이의 미세한 간격에 영향을 준다.
          너무 낮으면 떨림이 생길 수 있다.
        */
        slop: 0.01,

        /*
          원형을 근사하는 최대 다각형 변 수.
          높을수록 시각 원과 물리 원의 차이가 줄지만 충돌 계산량이 조금 늘어난다.
        */
        maxSides: 48
    },

    /*
      =========================
      2. 접지 판정
      =========================
    */
    contact: {
        /*
          콜라이더 접촉이 잠깐 끊겨도 이 시간(ms) 안에는 지상 입력을 허용한다.
          인접 지형 선분 경계에서 점프 입력이 씹히는 것을 줄인다.
        */
        coyoteTimeMs: 140
    },

    /*
      =========================
      3. 오른쪽 방향키: 전진/오르막
      =========================
    */
    right: {
        /*
          지상에서 RIGHT를 누르고 있을 때 매 프레임 가하는 힘.
          높이면 홀드만으로도 쉽게 올라가 연타의 의미가 줄어든다.
        */
        holdForceGround: 0.00042,

        /*
          공중에서 RIGHT를 누를 때의 약한 수평 제어력.
        */
        holdForceAir: 0.0001,

        /*
          지상 RIGHT 홀드 중 회전 가속.
          선형 힘과 함께 조절해야 바퀴가 미끄러지지 않고 자연스럽게 굴러간다.
        */
        holdAngularGround: 0.007,

        /*
          공중 RIGHT 홀드 중 회전 가속.
        */
        holdAngularAir: 0.002,

        /*
          지상에서 RIGHT를 한 번 눌렀을 때 즉시 더해지는 x 속도.
          오르막에서 계속 연타해야 하는 핵심 값이다.

          높이면 한 번의 연타가 강해지고,
          낮추면 같은 언덕에서 더 많이 연타해야 한다.
        */
        tapBoostGround: 0.62,

        /*
          공중 RIGHT 연타의 수평 보정량.
        */
        tapBoostAir: 0.22,

        /*
          지상 RIGHT 연타 시 추가 회전 속도.
        */
        tapAngularGround: 0.22,

        /*
          공중 RIGHT 연타 시 추가 회전 속도.
        */
        tapAngularAir: 0.08,

        /*
          RIGHT를 누르고 있는데 x 속도가 거의 0일 때 보장하는 최소 전진 속도.
          너무 높이면 급경사에서도 자동으로 기어오르는 느낌이 난다.
        */
        minForwardVelocity: 0.025
    },

    /*
      =========================
      4. 왼쪽 방향키: 지속 브레이크/후진
      =========================
    */
    left: {
        /*
          지상 LEFT 홀드 중 가하는 역방향 힘.
          전진 중에는 감속, 정지 후에는 후진으로 작동한다.
        */
        holdForceGround: -0.00058,

        /*
          LEFT+DOWN을 함께 누를 때의 강한 역방향 힘.
        */
        holdForceGroundWithGrip: -0.00082,

        /*
          공중 LEFT 제어력. 지상보다 약하게 유지한다.
        */
        holdForceAir: -0.00008,

        /*
          지상 LEFT 홀드의 역회전 가속.
        */
        angularGround: -0.01,

        /*
          LEFT+DOWN의 강한 역회전 가속.
        */
        angularGroundWithGrip: -0.015,

        /*
          공중 LEFT 역회전 가속.
        */
        angularAir: -0.002,

        /*
          전진 중 LEFT를 계속 누를 때 매 프레임 x 속도에 곱하는 값.
          1에 가까울수록 지속 브레이크가 약하고 천천히 줄어든다.
        */
        reverseBrakeMultiplier: 0.992,

        /*
          LEFT+DOWN 지속 브레이크 배율.
        */
        reverseBrakeMultiplierWithGrip: 0.978,

        /*
          전진 중 LEFT를 누를 때 하강 y 속도를 줄이는 배율.
          내리막에서 바닥을 뚫거나 과도하게 튀는 것을 완화한다.
        */
        reverseVerticalDamping: 0.992,
        reverseVerticalDampingWithGrip: 0.975,

        /*
          이미 후진 중일 때 LEFT 홀드로 더해지는 후진 속도.
        */
        backwardAccel: 0.01,
        backwardAccelWithGrip: 0.02
    },

    /*
      =========================
      5. 왼쪽 키 연타 브레이크
      =========================
    */
    brakeTap: {
        enabled: true,

        /*
          LEFT를 한 번 누를 때 제거되는 x 속도.

          고정량을 빼므로 속도가 빨라질수록 정지에 필요한 연타 횟수가 늘어난다.
          "내리막에서 점점 더 많이 브레이크를 눌러야 하는" 감각의 핵심 값이다.

          낮추면 더 많이 연타해야 하고, 높이면 한두 번에 급정지한다.
          추천 범위: 0.3 ~ 0.8
        */
        velocityReductionPerTap: 0.52,

        /*
          LEFT+DOWN 상태에서 연타 브레이크 강도를 몇 배로 할지.
        */
        gripMultiplier: 1.45,

        /*
          LEFT 연타 한 번에 제거되는 양의 회전 속도.
        */
        angularReductionPerTap: 0.18,

        /*
          이보다 느리게 전진 중이면 연타 브레이크를 생략하고
          LEFT 홀드 후진 제어로 자연스럽게 넘어간다.
        */
        minimumForwardSpeed: 0.05
    },

    /*
      =========================
      6. 내리막 추가 가속
      =========================
    */
    downhill: {
        enabled: true,

        /*
          이 값보다 큰 양의 경사에서만 내리막 가속을 적용한다.
          양수 slope = 오른쪽으로 갈수록 화면 아래로 내려가는 길.
        */
        minSlope: 0.06,

        /*
          이 경사에서 slopeForce가 최대 효과에 도달한다.
        */
        fullEffectSlope: 0.65,

        /*
          내리막 진입 시 최소 추가 힘.
        */
        baseForce: 0.00003,

        /*
          경사가 가팔라질수록 더해지는 힘.
        */
        slopeForce: 0.00022,

        /*
          현재 속도가 빠를수록 더해지는 힘.
          내리막에서 시간이 갈수록 가속이 붙는 감각을 만든다.
        */
        speedForce: 0.0001,

        /*
          속도 기반 가속 계산의 기준 x 속도.
        */
        speedReference: 7,

        /*
          한 프레임에 적용할 내리막 추가 힘의 상한.
          너무 높으면 프레임률이나 급경사에서 제어 불가능해질 수 있다.
        */
        maxForce: 0.0007,

        /*
          내리막에서 자동으로 더해지는 회전 속도.
        */
        angularAcceleration: 0.0032,

        /*
          추가 내리막 가속을 중지하는 x 속도.
          중력/관성 때문에 실제 속도는 이 값을 약간 넘을 수 있다.
        */
        maxSpeed: 11.5
    },

    /*
      =========================
      7. 오르막 피로
      =========================
    */
    uphillFatigue: {
        enabled: true,

        /*
          이 값보다 큰 절대 음의 경사에서 오르막으로 판정한다.
        */
        minSlope: 0.05,

        /*
          오르막에서 RIGHT를 누르는 동안 초당 증가하는 피로도.
          피로도 범위는 0~1이다.

          현재 0.5는 빠르게 지치는 강한 설정이다.
          완화하려면 0.12~0.3 정도부터 시험한다.
        */
        gainPerSecond: 0.5,

        /*
          오르막에서 RIGHT를 한 번 연타할 때 추가되는 피로도.
          현재 0.1이면 약 10회의 연타만으로도 최대 피로에 가까워진다.
        */
        gainPerTap: 0.1,

        /*
          빠른 속도로 올라갈 때 피로 증가량을 추가로 키우는 배율.
        */
        speedGainMultiplier: 0.35,
        speedReference: 5,

        /*
          평지/내리막에서 초당 회복되는 피로도.
        */
        recoveryPerSecond: 0.16,

        /*
          공중에서 피로 회복 속도에 곱하는 값.
        */
        airborneRecoveryMultiplier: 0.45,

        /*
          피로도 100%일 때 남는 RIGHT 홀드 힘의 최소 비율.
        */
        minHoldEffectiveness: 0.28,

        /*
          피로도 100%일 때 남는 RIGHT 연타 힘의 최소 비율.
          낮을수록 지친 뒤 더 많이 연타해야 한다.
        */
        minTapEffectiveness: 0.35,

        /*
          화면에 CLIMB FATIGUE 표시를 시작할 피로도.
        */
        statusThreshold: 0.18
    },

    /*
      =========================
      8. 경사 측정
      =========================
    */
    slope: {
        /*
          플레이어 주변 몇 px 폭의 지형 높이를 비교할지.
          작으면 작은 요철에도 민감하고, 크면 큰 추세 위주로 반응한다.
        */
        sampleDistanceX: 140
    },

    /*
      =========================
      9. DOWN 그립
      =========================
    */
    downGrip: {
        /*
          DOWN 홀드 중 매 프레임 x 속도에 곱하는 값.
          1에 가까울수록 약하고, 낮을수록 빠르게 감속한다.
        */
        horizontalDamping: 0.975,

        /*
          지상 접촉 중 양의 y 속도에 곱하는 값.
        */
        verticalDamping: 0.94,

        /*
          회전 속도 감쇠.
        */
        angularDamping: 0.93
    },

    /*
      =========================
      10. 점프
      =========================
    */
    jump: {
        /*
          점프 순간 y 속도. 화면 좌표에서는 음수일수록 위로 강하게 뛴다.
        */
        velocityY: -10.2,

        /*
          DOWN을 누른 상태에서는 점프를 막는다.
        */
        disableJumpWhileDownHeld: true,

        /*
          점프 직후 이 시간(ms) 동안 선택적 접지 보조를 적용하지 않는다.
          현재 접지 보조는 기본 OFF지만, 나중에 켤 때 필요하다.
        */
        detachGraceMs: 180
    },

    /*
      =========================
      11. 낙하/착지
      =========================
    */
    fall: {
        fatalVelocityY: 17.5,
        fatalFallDistance: 330,
        hardLandingVelocityY: 10.5,
        hardLandingFallDistance: 150,
        hardLandingXMultiplier: 0.88,
        hardLandingYMultiplier: 0.78,
        hardLandingYMax: 8.2,
        hardLandingAngularMultiplier: 0.8
    },

    /*
      =========================
      12. 선택적 접지 보조
      =========================

      지형 콜라이더와 보이는 선을 정확히 맞춘 뒤에도
      급격한 볼록 지형에서 관성 때문에 실제로 떠오르는 경우에만 켠다.

      점프와 낙하가 중요한 게임이므로 기본값은 false다.
      단순히 "공이 선 위에 떠 보이는" 문제는 접지 보조가 아니라
      GameScene의 콜라이더 법선 오프셋으로 해결한다.
    */
    groundAdhesion: {
        enabled: false,
        maxDistance: 8,
        force: 0.00008,
        maxDownwardVelocity: 2.5
    },

    /*
      =========================
      13. 속도 제한
      =========================
    */
    limits: {
        angularLimit: 2.8,
        velocityXMin: -4.5,
        velocityXMax: 6
    }
};
