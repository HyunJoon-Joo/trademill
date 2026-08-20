import Phaser from 'phaser';
import { VISUAL_THEME } from '../config/visualTheme';
import {
    formatElapsedMs,
    getLeaderboardResult,
    getPlayerName,
    savePlayerName,
    submitScore
} from '../services/rankingService';
import {
    createLacquerBackground,
    createNacreButton,
    createNacrePanel,
    createNacreText,
    styleNacreInput
} from '../utils/visualEffects';
import { getMapDate, normalizeMapId } from '../utils/mapDataUtils';
import {
    normalizePlayerName,
    sanitizePlayerNameInput
} from '../utils/localRecords';

export class ResultScene extends Phaser.Scene {
    constructor() {
        super('ResultScene');
    }

    init(data = {}) {
        this.mapMeta = data.mapMeta || null;
        this.mapData = data.mapData || null;
        this.distance = Math.max(0, Math.floor(Number(data.distance) || 0));
        this.reason = String(data.reason || 'GAME OVER').slice(0, 40);
        this.finished = !!data.finished || this.reason === 'FINISH';
        this.elapsedMs = Math.max(0, Math.floor(Number(data.elapsedMs) || 0));

        this.playerName = '';
        this.saved = false;
        this.saveResult = null;
        this.saveError = '';
        this.isReady = false;
        this.isSaving = false;
        this.sceneAlive = true;
        this.renderToken = 0;

        this.uiObjects = [];
        this.enterKey = null;
        this.restartKey = null;
        this.menuKey = null;
        this.nameInputElement = null;
        this.nameInputDom = null;
    }

