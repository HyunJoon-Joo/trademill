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

        this.onCollisionStart = null;
        this.onCollisionEnd = null;

        this.marketTerrainData = null;
        this.currentMapMeta = null;
    }

    create() {
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.setBackgroundColor('#0f172a');

        this.add.rectangle(0, -4000, 120000, 10000, 0x0f172a).setOrigin(0, 0);
        this.add.rectangle(0, 520, 120000, 5000, 0x111827).setOrigin(0, 0);

        this.distanceText = this.add.text(24, 20, 'DIST: 0', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff'
        }).setScrollFactor(0);

        this.timeText = this.add.text(24, 52, 'TIME: 0:00.0', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#cbd5e1'
        }).setScrollFactor(0);

        this.marketInfoText = this.add.text(24, 78, 'MARKET: loading...', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#93c5fd',
            wordWrap: { width: 1230 }
        }).setScrollFactor(0);

        this.infoText = this.add.text(
            24,
            104,
            'RIGHT tap/hold: climb  /  LEFT hold: reverse + friction brake  /  DOWN hold: grip  /  SPACE or UP: jump',
            {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#cbd5e1',
                wordWrap: { width: 1230 }
            }
        ).setScrollFactor(0);

        this.statusText = this.add.text(640, 144, '', {
            fontFamily: 'Arial',
            fontSize: '30px',
            color: '#fbbf24',
            align: 'center'
        }).setOrigin(0.5).setScrollFactor(0);

        this.loadingText = this.add.text(640, 360, 'LOADING SELECTED MARKET MAP...', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff',
            align: 'center'
        }).setOrigin(0.5);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.menuKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

        this.terrainGraphics = this.add.graphics();
        this.wheelGraphics = this.add.graphics();

        this.finishText = this.add.text(0, 0, 'FINISH', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#fbbf24'
        }).setOrigin(0.5).setVisible(false);

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
                    this.groundContactCount = Math.max(0, this.groundContactCount - 1);

                    if (this.groundContactCount === 0) {
                        this.hasBeenAirborne = true;
                        this.airborneStartY = this.wheelBody.position.y;
                        this.maxFallVelocityY = Math.max(0, this.wheelBody.velocity.y);
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
                this.marketInfoText.setText('MARKET: failed to load selected map');
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
            index.maps.find((m) => m.mapId === index.latestMapId) ||
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

        const stepX = mapData.stepX
            ? ` / stepX=${mapData.stepX}`
            : '';

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
            this.cameraX = Math.max(this.cameraX, this.wheelBody.position.x - 260);
        }

        this.updateCamera();

        this.trackAirborneFall();
        this.handleInput();
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
        const cam = this.cameras.main;

        let targetCameraX = this.cameraX;

        if (
            GAME_TUNING.camera.horizontalFollowEnabled &&
            this.wheelBody
        ) {
            const playerBasedCameraX =
                this.wheelBody.position.x - GAME_TUNING.camera.targetScreenX;

            targetCameraX = Math.max(this.cameraX, playerBasedCameraX);
        }

        const desiredScrollX = Math.max(
            0,
            targetCameraX - GAME_TUNING.camera.autoScrollLead
        );

        cam.scrollX = Phaser.Math.Linear(
            cam.scrollX,
            desiredScrollX,
            GAME_TUNING.camera.horizontalFollowLerp
        );

        if (!GAME_TUNING.camera.verticalFollowEnabled || !this.wheelBody) {
            return;
        }

        const desiredScrollY =
            this.wheelBody.position.y - GAME_TUNING.camera.targetScreenY;

        const clampedScrollY = Phaser.Math.Clamp(
            desiredScrollY,
            GAME_TUNING.camera.minScrollY,
            GAME_TUNING.camera.maxScrollY
        );

        cam.scrollY = Phaser.Math.Linear(
            cam.scrollY,
            clampedScrollY,
            GAME_TUNING.camera.verticalFollowLerp
        );
    }

    shouldDieOutOfMarket() {
        if (!this.wheelBody) {
            return false;
        }

        const deadLeft = this.cameraX - GAME_TUNING.world.deadLeftOffset;

        if (
            GAME_TUNING.world.autoScrollEnabled &&
            this.wheelBody.position.x < deadLeft
        ) {
            return true;
        }

        return (
            this.wheelBody.position.y > GAME_TUNING.camera.maxScrollY + 1400 ||
            this.wheelBody.position.x > this.lastGroundX + 300
        );
    }

    updateMovementStatus() {
        if (!this.statusText || !this.wheelBody) {
            return;
        }

        const grounded = this.isGrounded();
        const leftHeld = this.cursors.left.isDown;
        const downHeld = this.cursors.down.isDown;

        if (grounded && leftHeld && downHeld) {
            this.statusText.setText('GRIP REVERSE');
            this.statusText.setColor('#fbbf24');
            return;
        }

        if (grounded && leftHeld) {
            this.statusText.setText('REVERSE');
            this.statusText.setColor('#93c5fd');
            return;
        }

        if (grounded && downHeld) {
            this.statusText.setText('GRIP');
            this.statusText.setColor('#a7f3d0');
            return;
        }

        this.statusText.setText('');
    }

    hasReachedFinish() {
        if (!this.wheelBody || !this.finishLineX) {
            return false;
        }

        return this.wheelBody.position.x >= this.finishLineX - this.finishMargin;
    }

    finishRun() {
        this.gameOver(this.getDistance(), 'FINISH');
    }

    getElapsedMs() {
        if (!this.runStartedAt) {
            return 0;
        }

        return Math.max(0, Math.floor(this.time.now - this.runStartedAt));
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
        try {
            this.menuRequested = false;
            this.detachCollisionEvents();

            if (this.input?.keyboard && typeof this.input.keyboard.resetKeys === 'function') {
                this.input.keyboard.resetKeys();
            }

            this.scene.start('MenuScene');
        } catch (error) {
            console.error('MenuScene 전환 실패:', error);
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

        if (this.input?.keyboard && typeof this.input.keyboard.resetKeys === 'function') {
            this.input.keyboard.resetKeys();
        }

        this.scene.start('ResultScene', payload);
    }

    detachCollisionEvents() {
        try {
            if (this.onCollisionStart && this.matter?.world) {
                this.matter.world.off('collisionstart', this.onCollisionStart);
            }

            if (this.onCollisionEnd && this.matter?.world) {
                this.matter.world.off('collisionend', this.onCollisionEnd);
            }
        } catch (error) {
            console.warn('collision 이벤트 해제 중 경고:', error);
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

            const fallDistance = this.wheelBody.position.y - this.airborneStartY;
            this.maxFallDistance = Math.max(this.maxFallDistance, fallDistance);
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
        if (!this.wheelBody) {
            return;
        }

        const Body = Phaser.Physics.Matter.Matter.Body;

        Body.setVelocity(this.wheelBody, {
            x: this.wheelBody.velocity.x * PLAYER_TUNING.fall.hardLandingXMultiplier,
            y: Math.min(
                this.wheelBody.velocity.y * PLAYER_TUNING.fall.hardLandingYMultiplier,
                PLAYER_TUNING.fall.hardLandingYMax
            )
        });

        Body.setAngularVelocity(
            this.wheelBody,
            this.wheelBody.angularVelocity * PLAYER_TUNING.fall.hardLandingAngularMultiplier
        );
    }

    flashStatus(text, color = '#fbbf24', duration = 450) {
        if (!this.statusText) {
            return;
        }

        this.statusText.setText(text);
        this.statusText.setColor(color);

        this.time.delayedCall(duration, () => {
            if (this.statusText && this.statusText.text === text) {
                this.statusText.setText('');
            }
        });
    }

    applyLeftGroundControl(Body, downHeld) {
        const left = PLAYER_TUNING.left;
        const limits = PLAYER_TUNING.limits;

        const vx = this.wheelBody.velocity.x;
        const vy = this.wheelBody.velocity.y;

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
                    (downHeld ? left.angularGroundWithGrip : left.angularGround),
                -limits.angularLimit,
                limits.angularLimit
            )
        );

        if (vx > 0) {
            Body.setVelocity(this.wheelBody, {
                x: vx * (
                    downHeld
                        ? left.reverseBrakeMultiplierWithGrip
                        : left.reverseBrakeMultiplier
                ),
                y: vy > 0
                    ? vy * (
                        downHeld
                            ? left.reverseVerticalDampingWithGrip
                            : left.reverseVerticalDamping
                    )
                    : vy
            });
        } else {
            Body.setVelocity(this.wheelBody, {
                x: Phaser.Math.Clamp(
                    vx - (downHeld ? left.backwardAccelWithGrip : left.backwardAccel),
                    limits.velocityXMin,
                    limits.velocityXMax
                ),
                y: vy
            });
        }
    }

    applyDownGrip(Body) {
        if (!this.wheelBody || !this.isGrounded()) {
            return;
        }

        const grip = PLAYER_TUNING.downGrip;

        const vx = this.wheelBody.velocity.x;
        const vy = this.wheelBody.velocity.y;

        Body.setVelocity(this.wheelBody, {
            x: vx * grip.horizontalDamping,
            y: vy > 0 ? vy * grip.verticalDamping : vy
        });

        Body.setAngularVelocity(
            this.wheelBody,
            this.wheelBody.angularVelocity * grip.angularDamping
        );
    }

    applyAirLeftControl(Body) {
        const left = PLAYER_TUNING.left;
        const limits = PLAYER_TUNING.limits;

        Body.applyForce(
            this.wheelBody,
            this.wheelBody.position,
            { x: left.holdForceAir, y: 0 }
        );

        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(
                this.wheelBody.angularVelocity + left.angularAir,
                -limits.angularLimit,
                limits.angularLimit
            )
        );
    }

    isGrounded() {
        return (
            this.groundContactCount > 0 ||
            (this.time.now - this.lastGroundedAt <= this.coyoteTimeMs)
        );
    }

    getDistance() {
        if (!this.wheelBody) {
            return 0;
        }

        return Math.max(0, Math.floor((this.wheelBody.position.x - this.startX) / 10));
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
        this.spawnGraceUntil = this.time.now + 1000;

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
            this.timeText.setText('TIME: 0:00.0');
        }

        this.buildGroundFromMarketData();

        this.wheelBody = this.matter.add.circle(
            this.startX,
            PLAYER_TUNING.wheel.spawnY,
            this.wheelRadius,
            {
                label: 'wheel',
                restitution: PLAYER_TUNING.wheel.restitution,
                friction: PLAYER_TUNING.wheel.friction,
                frictionStatic: PLAYER_TUNING.wheel.frictionStatic,
                frictionAir: PLAYER_TUNING.wheel.frictionAir,
                density: PLAYER_TUNING.wheel.density
            }
        );

        this.runStartedAt = this.time.now;

        this.drawTerrain();
        this.drawWheel();
    }

    buildGroundFromMarketData() {
        if (
            !this.marketTerrainData ||
            !Array.isArray(this.marketTerrainData.points) ||
            this.marketTerrainData.points.length < 2
        ) {
            throw new Error('marketTerrainData.points가 올바르지 않습니다.');
        }

        const sourcePoints = this.marketTerrainData.points.map((p) => ({
            x: Number(p.x),
            y: Number(p.y)
        }));

        this.groundPoints = sourcePoints;

        for (let i = 0; i < sourcePoints.length - 1; i++) {
            const a = sourcePoints[i];
            const b = sourcePoints[i + 1];

            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const length = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
            const angle = Phaser.Math.Angle.Between(a.x, a.y, b.x, b.y);

            const body = this.matter.add.rectangle(
                midX,
                midY,
                length,
                GAME_TUNING.terrain.colliderThickness,
                {
                    label: 'ground',
                    isStatic: true,
                    angle,
                    friction: GAME_TUNING.terrain.groundFriction,
                    frictionStatic: GAME_TUNING.terrain.groundStaticFriction
                }
            );

            this.groundBodies.push(body);
        }

        this.lastGroundX = sourcePoints[sourcePoints.length - 1].x;
        this.finishLineX = this.lastGroundX;
    }

    clearRunObjects() {
        if (this.wheelBody) {
            try {
                this.matter.world.remove(this.wheelBody);
            } catch (error) {
                console.warn('wheelBody 제거 중 경고:', error);
            }

            this.wheelBody = null;
        }

        if (this.groundBodies && this.groundBodies.length > 0) {
            for (const body of this.groundBodies) {
                try {
                    this.matter.world.remove(body);
                } catch (error) {
                    console.warn('groundBody 제거 중 경고:', error);
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

        if (this.gameOverUi && this.gameOverUi.length > 0) {
            for (const obj of this.gameOverUi) {
                if (obj && obj.destroy) {
                    obj.destroy();
                }
            }
        }

        this.gameOverUi = [];
    }

    handleInput() {
        const Body = Phaser.Physics.Matter.Matter.Body;
        const grounded = this.isGrounded();

        const right = PLAYER_TUNING.right;
        const limits = PLAYER_TUNING.limits;

        const rightHeld = this.cursors.right.isDown;
        const leftHeld = this.cursors.left.isDown;
        const downHeld = this.cursors.down.isDown;

        if (rightHeld) {
            Body.applyForce(
                this.wheelBody,
                this.wheelBody.position,
                {
                    x: grounded ? right.holdForceGround : right.holdForceAir,
                    y: 0
                }
            );

            Body.setAngularVelocity(
                this.wheelBody,
                Phaser.Math.Clamp(
                    this.wheelBody.angularVelocity +
                        (grounded ? right.holdAngularGround : right.holdAngularAir),
                    -limits.angularLimit,
                    limits.angularLimit
                )
            );

            if (grounded && this.wheelBody.velocity.x < right.minForwardVelocity) {
                Body.setVelocity(this.wheelBody, {
                    x: right.minForwardVelocity,
                    y: this.wheelBody.velocity.y
                });
            }
        }

        if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
            Body.setVelocity(this.wheelBody, {
                x: Phaser.Math.Clamp(
                    this.wheelBody.velocity.x +
                        (grounded ? right.tapBoostGround : right.tapBoostAir),
                    limits.velocityXMin,
                    limits.velocityXMax
                ),
                y: this.wheelBody.velocity.y
            });

            Body.setAngularVelocity(
                this.wheelBody,
                Phaser.Math.Clamp(
                    this.wheelBody.angularVelocity +
                        (grounded ? right.tapAngularGround : right.tapAngularAir),
                    -limits.angularLimit,
                    limits.angularLimit
                )
            );
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

        const canJump =
            grounded &&
            !(PLAYER_TUNING.jump.disableJumpWhileDownHeld && downHeld);

        if (
            (Phaser.Input.Keyboard.JustDown(this.jumpKey) ||
                Phaser.Input.Keyboard.JustDown(this.cursors.up)) &&
            canJump
        ) {
            Body.setVelocity(this.wheelBody, {
                x: this.wheelBody.velocity.x,
                y: PLAYER_TUNING.jump.velocityY
            });

            this.groundContactCount = 0;
            this.lastGroundedAt = -99999;

            this.hasBeenAirborne = true;
            this.airborneStartY = this.wheelBody.position.y;
            this.maxFallVelocityY = 0;
            this.maxFallDistance = 0;
        }
    }

    gameOver(distance, reason = 'GAME OVER') {
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
        const g = this.terrainGraphics;
        g.clear();

        if (!this.groundPoints || this.groundPoints.length < 2) {
            return;
        }

        const cam = this.cameras.main;
        const left = cam.scrollX - 180;
        const right = cam.scrollX + this.scale.width + 180;
        const bottom = cam.scrollY + this.scale.height + GAME_TUNING.terrain.fillBottomPadding;

        const visible = this.groundPoints.filter(
            (p) => p.x >= left - 320 && p.x <= right + 320
        );

        if (visible.length < 2) {
            return;
        }

        g.fillStyle(0x334155, 1);
        g.lineStyle(GAME_TUNING.terrain.visualLineWidth, 0x94a3b8, 1);

        g.beginPath();
        g.moveTo(visible[0].x, bottom);

        for (const p of visible) {
            g.lineTo(p.x, p.y);
        }

        g.lineTo(visible[visible.length - 1].x, bottom);
        g.closePath();
        g.fillPath();

        g.beginPath();
        g.moveTo(visible[0].x, visible[0].y);

        for (const p of visible) {
            g.lineTo(p.x, p.y);
        }

        g.strokePath();

        this.drawFinishMarker(g, left, right);
    }

    drawFinishMarker(g, left, right) {
        if (!this.finishLineX) {
            return;
        }

        const visible = this.finishLineX >= left && this.finishLineX <= right;

        if (!visible) {
            if (this.finishText) {
                this.finishText.setVisible(false);
            }

            return;
        }

        const cam = this.cameras.main;
        const top = cam.scrollY + 140;
        const bottom = cam.scrollY + this.scale.height + 180;

        g.lineStyle(5, 0xfbbf24, 1);
        g.lineBetween(this.finishLineX, top, this.finishLineX, bottom);

        if (this.finishText) {
            this.finishText
                .setPosition(this.finishLineX, top - 20)
                .setVisible(true);
        }
    }

    drawWheel() {
        if (!this.wheelBody || !this.wheelGraphics) {
            return;
        }

        const g = this.wheelGraphics;
        const x = this.wheelBody.position.x;
        const y = this.wheelBody.position.y;
        const angle = this.wheelBody.angle;
        const r = this.wheelRadius;

        g.clear();

        g.fillStyle(0xf59e0b, 1);
        g.lineStyle(4, 0xf8fafc, 1);
        g.fillCircle(x, y, r);
        g.strokeCircle(x, y, r);

        g.lineStyle(5, 0x1f2937, 1);
        g.lineBetween(x, y, x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        g.lineBetween(
            x,
            y,
            x + Math.cos(angle + Math.PI * 0.5) * r * 0.75,
            y + Math.sin(angle + Math.PI * 0.5) * r * 0.75
        );
    }

    isWheelGroundPair(pair) {
        const a = pair.bodyA;
        const b = pair.bodyB;

        return (
            (a.label === 'wheel' && b.label === 'ground') ||
            (a.label === 'ground' && b.label === 'wheel')
        );
    }
}