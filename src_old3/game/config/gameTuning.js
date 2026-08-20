export const GAME_TUNING = {
    /*
      =========================
      1. 월드 진행 방식
      =========================
    */
    world: {
        /*
          자동 스크롤 스위치.

          true:
          - 화면이 계속 오른쪽으로 이동
          - 뒤처지면 OUT OF MARKET
          - 러너 게임 방식

          false:
          - 자동 스크롤 없음
          - 플레이어가 이동할 때만 카메라가 따라감
        */
        autoScrollEnabled: false,

        /*
          자동 스크롤 속도.
          autoScrollEnabled=true일 때만 사용됨.
        */
        scrollSpeed: 88,

        /*
          플레이어 시작 x 좌표.
        */
        startX: 180,

        /*
          실제 맵 끝보다 이 거리만큼 앞에서 FINISH 처리.
        */
        finishMargin: 80,

        /*
          자동 스크롤 기준선보다 이만큼 뒤처지면 OUT OF MARKET.
        */
        deadLeftOffset: 120
    },

    /*
      =========================
      2. 시작 지점
      =========================
    */
    start: {
        /*
          시작 위치는 실제 지형 표면 바로 위에 둔다.
          0이면 충돌체와 겹칠 가능성이 있으므로 1px만 띄운다.
        */
        spawnGroundClearance: 1,

        outOfMarketGraceMs: 2500,

        /*
          시작점 왼쪽에 추가 발판은 만들지 않는다.
        */
        leftSafePlatformLength: 0,
        leftSafePlatformStepX: 120,

        /*
          완전히 보이지 않는 물리 경계 사용.
        */
        leftWallEnabled: true,

        /*
          지형의 첫 x 좌표가 0이므로,
          경계의 오른쪽 면이 정확히 x=0에 오게 한다.
        */
        leftBoundaryX: 0,

        /*
          벽은 화면 밖에 있고 렌더링하지 않는다.
          빠른 속도로 통과하지 않도록 충분히 두껍게 둔다.
        */
        leftWallWidth: 120,

        /*
          점프로 넘어갈 수 없도록 월드 전체 높이보다 크게 둔다.
        */
        leftWallHeight: 6000,

        /*
          지형 아래쪽까지 깊게 묻어서 틈으로 빠지는 것을 막는다.
        */
        leftWallBottomEmbed: 1000,

        /*
          물리 경계까지 비정상적으로 통과했을 때의 최종 사망 여유값.
        */
        leftBoundaryExtra: 220
    },

    /*
      =========================
      3. 카메라
      =========================
    */
    camera: {
        /*
          플레이어가 자동 스크롤보다 빠르게 전진하면
          카메라가 플레이어를 따라갈지 여부.
        */
        horizontalFollowEnabled: true,

        /*
          플레이어가 화면의 어느 x 위치에 보이게 할지.
          작을수록 플레이어가 화면 왼쪽에 위치함.
        */
        targetScreenX: 380,

        /*
          가로 카메라 추적 속도.
          0에 가까우면 천천히, 1이면 즉시 이동.
        */
        horizontalFollowLerp: 0.22,

        /*
          자동 스크롤 기준선과 실제 카메라 사이의 여유 거리.
        */
        autoScrollLead: 160,

        /*
          플레이어 높이에 따라 카메라가 위아래로 움직일지 여부.
        */
        verticalFollowEnabled: true,

        /*
          플레이어가 화면의 어느 y 위치에 보이게 할지.
        */
        targetScreenY: 370,

        /*
          세로 카메라 추적 속도.
        */
        verticalFollowLerp: 0.075,

        /*
          카메라가 올라갈 수 있는 최대 월드 범위.
        */
        minScrollY: -1600,

        /*
          카메라가 내려갈 수 있는 최대 월드 범위.
        */
        maxScrollY: 2600
    },

    /*
      =========================
      4. 지형
      =========================
    */
    terrain: {
        /*
          지형 충돌체 두께.
        */
        colliderThickness: 60,

        /*
          지형 윗선의 시각적 두께.
        */
        visualLineWidth: 7,

        /*
          지형과 플레이어 사이의 동적 마찰.
        */
        groundFriction: 1.0,

        /*
          정지 상태에서의 지형 마찰.
        */
        groundStaticFriction: 52,

        /*
          지형 아래쪽을 채워 그리는 추가 범위.
        */
        fillBottomPadding: 1200
    }
};