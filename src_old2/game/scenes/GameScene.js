import Phaser from 'phaser';
import { fetchDataJson } from '../config/dataConfig';
import { GAME_TUNING } from '../config/gameTuning';
import { PLAYER_TUNING } from '../config/playerTuning';
import {
    getLatestMapMeta,
    getMapDate,
    normalizeMapMeta,
    normalizeTerrainMap
} from '../utils/mapDataUtils';

const BODY_LABEL_WHEEL = 'wheel';
const BODY_LABEL_GROUND = 'ground';
const BODY_LABEL_START_BOUNDARY = 'startBoundary';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data = {}) {
        this.selectedMapMeta = normalizeMapMeta(data.mapMeta) || null;
        this.currentMapMeta = null;
        this.marketTerrainData = null;

        this.sceneAlive = true;
        this.worldReady = false;
        this.isGameOver = false;
        this.menuRequested = false;
        this.resultRequested = false;
        this.resultData = null;

        this.mapLoadController = null;
        this.onCollisionStart = null;
        this.onCollisionEnd = null;

        this.wheelRadius = PLAYER_TUNING.wheel.radius;
        this.wheelBody = null;
        this.startBoundaryBody = null;
        this.groundBodies = [];
        this.groundPoints = [];
        this.groundSegments = [];

        this.firstGroundX = 0;
        this.lastGroundX = 0;
        this.finishLineX = 0;
        this.distanceOriginX = GAME_TUNING.world.preferredStartSurfaceX;
        this.minimumWheelCenterX = Number.NEGATIVE_INFINITY;

        this.autoProgressX = 0;
        this.runStartedAt = 0;
        this.spawnGraceUntil = 0;
        this.startSafeUntil = 0;

        /*
          지형 선분 콜라이더가 서로 겹치는 구간에서도 접지 수가 꼬이지 않도록
          단순 숫자 카운터가 아니라 Matter pair id Set을 사용한다.
        */
        this.groundContactIds = new Set();
        this.lastGroundedAt = Number.NEGATIVE_INFINITY;

        this.hasBeenAirborne = false;
        this.airborneStartY = 0;
        this.maxFallVelocityY = 0;
        this.maxFallDistance = 0;

        this.currentGroundSlope = 0;
        this.climbFatigue = 0;

        this.distanceText = null;
        this.timeText = null;
        this.marketInfoText = null;
        this.infoText = null;
        this.statusText = null;
        this.loadingText = null;
        this.finishText = null;
        this.terrainGraphics = null;
        this.wheelGraphics = null;

        this.cursors = null;
        this.menuKey = null;
    }

    create() {
        const colors = GAME_TUNING.graphics;
        const camera = this.cameras.main;

        camera.setRoundPixels(true);
        camera.setBackgroundColor(colors.backgroundTop);

        /*
          배경은 월드 전체 크기의 거대한 사각형 대신 화면 고정 레이어로 둔다.
          맵 길이가 늘어도 불필요하게 큰 그래픽 오브젝트가 생기지 않는다.
        */
        this.add.rectangle(0, 0, 1280, 720, colors.backgroundTop)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(-100);
        this.add.rectangle(0, 500, 1280, 220, colors.backgroundBottom)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(-99);

        this.createHud();
        this.createInput();

        this.terrainGraphics = this.add.graphics().setDepth(0);
        this.wheelGraphics = this.add.graphics().setDepth(10);
        this.finishText = this.add.text(0, 0, 'FINISH', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#fbbf24'
        }).setOrigin(0.5).setVisible(false).setDepth(5);

        this.registerCollisionEvents();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.sceneAlive = false;
            this.mapLoadController?.abort();
            this.mapLoadController = null;
            this.detachCollisionEvents();
            this.clearRunObjects();
        });

        this.loadSelectedMarketMap();
    }

    createHud() {
        this.distanceText = this.add.text(24, 20, 'DIST: 0', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff'
        }).setScrollFactor(0).setDepth(100);

        this.timeText = this.add.text(24, 52, 'TIME: 0:00.0', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#cbd5e1'
        }).setScrollFactor(0).setDepth(100);

        this.marketInfoText = this.add.text(24, 78, 'MARKET: loading...', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#93c5fd',
            wordWrap: { width: 1230 }
        }).setScrollFactor(0).setDepth(100);

        this.infoText = this.add.text(
            24,
            104,
            'RIGHT tap/hold: climb / LEFT tap: brake / LEFT hold: reverse / DOWN: grip',
            {
                fontFamily: 'Arial',
                fontSize: '17px',
                color: '#cbd5e1',
                wordWrap: { width: 1230 }
            }
        ).setScrollFactor(0).setDepth(100);

        this.statusText = this.add.text(640, 144, '', {
            fontFamily: 'Arial',
            fontSize: '30px',
            color: '#fbbf24',
            align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        this.loadingText = this.add.text(640, 360, 'LOADING SELECTED MARKET MAP...', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff',
            align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
    }

    createInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.menuKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    }

    registerCollisionEvents() {
        this.onCollisionStart = (event) => {
            if (!this.wheelBody || this.isGameOver) {
                return;
            }

            const wasPhysicallyGrounded = this.isPhysicallyGrounded();

            for (const pair of event.pairs) {
                if (this.isWheelGroundPair(pair)) {
                    this.groundContactIds.add(this.getCollisionPairKey(pair));
                }
            }

            if (!wasPhysicallyGrounded && this.isPhysicallyGrounded()) {
                this.handleLandingImpact();

                if (this.isGameOver) {
                    return;
                }

                this.lastGroundedAt = this.time.now;
                this.hasBeenAirborne = false;
                this.maxFallVelocityY = 0;
                this.maxFallDistance = 0;
            }
        };

        this.onCollisionEnd = (event) => {
            if (!this.wheelBody) {
                return;
            }

            const wasPhysicallyGrounded = this.isPhysicallyGrounded();

            for (const pair of event.pairs) {
                if (this.isWheelGroundPair(pair)) {
                    this.groundContactIds.delete(this.getCollisionPairKey(pair));
                }
            }

            if (wasPhysicallyGrounded && !this.isPhysicallyGrounded()) {
                this.lastGroundedAt = this.time.now;
                this.beginAirborneTracking();
            }
        };

        this.matter.world.on('collisionstart', this.onCollisionStart);
        this.matter.world.on('collisionend', this.onCollisionEnd);
    }

    detachCollisionEvents() {
        if (!this.matter?.world) {
            return;
        }

        if (this.onCollisionStart) {
            this.matter.world.off('collisionstart', this.onCollisionStart);
        }

        if (this.onCollisionEnd) {
            this.matter.world.off('collisionend', this.onCollisionEnd);
        }

        this.onCollisionStart = null;
        this.onCollisionEnd = null;
    }

    async loadSelectedMarketMap() {
        this.mapLoadController?.abort();
        this.mapLoadController = new AbortController();

        try {
            const mapMeta = this.getSelectedMapMeta();

            if (!mapMeta?.path) {
                throw new Error('선택된 mapMeta 또는 path가 없습니다.');
            }

            const rawMap = await fetchDataJson(mapMeta.path, {
                signal: this.mapLoadController.signal
            });
            const mapData = normalizeTerrainMap(rawMap, mapMeta);

            if (!this.sceneAlive) {
                return;
            }

            this.currentMapMeta = {
                ...mapMeta,
                mapId: mapData.mapId,
                date: mapData.date,
                marketDate: mapData.marketDate,
                symbol: mapData.symbol || mapMeta.symbol,
                label: mapData.label || mapMeta.label,
                interval: mapData.interval || mapMeta.interval
            };
            this.marketTerrainData = mapData;
            this.setMarketInfoText(mapData);

            this.worldReady = true;
            this.resetRun();

            this.loadingText?.setText('MARKET MAP LOADED');
            this.time.delayedCall(450, () => {
                if (this.sceneAlive && this.loadingText) {
                    this.loadingText.destroy();
                    this.loadingText = null;
                }
            });
        } catch (error) {
            if (!this.sceneAlive) {
                return;
            }

            console.error('맵 로드 실패:', error);
            this.loadingText?.setText(
                `FAILED TO LOAD SELECTED MAP\n${error?.message || error}\nPress M to return to menu`
            );
            this.marketInfoText?.setText('MARKET: failed to load selected map');
        }
    }

    getSelectedMapMeta() {
        if (this.selectedMapMeta) {
            return this.selectedMapMeta;
        }

        return getLatestMapMeta(this.registry.get('mapIndex'));
    }

    setMarketInfoText(mapData) {
        const difficulty = mapData.difficulty?.score
            ? ` / difficulty=${mapData.difficulty.score}`
            : '';
        const range = mapData.priceScale?.priceRangePct
            ? ` / range=${mapData.priceScale.priceRangePct}%`
            : '';
        const height = mapData.priceScale?.heightRangePx
            ? ` / height=${mapData.priceScale.heightRangePx}px`
            : '';
        const stepX = mapData.stepX ? ` / stepX=${mapData.stepX}` : '';

        this.marketInfoText.setText(
            `MAP: ${mapData.mapId} / ${getMapDate(mapData, this.currentMapMeta)} / ${mapData.symbol} / ${mapData.interval} / bars=${mapData.barsUsed}${difficulty}${range}${height}${stepX}`
        );
    }

    update(_time, delta) {
        if (this.resultRequested) {
            this.performGoToResult();
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.menuKey)) {
            this.requestMenu();
        }

        if (this.menuRequested) {
            this.performGoToMenu();
            return;
        }

        if (!this.worldReady || !this.wheelBody) {
            return;
        }

        if (this.isGameOver) {
            this.drawWheel();
            return;
        }

        /* 탭 복귀 직후 delta 폭증으로 힘/피로 계산이 튀는 것을 막는다. */
        const dt = Phaser.Math.Clamp(delta / 1000, 0, 0.05);

        this.enforceInvisibleStartBoundary();
        this.advanceAutoScroll(dt);
        this.updateCamera();
        this.trackAirborneFall();
        this.handleInput(dt);
        this.applyOptionalGroundAdhesion();
        this.enforceInvisibleStartBoundary();
        this.updateMovementStatus();

        this.drawTerrain();
        this.drawWheel();

        const distance = this.getDistance();
        const elapsedMs = this.getElapsedMs();
        this.distanceText.setText(`DIST: ${distance}`);
        this.timeText.setText(`TIME: ${this.formatElapsedMs(elapsedMs)}`);

        if (this.hasReachedFinish()) {
            this.finishRun();
            return;
        }

        if (this.shouldDieOutOfMarket()) {
            this.gameOver(distance, 'OUT OF MARKET');
        }
    }

    advanceAutoScroll(dt) {
        if (GAME_TUNING.world.autoScrollEnabled) {
            this.autoProgressX += GAME_TUNING.world.scrollSpeed * dt;
        }
    }

    updateCamera() {
        const camera = this.cameras.main;
        const autoScrollX = GAME_TUNING.world.autoScrollEnabled
            ? this.autoProgressX - GAME_TUNING.camera.autoScrollLead
            : 0;
        const playerFollowX =
            GAME_TUNING.camera.horizontalFollowEnabled && this.wheelBody
                ? this.wheelBody.position.x - GAME_TUNING.camera.targetScreenX
                : 0;
        const desiredScrollX = Math.max(0, autoScrollX, playerFollowX);

        camera.scrollX = Phaser.Math.Linear(
            camera.scrollX,
            desiredScrollX,
            GAME_TUNING.camera.horizontalFollowLerp
        );

        if (!GAME_TUNING.camera.verticalFollowEnabled || !this.wheelBody) {
            return;
        }

        const desiredScrollY = Phaser.Math.Clamp(
            this.wheelBody.position.y - GAME_TUNING.camera.targetScreenY,
            GAME_TUNING.camera.minScrollY,
            GAME_TUNING.camera.maxScrollY
        );

        camera.scrollY = Phaser.Math.Linear(
            camera.scrollY,
            desiredScrollY,
            GAME_TUNING.camera.verticalFollowLerp
        );
    }

    snapCameraToPlayer() {
        if (!this.wheelBody) {
            return;
        }

        this.cameras.main.scrollX = Math.max(
            0,
            this.wheelBody.position.x - GAME_TUNING.camera.targetScreenX
        );
        this.cameras.main.scrollY = Phaser.Math.Clamp(
            this.wheelBody.position.y - GAME_TUNING.camera.targetScreenY,
            GAME_TUNING.camera.minScrollY,
            GAME_TUNING.camera.maxScrollY
        );
    }

    /*
      시작 왼쪽 경계는 화면에 그리지 않는다.
      1차: 보이지 않는 Matter 정적 벽
      2차: 아래 하드 클램프로 위치/속도를 직접 보정

      이중 처리로 빠른 후진에서도 맵 왼쪽으로 떨어지는 문제를 막는다.
    */
    enforceInvisibleStartBoundary() {
        if (
            !GAME_TUNING.start.leftBoundaryEnabled ||
            !GAME_TUNING.start.hardClampEnabled ||
            !this.wheelBody ||
            this.wheelBody.position.x >= this.minimumWheelCenterX
        ) {
            return;
        }

        const Body = Phaser.Physics.Matter.Matter.Body;
        const velocity = this.wheelBody.velocity;

        Body.setPosition(this.wheelBody, {
            x: this.minimumWheelCenterX,
            y: this.wheelBody.position.y
        });

        if (velocity.x < 0) {
            Body.setVelocity(this.wheelBody, {
                x: 0,
                y: velocity.y
            });
        }

        if (this.wheelBody.angularVelocity < 0) {
            Body.setAngularVelocity(this.wheelBody, 0);
        }
    }

    shouldDieOutOfMarket() {
        if (!this.wheelBody) {
            return false;
        }

        const inStartSafeTime = this.time.now < this.startSafeUntil;

        if (!inStartSafeTime && GAME_TUNING.world.autoScrollEnabled) {
            const deadLeftX = this.autoProgressX - GAME_TUNING.world.deadLeftOffset;

            if (this.wheelBody.position.x < deadLeftX) {
                return true;
            }
        }

        return (
            this.wheelBody.position.y >
                GAME_TUNING.camera.maxScrollY +
                    GAME_TUNING.world.bottomOutOfBoundsMargin ||
            this.wheelBody.position.x >
                this.lastGroundX + GAME_TUNING.world.rightOutOfBoundsMargin
        );
    }

    updateMovementStatus() {
        if (!this.statusText || !this.wheelBody) {
            return;
        }

        const grounded = this.isGroundedForInput();
        const leftHeld = this.cursors.left.isDown;
        const rightHeld = this.cursors.right.isDown;
        const downHeld = this.cursors.down.isDown;

        if (grounded && leftHeld && downHeld) {
            this.statusText.setText('GRIP REVERSE').setColor('#fbbf24');
            return;
        }

        if (grounded && leftHeld) {
            this.statusText.setText('BRAKE / REVERSE').setColor('#93c5fd');
            return;
        }

        if (grounded && downHeld) {
            this.statusText.setText('GRIP').setColor('#a7f3d0');
            return;
        }

        if (
            grounded &&
            rightHeld &&
            this.currentGroundSlope <= -PLAYER_TUNING.uphillFatigue.minSlope &&
            this.climbFatigue >= PLAYER_TUNING.uphillFatigue.statusThreshold
        ) {
            this.statusText
                .setText(`CLIMB FATIGUE ${Math.round(this.climbFatigue * 100)}%`)
                .setColor('#fb923c');
            return;
        }

        if (
            grounded &&
            this.currentGroundSlope >= PLAYER_TUNING.downhill.minSlope &&
            this.wheelBody.velocity.x > 2
        ) {
            this.statusText
                .setText(`DOWNHILL ${this.wheelBody.velocity.x.toFixed(1)}`)
                .setColor('#f87171');
            return;
        }

        this.statusText.setText('');
    }

    hasReachedFinish() {
        return !!(
            this.wheelBody &&
            this.finishLineX &&
            this.wheelBody.position.x >=
                this.finishLineX - GAME_TUNING.world.finishMargin
        );
    }

    finishRun() {
        this.gameOver(this.getDistance(), 'FINISH');
    }

    getElapsedMs() {
        return this.runStartedAt
            ? Math.max(0, Math.floor(this.time.now - this.runStartedAt))
            : 0;
    }

    formatElapsedMs(ms) {
        const value = Math.max(0, Math.floor(Number(ms) || 0));
        const totalSeconds = Math.floor(value / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const tenths = Math.floor((value % 1000) / 100);

        return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
    }

    requestMenu() {
        this.menuRequested = true;
    }

    performGoToMenu() {
        this.menuRequested = false;
        this.detachCollisionEvents();
        this.input?.keyboard?.resetKeys?.();
        this.scene.start('MenuScene');
    }

    performGoToResult() {
        if (!this.resultData) {
            return;
        }

        const payload = this.resultData;
        this.resultRequested = false;
        this.detachCollisionEvents();
        this.input?.keyboard?.resetKeys?.();
        this.scene.start('ResultScene', payload);
    }

    beginAirborneTracking() {
        if (!this.wheelBody) {
            return;
        }

        this.hasBeenAirborne = true;
        this.airborneStartY = this.wheelBody.position.y;
        this.maxFallVelocityY = Math.max(0, this.wheelBody.velocity.y);
        this.maxFallDistance = 0;
    }

    trackAirborneFall() {
        if (!this.wheelBody || this.isPhysicallyGrounded() || !this.hasBeenAirborne) {
            return;
        }

        this.maxFallVelocityY = Math.max(
            this.maxFallVelocityY,
            this.wheelBody.velocity.y
        );
        this.maxFallDistance = Math.max(
            this.maxFallDistance,
            this.wheelBody.position.y - this.airborneStartY
        );
    }

    handleLandingImpact() {
        if (
            !this.wheelBody ||
            this.isGameOver ||
            this.time.now < this.spawnGraceUntil ||
            !this.hasBeenAirborne
        ) {
            return;
        }

        const landingVelocityY = Math.max(
            this.maxFallVelocityY,
            this.wheelBody.velocity.y
        );
        const fallDistance = this.maxFallDistance;
        const fatalFreeFall =
            landingVelocityY >= PLAYER_TUNING.fall.fatalVelocityY ||
            fallDistance >= PLAYER_TUNING.fall.fatalFallDistance;

        if (fatalFreeFall) {
            this.gameOver(this.getDistance(), 'FREE FALL');
            return;
        }

        const hardLanding =
            landingVelocityY >= PLAYER_TUNING.fall.hardLandingVelocityY ||
            fallDistance >= PLAYER_TUNING.fall.hardLandingFallDistance;

        if (hardLanding) {
            this.applyHardLandingStabilizer();
            this.flashStatus('HARD LANDING', '#f87171', 500);
        }
    }

    applyHardLandingStabilizer() {
        const Body = Phaser.Physics.Matter.Matter.Body;

        Body.setVelocity(this.wheelBody, {
            x:
                this.wheelBody.velocity.x *
                PLAYER_TUNING.fall.hardLandingXMultiplier,
            y: Math.min(
                this.wheelBody.velocity.y *
                    PLAYER_TUNING.fall.hardLandingYMultiplier,
                PLAYER_TUNING.fall.hardLandingYMax
            )
        });
        Body.setAngularVelocity(
            this.wheelBody,
            this.wheelBody.angularVelocity *
                PLAYER_TUNING.fall.hardLandingAngularMultiplier
        );
    }

    flashStatus(text, color = '#fbbf24', duration = 450) {
        this.statusText?.setText(text).setColor(color);

        this.time.delayedCall(duration, () => {
            if (this.sceneAlive && this.statusText?.text === text) {
                this.statusText.setText('');
            }
        });
    }

    /*
      =========================
      캐릭터 조종 계산
      =========================

      updateClimbFatigue → applyDownhillAcceleration → 오른쪽 입력 →
      왼쪽 연타/홀드 → DOWN 그립 → 점프 순서로 처리한다.

      이 순서를 바꾸면 같은 프레임에 여러 키가 눌렸을 때 체감이 달라지므로
      튜닝값만 조절할 때는 아래 함수 호출 순서를 유지하는 것이 안전하다.
    */
    updateClimbFatigue(dt, grounded, slope, rightHeld, rightTapped) {
        const fatigue = PLAYER_TUNING.uphillFatigue;

        if (!fatigue.enabled) {
            this.climbFatigue = 0;
            return;
        }

        const velocityX = this.wheelBody?.velocity.x || 0;
        const climbing =
            grounded &&
            slope <= -fatigue.minSlope &&
            velocityX > -0.3 &&
            (rightHeld || rightTapped);

        if (climbing) {
            const speedRatio = Phaser.Math.Clamp(
                Math.max(0, velocityX) / fatigue.speedReference,
                0,
                1
            );
            const speedMultiplier =
                1 + speedRatio * fatigue.speedGainMultiplier;
            let gain = fatigue.gainPerSecond * dt * speedMultiplier;

            if (rightTapped) {
                gain += fatigue.gainPerTap;
            }

            this.climbFatigue = Phaser.Math.Clamp(
                this.climbFatigue + gain,
                0,
                1
            );
            return;
        }

        const recoveryMultiplier = grounded
            ? 1
            : fatigue.airborneRecoveryMultiplier;

        this.climbFatigue = Math.max(
            0,
            this.climbFatigue -
                fatigue.recoveryPerSecond * recoveryMultiplier * dt
        );
    }

    getRightPowerMultiplier(type) {
        const fatigue = PLAYER_TUNING.uphillFatigue;

        if (!fatigue.enabled) {
            return 1;
        }

        const minimum = type === 'tap'
            ? fatigue.minTapEffectiveness
            : fatigue.minHoldEffectiveness;

        return Phaser.Math.Linear(1, minimum, this.climbFatigue);
    }

    applyDownhillAcceleration(Body, grounded, slope) {
        const downhill = PLAYER_TUNING.downhill;

        if (
            !downhill.enabled ||
            !grounded ||
            slope < downhill.minSlope ||
            this.wheelBody.velocity.x < -0.2 ||
            this.wheelBody.velocity.x >= downhill.maxSpeed
        ) {
            return;
        }

        const slopeRange = Math.max(
            0.001,
            downhill.fullEffectSlope - downhill.minSlope
        );
        const slopeRatio = Phaser.Math.Clamp(
            (slope - downhill.minSlope) / slopeRange,
            0,
            1
        );
        const speedRatio = Phaser.Math.Clamp(
            Math.max(0, this.wheelBody.velocity.x) / downhill.speedReference,
            0,
            1.5
        );
        const force = Math.min(
            downhill.maxForce,
            downhill.baseForce +
                downhill.slopeForce * slopeRatio +
                downhill.speedForce * speedRatio
        );

        Body.applyForce(this.wheelBody, this.wheelBody.position, {
            x: force,
            y: 0
        });
        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(
                this.wheelBody.angularVelocity +
                    downhill.angularAcceleration *
                        (0.5 + slopeRatio + speedRatio * 0.25),
                -PLAYER_TUNING.limits.angularLimit,
                PLAYER_TUNING.limits.angularLimit
            )
        );
    }

    applyBrakeTap(Body, downHeld) {
        const brake = PLAYER_TUNING.brakeTap;

        if (
            !brake.enabled ||
            !this.isGroundedForInput() ||
            this.wheelBody.velocity.x <= brake.minimumForwardSpeed
        ) {
            return;
        }

        const multiplier = downHeld ? brake.gripMultiplier : 1;

        Body.setVelocity(this.wheelBody, {
            x: Math.max(
                0,
                this.wheelBody.velocity.x -
                    brake.velocityReductionPerTap * multiplier
            ),
            y: this.wheelBody.velocity.y
        });

        if (this.wheelBody.angularVelocity > 0) {
            Body.setAngularVelocity(
                this.wheelBody,
                Math.max(
                    0,
                    this.wheelBody.angularVelocity -
                        brake.angularReductionPerTap * multiplier
                )
            );
        }
    }

    applyLeftGroundControl(Body, downHeld) {
        const left = PLAYER_TUNING.left;
        const limits = PLAYER_TUNING.limits;
        const velocityX = this.wheelBody.velocity.x;
        const velocityY = this.wheelBody.velocity.y;

        Body.applyForce(this.wheelBody, this.wheelBody.position, {
            x: downHeld
                ? left.holdForceGroundWithGrip
                : left.holdForceGround,
            y: 0
        });
        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(
                this.wheelBody.angularVelocity +
                    (downHeld
                        ? left.angularGroundWithGrip
                        : left.angularGround),
                -limits.angularLimit,
                limits.angularLimit
            )
        );

        if (velocityX > 0) {
            Body.setVelocity(this.wheelBody, {
                x:
                    velocityX *
                    (downHeld
                        ? left.reverseBrakeMultiplierWithGrip
                        : left.reverseBrakeMultiplier),
                y:
                    velocityY > 0
                        ? velocityY *
                            (downHeld
                                ? left.reverseVerticalDampingWithGrip
                                : left.reverseVerticalDamping)
                        : velocityY
            });
        } else {
            Body.setVelocity(this.wheelBody, {
                x: Phaser.Math.Clamp(
                    velocityX -
                        (downHeld
                            ? left.backwardAccelWithGrip
                            : left.backwardAccel),
                    limits.velocityXMin,
                    limits.velocityXMax
                ),
                y: velocityY
            });
        }
    }

    applyDownGrip(Body) {
        if (!this.wheelBody || !this.isGroundedForInput()) {
            return;
        }

        const grip = PLAYER_TUNING.downGrip;
        const velocityY = this.wheelBody.velocity.y;

        Body.setVelocity(this.wheelBody, {
            x: this.wheelBody.velocity.x * grip.horizontalDamping,
            y: velocityY > 0 ? velocityY * grip.verticalDamping : velocityY
        });
        Body.setAngularVelocity(
            this.wheelBody,
            this.wheelBody.angularVelocity * grip.angularDamping
        );
    }

    applyAirLeftControl(Body) {
        const left = PLAYER_TUNING.left;
        const limits = PLAYER_TUNING.limits;

        Body.applyForce(this.wheelBody, this.wheelBody.position, {
            x: left.holdForceAir,
            y: 0
        });
        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(
                this.wheelBody.angularVelocity + left.angularAir,
                -limits.angularLimit,
                limits.angularLimit
            )
        );
    }

    applyOptionalGroundAdhesion() {
        const adhesion = PLAYER_TUNING.groundAdhesion;

        if (
            !adhesion.enabled ||
            !this.wheelBody ||
            this.isPhysicallyGrounded()
        ) {
            return;
        }

        const sample = this.getGroundSampleAtX(this.wheelBody.position.x);

        if (!sample) {
            return;
        }

        const offsetX = this.wheelBody.position.x - sample.point.x;
        const offsetY = this.wheelBody.position.y - sample.point.y;
        const centerDistanceAlongUpNormal =
            offsetX * sample.normalUpX + offsetY * sample.normalUpY;
        const surfaceGap = centerDistanceAlongUpNormal - this.wheelRadius;

        if (surfaceGap <= 0 || surfaceGap > adhesion.maxDistance) {
            return;
        }

        const Body = Phaser.Physics.Matter.Matter.Body;
        Body.applyForce(this.wheelBody, this.wheelBody.position, {
            x: -sample.normalUpX * adhesion.force,
            y: -sample.normalUpY * adhesion.force
        });

        if (this.wheelBody.velocity.y > adhesion.maxDownwardVelocity) {
            Body.setVelocity(this.wheelBody, {
                x: this.wheelBody.velocity.x,
                y: adhesion.maxDownwardVelocity
            });
        }
    }

    isPhysicallyGrounded() {
        return this.groundContactIds.size > 0;
    }

    isGroundedForInput() {
        return (
            this.isPhysicallyGrounded() ||
            this.time.now - this.lastGroundedAt <=
                PLAYER_TUNING.contact.coyoteTimeMs
        );
    }

    getDistance() {
        if (!this.wheelBody) {
            return 0;
        }

        return Math.max(
            0,
            Math.floor((this.wheelBody.position.x - this.distanceOriginX) / 10)
        );
    }

    resetRun() {
        this.clearRunObjects();

        this.isGameOver = false;
        this.resultRequested = false;
        this.resultData = null;
        this.menuRequested = false;
        this.groundContactIds.clear();
        this.lastGroundedAt = Number.NEGATIVE_INFINITY;
        this.hasBeenAirborne = false;
        this.airborneStartY = 0;
        this.maxFallVelocityY = 0;
        this.maxFallDistance = 0;
        this.currentGroundSlope = 0;
        this.climbFatigue = 0;

        this.statusText?.setText('');
        this.finishText?.setVisible(false);
        this.distanceText?.setText('DIST: 0');
        this.timeText?.setText('TIME: 0:00.0');

        this.buildGroundFromMarketData();
        const spawnSample = this.chooseSafeSpawnSample();
        this.createWheelAtSample(spawnSample);
        this.createInvisibleStartBoundary();

        this.autoProgressX = this.distanceOriginX;
        this.spawnGraceUntil = this.time.now + GAME_TUNING.start.spawnGraceMs;
        this.startSafeUntil =
            this.time.now + GAME_TUNING.start.outOfMarketGraceMs;
        this.runStartedAt = this.time.now;

        this.snapCameraToPlayer();
        this.drawTerrain();
        this.drawWheel();
    }

    /*
      맵 points는 "보이는 지형 윗선"이다.

      이전 코드는 두께 60px의 콜라이더 중심을 이 선 위에 놓아서,
      실제 충돌 윗면이 선보다 약 30px 위에 생겼고 공이 떠 보였다.

      아래에서는 각 선분의 아래쪽 법선 방향으로 콜라이더 중심을
      thickness/2만큼 이동한다. 그 결과 콜라이더의 윗면과 보이는 선이
      수학적으로 같은 위치가 된다.

      중요한 점:
      콜라이더 길이를 시각 선분보다 더 길게 만들지 않는다.
      이전의 segmentOverlap은 완만한 이음부에는 도움이 됐지만,
      날카로운 산꼭대기에서는 회전된 사각형의 끝부분이 정상보다 앞으로
      튀어나와 보이지 않는 네모 발판처럼 작동했다. 각 몸체의 윗면을
      pointA~pointB에 정확히 끝내면 삼각형 정상의 물리 모양도 화면과 맞는다.
    */
    buildGroundFromMarketData() {
        this.groundPoints = this.marketTerrainData.points.map((point) => ({
            x: point.x,
            y: point.y
        }));
        this.groundSegments = [];
        this.groundBodies = [];

        const thickness = GAME_TUNING.terrain.colliderThickness;
        const halfThickness = thickness / 2;

        for (let index = 0; index < this.groundPoints.length - 1; index += 1) {
            const pointA = this.groundPoints[index];
            const pointB = this.groundPoints[index + 1];
            const dx = pointB.x - pointA.x;
            const dy = pointB.y - pointA.y;
            const length = Math.hypot(dx, dy);

            if (!Number.isFinite(length) || length <= 0) {
                continue;
            }

            const tangentX = dx / length;
            const tangentY = dy / length;

            /* 화면 좌표에서 y가 아래로 증가하므로 시계방향 법선이 아래쪽이다. */
            const normalDownX = -tangentY;
            const normalDownY = tangentX;
            const normalUpX = -normalDownX;
            const normalUpY = -normalDownY;
            const middleX = (pointA.x + pointB.x) / 2;
            const middleY = (pointA.y + pointB.y) / 2;
            const centerX = middleX + normalDownX * halfThickness;
            const centerY = middleY + normalDownY * halfThickness;
            const angle = Math.atan2(dy, dx);

            const body = this.matter.add.rectangle(
                centerX,
                centerY,
                length,
                thickness,
                {
                    label: BODY_LABEL_GROUND,
                    isStatic: true,
                    angle,
                    friction: GAME_TUNING.terrain.groundFriction,
                    frictionStatic: GAME_TUNING.terrain.groundStaticFriction,
                    restitution: 0,
                    slop: GAME_TUNING.terrain.collisionSlop
                }
            );

            this.groundBodies.push(body);
            this.groundSegments.push({
                index,
                pointA,
                pointB,
                dx,
                dy,
                length,
                slope: dy / dx,
                tangentX,
                tangentY,
                normalUpX,
                normalUpY,
                normalDownX,
                normalDownY
            });
        }

        if (this.groundSegments.length === 0) {
            throw new Error('지형 충돌 선분을 만들 수 없습니다.');
        }

        this.firstGroundX = this.groundPoints[0].x;
        this.lastGroundX = this.groundPoints[this.groundPoints.length - 1].x;
        this.finishLineX = this.lastGroundX;
    }

    chooseSafeSpawnSample() {
        const preferredX = Phaser.Math.Clamp(
            GAME_TUNING.world.preferredStartSurfaceX,
            this.firstGroundX,
            this.lastGroundX
        );
        const preferredIndex = this.findGroundSegmentIndex(preferredX);
        const candidateCount = Math.max(
            1,
            Math.floor(GAME_TUNING.start.safeSpawnSearchSegmentCount)
        );
        const candidates = [];

        for (let offset = 0; offset < candidateCount; offset += 1) {
            const index = Math.min(
                this.groundSegments.length - 1,
                preferredIndex + offset
            );
            const segment = this.groundSegments[index];
            const ratio = Phaser.Math.Clamp(
                GAME_TUNING.start.spawnSegmentRatio,
                0.1,
                0.9
            );
            const sample = this.getGroundSampleOnSegment(segment, ratio);

            candidates.push({
                ...sample,
                absoluteSlope: Math.abs(segment.slope),
                distanceFromPreferred: Math.abs(sample.point.x - preferredX)
            });

            if (index === this.groundSegments.length - 1) {
                break;
            }
        }

        const acceptable = candidates.filter(
            (candidate) =>
                candidate.absoluteSlope <=
                GAME_TUNING.start.maxSpawnAbsoluteSlope
        );
        const pool = acceptable.length > 0 ? acceptable : candidates;

        pool.sort((a, b) => {
            /* 가까운 시작점과 완만한 경사 사이의 균형 */
            const scoreA = a.absoluteSlope + a.distanceFromPreferred * 0.002;
            const scoreB = b.absoluteSlope + b.distanceFromPreferred * 0.002;
            return scoreA - scoreB;
        });

        return pool[0] || this.getGroundSampleAtX(preferredX);
    }

    createWheelAtSample(sample) {
        if (!sample) {
            throw new Error('시작 지형 위치를 계산하지 못했습니다.');
        }

        const clearance = GAME_TUNING.start.spawnGroundClearance;
        const centerDistance = this.wheelRadius + clearance;
        const spawnX = sample.point.x + sample.normalUpX * centerDistance;
        const spawnY = sample.point.y + sample.normalUpY * centerDistance;

        /* 실제 공 중심 x를 거리 0점으로 사용해 시작 직후 DIST가 0이 되게 한다. */
        this.distanceOriginX = spawnX;
        this.wheelBody = this.matter.add.circle(
            spawnX,
            spawnY,
            this.wheelRadius,
            {
                label: BODY_LABEL_WHEEL,
                restitution: PLAYER_TUNING.wheel.restitution,
                friction: PLAYER_TUNING.wheel.friction,
                frictionStatic: PLAYER_TUNING.wheel.frictionStatic,
                frictionAir: PLAYER_TUNING.wheel.frictionAir,
                density: PLAYER_TUNING.wheel.density,
                slop: PLAYER_TUNING.wheel.slop
            },
            PLAYER_TUNING.wheel.maxSides
        );
    }

    createInvisibleStartBoundary() {
        if (!GAME_TUNING.start.leftBoundaryEnabled) {
            this.minimumWheelCenterX = Number.NEGATIVE_INFINITY;
            return;
        }

        const thickness = GAME_TUNING.start.leftBoundaryThickness;
        const height = GAME_TUNING.start.leftBoundaryHeight;
        const rightFaceX = this.firstGroundX;
        const wallX = rightFaceX - thickness / 2;
        const topY = GAME_TUNING.camera.minScrollY - 2200;
        const wallY = topY + height / 2;

        this.startBoundaryBody = this.matter.add.rectangle(
            wallX,
            wallY,
            thickness,
            height,
            {
                label: BODY_LABEL_START_BOUNDARY,
                isStatic: true,
                friction: 1,
                frictionStatic: 100,
                restitution: 0,
                slop: GAME_TUNING.terrain.collisionSlop
            }
        );

        this.minimumWheelCenterX =
            rightFaceX +
            this.wheelRadius +
            GAME_TUNING.start.leftBoundaryPadding;
    }

    findGroundSegmentIndex(x) {
        if (this.groundSegments.length === 0) {
            return -1;
        }

        if (x <= this.groundSegments[0].pointA.x) {
            return 0;
        }

        const lastIndex = this.groundSegments.length - 1;

        if (x >= this.groundSegments[lastIndex].pointB.x) {
            return lastIndex;
        }

        let low = 0;
        let high = lastIndex;

        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            const segment = this.groundSegments[middle];

            if (x < segment.pointA.x) {
                high = middle - 1;
            } else if (x > segment.pointB.x) {
                low = middle + 1;
            } else {
                return middle;
            }
        }

        return Phaser.Math.Clamp(low, 0, lastIndex);
    }

    getGroundSampleOnSegment(segment, ratio) {
        const safeRatio = Phaser.Math.Clamp(ratio, 0, 1);

        return {
            segment,
            ratio: safeRatio,
            point: {
                x: Phaser.Math.Linear(
                    segment.pointA.x,
                    segment.pointB.x,
                    safeRatio
                ),
                y: Phaser.Math.Linear(
                    segment.pointA.y,
                    segment.pointB.y,
                    safeRatio
                )
            },
            normalUpX: segment.normalUpX,
            normalUpY: segment.normalUpY,
            tangentX: segment.tangentX,
            tangentY: segment.tangentY,
            slope: segment.slope
        };
    }

    getGroundSampleAtX(x) {
        const index = this.findGroundSegmentIndex(x);

        if (index < 0) {
            return null;
        }

        const segment = this.groundSegments[index];
        const ratio = Phaser.Math.Clamp(
            (x - segment.pointA.x) / segment.dx,
            0,
            1
        );

        return this.getGroundSampleOnSegment(segment, ratio);
    }

    getGroundYAtX(x) {
        return this.getGroundSampleAtX(x)?.point.y ??
            PLAYER_TUNING.wheel.fallbackSpawnY;
    }

    getGroundSlopeAtX(x) {
        const sampleDistance = PLAYER_TUNING.slope.sampleDistanceX;
        const halfDistance = sampleDistance / 2;
        const leftY = this.getGroundYAtX(x - halfDistance);
        const rightY = this.getGroundYAtX(x + halfDistance);

        return (rightY - leftY) / Math.max(1, sampleDistance);
    }

    clearRunObjects() {
        if (this.wheelBody) {
            this.matter?.world?.remove(this.wheelBody);
            this.wheelBody = null;
        }

        if (this.startBoundaryBody) {
            this.matter?.world?.remove(this.startBoundaryBody);
            this.startBoundaryBody = null;
        }

        for (const body of this.groundBodies) {
            this.matter?.world?.remove(body);
        }

        this.groundBodies = [];
        this.groundPoints = [];
        this.groundSegments = [];
        this.groundContactIds.clear();
        this.terrainGraphics?.clear();
        this.wheelGraphics?.clear();
    }

    handleInput(dt) {
        const Body = Phaser.Physics.Matter.Matter.Body;
        const grounded = this.isGroundedForInput();
        const right = PLAYER_TUNING.right;
        const limits = PLAYER_TUNING.limits;
        const rightHeld = this.cursors.right.isDown;
        const leftHeld = this.cursors.left.isDown;
        const downHeld = this.cursors.down.isDown;
        const rightTapped = Phaser.Input.Keyboard.JustDown(this.cursors.right);
        const leftTapped = Phaser.Input.Keyboard.JustDown(this.cursors.left);
        const slope = grounded
            ? this.getGroundSlopeAtX(this.wheelBody.position.x)
            : 0;

        this.currentGroundSlope = slope;
        this.updateClimbFatigue(
            dt,
            grounded,
            slope,
            rightHeld,
            rightTapped
        );
        this.applyDownhillAcceleration(Body, grounded, slope);

        const holdPower = this.getRightPowerMultiplier('hold');
        const tapPower = this.getRightPowerMultiplier('tap');

        if (rightHeld) {
            Body.applyForce(this.wheelBody, this.wheelBody.position, {
                x:
                    (grounded
                        ? right.holdForceGround
                        : right.holdForceAir) * holdPower,
                y: 0
            });
            Body.setAngularVelocity(
                this.wheelBody,
                Phaser.Math.Clamp(
                    this.wheelBody.angularVelocity +
                        (grounded
                            ? right.holdAngularGround
                            : right.holdAngularAir) * holdPower,
                    -limits.angularLimit,
                    limits.angularLimit
                )
            );

            if (
                grounded &&
                this.wheelBody.velocity.x < right.minForwardVelocity * holdPower
            ) {
                Body.setVelocity(this.wheelBody, {
                    x: right.minForwardVelocity * holdPower,
                    y: this.wheelBody.velocity.y
                });
            }
        }

        if (rightTapped) {
            Body.setVelocity(this.wheelBody, {
                x: Phaser.Math.Clamp(
                    this.wheelBody.velocity.x +
                        (grounded
                            ? right.tapBoostGround
                            : right.tapBoostAir) * tapPower,
                    limits.velocityXMin,
                    limits.velocityXMax
                ),
                y: this.wheelBody.velocity.y
            });
            Body.setAngularVelocity(
                this.wheelBody,
                Phaser.Math.Clamp(
                    this.wheelBody.angularVelocity +
                        (grounded
                            ? right.tapAngularGround
                            : right.tapAngularAir) * tapPower,
                    -limits.angularLimit,
                    limits.angularLimit
                )
            );
        }

        if (leftTapped && grounded) {
            this.applyBrakeTap(Body, downHeld);
        }

        if (leftHeld) {
            if (grounded) {
                this.applyLeftGroundControl(Body, downHeld);
            } else {
                this.applyAirLeftControl(Body);
            }
        } else if (downHeld && grounded) {
            this.applyDownGrip(Body);
        }

    }

    gameOver(distance, reason = 'GAME OVER') {
        if (this.isGameOver) {
            return;
        }

        this.isGameOver = true;
        this.resultData = {
            mapMeta: this.currentMapMeta,
            mapData: this.marketTerrainData,
            distance,
            reason,
            finished: reason === 'FINISH',
            elapsedMs: this.getElapsedMs()
        };
        this.resultRequested = true;
    }

    getVisiblePointSlice(leftX, rightX) {
        if (this.groundPoints.length < 2) {
            return [];
        }

        const startSegment = this.findGroundSegmentIndex(leftX);
        const endSegment = this.findGroundSegmentIndex(rightX);
        const startIndex = Math.max(0, startSegment);
        const endIndex = Math.min(
            this.groundPoints.length - 1,
            endSegment + 1
        );

        return this.groundPoints.slice(startIndex, endIndex + 1);
    }

    drawTerrain() {
        const graphics = this.terrainGraphics;
        graphics.clear();

        if (this.groundPoints.length < 2) {
            return;
        }

        const camera = this.cameras.main;
        const overscan = GAME_TUNING.terrain.renderOverscanX;
        const left = camera.scrollX - overscan;
        const right = camera.scrollX + this.scale.width + overscan;
        const bottom =
            camera.scrollY +
            this.scale.height +
            GAME_TUNING.terrain.fillBottomPadding;
        const visiblePoints = this.getVisiblePointSlice(left, right);

        if (visiblePoints.length >= 2) {
            graphics.fillStyle(GAME_TUNING.graphics.terrainFill, 1);
            graphics.lineStyle(
                GAME_TUNING.terrain.visualLineWidth,
                GAME_TUNING.graphics.terrainLine,
                1
            );

            graphics.beginPath();
            graphics.moveTo(visiblePoints[0].x, bottom);

            for (const point of visiblePoints) {
                graphics.lineTo(point.x, point.y);
            }

            graphics.lineTo(
                visiblePoints[visiblePoints.length - 1].x,
                bottom
            );
            graphics.closePath();
            graphics.fillPath();

            graphics.beginPath();
            graphics.moveTo(visiblePoints[0].x, visiblePoints[0].y);

            for (let index = 1; index < visiblePoints.length; index += 1) {
                graphics.lineTo(
                    visiblePoints[index].x,
                    visiblePoints[index].y
                );
            }

            graphics.strokePath();
        }

        this.drawFinishMarker(graphics, left, right);
    }

    drawFinishMarker(graphics, left, right) {
        if (!this.finishLineX) {
            return;
        }

        const visible = this.finishLineX >= left && this.finishLineX <= right;

        if (!visible) {
            this.finishText?.setVisible(false);
            return;
        }

        const camera = this.cameras.main;
        const top = camera.scrollY + 140;
        const bottom = camera.scrollY + this.scale.height + 180;

        graphics.lineStyle(5, GAME_TUNING.graphics.finish, 1);
        graphics.lineBetween(this.finishLineX, top, this.finishLineX, bottom);
        this.finishText
            ?.setPosition(this.finishLineX, top - 20)
            .setVisible(true);
    }

    /*
      현재는 물리 확인용 임시 공 그래픽이다.
      최종 그래픽 단계에서는 wheelBody는 그대로 두고,
      바깥 바퀴 스프라이트는 body.angle로 회전시키며
      안쪽 인물 스프라이트는 별도 애니메이션으로 제어하면 된다.
    */
    drawWheel() {
        if (!this.wheelBody || !this.wheelGraphics) {
            return;
        }

        const graphics = this.wheelGraphics;
        const { x, y } = this.wheelBody.position;
        const angle = this.wheelBody.angle;
        const radius = this.wheelRadius;

        graphics.clear();
        graphics.fillStyle(GAME_TUNING.graphics.wheelFill, 1);
        graphics.lineStyle(4, GAME_TUNING.graphics.wheelOutline, 1);
        graphics.fillCircle(x, y, radius);
        graphics.strokeCircle(x, y, radius);
        graphics.lineStyle(5, GAME_TUNING.graphics.wheelSpoke, 1);
        graphics.lineBetween(
            x,
            y,
            x + Math.cos(angle) * radius,
            y + Math.sin(angle) * radius
        );
        graphics.lineBetween(
            x,
            y,
            x + Math.cos(angle + Math.PI * 0.5) * radius * 0.75,
            y + Math.sin(angle + Math.PI * 0.5) * radius * 0.75
        );
    }

    getBodyLabel(body) {
        return body?.parent?.label || body?.label || '';
    }

    isWheelGroundPair(pair) {
        const labelA = this.getBodyLabel(pair.bodyA);
        const labelB = this.getBodyLabel(pair.bodyB);

        return (
            (labelA === BODY_LABEL_WHEEL && labelB === BODY_LABEL_GROUND) ||
            (labelA === BODY_LABEL_GROUND && labelB === BODY_LABEL_WHEEL)
        );
    }

    getCollisionPairKey(pair) {
        if (pair.id) {
            return pair.id;
        }

        const idA = pair.bodyA?.id ?? 'A';
        const idB = pair.bodyB?.id ?? 'B';
        return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
    }
}
