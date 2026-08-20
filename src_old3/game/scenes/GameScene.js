import Phaser from 'phaser';
import { getDataUrl } from '../config/dataConfig';
import { GAME_TUNING } from '../config/gameTuning';
import { PLAYER_TUNING } from '../config/playerTuning';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data = {}) {
        this.selectedMapMeta = data.mapMeta || null;

        this.scrollSpeed = GAME_TUNING.world.scrollSpeed;
        this.startX = GAME_TUNING.world.startX;
        this.wheelRadius = PLAYER_TUNING.wheel.radius;

        this.cameraX = 0;
        this.lastGroundX = 0;
        this.finishLineX = 0;
        this.finishMargin = GAME_TUNING.world.finishMargin;

        this.runStartedAt = 0;

        this.isGameOver = false;
        this.menuRequested = false;
        this.resultRequested = false;
        this.resultData = null;
        this.worldReady = false;

        this.wheelBody = null;
        this.leftWallBody = null;

        this.wheelGraphics = null;
        this.terrainGraphics = null;
        this.finishText = null;


        this.groundPoints = [];
        this.groundBodies = [];
        this.gameOverUi = [];

        this.distanceText = null;
        this.timeText = null;
        this.infoText = null;
        this.marketInfoText = null;
        this.loadingText = null;
        this.statusText = null;

        this.cursors = null;
        this.jumpKey = null;
        this.menuKey = null;

        this.groundContactCount = 0;
        this.lastGroundedAt = -99999;
        this.coyoteTimeMs = 140;

        this.hasBeenAirborne = false;
        this.airborneStartY = 0;
        this.maxFallVelocityY = 0;
        this.maxFallDistance = 0;

        this.spawnGraceUntil = 0;
        this.startSafeUntil = 0;
        this.leftPlayableBoundaryX = -1000;

        this.currentGroundSlope = 0;
        this.climbFatigue = 0;

        this.onCollisionStart = null;
        this.onCollisionEnd = null;

        this.marketTerrainData = null;
        this.currentMapMeta = null;
    }

    create() {
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.setBackgroundColor('#0f172a');

        this.add
            .rectangle(0, -5000, 160000, 12000, 0x0f172a)
            .setOrigin(0, 0);

        this.add
            .rectangle(0, 520, 160000, 7000, 0x111827)
            .setOrigin(0, 0);

        this.distanceText = this.add
            .text(24, 20, 'DIST: 0', {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffffff'
            })
            .setScrollFactor(0);

        this.timeText = this.add
            .text(24, 52, 'TIME: 0:00.0', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#cbd5e1'
            })
            .setScrollFactor(0);

        this.marketInfoText = this.add
            .text(24, 78, 'MARKET: loading...', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#93c5fd',
                wordWrap: { width: 1230 }
            })
            .setScrollFactor(0);

        this.infoText = this.add
            .text(
                24,
                104,
                'RIGHT tap: climb / LEFT tap: brake / LEFT hold: reverse / DOWN: grip / SPACE or UP: jump',
                {
                    fontFamily: 'Arial',
                    fontSize: '18px',
                    color: '#cbd5e1',
                    wordWrap: { width: 1230 }
                }
            )
            .setScrollFactor(0);

        this.statusText = this.add
            .text(640, 144, '', {
                fontFamily: 'Arial',
                fontSize: '30px',
                color: '#fbbf24',
                align: 'center'
            })
            .setOrigin(0.5)
            .setScrollFactor(0);

        this.loadingText = this.add
            .text(640, 360, 'LOADING SELECTED MARKET MAP...', {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffffff',
                align: 'center'
            })
            .setOrigin(0.5);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.jumpKey = this.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.SPACE
        );
        this.menuKey = this.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.M
        );

        this.terrainGraphics = this.add.graphics();
        this.wheelGraphics = this.add.graphics();

        this.finishText = this.add
            .text(0, 0, 'FINISH', {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#fbbf24'
            })
            .setOrigin(0.5)
            .setVisible(false);

        this.onCollisionStart = (event) => {
            if (!this.wheelBody) {
                return;
            }

            for (const pair of event.pairs) {
                if (this.isWheelGroundPair(pair)) {
                    this.handleLandingImpact();

                    if (this.isGameOver) {
                        return;
                    }

                    this.groundContactCount += 1;
                    this.lastGroundedAt = this.time.now;

                    this.hasBeenAirborne = false;
                    this.maxFallVelocityY = 0;
                    this.maxFallDistance = 0;
                }
            }
        };

        this.onCollisionEnd = (event) => {
            if (!this.wheelBody) {
                return;
            }

            for (const pair of event.pairs) {
                if (this.isWheelGroundPair(pair)) {
                    this.groundContactCount = Math.max(
                        0,
                        this.groundContactCount - 1
                    );

                    if (this.groundContactCount === 0) {
                        this.hasBeenAirborne = true;
                        this.airborneStartY = this.wheelBody.position.y;
                        this.maxFallVelocityY = Math.max(
                            0,
                            this.wheelBody.velocity.y
                        );
                        this.maxFallDistance = 0;
                    } else {
                        this.lastGroundedAt = this.time.now;
                    }
                }
            }
        };

        this.matter.world.on('collisionstart', this.onCollisionStart);
        this.matter.world.on('collisionend', this.onCollisionEnd);

        this.events.once('shutdown', () => {
            this.detachCollisionEvents();
        });

        this.loadSelectedMarketMap();
    }

    async loadSelectedMarketMap() {
        try {
            const mapMeta = this.getSelectedMapMeta();

            if (!mapMeta || !mapMeta.path) {
                throw new Error('선택된 mapMeta 또는 path가 없습니다.');
            }

            const mapData = await this.fetchJson(mapMeta.path);

            this.currentMapMeta = mapMeta;
            this.marketTerrainData = mapData;

            this.setMarketInfoText(mapData);

            this.worldReady = true;
            this.resetRun();

            if (this.loadingText) {
                this.loadingText.setText('MARKET MAP LOADED');

                this.time.delayedCall(500, () => {
                    if (this.loadingText) {
                        this.loadingText.destroy();
                        this.loadingText = null;
                    }
                });
            }
        } catch (error) {
            console.error(error);

            if (this.loadingText) {
                this.loadingText.setText(
                    'FAILED TO LOAD SELECTED MAP\nPress M to return to menu'
                );
            }

            if (this.marketInfoText) {
                this.marketInfoText.setText(
                    'MARKET: failed to load selected map'
                );
            }
        }
    }

    getSelectedMapMeta() {
        if (this.selectedMapMeta) {
            return this.selectedMapMeta;
        }

        const index = this.registry.get('mapIndex');

        if (!index || !Array.isArray(index.maps) || index.maps.length === 0) {
            return null;
        }

        return (
            index.maps.find((map) => map.mapId === index.latestMapId) ||
            index.maps[0]
        );
    }

    async fetchJson(path) {
        const response = await fetch(getDataUrl(path));

        if (!response.ok) {
            throw new Error(`${path} 로드 실패: ${response.status}`);
        }

        return response.json();
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
            `MAP: ${mapData.mapId || 'unknown'} / ${mapData.symbol} / ${mapData.interval} / bars=${mapData.barsUsed}${difficulty}${range}${height}${stepX}`
        );
    }

    update(time, delta) {
        if (this.resultRequested) {
            this.performGoToResult();
            return;
        }

        const menuPressed = Phaser.Input.Keyboard.JustDown(this.menuKey);

        if (menuPressed && !this.worldReady) {
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

        const dt = delta / 1000;

        if (GAME_TUNING.world.autoScrollEnabled) {
            this.cameraX += this.scrollSpeed * dt;
        } else {
            this.cameraX = Math.max(
                this.cameraX,
                this.wheelBody.position.x -
                    GAME_TUNING.camera.targetScreenX
            );
        }

        this.updateCamera();
        this.trackAirborneFall();
        this.handleInput(dt);
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

    updateCamera() {
        const camera = this.cameras.main;

        const autoScrollX = GAME_TUNING.world.autoScrollEnabled
            ? this.cameraX - GAME_TUNING.camera.autoScrollLead
            : 0;

        const playerScrollX =
            GAME_TUNING.camera.horizontalFollowEnabled && this.wheelBody
                ? this.wheelBody.position.x -
                  GAME_TUNING.camera.targetScreenX
                : 0;

        const desiredScrollX = Math.max(
            0,
            autoScrollX,
            playerScrollX
        );

        camera.scrollX = Phaser.Math.Linear(
            camera.scrollX,
            desiredScrollX,
            GAME_TUNING.camera.horizontalFollowLerp
        );

        if (
            !GAME_TUNING.camera.verticalFollowEnabled ||
            !this.wheelBody
        ) {
            return;
        }

        const desiredScrollY =
            this.wheelBody.position.y -
            GAME_TUNING.camera.targetScreenY;

        const clampedScrollY = Phaser.Math.Clamp(
            desiredScrollY,
            GAME_TUNING.camera.minScrollY,
            GAME_TUNING.camera.maxScrollY
        );

        camera.scrollY = Phaser.Math.Linear(
            camera.scrollY,
            clampedScrollY,
            GAME_TUNING.camera.verticalFollowLerp
        );
    }

    snapCameraToPlayer() {
        if (!this.wheelBody) {
            return;
        }

        const camera = this.cameras.main;

        const desiredScrollY = Phaser.Math.Clamp(
            this.wheelBody.position.y -
                GAME_TUNING.camera.targetScreenY,
            GAME_TUNING.camera.minScrollY,
            GAME_TUNING.camera.maxScrollY
        );

        camera.scrollX = 0;
        camera.scrollY = desiredScrollY;
    }

    shouldDieOutOfMarket() {
        if (!this.wheelBody) {
            return false;
        }

        const inStartSafeTime =
            this.time.now < this.startSafeUntil;

        if (
            !inStartSafeTime &&
            GAME_TUNING.world.autoScrollEnabled
        ) {
            const deadLeft =
                this.cameraX -
                GAME_TUNING.world.deadLeftOffset;

            if (this.wheelBody.position.x < deadLeft) {
                return true;
            }
        }

        if (
            !inStartSafeTime &&
            this.wheelBody.position.x <
                this.leftPlayableBoundaryX
        ) {
            return true;
        }

        return (
            this.wheelBody.position.y >
                GAME_TUNING.camera.maxScrollY + 1400 ||
            this.wheelBody.position.x >
                this.lastGroundX + 300
        );
    }

    updateMovementStatus() {
        if (!this.statusText || !this.wheelBody) {
            return;
        }

        const grounded = this.isGrounded();
        const leftHeld = this.cursors.left.isDown;
        const rightHeld = this.cursors.right.isDown;
        const downHeld = this.cursors.down.isDown;

        if (grounded && leftHeld && downHeld) {
            this.statusText.setText('GRIP REVERSE');
            this.statusText.setColor('#fbbf24');
            return;
        }

        if (grounded && leftHeld) {
            this.statusText.setText('BRAKE / REVERSE');
            this.statusText.setColor('#93c5fd');
            return;
        }

        if (grounded && downHeld) {
            this.statusText.setText('GRIP');
            this.statusText.setColor('#a7f3d0');
            return;
        }

        if (
            grounded &&
            rightHeld &&
            this.currentGroundSlope <=
                -PLAYER_TUNING.uphillFatigue.minSlope &&
            this.climbFatigue >=
                PLAYER_TUNING.uphillFatigue.statusThreshold
        ) {
            this.statusText.setText(
                `CLIMB FATIGUE ${Math.round(
                    this.climbFatigue * 100
                )}%`
            );
            this.statusText.setColor('#fb923c');
            return;
        }

        if (
            grounded &&
            this.currentGroundSlope >=
                PLAYER_TUNING.downhill.minSlope &&
            this.wheelBody.velocity.x > 2
        ) {
            this.statusText.setText(
                `DOWNHILL ${this.wheelBody.velocity.x.toFixed(1)}`
            );
            this.statusText.setColor('#f87171');
            return;
        }

        this.statusText.setText('');
    }

    hasReachedFinish() {
        if (!this.wheelBody || !this.finishLineX) {
            return false;
        }

        return (
            this.wheelBody.position.x >=
            this.finishLineX - this.finishMargin
        );
    }

    finishRun() {
        this.gameOver(this.getDistance(), 'FINISH');
    }

    getElapsedMs() {
        if (!this.runStartedAt) {
            return 0;
        }

        return Math.max(
            0,
            Math.floor(this.time.now - this.runStartedAt)
        );
    }

    formatElapsedMs(ms) {
        const value = Math.max(
            0,
            Math.floor(Number(ms) || 0)
        );

        const totalSeconds = Math.floor(value / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const tenths = Math.floor((value % 1000) / 100);

        return `${minutes}:${String(seconds).padStart(
            2,
            '0'
        )}.${tenths}`;
    }

    requestMenu() {
        this.menuRequested = true;
    }

    performGoToMenu() {
        try {
            this.menuRequested = false;
            this.detachCollisionEvents();

            if (
                this.input?.keyboard &&
                typeof this.input.keyboard.resetKeys ===
                    'function'
            ) {
                this.input.keyboard.resetKeys();
            }

            this.scene.start('MenuScene');
        } catch (error) {
            console.error(
                'MenuScene 전환 실패:',
                error
            );
            this.menuRequested = false;
        }
    }

    performGoToResult() {
        const payload = this.resultData;

        if (!payload) {
            return;
        }

        this.resultRequested = false;
        this.detachCollisionEvents();

        if (
            this.input?.keyboard &&
            typeof this.input.keyboard.resetKeys ===
                'function'
        ) {
            this.input.keyboard.resetKeys();
        }

        this.scene.start('ResultScene', payload);
    }

    detachCollisionEvents() {
        try {
            if (
                this.onCollisionStart &&
                this.matter?.world
            ) {
                this.matter.world.off(
                    'collisionstart',
                    this.onCollisionStart
                );
            }

            if (
                this.onCollisionEnd &&
                this.matter?.world
            ) {
                this.matter.world.off(
                    'collisionend',
                    this.onCollisionEnd
                );
            }
        } catch (error) {
            console.warn(
                'collision 이벤트 해제 중 경고:',
                error
            );
        }

        this.onCollisionStart = null;
        this.onCollisionEnd = null;
    }

    trackAirborneFall() {
        if (!this.wheelBody) {
            return;
        }

        const grounded = this.isGrounded();

        if (!grounded && this.hasBeenAirborne) {
            this.maxFallVelocityY = Math.max(
                this.maxFallVelocityY,
                this.wheelBody.velocity.y
            );

            const fallDistance =
                this.wheelBody.position.y -
                this.airborneStartY;

            this.maxFallDistance = Math.max(
                this.maxFallDistance,
                fallDistance
            );
        }
    }

    handleLandingImpact() {
        if (!this.wheelBody || this.isGameOver) {
            return;
        }

        if (this.time.now < this.spawnGraceUntil) {
            return;
        }

        if (!this.hasBeenAirborne) {
            return;
        }

        const landingVelocityY = Math.max(
            this.maxFallVelocityY,
            this.wheelBody.velocity.y
        );

        const fallDistance = this.maxFallDistance;

        const fatalFreeFall =
            landingVelocityY >=
                PLAYER_TUNING.fall.fatalVelocityY ||
            fallDistance >=
                PLAYER_TUNING.fall.fatalFallDistance;

        if (fatalFreeFall) {
            this.gameOver(
                this.getDistance(),
                'FREE FALL'
            );
            return;
        }

        const hardLanding =
            landingVelocityY >=
                PLAYER_TUNING.fall.hardLandingVelocityY ||
            fallDistance >=
                PLAYER_TUNING.fall.hardLandingFallDistance;

        if (hardLanding) {
            this.applyHardLandingStabilizer();
            this.flashStatus(
                'HARD LANDING',
                '#f87171',
                500
            );
        }
    }

    applyHardLandingStabilizer() {
        if (!this.wheelBody) {
            return;
        }

        const Body =
            Phaser.Physics.Matter.Matter.Body;

        Body.setVelocity(this.wheelBody, {
            x:
                this.wheelBody.velocity.x *
                PLAYER_TUNING.fall
                    .hardLandingXMultiplier,
            y: Math.min(
                this.wheelBody.velocity.y *
                    PLAYER_TUNING.fall
                        .hardLandingYMultiplier,
                PLAYER_TUNING.fall.hardLandingYMax
            )
        });

        Body.setAngularVelocity(
            this.wheelBody,
            this.wheelBody.angularVelocity *
                PLAYER_TUNING.fall
                    .hardLandingAngularMultiplier
        );
    }

    flashStatus(
        text,
        color = '#fbbf24',
        duration = 450
    ) {
        if (!this.statusText) {
            return;
        }

        this.statusText.setText(text);
        this.statusText.setColor(color);

        this.time.delayedCall(duration, () => {
            if (
                this.statusText &&
                this.statusText.text === text
            ) {
                this.statusText.setText('');
            }
        });
    }

    updateClimbFatigue(
        dt,
        grounded,
        slope,
        rightHeld,
        rightTapped
    ) {
        const fatigue =
            PLAYER_TUNING.uphillFatigue;

        if (!fatigue.enabled) {
            this.climbFatigue = 0;
            return;
        }

        const velocityX =
            this.wheelBody?.velocity.x || 0;

        const isClimbing =
            grounded &&
            slope <= -fatigue.minSlope &&
            velocityX > -0.3 &&
            (rightHeld || rightTapped);

        if (isClimbing) {
            const speedRatio = Phaser.Math.Clamp(
                Math.max(0, velocityX) /
                    fatigue.speedReference,
                0,
                1
            );

            const speedMultiplier =
                1 +
                speedRatio *
                    fatigue.speedGainMultiplier;

            let gain =
                fatigue.gainPerSecond *
                dt *
                speedMultiplier;

            if (rightTapped) {
                gain += fatigue.gainPerTap;
            }

            this.climbFatigue =
                Phaser.Math.Clamp(
                    this.climbFatigue + gain,
                    0,
                    1
                );

            return;
        }

        const recoveryMultiplier = grounded
            ? 1
            : fatigue.airborneRecoveryMultiplier;

        const recovery =
            fatigue.recoveryPerSecond *
            recoveryMultiplier *
            dt;

        this.climbFatigue = Math.max(
            0,
            this.climbFatigue - recovery
        );
    }

    getRightPowerMultiplier(type) {
        const fatigue =
            PLAYER_TUNING.uphillFatigue;

        if (!fatigue.enabled) {
            return 1;
        }

        const minimum =
            type === 'tap'
                ? fatigue.minTapEffectiveness
                : fatigue.minHoldEffectiveness;

        return Phaser.Math.Linear(
            1,
            minimum,
            this.climbFatigue
        );
    }

    applyDownhillAcceleration(
        Body,
        grounded,
        slope
    ) {
        const downhill =
            PLAYER_TUNING.downhill;

        if (
            !downhill.enabled ||
            !grounded ||
            slope < downhill.minSlope ||
            this.wheelBody.velocity.x < -0.2 ||
            this.wheelBody.velocity.x >=
                downhill.maxSpeed
        ) {
            return;
        }

        const slopeRange = Math.max(
            0.001,
            downhill.fullEffectSlope -
                downhill.minSlope
        );

        const slopeRatio =
            Phaser.Math.Clamp(
                (slope - downhill.minSlope) /
                    slopeRange,
                0,
                1
            );

        const speedRatio =
            Phaser.Math.Clamp(
                Math.max(
                    0,
                    this.wheelBody.velocity.x
                ) / downhill.speedReference,
                0,
                1.5
            );

        const force = Math.min(
            downhill.maxForce,
            downhill.baseForce +
                downhill.slopeForce *
                    slopeRatio +
                downhill.speedForce *
                    speedRatio
        );

        Body.applyForce(
            this.wheelBody,
            this.wheelBody.position,
            {
                x: force,
                y: 0
            }
        );

        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(
                this.wheelBody.angularVelocity +
                    downhill.angularAcceleration *
                        (0.5 +
                            slopeRatio +
                            speedRatio * 0.25),
                -PLAYER_TUNING.limits
                    .angularLimit,
                PLAYER_TUNING.limits
                    .angularLimit
            )
        );
    }

    applyBrakeTap(Body, downHeld) {
        const brake = PLAYER_TUNING.brakeTap;

        if (
            !brake.enabled ||
            !this.isGrounded() ||
            this.wheelBody.velocity.x <=
                brake.minimumForwardSpeed
        ) {
            return;
        }

        const multiplier = downHeld
            ? brake.gripMultiplier
            : 1;

        const nextVelocityX = Math.max(
            0,
            this.wheelBody.velocity.x -
                brake.velocityReductionPerTap *
                    multiplier
        );

        Body.setVelocity(this.wheelBody, {
            x: nextVelocityX,
            y: this.wheelBody.velocity.y
        });

        if (
            this.wheelBody.angularVelocity > 0
        ) {
            Body.setAngularVelocity(
                this.wheelBody,
                Math.max(
                    0,
                    this.wheelBody.angularVelocity -
                        brake.angularReductionPerTap *
                            multiplier
                )
            );
        }
    }

    applyLeftGroundControl(
        Body,
        downHeld
    ) {
        const left = PLAYER_TUNING.left;
        const limits = PLAYER_TUNING.limits;

        const velocityX =
            this.wheelBody.velocity.x;

        const velocityY =
            this.wheelBody.velocity.y;

        Body.applyForce(
            this.wheelBody,
            this.wheelBody.position,
            {
                x: downHeld
                    ? left.holdForceGroundWithGrip
                    : left.holdForceGround,
                y: 0
            }
        );

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
        if (
            !this.wheelBody ||
            !this.isGrounded()
        ) {
            return;
        }

        const grip = PLAYER_TUNING.downGrip;

        const velocityX =
            this.wheelBody.velocity.x;

        const velocityY =
            this.wheelBody.velocity.y;

        Body.setVelocity(this.wheelBody, {
            x:
                velocityX *
                grip.horizontalDamping,
            y:
                velocityY > 0
                    ? velocityY *
                      grip.verticalDamping
                    : velocityY
        });

        Body.setAngularVelocity(
            this.wheelBody,
            this.wheelBody.angularVelocity *
                grip.angularDamping
        );
    }

    applyAirLeftControl(Body) {
        const left = PLAYER_TUNING.left;
        const limits = PLAYER_TUNING.limits;

        Body.applyForce(
            this.wheelBody,
            this.wheelBody.position,
            {
                x: left.holdForceAir,
                y: 0
            }
        );

        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(
                this.wheelBody.angularVelocity +
                    left.angularAir,
                -limits.angularLimit,
                limits.angularLimit
            )
        );
    }

    isGrounded() {
        return (
            this.groundContactCount > 0 ||
            this.time.now -
                this.lastGroundedAt <=
                this.coyoteTimeMs
        );
    }

    getDistance() {
        if (!this.wheelBody) {
            return 0;
        }

        return Math.max(
            0,
            Math.floor(
                (this.wheelBody.position.x -
                    this.startX) /
                    10
            )
        );
    }

    resetRun() {
        this.clearRunObjects();

        this.cameraX = 0;
        this.lastGroundX = 0;
        this.finishLineX = 0;

        this.isGameOver = false;
        this.resultRequested = false;
        this.resultData = null;
        this.menuRequested = false;

        this.groundPoints = [];
        this.groundBodies = [];
        this.gameOverUi = [];

        this.groundContactCount = 0;
        this.lastGroundedAt = -99999;

        this.hasBeenAirborne = false;
        this.airborneStartY = 0;
        this.maxFallVelocityY = 0;
        this.maxFallDistance = 0;

        this.currentGroundSlope = 0;
        this.climbFatigue = 0;

        this.spawnGraceUntil =
            this.time.now + 1000;

        this.startSafeUntil =
            this.time.now +
            GAME_TUNING.start
                .outOfMarketGraceMs;

        if (this.statusText) {
            this.statusText.setText('');
        }

        if (this.finishText) {
            this.finishText.setVisible(false);
        }

        this.cameras.main.scrollX = 0;
        this.cameras.main.scrollY = 0;

        if (this.distanceText) {
            this.distanceText.setText('DIST: 0');
        }

        if (this.timeText) {
            this.timeText.setText(
                'TIME: 0:00.0'
            );
        }

        this.buildGroundFromMarketData();

        const groundYAtStart =
            this.getGroundYAtX(this.startX);

        const spawnY =
            groundYAtStart -
            this.wheelRadius -
            GAME_TUNING.start
                .spawnGroundClearance;

        this.wheelBody =
            this.matter.add.circle(
                this.startX,
                spawnY,
                this.wheelRadius,
                {
                    label: 'wheel',
                    restitution:
                        PLAYER_TUNING.wheel
                            .restitution,
                    friction:
                        PLAYER_TUNING.wheel
                            .friction,
                    frictionStatic:
                        PLAYER_TUNING.wheel
                            .frictionStatic,
                    frictionAir:
                        PLAYER_TUNING.wheel
                            .frictionAir,
                    density:
                        PLAYER_TUNING.wheel
                            .density
                }
            );

        this.snapCameraToPlayer();

        this.runStartedAt = this.time.now;

        this.drawTerrain();
        this.drawWheel();
    }

    buildGroundFromMarketData() {
        if (
            !this.marketTerrainData ||
            !Array.isArray(
                this.marketTerrainData.points
            ) ||
            this.marketTerrainData.points.length <
                2
        ) {
            throw new Error(
                'marketTerrainData.points가 올바르지 않습니다.'
            );
        }

        const sourcePoints =
            this.marketTerrainData.points
                .map((point) => ({
                    x: Number(point.x),
                    y: Number(point.y)
                }))
                .filter(
                    (point) =>
                        Number.isFinite(point.x) &&
                        Number.isFinite(point.y)
                )
                .sort(
                    (pointA, pointB) =>
                        pointA.x - pointB.x
                );

        if (sourcePoints.length < 2) {
            throw new Error(
                '유효한 지형 포인트가 너무 적습니다.'
            );
        }

        const first = sourcePoints[0];

        const preRollLength = Math.max(
            0,
            GAME_TUNING.start
                .leftSafePlatformLength
        );

        const preRollStep = Math.max(
            40,
            GAME_TUNING.start
                .leftSafePlatformStepX
        );

        const preRollCount = Math.ceil(
            preRollLength / preRollStep
        );

        const leftSafePoints = [];

        for (
            let index = preRollCount;
            index >= 1;
            index -= 1
        ) {
            leftSafePoints.push({
                x:
                    first.x -
                    index * preRollStep,
                y: first.y
            });
        }

        this.groundPoints = [
            ...leftSafePoints,
            ...sourcePoints
        ];

        for (
            let index = 0;
            index <
            this.groundPoints.length - 1;
            index += 1
        ) {
            const pointA =
                this.groundPoints[index];

            const pointB =
                this.groundPoints[index + 1];

            const middleX =
                (pointA.x + pointB.x) / 2;

            const middleY =
                (pointA.y + pointB.y) / 2;

            const length =
                Phaser.Math.Distance.Between(
                    pointA.x,
                    pointA.y,
                    pointB.x,
                    pointB.y
                );

            const angle =
                Phaser.Math.Angle.Between(
                    pointA.x,
                    pointA.y,
                    pointB.x,
                    pointB.y
                );

            const body =
                this.matter.add.rectangle(
                    middleX,
                    middleY,
                    length,
                    GAME_TUNING.terrain
                        .colliderThickness,
                    {
                        label: 'ground',
                        isStatic: true,
                        angle,
                        friction:
                            GAME_TUNING.terrain
                                .groundFriction,
                        frictionStatic:
                            GAME_TUNING.terrain
                                .groundStaticFriction
                    }
                );

            this.groundBodies.push(body);
        }

        this.lastGroundX =
            sourcePoints[
                sourcePoints.length - 1
            ].x;

        this.finishLineX = this.lastGroundX;

        this.createStartWall();
    }

    createStartWall() {
        if (!GAME_TUNING.start.leftWallEnabled) {
            this.leftWallBody = null;

            const firstX = this.groundPoints[0]?.x || 0;

            this.leftPlayableBoundaryX =
                firstX - GAME_TUNING.start.leftBoundaryExtra;

            return;
        }

        const wallWidth = GAME_TUNING.start.leftWallWidth;
        const wallHeight = GAME_TUNING.start.leftWallHeight;
        const boundaryX = GAME_TUNING.start.leftBoundaryX;

        /*
        벽의 오른쪽 면이 boundaryX에 위치한다.

        boundaryX가 0이면 벽 전체는 x<0 영역에 있으므로
        게임 화면과 지형 위에서는 전혀 보이지 않는다.
        */
        const wallX = boundaryX - wallWidth / 2;

        const groundY = this.getGroundYAtX(boundaryX);
        const bottomY =
            groundY + GAME_TUNING.start.leftWallBottomEmbed;

        const centerY = bottomY - wallHeight / 2;

        this.leftWallBody = this.matter.add.rectangle(
            wallX,
            centerY,
            wallWidth,
            wallHeight,
            {
                label: 'startBoundary',
                isStatic: true,
                friction: 1,
                frictionStatic: 100,
                restitution: 0
            }
        );

        /*
        물리 경계까지 뚫고 나가는 극단적인 상황에만 사용된다.
        */
        this.leftPlayableBoundaryX =
            boundaryX -
            wallWidth -
            GAME_TUNING.start.leftBoundaryExtra;
    }

    getGroundYAtX(x) {
        if (
            !this.groundPoints ||
            this.groundPoints.length === 0
        ) {
            return PLAYER_TUNING.wheel.spawnY;
        }

        const points = this.groundPoints;

        if (x <= points[0].x) {
            return points[0].y;
        }

        if (
            x >=
            points[points.length - 1].x
        ) {
            return points[
                points.length - 1
            ].y;
        }

        for (
            let index = 0;
            index < points.length - 1;
            index += 1
        ) {
            const pointA = points[index];
            const pointB = points[index + 1];

            if (
                x >= pointA.x &&
                x <= pointB.x
            ) {
                const ratio =
                    (x - pointA.x) /
                    Math.max(
                        1,
                        pointB.x - pointA.x
                    );

                return Phaser.Math.Linear(
                    pointA.y,
                    pointB.y,
                    ratio
                );
            }
        }

        return points[0].y;
    }

    getGroundSlopeAtX(x) {
        const sampleDistance =
            PLAYER_TUNING.slope
                .sampleDistanceX;

        const halfDistance =
            sampleDistance / 2;

        const leftY = this.getGroundYAtX(
            x - halfDistance
        );

        const rightY = this.getGroundYAtX(
            x + halfDistance
        );

        return (
            (rightY - leftY) /
            Math.max(1, sampleDistance)
        );
    }

    clearRunObjects() {
        if (this.wheelBody) {
            try {
                this.matter.world.remove(
                    this.wheelBody
                );
            } catch (error) {
                console.warn(
                    'wheelBody 제거 중 경고:',
                    error
                );
            }

            this.wheelBody = null;
        }

        if (this.leftWallBody) {
            try {
                this.matter.world.remove(
                    this.leftWallBody
                );
            } catch (error) {
                console.warn(
                    'leftWallBody 제거 중 경고:',
                    error
                );
            }

            this.leftWallBody = null;
        }

        this.leftWallVisual = null;

        if (
            this.groundBodies &&
            this.groundBodies.length > 0
        ) {
            for (const body of this.groundBodies) {
                try {
                    this.matter.world.remove(body);
                } catch (error) {
                    console.warn(
                        'groundBody 제거 중 경고:',
                        error
                    );
                }
            }
        }

        this.groundBodies = [];
        this.groundPoints = [];

        if (this.terrainGraphics) {
            this.terrainGraphics.clear();
        }

        if (this.wheelGraphics) {
            this.wheelGraphics.clear();
        }

        if (
            this.gameOverUi &&
            this.gameOverUi.length > 0
        ) {
            for (const object of this.gameOverUi) {
                if (object && object.destroy) {
                    object.destroy();
                }
            }
        }

        this.gameOverUi = [];
    }

    handleInput(dt) {
        const Body =
            Phaser.Physics.Matter.Matter.Body;

        const grounded = this.isGrounded();

        const right =
            PLAYER_TUNING.right;

        const limits =
            PLAYER_TUNING.limits;

        const rightHeld =
            this.cursors.right.isDown;

        const leftHeld =
            this.cursors.left.isDown;

        const downHeld =
            this.cursors.down.isDown;

        const rightTapped =
            Phaser.Input.Keyboard.JustDown(
                this.cursors.right
            );

        const leftTapped =
            Phaser.Input.Keyboard.JustDown(
                this.cursors.left
            );

        const slope = grounded
            ? this.getGroundSlopeAtX(
                  this.wheelBody.position.x
              )
            : 0;

        this.currentGroundSlope = slope;

        this.updateClimbFatigue(
            dt,
            grounded,
            slope,
            rightHeld,
            rightTapped
        );

        this.applyDownhillAcceleration(
            Body,
            grounded,
            slope
        );

        const holdPower =
            this.getRightPowerMultiplier(
                'hold'
            );

        const tapPower =
            this.getRightPowerMultiplier(
                'tap'
            );

        if (rightHeld) {
            Body.applyForce(
                this.wheelBody,
                this.wheelBody.position,
                {
                    x:
                        (grounded
                            ? right.holdForceGround
                            : right.holdForceAir) *
                        holdPower,
                    y: 0
                }
            );

            Body.setAngularVelocity(
                this.wheelBody,
                Phaser.Math.Clamp(
                    this.wheelBody
                        .angularVelocity +
                        (grounded
                            ? right.holdAngularGround
                            : right.holdAngularAir) *
                            holdPower,
                    -limits.angularLimit,
                    limits.angularLimit
                )
            );

            if (
                grounded &&
                this.wheelBody.velocity.x <
                    right.minForwardVelocity *
                        holdPower
            ) {
                Body.setVelocity(
                    this.wheelBody,
                    {
                        x:
                            right.minForwardVelocity *
                            holdPower,
                        y:
                            this.wheelBody
                                .velocity.y
                    }
                );
            }
        }

        if (rightTapped) {
            Body.setVelocity(
                this.wheelBody,
                {
                    x: Phaser.Math.Clamp(
                        this.wheelBody
                            .velocity.x +
                            (grounded
                                ? right.tapBoostGround
                                : right.tapBoostAir) *
                                tapPower,
                        limits.velocityXMin,
                        limits.velocityXMax
                    ),
                    y:
                        this.wheelBody
                            .velocity.y
                }
            );

            Body.setAngularVelocity(
                this.wheelBody,
                Phaser.Math.Clamp(
                    this.wheelBody
                        .angularVelocity +
                        (grounded
                            ? right.tapAngularGround
                            : right.tapAngularAir) *
                            tapPower,
                    -limits.angularLimit,
                    limits.angularLimit
                )
            );
        }

        if (leftTapped && grounded) {
            this.applyBrakeTap(
                Body,
                downHeld
            );
        }

        if (leftHeld) {
            if (grounded) {
                this.applyLeftGroundControl(
                    Body,
                    downHeld
                );
            } else {
                this.applyAirLeftControl(Body);
            }
        } else if (downHeld && grounded) {
            this.applyDownGrip(Body);
        }

        const canJump =
            grounded &&
            !(
                PLAYER_TUNING.jump
                    .disableJumpWhileDownHeld &&
                downHeld
            );

        if (
            (Phaser.Input.Keyboard.JustDown(
                this.jumpKey
            ) ||
                Phaser.Input.Keyboard.JustDown(
                    this.cursors.up
                )) &&
            canJump
        ) {
            Body.setVelocity(
                this.wheelBody,
                {
                    x:
                        this.wheelBody
                            .velocity.x,
                    y:
                        PLAYER_TUNING.jump
                            .velocityY
                }
            );

            this.groundContactCount = 0;
            this.lastGroundedAt = -99999;

            this.hasBeenAirborne = true;
            this.airborneStartY =
                this.wheelBody.position.y;
            this.maxFallVelocityY = 0;
            this.maxFallDistance = 0;
        }
    }

    gameOver(
        distance,
        reason = 'GAME OVER'
    ) {
        if (this.isGameOver) {
            return;
        }

        const finished = reason === 'FINISH';
        const elapsedMs = this.getElapsedMs();

        this.isGameOver = true;

        this.resultData = {
            mapMeta: this.currentMapMeta,
            mapData: this.marketTerrainData,
            distance,
            reason,
            finished,
            elapsedMs
        };

        this.resultRequested = true;
    }

    drawTerrain() {
        const graphics =
            this.terrainGraphics;

        graphics.clear();

        if (
            !this.groundPoints ||
            this.groundPoints.length < 2
        ) {
            return;
        }

        const camera = this.cameras.main;

        const left =
            camera.scrollX - 180;

        const right =
            camera.scrollX +
            this.scale.width +
            180;

        const bottom =
            camera.scrollY +
            this.scale.height +
            GAME_TUNING.terrain
                .fillBottomPadding;

        const visible =
            this.groundPoints.filter(
                (point) =>
                    point.x >= left - 320 &&
                    point.x <= right + 320
            );

        if (visible.length >= 2) {
            graphics.fillStyle(
                0x334155,
                1
            );

            graphics.lineStyle(
                GAME_TUNING.terrain
                    .visualLineWidth,
                0x94a3b8,
                1
            );

            graphics.beginPath();
            graphics.moveTo(
                visible[0].x,
                bottom
            );

            for (const point of visible) {
                graphics.lineTo(
                    point.x,
                    point.y
                );
            }

            graphics.lineTo(
                visible[visible.length - 1].x,
                bottom
            );

            graphics.closePath();
            graphics.fillPath();

            graphics.beginPath();
            graphics.moveTo(
                visible[0].x,
                visible[0].y
            );

            for (const point of visible) {
                graphics.lineTo(
                    point.x,
                    point.y
                );
            }

            graphics.strokePath();
        }

        this.drawFinishMarker(
            graphics,
            left,
            right
        );
    }


    drawFinishMarker(
        graphics,
        left,
        right
    ) {
        if (!this.finishLineX) {
            return;
        }

        const visible =
            this.finishLineX >= left &&
            this.finishLineX <= right;

        if (!visible) {
            if (this.finishText) {
                this.finishText.setVisible(false);
            }

            return;
        }

        const camera = this.cameras.main;

        const top =
            camera.scrollY + 140;

        const bottom =
            camera.scrollY +
            this.scale.height +
            180;

        graphics.lineStyle(
            5,
            0xfbbf24,
            1
        );

        graphics.lineBetween(
            this.finishLineX,
            top,
            this.finishLineX,
            bottom
        );

        if (this.finishText) {
            this.finishText
                .setPosition(
                    this.finishLineX,
                    top - 20
                )
                .setVisible(true);
        }
    }

    drawWheel() {
        if (
            !this.wheelBody ||
            !this.wheelGraphics
        ) {
            return;
        }

        const graphics =
            this.wheelGraphics;

        const x =
            this.wheelBody.position.x;

        const y =
            this.wheelBody.position.y;

        const angle =
            this.wheelBody.angle;

        const radius =
            this.wheelRadius;

        graphics.clear();

        graphics.fillStyle(
            0xf59e0b,
            1
        );

        graphics.lineStyle(
            4,
            0xf8fafc,
            1
        );

        graphics.fillCircle(
            x,
            y,
            radius
        );

        graphics.strokeCircle(
            x,
            y,
            radius
        );

        graphics.lineStyle(
            5,
            0x1f2937,
            1
        );

        graphics.lineBetween(
            x,
            y,
            x +
                Math.cos(angle) *
                    radius,
            y +
                Math.sin(angle) *
                    radius
        );

        graphics.lineBetween(
            x,
            y,
            x +
                Math.cos(
                    angle + Math.PI * 0.5
                ) *
                    radius *
                    0.75,
            y +
                Math.sin(
                    angle + Math.PI * 0.5
                ) *
                    radius *
                    0.75
        );
    }

    isWheelGroundPair(pair) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        return (
            (bodyA.label === 'wheel' &&
                bodyB.label === 'ground') ||
            (bodyA.label === 'ground' &&
                bodyB.label === 'wheel')
        );
    }
}