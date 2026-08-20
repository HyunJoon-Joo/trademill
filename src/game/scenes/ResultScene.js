import Phaser from 'phaser';
import { trademillAudio } from '../audio/TrademillAudio';
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
        this.storedPlayerName = '';
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
        /*
          GIVE UP 확인창에서 멈췄던 BGM은 ResultScene 진입 후 다시 이어진다.
          일반 추락/FINISH에서는 이미 BGM이 재생 중이므로 audio service가
          현재 duck/fade 상태를 보존하고 중복 resume하지 않는다.
        */
        trademillAudio.resumeBgm({
            delaySec: 0.22,
            fadeInSec: 0.9
        });

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
        this.storedPlayerName = sanitizePlayerNameInput(await getPlayerName());
        this.playerName = this.storedPlayerName;

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
            trademillAudio.playUiClick();
            this.saveScoreAndRender();
        }

        if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
            trademillAudio.playUiClick();
            this.saveIfNeededAndThen(() => this.restartMap());
        }

        if (Phaser.Input.Keyboard.JustDown(this.menuKey)) {
            trademillAudio.playUiClick();
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
        const mapDate = getMapDate(this.mapData, this.mapMeta);

        this.addUi(
            createNacreText(this, 640, 190, mapDate, {
                fontFamily: VISUAL_THEME.text.monoFont,
                fontSize: '18px',
                color: VISUAL_THEME.text.secondary
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
            this.addUi(createNacrePanel(this, 640, 258, 460, 50, {
                phase: 1,
                fillAlpha: 0.82,
                glowAlpha: 0.08,
                coreAlpha: 0.5
            }));
            this.addUi(
                createNacreText(this, 640, 258, `PLAYER: ${this.playerName}`, {
                    fontFamily: VISUAL_THEME.text.monoFont,
                    fontSize: '25px'
                }, {
                    phase: 1
                }).setOrigin(0.5)
            );
            return;
        }

        this.addUi(
            createNacreText(this, 640, 226, 'ENTER NAME', {
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
                trademillAudio.playUiClick();
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
        this.nameInputDom = this.add.dom(640, 258, input);
        this.addUi(this.nameInputDom);

        this.addUi(
            createNacreText(
                this,
                640,
                297,
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
            /*
              leaderboard 표는 계속 TOP 10만 보여주지만, 서버는 저장 후
              전체 scores를 기준으로 이 플레이어의 정확한 순위를 반환한다.
              따라서 11위 이하도 OUT OF TOP 10으로 뭉개지 않고 #27처럼 표시한다.
            */
            const parsedRank = Math.floor(Number(this.saveResult.rank));
            const rankText = Number.isFinite(parsedRank) && parsedRank > 0
                ? `RANK #${parsedRank}`
                : 'RANK UNAVAILABLE';
            const bestText = this.saveResult.nameAdjusted
                ? `SAVED AS ${this.playerName}`
                : this.saveResult.isNewBest
                    ? 'NEW BEST'
                    : 'SCORE SAVED';

            message = `${bestText} / ${rankText}`;
            nacre = true;
        } else if (this.saveError) {
            message = `SAVE FAILED: ${this.saveError}`;
            color = VISUAL_THEME.text.danger;
        }

        this.addUi(
            createNacreText(this, 640, 330, message, {
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
        /*
          기존에는 10줄을 하나의 Phaser Text에 넣고 origin 0.5로 배치해서
          실제 폰트 line-height가 예상보다 조금 커질 경우 10위 줄이 패널 아래쪽
          테두리에 걸쳐 보일 수 있었다.

          이제 각 랭킹 줄을 고정 y 좌표로 따로 배치한다.
          그래서 브라우저/OS의 폰트 메트릭 차이가 있어도 1~10위가 항상
          패널 내부의 정해진 세로 공간에 들어간다.
        */
        this.addUi(createNacrePanel(this, 640, 479, 800, 248, {
            phase: 3,
            fillAlpha: 0.78,
            glowAlpha: 0.1,
            coreAlpha: 0.54
        }));
        this.addUi(
            createNacreText(this, 640, 375, 'RANKING 1-10', {
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

        const firstRowY = 405;
        const rowStep = 19;
        const rowX = 450;

        for (let index = 0; index < 10; index += 1) {
            const entry = rankingResult.leaderboard[index];
            let rowText = '';

            if (!entry) {
                rowText = `${String(index + 1).padStart(2, ' ')}. ---          ---`;
            } else {
                const rank = String(index + 1).padStart(2, ' ');
                const name = String(entry.playerName || 'YOU').padEnd(12, ' ');
                const score = entry.bestFinished
                    ? `FIN ${formatElapsedMs(entry.bestElapsedMs)}`
                    : `DST ${String(entry.bestDistance || 0).padStart(5, ' ')}`;

                rowText = `${rank}. ${name}  ${score}`;
            }

            this.addUi(
                createNacreText(this, rowX, firstRowY + index * rowStep, rowText, {
                    fontFamily: VISUAL_THEME.text.monoFont,
                    fontSize: '18px',
                    color: VISUAL_THEME.text.primary,
                    align: 'left'
                }, {
                    nacre: false
                }).setOrigin(0, 0.5)
            );
        }
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

        const requestedName = normalizePlayerName(
            this.nameInputElement?.value || this.playerName || 'YOU'
        );
        /*
          로컬에 저장된 이름은 '서버가 최종 배정한 이름'이 아니라
          사용자가 직접 입력한 기본 이름을 기억한다.

          예: 사용자가 ABC를 입력했는데 해당 날짜에 ABC가 이미 있으면
          서버는 ABC2로 저장한다. 다음 게임의 입력창에는 다시 ABC가 들어가고,
          또 중복이면 ABC3처럼 다음 빈 번호를 서버가 배정한다.
        */
        const preferredInputName = requestedName;

        this.playerName = requestedName;
        this.nameInputElement?.blur();

        const result = await submitScore({
            mapId: this.getMapId(),
            distance: this.distance,
            reason: this.reason,
            finished: this.finished,
            elapsedMs: this.elapsedMs,
            playerName: requestedName
        });

        if (!this.sceneAlive) {
            return result;
        }

        if (result.ok) {
            this.playerName = normalizePlayerName(
                result.playerName || requestedName
            );
            /*
              서버가 ABC2 / ABC3처럼 자동 배정하더라도 다음 판 입력창에는
              사용자가 원래 입력했던 ABC를 유지한다. 그래야 번호가
              ABC22처럼 누적되지 않고 ABC, ABC2, ABC3... 순서로 배정된다.
            */
            this.storedPlayerName = preferredInputName;
            await savePlayerName(preferredInputName);
        }

        this.saveResult = result;
        this.saved = !!result.ok;
        this.saveError = result.ok ? '' : result.error || 'Unknown error';
        this.isSaving = false;

        /*
          서버가 실제 저장 성공을 반환한 뒤에만 confirm coin을 울린다.
          1~10위에 들어가면 TrademillAudio 내부에서 짧은 bonus coin이 추가된다.
          저장 실패에는 돈 소리를 주지 않아 성공/실패를 귀로 구분할 수 있다.
        */
        if (result.ok) {
            trademillAudio.playScoreSaved(result.rank);
        }

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
