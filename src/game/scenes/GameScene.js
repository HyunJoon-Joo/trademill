import Phaser from 'phaser';
import { getDataUrl } from '../config/dataConfig';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data = {}) {
        this.selectedMapMeta = data.mapMeta || null;

        this.scrollSpeed = 88;

        this.startX = 180;
        this.wheelRadius = 28;

        this.cameraX = 0;
        this.lastGroundX = 0;
        this.finishLineX = 0;
        this.finishMargin = 80;

        this.runStartedAt = 0;

        this.isGameOver = false;
        this.restartRequested = false;
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

        /*
          낙하 사망 기준.
          자유낙하로 세게 떨어지면 좌/하 입력과 무관하게 죽는다.
        */
        this.fatalVelocityY = 17.5;
        this.fatalFallDistance = 330;

        this.hardLandingVelocityY = 10.5;
        this.hardLandingFallDistance = 150;

        this.lastBrakeTapAt = -99999;
        this.brakeTapCooldownMs = 45;

        this.onCollisionStart = null;
        this.onCollisionEnd = null;

        this.marketTerrainData = null;
        this.currentMapMeta = null;
    }

    create() {
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.setBackgroundColor('#0f172a');

        this.add.rectangle(0, 0, 50000, 720, 0x0f172a).setOrigin(0, 0);
        this.add.rectangle(0, 520, 50000, 400, 0x111827).setOrigin(0, 0);

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
            'RIGHT tap/hold: climb  /  LEFT hold: reverse + brake by friction  /  DOWN hold: grip  /  SPACE or UP: jump',
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

            this.marketInfoText.setText('MARKET: failed to load selected map');
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

        this.marketInfoText.setText(
            `MAP: ${mapData.mapId || 'unknown'} / ${mapData.symbol} / ${mapData.interval} / bars=${mapData.barsUsed}${difficulty}${range}`
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

        this.cameraX += this.scrollSpeed * dt;
        this.cameras.main.scrollX = Math.max(0, this.cameraX - 160);

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

        const deadLeft = this.cameraX - 120;

        if (
            this.wheelBody.position.x < deadLeft ||
            this.wheelBody.position.y > 1000 ||
            this.wheelBody.position.x > this.lastGroundX + 300
        ) {
            this.gameOver(distance, 'OUT OF MARKET');
        }
    }

    updateMovementStatus() {
        if (!this.statusText || !this.wheelBody) {
            return;
        }

        const grounded = this.isGrounded();
        const leftHeld = this.cursors.left.isDown;
        const downHeld = this.cursors.down.isDown;

        if (grounded && leftHeld && downHeld) {
            this.statusText.setText('GRIP BRAKE');
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
            landingVelocityY >= this.fatalVelocityY ||
            fallDistance >= this.fatalFallDistance;

        if (fatalFreeFall) {
            this.gameOver(this.getDistance(), 'FREE FALL');
            return;
        }

        const hardLanding =
            landingVelocityY >= this.hardLandingVelocityY ||
            fallDistance >= this.hardLandingFallDistance;

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
            x: this.wheelBody.velocity.x * 0.88,
            y: Math.min(this.wheelBody.velocity.y * 0.78, 8.2)
        });

        Body.setAngularVelocity(this.wheelBody, this.wheelBody.angularVelocity * 0.8);
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
        const vx = this.wheelBody.velocity.x;
        const vy = this.wheelBody.velocity.y;

        /*
          LEFT는 실제 후진/역회전.
          오른쪽으로 빠르게 내려가던 중이면 마찰성 감속.
          충분히 느려지면 실제로 왼쪽으로 움직일 수 있음.
        */
        Body.applyForce(
            this.wheelBody,
            this.wheelBody.position,
            { x: downHeld ? -0.00078 : -0.00058, y: 0 }
        );

        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(
                this.wheelBody.angularVelocity - (downHeld ? 0.014 : 0.010),
                -2.8,
                2.8
            )
        );

        if (vx > 0) {
            Body.setVelocity(this.wheelBody, {
                x: vx * (downHeld ? 0.925 : 0.965),
                y: vy > 0 ? vy * (downHeld ? 0.965 : 0.985) : vy
            });
        } else {
            Body.setVelocity(this.wheelBody, {
                x: Phaser.Math.Clamp(vx - (downHeld ? 0.018 : 0.010), -4.5, 6),
                y: vy
            });
        }

        Body.setAngularVelocity(
            this.wheelBody,
            this.wheelBody.angularVelocity * (downHeld ? 0.92 : 0.97)
        );
    }

    applyDownGrip(Body) {
        if (!this.wheelBody || !this.isGrounded()) {
            return;
        }

        const vx = this.wheelBody.velocity.x;
        const vy = this.wheelBody.velocity.y;

        /*
          DOWN은 지면 접촉 중 grip/brace.
          자유낙하 중에는 구원 버튼이 아님.
        */
        Body.setVelocity(this.wheelBody, {
            x: vx * 0.975,
            y: vy > 0 ? vy * 0.94 : vy
        });

        Body.setAngularVelocity(this.wheelBody, this.wheelBody.angularVelocity * 0.93);
    }

    applyAirLeftControl(Body) {
        Body.applyForce(
            this.wheelBody,
            this.wheelBody.position,
            { x: -0.00008, y: 0 }
        );

        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(this.wheelBody.angularVelocity - 0.002, -2.4, 2.4)
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

        this.lastBrakeTapAt = -99999;

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
            300,
            this.wheelRadius,
            {
                label: 'wheel',
                restitution: 0.0,
                friction: 0.54,
                frictionStatic: 44,
                frictionAir: 0.02,
                density: 0.0027
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
                44,
                {
                    label: 'ground',
                    isStatic: true,
                    angle,
                    friction: 1.0,
                    frictionStatic: 48
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

        const rightHeld = this.cursors.right.isDown;
        const leftHeld = this.cursors.left.isDown;
        const downHeld = this.cursors.down.isDown;

        if (rightHeld) {
            Body.applyForce(
                this.wheelBody,
                this.wheelBody.position,
                { x: grounded ? 0.00042 : 0.00010, y: 0 }
            );

            Body.setAngularVelocity(
                this.wheelBody,
                Phaser.Math.Clamp(
                    this.wheelBody.angularVelocity + (grounded ? 0.007 : 0.002),
                    -2.4,
                    2.4
                )
            );

            if (grounded && this.wheelBody.velocity.x < 0.025) {
                Body.setVelocity(this.wheelBody, {
                    x: 0.025,
                    y: this.wheelBody.velocity.y
                });
            }
        }

        if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
            Body.setVelocity(this.wheelBody, {
                x: Phaser.Math.Clamp(
                    this.wheelBody.velocity.x + (grounded ? 0.62 : 0.22),
                    -6,
                    6
                ),
                y: this.wheelBody.velocity.y
            });

            Body.setAngularVelocity(
                this.wheelBody,
                Phaser.Math.Clamp(
                    this.wheelBody.angularVelocity + (grounded ? 0.22 : 0.08),
                    -2.8,
                    2.8
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

        const canJump = grounded && !downHeld;

        if (
            (Phaser.Input.Keyboard.JustDown(this.jumpKey) ||
                Phaser.Input.Keyboard.JustDown(this.cursors.up)) &&
            canJump
        ) {
            Body.setVelocity(this.wheelBody, {
                x: this.wheelBody.velocity.x,
                y: -10.2
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

        const left = this.cameras.main.scrollX - 120;
        const right = this.cameras.main.scrollX + this.scale.width + 120;

        const visible = this.groundPoints.filter(
            (p) => p.x >= left - 220 && p.x <= right + 220
        );

        if (visible.length < 2) {
            return;
        }

        g.fillStyle(0x334155, 1);
        g.lineStyle(6, 0x94a3b8, 1);

        g.beginPath();
        g.moveTo(visible[0].x, 720);

        for (const p of visible) {
            g.lineTo(p.x, p.y);
        }

        g.lineTo(visible[visible.length - 1].x, 720);
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

        g.lineStyle(5, 0xfbbf24, 1);
        g.lineBetween(this.finishLineX, 220, this.finishLineX, 700);

        if (this.finishText) {
            this.finishText
                .setPosition(this.finishLineX, 205)
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