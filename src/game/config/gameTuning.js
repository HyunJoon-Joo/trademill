export const GAME_TUNING = {
    /*
      =========================
      1. 월드 진행 방식
      =========================
    */
    world: {
        /*
          autoScrollEnabled:
          true  = 화면이 계속 오른쪽으로 밀림. 현재 기본 게임 모드.
          false = 화면 자동 이동 없음. 항아리게임식 테스트 가능.
        */
        autoScrollEnabled: false,

        /*
          scrollSpeed:
          자동으로 화면/죽음 라인이 오른쪽으로 이동하는 속도.
          낮추면 여유롭고, 높이면 압박이 강해짐.
        */
        scrollSpeed: 88,

        startX: 180,

        /*
          finishMargin:
          finishLineX보다 이 정도 앞에 도달하면 FINISH 처리.
        */
        finishMargin: 80,

        /*
          deadLeftOffset:
          auto scroll 기준으로 이만큼 뒤쳐지면 OUT OF MARKET.
        */
        deadLeftOffset: 120
    },

    /*
      =========================
      2. 카메라
      =========================
    */
    camera: {
        /*
          horizontalFollowEnabled:
          true면 화면은 계속 오른쪽으로 이동하면서도,
          플레이어가 더 빨리 오른쪽으로 가면 카메라가 따라감.
        */
        horizontalFollowEnabled: true,

        /*
          targetScreenX:
          플레이어가 화면상 어느 x 위치에 오도록 따라갈지.
          360~460 추천.
        */
        targetScreenX: 380,

        /*
          horizontalFollowLerp:
          플레이어를 따라가는 부드러움.
          1이면 즉시 따라감. 0.1이면 천천히 따라감.
        */
        horizontalFollowLerp: 0.22,

        /*
          autoScrollLead:
          자동 스크롤 기준으로 화면을 얼마나 앞쪽에 둘지.
        */
        autoScrollLead: 160,

        verticalFollowEnabled: true,

        /*
          targetScreenY:
          플레이어가 화면상 어느 y 위치에 오도록 y축 카메라를 움직일지.
        */
        targetScreenY: 370,

        verticalFollowLerp: 0.075,

        /*
          y축 카메라 한계.
          맵 y범위를 넓혔기 때문에 넉넉하게 둠.
        */
        minScrollY: -1600,
        maxScrollY: 2600
    },

    /*
      =========================
      3. 지형 물리/렌더링
      =========================
    */
    terrain: {
        /*
          colliderThickness:
          지형 충돌체 두께.
          지형 점 간격을 넓히면 약간 두꺼운 게 안정적.
        */
        colliderThickness: 60,

        visualLineWidth: 7,

        groundFriction: 1.0,
        groundStaticFriction: 52,

        /*
          y축 카메라가 움직이므로 지형 아래를 채울 때 여유가 필요.
        */
        fillBottomPadding: 1200
    }
};