    create() {
        this.cameras.main.setBackgroundColor(VISUAL_THEME.lacquer.base);
        createLacquerBackground(this, {
            seed: 'ResultScene',
            depth: VISUAL_THEME.depth.background
        });

        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.menuKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

        this.addUi(createNacrePanel(this, 640, 360, 560, 112, {
            phase: 2,
            fillAlpha: 0.72
        }));
        this.addUi(
            createNacreText(this, 640, 360, 'LOADING RESULT...', {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '28px'
            }, {
                phase: 2
            }).setOrigin(0.5)
        );

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.sceneAlive = false;
            this.renderToken += 1;
            this.clearUi();
        });

        this.prepareResult();
    }

    async prepareResult() {
        this.playerName = sanitizePlayerNameInput(await getPlayerName());

        if (!this.sceneAlive) {
            return;
        }

        this.isReady = true;
        await this.render();
    }

    update() {
        if (!this.isReady || this.isSaving || this.isNameInputFocused()) {
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.enterKey) && !this.saved) {
            this.saveScoreAndRender();
        }

        if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
            this.saveIfNeededAndThen(() => this.restartMap());
        }

        if (Phaser.Input.Keyboard.JustDown(this.menuKey)) {
            this.saveIfNeededAndThen(() => this.scene.start('MenuScene'));
        }
    }

    clearUi() {
        for (const object of this.uiObjects) {
            object?.destroy?.();
        }

        this.uiObjects = [];
        this.nameInputElement = null;
        this.nameInputDom = null;
    }

    addUi(object) {
        this.uiObjects.push(object);
        return object;
    }

    async render() {
        const token = ++this.renderToken;
        this.clearUi();

        const mapId = this.getMapId();
        const rankingResult = await getLeaderboardResult(mapId);

        if (!this.sceneAlive || token !== this.renderToken) {
            return;
        }

        this.addUi(
            createNacreText(this, 640, 58, this.reason, {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '54px',
                fontStyle: 'bold'
            }, {
                phase: this.finished ? 4 : 1
            }).setOrigin(0.5)
        );

        const scoreLine = this.finished
            ? `FINISH TIME: ${formatElapsedMs(this.elapsedMs)}`
            : `DISTANCE: ${this.distance}`;

        this.addUi(
            createNacreText(this, 640, 120, scoreLine, {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '31px'
            }, {
                phase: 0
            }).setOrigin(0.5)
        );

        const subScoreLine = this.finished
            ? `DISTANCE: ${this.distance}`
            : `TIME: ${formatElapsedMs(this.elapsedMs)}`;

        this.addUi(
            createNacreText(this, 640, 158, subScoreLine, {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: '19px',
                color: VISUAL_THEME.text.secondary
            }, {
                nacre: false
            }).setOrigin(0.5)
        );

        /*
          날짜는 현재 날짜가 아니라 "실제로 플레이한 mapId"의 날짜다.
          과거 Archive 맵을 플레이해도 해당 날짜의 랭킹에 정확히 저장된다.
        */
        const mapLine = [
            getMapDate(this.mapData, this.mapMeta),
            this.mapData?.symbol || this.mapMeta?.symbol || '',
            this.mapData?.interval || this.mapMeta?.interval || ''
        ].filter(Boolean).join(' / ');

        this.addUi(
            createNacreText(this, 640, 190, mapLine, {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: '18px',
                color: VISUAL_THEME.text.secondary
            }, {
                nacre: false
            }).setOrigin(0.5)
        );

        this.addUi(
            createNacreText(this, 640, 215, mapId, {
                fontFamily: VISUAL_THEME.text.monoFont,
                fontSize: '14px',
                color: VISUAL_THEME.text.muted
            }, {
                nacre: false
            }).setOrigin(0.5)
        );

        this.drawNameInput();
        this.drawSaveStatus();
        this.drawLeaderboard(rankingResult);
        this.drawButtons();
    }

    drawNameInput() {
        if (this.saved) {
            this.addUi(createNacrePanel(this, 640, 270, 460, 50, {
                phase: 1,
                fillAlpha: 0.82,
                glowAlpha: 0.08,
                coreAlpha: 0.5
            }));
            this.addUi(
                createNacreText(this, 640, 270, `PLAYER: ${this.playerName}`, {
                    fontFamily: VISUAL_THEME.text.monoFont,
                    fontSize: '25px'
                }, {
                    phase: 1
                }).setOrigin(0.5)
            );
            return;
        }

        this.addUi(
            createNacreText(this, 640, 238, 'ENTER NAME', {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '17px'
            }, {
                phase: 2
            }).setOrigin(0.5)
        );

        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.playerName || '';
        input.maxLength = 12;
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.autocorrect = 'off';
        input.autocapitalize = 'characters';
        input.placeholder = 'YOU';
        input.setAttribute('aria-label', 'Player name');

        Object.assign(input.style, {
            width: '430px',
            height: '46px',
            fontFamily: VISUAL_THEME.text.monoFont,
            fontSize: '25px',
            textAlign: 'center',
            textTransform: 'uppercase'
        });
        styleNacreInput(input);

        input.addEventListener('keydown', (event) => {
            event.stopPropagation();

            if (event.key === 'Enter') {
                event.preventDefault();
                this.playerName = normalizePlayerName(input.value);
                this.saveScoreAndRender();
            }
        });

        input.addEventListener('input', () => {
            const cleaned = String(input.value || '')
                .toUpperCase()
                .replace(/[^A-Z0-9_-]/g, '')
                .slice(0, 12);

            if (input.value !== cleaned) {
                input.value = cleaned;
            }

            this.playerName = cleaned;
        });

        this.nameInputElement = input;
        this.nameInputDom = this.add.dom(640, 270, input);
        this.addUi(this.nameInputDom);

        this.addUi(
            createNacreText(
                this,
                640,
                309,
                'Type your name, then press ENTER or SAVE SCORE.',
                {
                    fontFamily: VISUAL_THEME.text.bodyFont,
                    fontSize: '15px',
                    color: VISUAL_THEME.text.muted
                },
                {
                    nacre: false
                }
            ).setOrigin(0.5)
        );

        this.time.delayedCall(80, () => {
            if (this.sceneAlive && this.nameInputElement && !this.saved) {
                this.nameInputElement.focus();
                this.nameInputElement.select();
            }
        });
    }

    drawSaveStatus() {
        let message = 'Score is not saved yet.';
        let color = VISUAL_THEME.text.secondary;
        let nacre = false;

        if (this.isSaving) {
            message = 'SAVING...';
            nacre = true;
        } else if (this.saved && this.saveResult?.ok) {
            const rankText = this.saveResult.rank
                ? `RANK #${this.saveResult.rank}`
                : 'OUT OF TOP 10';
            const bestText = this.saveResult.isNewBest
                ? 'NEW BEST'
                : 'SCORE SAVED';

            message = `${bestText} / ${rankText}`;
            nacre = true;
        } else if (this.saveError) {
            message = `SAVE FAILED: ${this.saveError}`;
            color = VISUAL_THEME.text.danger;
        }

        this.addUi(
            createNacreText(this, 640, 338, message, {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: '18px',
                color,
                align: 'center',
                wordWrap: { width: 900 }
            }, {
                nacre,
                phase: 4
            }).setOrigin(0.5)
        );
    }

    drawLeaderboard(rankingResult) {
        this.addUi(createNacrePanel(this, 640, 468, 800, 215, {
            phase: 3,
            fillAlpha: 0.78,
            glowAlpha: 0.1,
            coreAlpha: 0.54
        }));
        this.addUi(
            createNacreText(this, 640, 376, 'RANKING 1-10', {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '23px'
            }, {
                phase: 3
            }).setOrigin(0.5)
        );

        if (!rankingResult.ok) {
            this.addUi(
                createNacreText(
                    this,
                    640,
                    480,
                    `Ranking unavailable.\n${rankingResult.error}`,
                    {
                        fontFamily: VISUAL_THEME.text.bodyFont,
                        fontSize: '18px',
                        color: VISUAL_THEME.text.danger,
                        align: 'center',
                        wordWrap: { width: 700 }
                    },
                    {
                        nacre: false
                    }
                ).setOrigin(0.5)
            );
            return;
        }

        const rows = [];

        for (let index = 0; index < 10; index += 1) {
            const entry = rankingResult.leaderboard[index];

            if (!entry) {
                rows.push(`${String(index + 1).padStart(2, ' ')}. ---          ---`);
                continue;
            }

            const rank = String(index + 1).padStart(2, ' ');
            const name = String(entry.playerName || 'YOU').padEnd(12, ' ');
            const score = entry.bestFinished
                ? `FIN ${formatElapsedMs(entry.bestElapsedMs)}`
                : `DST ${String(entry.bestDistance || 0).padStart(5, ' ')}`;

            rows.push(`${rank}. ${name}  ${score}`);
        }

        this.addUi(
            createNacreText(this, 640, 490, rows.join('\n'), {
                fontFamily: VISUAL_THEME.text.monoFont,
                fontSize: '19px',
                color: VISUAL_THEME.text.primary,
                align: 'left',
                lineSpacing: 4
            }, {
                nacre: false
            }).setOrigin(0.5)
        );
    }

    drawButtons() {
        this.createButton(
            470,
            640,
            220,
            48,
            this.saved ? 'SAVED' : this.isSaving ? 'SAVING...' : 'SAVE SCORE',
            () => this.saveScoreAndRender(),
            20,
            this.saved || this.isSaving,
            0
        );

        this.createButton(690, 640, 190, 48, 'RESTART', () => {
            this.saveIfNeededAndThen(() => this.restartMap());
        }, 20, false, 2);

        this.createButton(900, 640, 180, 48, 'MENU', () => {
            this.saveIfNeededAndThen(() => this.scene.start('MenuScene'));
        }, 20, false, 4);

        this.addUi(
            createNacreText(this, 640, 690, 'R restart / M menu', {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: '16px',
                color: VISUAL_THEME.text.muted
            }, {
                nacre: false
            }).setOrigin(0.5)
        );
    }

    isNameInputFocused() {
        return !!(
            this.nameInputElement &&
            document.activeElement === this.nameInputElement
        );
    }

    async saveScore() {
        if (this.saved || this.isSaving) {
            return this.saveResult;
        }

        this.isSaving = true;
        this.saveError = '';
        this.playerName = await savePlayerName(
            this.nameInputElement?.value || this.playerName || 'YOU'
        );
        this.nameInputElement?.blur();

        const result = await submitScore({
            mapId: this.getMapId(),
            distance: this.distance,
            reason: this.reason,
            finished: this.finished,
            elapsedMs: this.elapsedMs,
            playerName: this.playerName
        });

        if (!this.sceneAlive) {
            return result;
        }

        this.saveResult = result;
        this.saved = !!result.ok;
        this.saveError = result.ok ? '' : result.error || 'Unknown error';
        this.isSaving = false;
        return result;
    }

    async saveScoreAndRender() {
        await this.saveScore();

        if (this.sceneAlive) {
            await this.render();
        }
    }

    async saveIfNeededAndThen(callback) {
        if (!this.saved && !this.isSaving) {
            await this.saveScore();
        }

        if (this.sceneAlive) {
            callback();
        }
    }

    restartMap() {
        this.scene.start('GameScene', {
            mapMeta: this.mapMeta
        });
    }

    getMapId() {
        return normalizeMapId(
            this.mapData?.mapId || this.mapMeta?.mapId,
            'unknown-map'
        );
    }

    createButton(
        x,
        y,
        width,
        height,
        label,
        onClick,
        fontSize = 20,
        disabled = false,
        phase = 0
    ) {
        const button = createNacreButton(this, {
            x,
            y,
            width,
            height,
            label,
            onClick,
            fontSize,
            disabled,
            phase
        });

        this.addUi(button);
        return button;
    }
}
