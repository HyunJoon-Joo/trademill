import Phaser from 'phaser';
import { trademillAudio } from '../audio/TrademillAudio';
import { fetchDataJson } from '../config/dataConfig';
import { GAME_TUNING } from '../config/gameTuning';
import { PLAYER_TUNING } from '../config/playerTuning';
import { VISUAL_THEME } from '../config/visualTheme';
import {
    getLatestMapMeta,
    getMapDate,
    normalizeMapMeta,
    normalizeTerrainMap
} from '../utils/mapDataUtils';
import {
    DESKTOP_GAME_HEIGHT,
    DESKTOP_GAME_WIDTH,
    MOBILE_GAME_HEIGHT,
    MOBILE_GAME_WIDTH,
    activateMobileGameplayControls,
    consumeMobileLeftTap,
    consumeMobileRightTap,
    deactivateMobileGameplayControls,
    isMobileLeftHeld,
    isMobilePortraitEnvironment,
    isMobileRightHeld,
    resetMobileGameplayInput,
    setMobileGameplayControlsEnabled
} from '../utils/mobileControls';
import {
    canUsePlayerSprite,
    createLacquerBackground,
    createNacreButton,
    createNacrePanel,
    createNacreText,
    createPlayerAnimations,
    drawNacrePolyline,
    drawNacreVerticalLine,
    drawNacreWheel,
    drawProceduralHuman,
    drawWheelCage,
    drawWheelDust
} from '../utils/visualEffects';

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

        /*
          GIVE UP 확인창 상태.

          G 키와 화면의 GIVE UP 버튼은 둘 다 같은 확인창을 연다.
          확인창을 연 순간의 거리/시간을 snapshot으로 고정해 두므로,
          사용자가 확인창 앞에서 오래 고민해도 그 시간이 기록에 더해지지 않는다.
        */
        this.giveUpPromptOpen = false;
        this.giveUpSnapshot = null;
        this.giveUpPromptOpenedAt = 0;
        this.runPausedTotalMs = 0;
        this.giveUpPromptObjects = [];
        this.giveUpButton = null;
        this.giveUpSpriteAnimationWasPlaying = false;

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

        /*
          착지 충격을 애니메이션으로 넘기기 위한 값.

          이전에는 애니메이션이 HUD의 statusText 문자열을 읽어 착지를 감지했다.
          그 방식은 (1) 충격 크기를 버리고 (2) updateMovementStatus가 매 프레임
          텍스트를 덮어쓰기 때문에 사실상 동작하지 않았다.
          이제 id와 강도를 직접 넘긴다.
        */
        this.landingImpactId = 0;
        this.landingImpactPower = 0;
        this.landingImpactAt = Number.NEGATIVE_INFINITY;

        /* flashStatus로 띄운 문구가 곧바로 덮이지 않게 하는 보호 시간. */
        this.statusFlashUntil = 0;


        this.distanceText = null;
        this.timeText = null;
        this.marketInfoText = null;
        this.infoText = null;
        this.statusText = null;
        this.loadingText = null;
        this.finishText = null;
        this.terrainGraphics = null;
        this.wheelGraphics = null;
        this.wheelOverlayGraphics = null;
        this.playerHumanSprite = null;
        this.currentPlayerVisualState = 'idle';

        this.cursors = null;
        this.menuKey = null;
        this.giveUpKey = null;

        /*
          모바일 세로 플레이 상태.
          데스크톱은 기존 1280x720을 그대로 유지하고,
          터치 가능한 세로 화면에서 GameScene에 들어왔을 때만 720x960으로 확장한다.
        */
        this.mobileGameplayLayout = false;
    }

    create() {
        this.configureGameplayViewport();
        /*
          새 런에서는 오디오의 '피로도 100% 이후 RIGHT 무한 하강 누적'만
          초기화한다. 게임/비주얼 튜닝 수치는 건드리지 않는다.
        */
        trademillAudio.resetRunState();

        const camera = this.cameras.main;

        camera.setRoundPixels(true);
        camera.setBackgroundColor(VISUAL_THEME.lacquer.base);

        /*
          흑칠 배경은 화면 고정 레이어다.
          월드가 길어져도 거대한 배경 오브젝트를 만들지 않으며,
          미세한 회색 광택만 천천히 이동해 검은 옻칠 표면처럼 보이게 한다.
        */
        createLacquerBackground(this, {
            seed: `GameScene-${this.selectedMapMeta?.mapId || 'latest'}`,
            depth: VISUAL_THEME.depth.background,
            width: this.scale.width,
            height: this.scale.height
        });

        const hudPanelX = this.mobileGameplayLayout
            ? this.scale.width / 2
            : 405;
        const hudPanelWidth = this.mobileGameplayLayout
            ? this.scale.width - 32
            : 770;

        createNacrePanel(this, hudPanelX, 70, hudPanelWidth, 126, {
            phase: 1,
            fillAlpha: 0.42,
            glowAlpha: 0.045,
            coreAlpha: 0.25
        }).setScrollFactor(0).setDepth(VISUAL_THEME.depth.hud - 1);

        this.createHud();
        this.createInput();

        this.terrainGraphics = this.add.graphics()
            .setDepth(VISUAL_THEME.depth.terrain);
        this.wheelGraphics = this.add.graphics()
            .setDepth(VISUAL_THEME.depth.wheel);
        this.wheelOverlayGraphics = this.add.graphics()
            .setDepth(VISUAL_THEME.depth.human + 1);
        this.finishText = createNacreText(this, 0, 0, 'FINISH', {
            fontFamily: VISUAL_THEME.text.displayFont,
            fontSize: '28px',
            fontStyle: 'bold'
        }, {
            phase: 4
        }).setOrigin(0.5).setVisible(false).setDepth(VISUAL_THEME.depth.finish);

        this.registerCollisionEvents();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.sceneAlive = false;
            this.mapLoadController?.abort();
            this.mapLoadController = null;
            this.closeGiveUpPrompt({
                resumeWorld: true,
                countPausedTime: false
            });
            this.detachCollisionEvents();
            this.clearRunObjects();
            this.restoreGameplayViewport();
        });

        this.loadSelectedMarketMap();
    }

    createHud() {
        const depth = VISUAL_THEME.depth.hud;
        const viewWidth = this.scale.width;
        const viewHeight = this.scale.height;
        const centerX = viewWidth / 2;
        const contentWidth = this.mobileGameplayLayout
            ? Math.max(360, viewWidth - 48)
            : 1230;

        this.distanceText = createNacreText(this, 24, 18, 'DIST: 0', {
            fontFamily: VISUAL_THEME.text.displayFont,
            fontSize: '27px',
            fontStyle: 'bold'
        }, {
            phase: 0
        }).setScrollFactor(0).setDepth(depth);

        this.timeText = createNacreText(this, 24, 51, 'TIME: 0:00.0', {
            fontFamily: VISUAL_THEME.text.monoFont,
            fontSize: '17px',
            color: VISUAL_THEME.text.secondary
        }, {
            nacre: false
        }).setScrollFactor(0).setDepth(depth);

        this.marketInfoText = createNacreText(this, 24, 77, 'DATE: loading...', {
            fontFamily: VISUAL_THEME.text.monoFont,
            fontSize: '15px',
            color: VISUAL_THEME.text.muted,
            wordWrap: { width: contentWidth }
        }, {
            nacre: false
        }).setScrollFactor(0).setDepth(depth);

        const controlGuide = this.mobileGameplayLayout
            ? 'TOUCH →: CLIMB / TOUCH ←: BRAKE / HOLD ←: REVERSE / GIVE UP: TOP RIGHT'
            : 'RIGHT tap/hold: climb / LEFT tap: brake / LEFT hold: reverse / G: give up / M: menu';

        this.infoText = createNacreText(
            this,
            24,
            102,
            controlGuide,
            {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: this.mobileGameplayLayout ? '15px' : '16px',
                color: VISUAL_THEME.text.secondary,
                wordWrap: { width: contentWidth }
            },
            {
                nacre: false
            }
        ).setScrollFactor(0).setDepth(depth);

        this.statusText = createNacreText(
            this,
            centerX,
            this.mobileGameplayLayout ? 158 : 143,
            '',
            {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '29px',
                align: 'center'
            },
            {
                phase: 4
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(depth);

        this.loadingText = createNacreText(
            this,
            centerX,
            viewHeight / 2,
            'LOADING SELECTED MARKET MAP...',
            {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '28px',
                align: 'center'
            },
            {
                phase: 2
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(depth);

        /*
          게임 도중 포기 버튼.
          모바일에서도 화면 우측 상단에 남겨 두므로 G 키가 없는 터치 환경에서도
          동일한 GIVE UP 확인창을 열 수 있다.
        */
        this.giveUpButton = createNacreButton(this, {
            x: this.mobileGameplayLayout ? viewWidth - 100 : 1158,
            y: 42,
            width: this.mobileGameplayLayout ? 172 : 196,
            height: 44,
            label: 'GIVE UP [G]',
            onClick: () => this.openGiveUpPrompt(),
            fontSize: this.mobileGameplayLayout ? 16 : 18,
            phase: 5,

            /*
              G 키와 버튼 클릭이 openGiveUpPrompt() 하나로 합쳐져 있으므로
              클릭 코인은 openGiveUpPrompt()에서 한 번만 재생한다.
            */
            clickSound: false
        }).setScrollFactor(0).setDepth(depth + 2);
    }

    configureGameplayViewport() {
        this.mobileGameplayLayout = isMobilePortraitEnvironment();

        if (this.mobileGameplayLayout) {
            /*
              720x960 논리 화면을 사용하면 세로폰에서 1280x720 전체를 억지로 줄이는 것보다
              플레이 영역과 HUD가 훨씬 크게 보이고, 위/아래 지형도 더 넓게 보인다.
              물리 좌표와 튜닝값은 그대로이며 카메라가 보여주는 범위만 달라진다.
            */
            activateMobileGameplayControls();
            this.scale.setGameSize(MOBILE_GAME_WIDTH, MOBILE_GAME_HEIGHT);
            this.scale.refresh?.();
            return;
        }

        deactivateMobileGameplayControls();

        if (
            this.scale.width !== DESKTOP_GAME_WIDTH ||
            this.scale.height !== DESKTOP_GAME_HEIGHT
        ) {
            this.scale.setGameSize(DESKTOP_GAME_WIDTH, DESKTOP_GAME_HEIGHT);
            this.scale.refresh?.();
        }
    }

    restoreGameplayViewport() {
        resetMobileGameplayInput();
        deactivateMobileGameplayControls();

        if (
            this.mobileGameplayLayout &&
            (
                this.scale.width !== DESKTOP_GAME_WIDTH ||
                this.scale.height !== DESKTOP_GAME_HEIGHT
            )
        ) {
            this.scale.setGameSize(DESKTOP_GAME_WIDTH, DESKTOP_GAME_HEIGHT);
            this.scale.refresh?.();
        }

        this.mobileGameplayLayout = false;
    }

    getCameraTargetScreenX() {
        if (!this.mobileGameplayLayout) {
            return GAME_TUNING.camera.targetScreenX;
        }

        /* 데스크톱과 같은 화면 가로 비율 위치에 플레이어를 둔다. */
        return GAME_TUNING.camera.targetScreenX *
            (MOBILE_GAME_WIDTH / DESKTOP_GAME_WIDTH);
    }

    getCameraTargetScreenY() {
        if (!this.mobileGameplayLayout) {
            return GAME_TUNING.camera.targetScreenY;
        }

        /* 늘어난 세로 영역의 절반만큼 아래로 보정해 플레이어를 자연스럽게 중앙화한다. */
        return GAME_TUNING.camera.targetScreenY +
            (MOBILE_GAME_HEIGHT - DESKTOP_GAME_HEIGHT) / 2;
    }

    isLeftControlHeld() {
        return !!this.cursors?.left?.isDown || isMobileLeftHeld();
    }

    isRightControlHeld() {
        return !!this.cursors?.right?.isDown || isMobileRightHeld();
    }

    consumeLeftControlTap() {
        const keyboardTapped = !!this.cursors?.left &&
            Phaser.Input.Keyboard.JustDown(this.cursors.left);
        const mobileTapped = consumeMobileLeftTap();

        return keyboardTapped || mobileTapped;
    }

    consumeRightControlTap() {
        const keyboardTapped = !!this.cursors?.right &&
            Phaser.Input.Keyboard.JustDown(this.cursors.right);
        const mobileTapped = consumeMobileRightTap();

        return keyboardTapped || mobileTapped;
    }

    createInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.menuKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
        this.giveUpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
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
            resetMobileGameplayInput();
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
            this.marketInfoText?.setText('DATE: unavailable');
        }
    }

    getSelectedMapMeta() {
        if (this.selectedMapMeta) {
            return this.selectedMapMeta;
        }

        return getLatestMapMeta(this.registry.get('mapIndex'));
    }

    setMarketInfoText(mapData) {
        this.marketInfoText.setText(
            `DATE: ${getMapDate(mapData, this.currentMapMeta)}`
        );
    }

    update(_time, delta) {
        if (this.resultRequested) {
            this.performGoToResult();
            return;
        }

        /*
          GIVE UP 확인창이 떠 있는 동안에는 게임 update를 완전히 멈춘다.
          Matter world도 openGiveUpPrompt()에서 pause되어 있으므로
          공, 카메라, 자동 스크롤, 피로도, 거리, 게임 타이머가 모두 정지한다.

          확인창은 pointer 입력으로 동작하므로 Scene 자체를 pause하지는 않는다.
        */
        if (this.giveUpPromptOpen) {
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.menuKey)) {
            /* 키보드로 메뉴 UI를 호출할 때도 버튼과 같은 coin 계열을 사용한다. */
            trademillAudio.playUiClick();
            this.requestMenu();
        }

        if (this.menuRequested) {
            this.performGoToMenu();
            return;
        }

        if (!this.worldReady || !this.wheelBody) {
            if (this.mobileGameplayLayout) {
                consumeMobileLeftTap();
                consumeMobileRightTap();
            }
            return;
        }

        if (this.isGameOver) {
            this.drawWheel();
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.giveUpKey)) {
            this.openGiveUpPrompt();
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
                ? this.wheelBody.position.x - this.getCameraTargetScreenX()
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
            this.wheelBody.position.y - this.getCameraTargetScreenY(),
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
            this.wheelBody.position.x - this.getCameraTargetScreenX()
        );
        this.cameras.main.scrollY = Phaser.Math.Clamp(
            this.wheelBody.position.y - this.getCameraTargetScreenY(),
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

        /*
          HARD LANDING 같은 일시 표시가 같은 프레임에 지워지던 문제를 막는다.
          이 가드가 없으면 flashStatus는 1프레임도 화면에 남지 않는다.
        */
        if (this.time.now < this.statusFlashUntil) {
            return;
        }

        const grounded = this.isGroundedForInput();
        const leftHeld = this.isLeftControlHeld();
        const rightHeld = this.isRightControlHeld();

        if (grounded && leftHeld) {
            this.statusText.setText('BRAKE / REVERSE').setColor('#93c5fd');
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
        if (!this.runStartedAt) {
            return 0;
        }

        let pausedMs = this.runPausedTotalMs;

        /*
          확인창이 현재 열려 있다면 아직 closeGiveUpPrompt()에서 누적하지 않은
          이번 pause 시간까지 실시간으로 제외한다.
          따라서 확인창을 30초 보고 있어도 게임 기록은 30초 늘어나지 않는다.
        */
        if (this.giveUpPromptOpen && this.giveUpPromptOpenedAt) {
            pausedMs += Math.max(0, this.time.now - this.giveUpPromptOpenedAt);
        }

        return Math.max(
            0,
            Math.floor(this.time.now - this.runStartedAt - pausedMs)
        );
    }

    formatElapsedMs(ms) {
        const value = Math.max(0, Math.floor(Number(ms) || 0));
        const totalSeconds = Math.floor(value / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const tenths = Math.floor((value % 1000) / 100);

        return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
    }

    openGiveUpPrompt() {
        if (
            this.giveUpPromptOpen ||
            !this.worldReady ||
            !this.wheelBody ||
            this.isGameOver ||
            this.resultRequested ||
            this.menuRequested
        ) {
            return;
        }

        /*
          포기 확인창을 누른 바로 그 순간의 기록을 고정한다.
          이후 확인창에서 머문 시간이나 Matter body 변화가 결과에 섞이지 않는다.
        */
        /*
          G 키와 화면 GIVE UP 버튼 모두 이 함수 하나로 들어온다.
          따라서 포기 확인창을 여는 UI coin도 여기서 딱 한 번만 울린다.
        */
        trademillAudio.playUiClick();

        this.giveUpSnapshot = {
            distance: this.getDistance(),
            elapsedMs: this.getElapsedMs()
        };
        this.giveUpPromptOpen = true;
        this.giveUpPromptOpenedAt = this.time.now;

        if (this.mobileGameplayLayout) {
            setMobileGameplayControlsEnabled(false);
        }

        this.matter?.world?.pause?.();

        /*
          화면/물리뿐 아니라 BGM도 함께 멈춘다.
          AudioContext 전체를 suspend하지 않으므로 확인창의 UI coin은 계속 들린다.
        */
        trademillAudio.pauseBgm();

        if (this.playerHumanSprite?.anims) {
            this.giveUpSpriteAnimationWasPlaying =
                !!this.playerHumanSprite.anims.isPlaying;
            this.playerHumanSprite.anims.pause?.();
        }

        this.drawGiveUpPrompt();
    }

    drawGiveUpPrompt() {
        this.destroyGiveUpPromptObjects();

        const modalDepth = VISUAL_THEME.depth.hud + 40;
        const snapshot = this.giveUpSnapshot || {
            distance: this.getDistance(),
            elapsedMs: this.getElapsedMs()
        };
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        /*
          화면 전체를 덮는 interactive blocker가 뒤쪽 HUD/버튼 클릭을 막는다.
          모바일 720x960에서도 실제 현재 viewport 전체를 정확히 덮는다.
        */
        const blocker = this.add.rectangle(
            centerX,
            centerY,
            this.scale.width,
            this.scale.height,
            0x000000,
            0.78
        )
            .setScrollFactor(0)
            .setDepth(modalDepth)
            .setInteractive();

        const panel = createNacrePanel(this, centerX, centerY, 600, 286, {
            phase: 4,
            fillAlpha: 0.96,
            glowAlpha: 0.16,
            coreAlpha: 0.82
        })
            .setScrollFactor(0)
            .setDepth(modalDepth + 1);

        const title = createNacreText(this, centerX, centerY - 74, 'REALLY GIVE UP?', {
            fontFamily: VISUAL_THEME.text.displayFont,
            fontSize: '39px',
            fontStyle: 'bold',
            align: 'center'
        }, {
            phase: 4
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(modalDepth + 2);

        const record = createNacreText(
            this,
            centerX,
            centerY - 16,
            `DIST ${snapshot.distance}   /   TIME ${this.formatElapsedMs(snapshot.elapsedMs)}`,
            {
                fontFamily: VISUAL_THEME.text.monoFont,
                fontSize: '20px',
                color: VISUAL_THEME.text.secondary,
                align: 'center'
            },
            {
                nacre: false
            }
        )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(modalDepth + 2);

        const guide = createNacreText(
            this,
            centerX,
            centerY + 22,
            'Your run is frozen at this point.',
            {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: '17px',
                color: VISUAL_THEME.text.muted,
                align: 'center'
            },
            {
                nacre: false
            }
        )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(modalDepth + 2);

        const yesButton = createNacreButton(this, {
            x: centerX - 118,
            y: centerY + 85,
            width: 220,
            height: 50,
            label: 'YES, GIVE UP',
            onClick: () => this.confirmGiveUp(),
            fontSize: 19,
            phase: 1
        })
            .setScrollFactor(0)
            .setDepth(modalDepth + 3);

        const continueButton = createNacreButton(this, {
            x: centerX + 118,
            y: centerY + 85,
            width: 220,
            height: 50,
            label: 'KEEP GOING',
            onClick: () => this.cancelGiveUp(),
            fontSize: 19,
            phase: 5
        })
            .setScrollFactor(0)
            .setDepth(modalDepth + 3);

        this.giveUpPromptObjects = [
            blocker,
            panel,
            title,
            record,
            guide,
            yesButton,
            continueButton
        ];
    }

    destroyGiveUpPromptObjects() {
        for (const object of this.giveUpPromptObjects) {
            object?.destroy?.();
        }

        this.giveUpPromptObjects = [];
    }

    closeGiveUpPrompt({
        resumeWorld = true,
        countPausedTime = true
    } = {}) {
        if (
            countPausedTime &&
            this.giveUpPromptOpen &&
            this.giveUpPromptOpenedAt
        ) {
            this.runPausedTotalMs += Math.max(
                0,
                this.time.now - this.giveUpPromptOpenedAt
            );
        }

        this.destroyGiveUpPromptObjects();
        this.giveUpPromptOpen = false;
        this.giveUpPromptOpenedAt = 0;

        if (resumeWorld) {
            this.matter?.world?.resume?.();

            if (
                this.giveUpSpriteAnimationWasPlaying &&
                this.playerHumanSprite?.anims
            ) {
                this.playerHumanSprite.anims.resume?.();
            }
        }

        this.giveUpSpriteAnimationWasPlaying = false;
    }

    cancelGiveUp() {
        if (!this.giveUpPromptOpen) {
            return;
        }

        this.giveUpSnapshot = null;
        this.closeGiveUpPrompt({
            resumeWorld: true,
            countPausedTime: true
        });
        trademillAudio.resumeBgm();

        if (this.mobileGameplayLayout) {
            setMobileGameplayControlsEnabled(true);
        }

        /*
          G를 누른 상태로 확인창을 열었을 때 닫는 즉시 다시 JustDown으로
          잡히는 일을 막기 위해 키 상태를 한 번 정리한다.
        */
        this.giveUpKey?.reset?.();
    }

    confirmGiveUp() {
        if (!this.giveUpPromptOpen || this.isGameOver) {
            return;
        }

        const snapshot = this.giveUpSnapshot || {
            distance: this.getDistance(),
            elapsedMs: this.getElapsedMs()
        };

        /*
          결과값은 확인창을 연 순간의 snapshot을 사용한다.
          ResultScene으로 넘어가기 직전 Matter world는 다시 켜 두어
          같은 Scene을 재시작할 때 pause 상태가 남지 않게 한다.
          isGameOver가 즉시 true가 되므로 재개 후 조종 로직은 실행되지 않는다.
        */
        this.closeGiveUpPrompt({
            resumeWorld: true,
            countPausedTime: false
        });
        this.giveUpSnapshot = null;
        this.gameOver(snapshot.distance, 'GIVE UP', snapshot.elapsedMs);
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

        /*
          약한 착지에도 무릎이 조금 접히도록 모든 착지를 기록한다.
          강도는 치명 낙하 속도 대비 비율이며 애니메이션에서 스프링에 주입된다.
        */
        this.landingImpactId += 1;
        this.landingImpactAt = this.time.now;
        this.landingImpactPower = Phaser.Math.Clamp(
            landingVelocityY / PLAYER_TUNING.fall.fatalVelocityY,
            0,
            1
        );

        const hardLanding =
            landingVelocityY >= PLAYER_TUNING.fall.hardLandingVelocityY ||
            fallDistance >= PLAYER_TUNING.fall.hardLandingFallDistance;

        if (hardLanding) {
            this.applyHardLandingStabilizer();
            this.flashStatus('HARD LANDING', '#f87171', 500);

            /*
              죽지 않은 강한 착지는 작은 8-bit impact만 재생한다.
              landingImpactPower가 클수록 조금 더 크게 들리지만
              최종 볼륨 상한은 audioTuning.js의 hardLanding에서 조절한다.
            */
            trademillAudio.playHardLanding(this.landingImpactPower);
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
        this.statusFlashUntil = this.time.now + duration;
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
      왼쪽 연타/홀드 순서로 처리한다.

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
                Number(fatigue.maxLevel ?? 1)
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

    applyBrakeTap(Body) {
        const brake = PLAYER_TUNING.brakeTap;

        if (
            !brake.enabled ||
            !this.isGroundedForInput() ||
            this.wheelBody.velocity.x <= brake.minimumForwardSpeed
        ) {
            return;
        }


        Body.setVelocity(this.wheelBody, {
            x: Math.max(
                0,
                this.wheelBody.velocity.x -
                    brake.velocityReductionPerTap
            ),
            y: this.wheelBody.velocity.y
        });

        if (this.wheelBody.angularVelocity > 0) {
            Body.setAngularVelocity(
                this.wheelBody,
                Math.max(
                    0,
                    this.wheelBody.angularVelocity -
                        brake.angularReductionPerTap
                )
            );
        }
    }

    applyLeftGroundControl(Body) {
        const left = PLAYER_TUNING.left;
        const limits = PLAYER_TUNING.limits;
        const velocityX = this.wheelBody.velocity.x;
        const velocityY = this.wheelBody.velocity.y;

        /*
          DOWN 그립은 게임 밸런스상 제거했다.
          LEFT는 이제 항상 기본 브레이크/후진 수치만 사용한다.
          PLAYER_TUNING의 기존 수치 자체는 사용자가 조정한 값이므로 건드리지 않는다.
        */
        Body.applyForce(this.wheelBody, this.wheelBody.position, {
            x: left.holdForceGround,
            y: 0
        });
        Body.setAngularVelocity(
            this.wheelBody,
            Phaser.Math.Clamp(
                this.wheelBody.angularVelocity + left.angularGround,
                -limits.angularLimit,
                limits.angularLimit
            )
        );

        if (velocityX > 0) {
            Body.setVelocity(this.wheelBody, {
                x: velocityX * left.reverseBrakeMultiplier,
                y:
                    velocityY > 0
                        ? velocityY * left.reverseVerticalDamping
                        : velocityY
            });
        } else {
            Body.setVelocity(this.wheelBody, {
                x: Phaser.Math.Clamp(
                    velocityX - left.backwardAccel,
                    limits.velocityXMin,
                    limits.velocityXMax
                ),
                y: velocityY
            });
        }
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
        this.giveUpPromptOpen = false;
        this.giveUpSnapshot = null;
        this.giveUpPromptOpenedAt = 0;
        this.runPausedTotalMs = 0;
        this.destroyGiveUpPromptObjects();
        this.matter?.world?.resume?.();
        this.groundContactIds.clear();
        this.lastGroundedAt = Number.NEGATIVE_INFINITY;
        this.hasBeenAirborne = false;
        this.airborneStartY = 0;
        this.maxFallVelocityY = 0;
        this.maxFallDistance = 0;
        this.currentGroundSlope = 0;
        this.climbFatigue = 0;
        this.landingImpactPower = 0;
        this.landingImpactAt = Number.NEGATIVE_INFINITY;
        this.statusFlashUntil = 0;

        this.statusText?.setText('');
        this.finishText?.setVisible(false);
        this.distanceText?.setText('DIST: 0');
        this.timeText?.setText('TIME: 0:00.0');

        this.buildGroundFromMarketData();
        const spawnSample = this.chooseSafeSpawnSample();
        this.createWheelAtSample(spawnSample);
        this.createPlayerHumanSprite();
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
      맵 points는 화면에 보이는 지형의 정확한 표면선이다.

      이전 방식은 각 선분마다 두께가 있는 회전 사각형을 만들었다.
      사각형의 긴 윗면은 선과 맞았지만, 날카로운 산 정상에서는 두 사각형의
      짧은 끝면(end cap)이 정상 양옆의 빈 공간으로 튀어나왔다.

      화면에는 삼각형 정상만 보이는데 물리적으로는 보이지 않는 네모가 생겨
      공이 정상 직전에 벽을 타거나 막히는 원인이었다.

      이번 방식은 지형을 "기울기가 계속 증가하는 볼록한 묶음"으로 나눈다.

      - 오르막 → 정상 → 내리막은 한 개의 볼록 다각형 몸체가 된다.
      - 따라서 산 정상에는 몸체 경계나 사각형 끝면이 존재하지 않는다.
      - 물리 표면은 원본 point들을 그대로 지나므로 보이는 검은 선과 일치한다.
      - 묶음은 골짜기 또는 안쪽으로 꺾이는 지점에서만 나뉜다.
        이런 경계는 플레이 가능한 표면 위로 튀어나오지 않고 지형 내부에 놓인다.

      Matter의 concave 자동 분해에 전체 맵을 맡기지 않고, 우리가 미리 볼록한
      조각으로 나눈다. 그래서 복잡한 맵에서도 예측 가능하고 유지보수가 쉽다.
    */
    buildGroundFromMarketData() {
        /*
          자개 지형색을 "원본 데이터 선분 단위"가 아니라 지형 전체를 따라
          연속적으로 배치하기 위해 각 포인트에 누적 경로 길이(pathDistance)를 넣는다.

          예를 들어 한 데이터 선분이 매우 가파르고 실제 길이가 길면,
          x좌표만 기준으로 했을 때보다 더 많은 자개색이 자연스럽게 섞인다.

          pathDistance는 오직 렌더링 색 배치에만 사용한다.
          충돌·경사·스폰 계산은 기존 x/y 좌표를 그대로 사용하므로
          최근 수정한 산 정상 콜라이더와 시작 안착 로직에는 영향을 주지 않는다.
        */
        let accumulatedPathDistance = 0;

        this.groundPoints = this.marketTerrainData.points.map(
            (point, index, sourcePoints) => {
                if (index > 0) {
                    const previous = sourcePoints[index - 1];

                    accumulatedPathDistance += Phaser.Math.Distance.Between(
                        previous.x,
                        previous.y,
                        point.x,
                        point.y
                    );
                }

                return {
                    x: point.x,
                    y: point.y,
                    pathDistance: accumulatedPathDistance
                };
            }
        );
        this.groundSegments = [];
        this.groundBodies = [];

        /*
          1단계: 원본 지형 선분 정보를 만든다.

          이 데이터는 실제 콜라이더 생성뿐 아니라 다음 기능에도 사용된다.
          - 안전한 시작 위치 선택
          - 현재 위치의 지형 높이와 경사 계산
          - 내리막 가속 및 오르막 피로 계산
          - 선택적인 접지 보조
        */
        for (let index = 0; index < this.groundPoints.length - 1; index += 1) {
            const pointA = this.groundPoints[index];
            const pointB = this.groundPoints[index + 1];
            const dx = pointB.x - pointA.x;
            const dy = pointB.y - pointA.y;
            const length = Math.hypot(dx, dy);

            if (
                !Number.isFinite(dx) ||
                !Number.isFinite(dy) ||
                !Number.isFinite(length) ||
                dx <= 0 ||
                length <= 0
            ) {
                throw new Error(
                    `유효하지 않은 지형 선분입니다. index=${index}`
                );
            }

            const tangentX = dx / length;
            const tangentY = dy / length;

            /*
              화면 좌표에서는 y가 아래로 증가한다.

              진행 방향 tangent = (tangentX, tangentY)
              지형 아래쪽 normalDown = (-tangentY, tangentX)
              지형 위쪽 normalUp = -normalDown
            */
            const normalDownX = -tangentY;
            const normalDownY = tangentX;
            const normalUpX = -normalDownX;
            const normalUpY = -normalDownY;

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

        /*
          2단계: 지형 표면을 볼록한 묶음으로 나눈다.

          연속된 선분의 slope가 증가하거나 같으면 그 표면은 아래쪽 지형을
          기준으로 볼록하다. 대표적으로 다음 산 모양이 한 몸체가 된다.

                    /\\
                   /  \\

          정상에서는 slope가 음수에서 양수로 증가하므로 절대 분리하지 않는다.
          반대로 slope가 감소하는 골짜기/안쪽 꺾임에서만 묶음을 나눈다.
        */
        const chunkRanges = this.buildConvexTerrainChunkRanges();
        const minimumDepth = Math.max(
            GAME_TUNING.terrain.colliderThickness,
            this.wheelRadius * 2 + 8
        );

        for (const range of chunkRanges) {
            const topPoints = this.groundPoints.slice(
                range.startPointIndex,
                range.endPointIndex + 1
            );

            if (topPoints.length < 2) {
                continue;
            }

            const firstPoint = topPoints[0];
            const lastPoint = topPoints[topPoints.length - 1];
            const lowestSurfaceY = Math.max(...topPoints.map((point) => point.y));
            const bottomY = lowestSurfaceY + minimumDepth;

            /*
              보이는 표면점 뒤에 아래쪽 두 점을 붙여 하나의 볼록 지형 몸체를 만든다.

              topPoints는 원본 검은 선과 1:1로 일치한다.
              아래쪽 두 점은 화면에 보이지 않는 지형 내부를 채우기 위한 것이다.
            */
            const worldVertices = [
                ...topPoints,
                { x: lastPoint.x, y: bottomY },
                { x: firstPoint.x, y: bottomY }
            ];

            const body = this.createConvexTerrainBody(worldVertices);
            this.groundBodies.push(body);
        }

        if (this.groundBodies.length === 0) {
            throw new Error('지형 물리 몸체를 만들 수 없습니다.');
        }

        this.firstGroundX = this.groundPoints[0].x;
        this.lastGroundX = this.groundPoints[this.groundPoints.length - 1].x;
        this.finishLineX = this.lastGroundX;
    }

    /*
      지형 표면을 maximal convex chain으로 나눈다.

      point i에서:
      이전 slope <= 다음 slope  → 같은 볼록 몸체에 포함
      이전 slope >  다음 slope  → 이 지점에서 새 몸체 시작

      작은 부동소수점 오차 때문에 거의 같은 slope를 잘못 분리하지 않도록
      epsilon을 둔다.
    */
    buildConvexTerrainChunkRanges() {
        const ranges = [];
        const slopeEpsilon = 1e-7;
        let startPointIndex = 0;

        for (
            let pointIndex = 1;
            pointIndex < this.groundPoints.length - 1;
            pointIndex += 1
        ) {
            const previousSegment = this.groundSegments[pointIndex - 1];
            const nextSegment = this.groundSegments[pointIndex];

            if (!previousSegment || !nextSegment) {
                continue;
            }

            const slopeDecreased =
                nextSegment.slope < previousSegment.slope - slopeEpsilon;

            if (!slopeDecreased) {
                continue;
            }

            ranges.push({
                startPointIndex,
                endPointIndex: pointIndex
            });
            startPointIndex = pointIndex;
        }

        ranges.push({
            startPointIndex,
            endPointIndex: this.groundPoints.length - 1
        });

        return ranges;
    }

    /*
      worldVertices로 정확한 정적 볼록 다각형을 만든다.

      Matter.fromVertices는 입력 꼭짓점을 몸체 중심 기준으로 받는 것이 가장
      예측 가능하다. 따라서 먼저 다각형의 면적 중심을 계산하고, 모든 점을
      그 중심 기준 로컬 좌표로 바꾼 뒤 원래 월드 위치에 생성한다.

      이 방식의 핵심:
      - 회전 사각형을 사용하지 않음
      - 산 정상에 짧은 네모 끝면이 생기지 않음
      - 보이는 선과 물리 표면이 같은 꼭짓점을 공유함
    */
    createConvexTerrainBody(worldVertices) {
        if (!this.isConvexPolygon(worldVertices)) {
            throw new Error('볼록 지형 묶음 생성에 실패했습니다.');
        }

        const center = this.getPolygonCentroid(worldVertices);
        const localVertices = worldVertices.map((vertex) => ({
            x: vertex.x - center.x,
            y: vertex.y - center.y
        }));

        const body = this.matter.add.fromVertices(
            center.x,
            center.y,
            localVertices,
            {
                label: BODY_LABEL_GROUND,
                isStatic: true,
                friction: GAME_TUNING.terrain.groundFriction,
                frictionStatic: GAME_TUNING.terrain.groundStaticFriction,
                restitution: 0,
                slop: GAME_TUNING.terrain.collisionSlop
            },
            false,
            false,
            0
        );

        if (!body) {
            throw new Error('Matter 지형 몸체 생성에 실패했습니다.');
        }

        /*
          fromVertices가 단일 몸체 또는 compound body를 반환하는 경우를 모두
          대비해 부모와 모든 part의 label을 통일한다.
        */
        body.label = BODY_LABEL_GROUND;

        for (const part of body.parts || []) {
            part.label = BODY_LABEL_GROUND;
        }

        return body;
    }

    /*
      연속 꼭짓점의 외적 부호가 모두 같으면 볼록 다각형이다.
      collinear 점은 허용한다. y가 아래로 증가하는 화면 좌표여도
      부호의 일관성만 보면 되므로 동일하게 사용할 수 있다.
    */
    isConvexPolygon(vertices) {
        if (!Array.isArray(vertices) || vertices.length < 3) {
            return false;
        }

        const epsilon = 1e-7;
        let direction = 0;

        for (let index = 0; index < vertices.length; index += 1) {
            const pointA = vertices[index];
            const pointB = vertices[(index + 1) % vertices.length];
            const pointC = vertices[(index + 2) % vertices.length];
            const cross =
                (pointB.x - pointA.x) * (pointC.y - pointB.y) -
                (pointB.y - pointA.y) * (pointC.x - pointB.x);

            if (Math.abs(cross) <= epsilon) {
                continue;
            }

            const currentDirection = Math.sign(cross);

            if (direction === 0) {
                direction = currentDirection;
            } else if (currentDirection !== direction) {
                return false;
            }
        }

        return direction !== 0;
    }

    /*
      shoelace 공식으로 다각형의 면적 중심을 계산한다.
      비정상적으로 면적이 0에 가까우면 꼭짓점 평균으로 안전하게 fallback한다.
    */
    getPolygonCentroid(vertices) {
        let twiceArea = 0;
        let centerXTimesArea = 0;
        let centerYTimesArea = 0;

        for (let index = 0; index < vertices.length; index += 1) {
            const current = vertices[index];
            const next = vertices[(index + 1) % vertices.length];
            const cross = current.x * next.y - next.x * current.y;

            twiceArea += cross;
            centerXTimesArea += (current.x + next.x) * cross;
            centerYTimesArea += (current.y + next.y) * cross;
        }

        if (Math.abs(twiceArea) <= 1e-7) {
            const sum = vertices.reduce(
                (accumulator, vertex) => ({
                    x: accumulator.x + vertex.x,
                    y: accumulator.y + vertex.y
                }),
                { x: 0, y: 0 }
            );

            return {
                x: sum.x / vertices.length,
                y: sum.y / vertices.length
            };
        }

        return {
            x: centerXTimesArea / (3 * twiceArea),
            y: centerYTimesArea / (3 * twiceArea)
        };
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

        this.playerHumanSprite?.destroy();
        this.playerHumanSprite = null;
        this.currentPlayerVisualState = 'idle';

        this.groundBodies = [];
        this.groundPoints = [];
        this.groundSegments = [];
        this.groundContactIds.clear();
        this.terrainGraphics?.clear();
        this.wheelGraphics?.clear();
        this.wheelOverlayGraphics?.clear();
    }

    handleInput(dt) {
        const Body = Phaser.Physics.Matter.Matter.Body;
        const grounded = this.isGroundedForInput();
        const right = PLAYER_TUNING.right;
        const limits = PLAYER_TUNING.limits;
        const rightHeld = this.isRightControlHeld();
        const leftHeld = this.isLeftControlHeld();
        const rightTapped = this.consumeRightControlTap();
        const leftTapped = this.consumeLeftControlTap();
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

        /*
          =========================
          방향키 코인 효과음
          =========================

          반드시 JustDown 1회당 소리 1회만 재생한다.
          isDown을 사용하면 키를 누르고 있는 동안 매 프레임 코인이 울려
          연타 노동의 리듬이 사라지므로 절대 바꾸지 않는 것이 좋다.

          RIGHT는 현재 climbFatigue를 넘긴다.
          피로도 100%까지는 기존 피로도에 따라 음이 낮아지고,
          100% 이후에도 연타할 때마다 추가 반음 누적이 계속되어
          음정 하한 없이 점점 더 낮아진다.

          LEFT는 밝은 RIGHT coin의 단순 역순이 아니라,
          아주 낮은 음역의 reverse-style coin을 별도로 재생한다.
        */
        if (rightTapped) {
            trademillAudio.playCoinForward({
                fatigue: this.climbFatigue
            });
        }

        if (leftTapped) {
            trademillAudio.playCoinReverse();
        }

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
            this.applyBrakeTap(Body);
        }

        if (leftHeld) {
            if (grounded) {
                this.applyLeftGroundControl(Body);
            } else {
                this.applyAirLeftControl(Body);
            }
        }

    }

    gameOver(distance, reason = 'GAME OVER', elapsedMsOverride = null) {
        if (this.isGameOver) {
            return;
        }

        /*
          IMPORTANT:
          Number(null) === 0 이므로, 예전 코드는 elapsedMsOverride 기본값 null을
          유효한 0ms 기록으로 오인했다. 그 결과 FREE FALL / FINISH처럼 override를
          넘기지 않는 종료가 랭킹에 0:00.0으로 저장됐다.

          override가 실제로 제공된 경우에만 숫자로 사용하고, null/undefined이면
          반드시 현재 플레이 시간을 getElapsedMs()에서 가져온다.
          GIVE UP은 기존 snapshot 시간을 override로 넘기므로 그대로 보존된다.
        */
        const hasElapsedOverride =
            elapsedMsOverride !== null && elapsedMsOverride !== undefined;
        const parsedElapsedMs = hasElapsedOverride
            ? Number(elapsedMsOverride)
            : NaN;
        const elapsedMs = Number.isFinite(parsedElapsedMs)
            ? Math.max(0, Math.floor(parsedElapsedMs))
            : this.getElapsedMs();

        this.isGameOver = true;

        if (this.mobileGameplayLayout) {
            setMobileGameplayControlsEnabled(false);
        }

        /*
          종료 사유별 8-bit 효과음.
          FINISH는 상승 코인 cascade, GIVE UP은 둔한 hit,
          그 외 추락/시장 이탈 계열은 큰 hit를 사용한다.
          isGameOver 가드 덕분에 같은 종료가 여러 프레임에서 중복 재생되지 않는다.
        */
        if (reason === 'FINISH') {
            trademillAudio.playFinish();
        } else if (reason === 'GIVE UP') {
            trademillAudio.playGiveUp();
        } else {
            trademillAudio.playDeath();
        }

        this.resultData = {
            mapMeta: this.currentMapMeta,
            mapData: this.marketTerrainData,
            distance,
            reason,
            finished: reason === 'FINISH',
            elapsedMs
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
            /*
              지형 내부는 흑칠처럼 거의 검게 채우고,
              실제 플레이 가능한 표면선만 디지털 자개로 밝힌다.

              자개 빛의 넓은 glow는 장식이고,
              가장 안쪽의 얇은 core 선이 실제 충돌 표면을 정확히 보여준다.
              따라서 그래픽이 화려해져도 플레이어가 밟는 위치는 모호해지지 않는다.
            */
            graphics.fillStyle(VISUAL_THEME.lacquer.panelStrong, 0.96);
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

            drawNacrePolyline(
                graphics,
                visiblePoints,
                this.time.now,
                {
                    phaseOffset: 0
                }
            );
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

        drawNacreVerticalLine(
            graphics,
            this.finishLineX,
            top,
            bottom,
            this.time.now,
            4
        );
        this.finishText
            ?.setPosition(this.finishLineX, top - 20)
            .setVisible(true);
    }

    /*
      =========================
      플레이어 비주얼 구조
      =========================

      물리 바디와 그래픽은 분리한다.

      - wheelBody:
        보이지 않는 원형 Matter 물리 바디. 충돌과 이동을 담당한다.

      - 코드로 그리는 바퀴:
        자개 링과 철제 프레임. wheelBody.angle에 맞춰 회전한다.

      - 안쪽 사람:
        기본 상태에서는 코드 실루엣으로 그린다.
        visualTheme.js에서 player.sprite.enabled=true로 바꾸고
        지정된 PNG 스프라이트시트를 넣으면 사람 부분만 스프라이트로 교체된다.

      사람을 바퀴 이미지에 합치지 않는 이유:
      바퀴는 계속 회전하지만 사람은 화면 기준으로 서 있어야 하기 때문이다.
      둘을 한 장으로 만들면 사람까지 빙글빙글 돌아가므로 반드시 분리한다.
    */
    createPlayerHumanSprite() {
        this.playerHumanSprite?.destroy();
        this.playerHumanSprite = null;
        this.currentPlayerVisualState = 'idle';

        createPlayerAnimations(this);

        if (!canUsePlayerSprite(this) || !this.wheelBody) {
            return;
        }

        const spriteConfig = VISUAL_THEME.player.sprite;
        const idleKey = spriteConfig.sheets.idle.key;

        this.playerHumanSprite = this.add.sprite(
            this.wheelBody.position.x,
            this.wheelBody.position.y + spriteConfig.yOffset,
            idleKey,
            0
        )
            .setScale(spriteConfig.scale)
            .setDepth(VISUAL_THEME.depth.human)
            .setOrigin(0.5);

        this.playerHumanSprite.play('player-idle', true);
    }

    getPlayerVisualState() {
        if (!this.wheelBody) {
            return 'idle';
        }

        if (this.isGameOver && this.resultData?.reason === 'FINISH') {
            return 'finish';
        }

        if (!this.isGroundedForInput()) {
            return 'air';
        }

        if (this.time.now - this.landingImpactAt < 260) {
            return 'land';
        }

        const velocityX = this.wheelBody.velocity.x;
        const leftHeld = !!this.cursors?.left?.isDown;
        const rightHeld = !!this.cursors?.right?.isDown;
        const uphillThreshold = PLAYER_TUNING.uphillFatigue.minSlope;

        if (leftHeld && velocityX > 0.12) {
            return 'brake';
        }

        if (leftHeld || velocityX < -0.18) {
            return 'reverse';
        }

        if (
            rightHeld &&
            this.currentGroundSlope <= -uphillThreshold &&
            this.climbFatigue >= PLAYER_TUNING.uphillFatigue.statusThreshold
        ) {
            return 'strain';
        }

        if (Math.abs(velocityX) > 0.16) {
            return 'run';
        }

        return 'idle';
    }

    /*
      절차적 러너에 넘기는 연속 상태.

      문자열 상태 하나로는 "느리게 굴릴 때"와 "전력으로 밀 때"를 구분할 수 없다.
      경사·피로도·충격량을 그대로 넘겨 포즈가 연속적으로 변하게 한다.

      spinRate 단위 주의:
      Matter의 angularVelocity는 프레임당 라디안이고 Phaser Matter는 고정 60Hz로 돈다.
      그래서 60을 곱해 초당 라디안으로 바꾼다.
      물리 타임스텝을 바꿨다면 이 상수도 함께 바꿔야 한다.
    */
    getPlayerMotionState() {
        const body = this.wheelBody;

        if (!body) {
            return { grounded: true };
        }

        const velocityX = body.velocity.x;
        const leftHeld = !!this.cursors?.left?.isDown;
        const rightHeld = !!this.cursors?.right?.isDown;
        const slope = this.currentGroundSlope;

        return {
            grounded: this.isGroundedForInput(),
            finished: this.isGameOver && this.resultData?.reason === 'FINISH',
            velocityX,
            spinRate: body.angularVelocity * 60,
            slope,
            uphill: Phaser.Math.Clamp(-slope / 0.6, 0, 1),
            fatigue: this.climbFatigue,
            pushing: rightHeld ? 1 : 0,
            braking: leftHeld && velocityX > 0.12 ? 1 : 0,
            reversing:
                (leftHeld && velocityX <= 0.12) || velocityX < -0.18 ? 1 : 0,
            gripping: 0,
            impactId: this.landingImpactId,
            impactPower: this.landingImpactPower
        };
    }

    updatePlayerHumanSprite() {
        if (!this.playerHumanSprite || !this.wheelBody) {
            return;
        }

        const spriteConfig = VISUAL_THEME.player.sprite;
        const state = this.getPlayerVisualState();
        const animationKey = `player-${state}`;
        const velocityX = this.wheelBody.velocity.x;

        this.playerHumanSprite
            .setPosition(
                this.wheelBody.position.x,
                this.wheelBody.position.y + spriteConfig.yOffset
            )
            .setRotation(0)
            .setFlipX(velocityX < -0.05);

        if (this.anims.exists(animationKey)) {
            this.playerHumanSprite.play(animationKey, true);
        }

        /* 달리는 속도에 따라 사람 애니메이션 속도도 자연스럽게 변한다. */
        this.playerHumanSprite.anims.timeScale = Phaser.Math.Clamp(
            Math.abs(velocityX) / 2.5,
            0.7,
            1.8
        );

        this.currentPlayerVisualState = state;
    }

    drawWheel() {
        if (!this.wheelBody || !this.wheelGraphics) {
            return;
        }

        const graphics = this.wheelGraphics;
        const overlay = this.wheelOverlayGraphics;
        const { x, y } = this.wheelBody.position;
        const angle = this.wheelBody.angle;
        const radius = this.wheelRadius;
        const velocityX = this.wheelBody.velocity.x;
        const grounded = this.isGroundedForInput();
        const state = this.getPlayerVisualState();

        graphics.clear();
        overlay?.clear();

        /*
          바퀴 내부는 검게 비워 사람 실루엣이 읽히게 하고,
          바깥 링만 디지털 자개로 그린다.
        */
        graphics.fillStyle(VISUAL_THEME.lacquer.panelStrong, 0.76);
        graphics.fillCircle(x, y, radius - 2);

        drawWheelDust(
            graphics,
            x,
            y,
            radius,
            velocityX,
            this.time.now,
            grounded
        );

        if (this.playerHumanSprite) {
            this.updatePlayerHumanSprite();
        } else {
            drawProceduralHuman(
                graphics,
                x,
                y,
                radius,
                this.time.now,
                this.getPlayerMotionState()
            );
        }

        /*
          사람 위에 철제 프레임과 자개 링을 다시 그려
          인물이 바퀴 안쪽에 실제로 갇혀 보이게 한다.
        */
        if (overlay) {
            drawWheelCage(overlay, x, y, radius, angle);
            drawNacreWheel(
                overlay,
                x,
                y,
                radius,
                angle,
                this.time.now
            );
        }

        this.currentPlayerVisualState = state;
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
