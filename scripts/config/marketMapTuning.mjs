export const MARKET_MAP_TUNING = {
    /*
      =========================
      1. 어떤 시장 데이터를 쓸 것인가
      =========================

      선택 가능:
      - 'KOSPI' : 코스피 지수. 이번 기본값.
      - 'HYNIX' : SK하이닉스. 단일 종목이라 더 급격할 수 있음.
      - 'QQQ'   : 미국 QQQ. 데이터 안정성 좋음.

      지금은 네 요청대로 KOSPI로 간다.
    */
    activeProfile: 'KOSPI',

    profiles: {
        KOSPI: {
            label: 'KOSPI Composite',
            candidates: [
                {
                    /*
                      Yahoo Finance 기준 코스피 지수 심볼.
                      생성 로그에서 symbol=^KS11 이 떠야 코스피로 성공한 것.
                    */
                    symbol: '^KS11',
                    label: 'KOSPI Composite',
                    timeZone: 'Asia/Seoul'
                },
                {
                    /*
                      코스피 데이터가 실패할 때만 예비로 사용.
                      원치 않으면 이 후보를 지워도 됨.
                    */
                    symbol: '000660.KS',
                    label: 'SK hynix',
                    timeZone: 'Asia/Seoul'
                },
                {
                    symbol: 'QQQ',
                    label: 'QQQ Nasdaq-100 ETF',
                    timeZone: 'America/New_York'
                }
            ]
        },

        HYNIX: {
            label: 'SK hynix',
            candidates: [
                {
                    symbol: '000660.KS',
                    label: 'SK hynix',
                    timeZone: 'Asia/Seoul'
                },
                {
                    symbol: 'QQQ',
                    label: 'QQQ Nasdaq-100 ETF',
                    timeZone: 'America/New_York'
                }
            ]
        },

        QQQ: {
            label: 'QQQ Nasdaq-100 ETF',
            candidates: [
                {
                    symbol: 'QQQ',
                    label: 'QQQ Nasdaq-100 ETF',
                    timeZone: 'America/New_York'
                },
                {
                    symbol: '^IXIC',
                    label: 'NASDAQ Composite',
                    timeZone: 'America/New_York'
                }
            ]
        }
    },

    /*
      =========================
      2. 데이터 개수
      =========================
    */
    interval: '1m',
    daysBack: 7,

    /*
      maxBars:
      맵에 사용할 분봉 개수.

      줄이면:
      - 맵이 짧아짐
      - 한 포인트 사이 시간 간격이 넓어져서 굴곡이 큼직하게 느껴짐

      늘리면:
      - 맵이 길어짐
      - 세부 데이터가 많아짐

      추천:
      - 180 : 짧고 강한 맵
      - 220 : 기본
      - 260 : 조금 긴 맵
    */
    maxBars: 220,

    /*
      =========================
      3. 가로 간격
      =========================

      stepX:
      점과 점 사이 가로 거리.
      맵이 너무 촘촘하면 올려라.

      추천:
      - 140 : 적당히 넓음
      - 180 : 현재 추천
      - 220 : 더 항아리게임 느낌
    */
    stepX: 180,

    /*
      맵 생성 방식이 바뀌었으므로 랭킹이 섞이지 않게 버전 변경.
      코스피용 새 맵은 v5kospi로 분리.
    */
    mapAlgorithmVersion: 'v5kospi',

    /*
      =========================
      4. 세로 기준
      =========================
    */
    baseY: 520,

    /*
      minY / maxY:
      월드 좌표 안전 범위.
      이건 화면에 맞추는 normalize가 아니라, 너무 멀리 튀는 것만 방지.
    */
    minY: -1600,
    maxY: 2800,

    /*
      =========================
      5. 세로 굴곡 튜닝
      =========================

      trendToPx:
      하루 전체 상승/하락 추세를 높이로 바꾸는 값.
      너무 높으면 맵 전체가 산맥처럼 치솟거나 깊게 꺼짐.
    */
    trendToPx: 32000,

    /*
      localDeviationToPx:
      이동평균 대비 국소 출렁임.
      재미있는 굴곡은 여기서 많이 나옴.

      너무 높으면 지형 높이가 과하게 커짐.
      너무 낮으면 밋밋함.
    */
    localDeviationToPx: 360000,

    /*
      deltaToPx:
      직전 분봉 대비 변화량.
      마루/골을 만드는 핵심값.

      너무 높으면 톱니처럼 심해짐.
    */
    deltaToPx: 220000,

    /*
      bodyToPx:
      1분봉 캔들 몸통 요철.
    */
    bodyToPx: 140000,

    /*
      wickToPx:
      고가/저가 꼬리 요철.
      너무 높으면 갑자기 튀는 절벽이 많아짐.
    */
    wickToPx: 110000,

    /*
      movingAverageWindow:
      localDeviation 계산용 이동평균 폭.

      작으면 잔굴곡.
      크면 큰 파동.
    */
    movingAverageWindow: 15,

    /*
      stepDyGain:
      점과 점 사이 높이 변화 증폭.
      너무 높으면 전체 맵이 과격해짐.
    */
    stepDyGain: 1.12,

    /*
      minVisibleStepY:
      작은 변화도 보이게 강제로 보장하는 최소 높이차.
      너무 높이면 인위적인 계단/톱니가 됨.
    */
    minVisibleStepY: 12,

    /*
      maxStepY:
      한 포인트에서 다음 포인트로 변할 수 있는 최대 높이차.
      너무 높은 맵을 제어할 때 가장 직접적인 안전장치.

      추천:
      - 140 : 안전하고 덜 과격
      - 180 : 기본 추천
      - 240 : 더 험함
    */
    maxStepY: 180,

    /*
      rawBlend:
      원래 가격 차트와 게임적 굴곡 사이의 혼합 비율.

      낮을수록 게임적 굴곡 강함.
      높을수록 실제 차트 선형 느낌 강함.
    */
    rawBlend: 0.42,

    /*
      microNoisePx:
      아주 작은 노이즈.
      실제 데이터성을 해치지 않게 낮게 유지.
    */
    microNoisePx: 6,

    /*
      true 유지 추천.
      minY/maxY 밖으로 튀는 것만 막음.
    */
    hardClamp: true
};