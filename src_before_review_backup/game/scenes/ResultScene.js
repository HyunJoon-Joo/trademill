import Phaser from 'phaser';
import {
    formatElapsedMs,
    getLeaderboardResult,
    getPlayerName,
    savePlayerName,
    submitScore
} from '../services/rankingService';
import { getMapDate, normalizeMapId } from '../utils/mapDataUtils';
import { normalizePlayerName } from '../utils/localRecords';

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

        this.playerName = 'YOU';
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
        this.cameras.main.setBackgroundColor('#0f172a');
        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.menuKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

        this.drawBackground();
        this.addUi(this.add.text(640, 360, 'LOADING RESULT...', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff'
        }).setOrigin(0.5));

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.sceneAlive = false;
            this.renderToken += 1;
            this.clearUi();
        });

        this.prepareResult();
    }

    async prepareResult() {
        this.playerName = normalizePlayerName(await getPlayerName());

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

    drawBackground() {
        this.add.rectangle(0, 0, 1280, 720, 0x0f172a).setOrigin(0, 0);
        this.add.rectangle(0, 500, 1280, 220, 0x111827).setOrigin(0, 0);

        for (let index = 0; index < 30; index += 1) {
            const x = index * 48;
            const y = 548 + Math.sin(index * 0.75) * 32;
            this.add.circle(x, y, 3, 0x334155, 0.8);
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

        const titleColor = this.finished ? '#fbbf24' : '#ffffff';

        this.addUi(this.add.text(640, 62, this.reason, {
            fontFamily: 'Arial',
            fontSize: '54px',
            color: titleColor
        }).setOrigin(0.5));

        const scoreLine = this.finished
            ? `FINISH TIME: ${formatElapsedMs(this.elapsedMs)}`
            : `DISTANCE: ${this.distance}`;

        this.addUi(this.add.text(640, 122, scoreLine, {
            fontFamily: 'Arial',
            fontSize: '31px',
            color: '#f8fafc'
        }).setOrigin(0.5));

        const subScoreLine = this.finished
            ? `DISTANCE: ${this.distance}`
            : `TIME: ${formatElapsedMs(this.elapsedMs)}`;

        this.addUi(this.add.text(640, 159, subScoreLine, {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: '#cbd5e1'
        }).setOrigin(0.5));

        /*
          날짜는 현재 날짜가 아니라 "실제로 플레이한 mapId"의 날짜다.
          과거 Archive 맵을 플레이해도 해당 날짜의 랭킹에 정확히 저장된다.
        */
        const mapLine = [
            getMapDate(this.mapData, this.mapMeta),
            this.mapData?.symbol || this.mapMeta?.symbol || '',
            this.mapData?.interval || this.mapMeta?.interval || ''
        ].filter(Boolean).join(' / ');

        this.addUi(this.add.text(640, 190, mapLine, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#93c5fd'
        }).setOrigin(0.5));

        this.addUi(this.add.text(640, 215, mapId, {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: '#94a3b8'
        }).setOrigin(0.5));

        this.drawNameInput();
        this.drawSaveStatus();
        this.drawLeaderboard(rankingResult);
        this.drawButtons();
    }

    drawNameInput() {
        if (this.saved) {
            this.addUi(this.add.rectangle(640, 270, 460, 50, 0x020617, 0.8)
                .setStrokeStyle(2, 0x334155, 1));
            this.addUi(this.add.text(640, 270, `PLAYER: ${this.playerName}`, {
                fontFamily: 'Courier New',
                fontSize: '25px',
                color: '#cbd5e1'
            }).setOrigin(0.5));
            return;
        }

        this.addUi(this.add.text(640, 238, 'ENTER NAME', {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#93c5fd'
        }).setOrigin(0.5));

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
            boxSizing: 'border-box',
            background: '#020617',
            border: '2px solid #93c5fd',
            borderRadius: '0px',
            color: '#ffffff',
            fontFamily: 'Courier New, monospace',
            fontSize: '25px',
            textAlign: 'center',
            outline: 'none',
            textTransform: 'uppercase'
        });

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

            this.playerName = cleaned || 'YOU';
        });

        this.nameInputElement = input;
        this.nameInputDom = this.add.dom(640, 270, input);
        this.addUi(this.nameInputDom);

        this.addUi(this.add.text(
            640,
            309,
            'Type your name, then press ENTER or SAVE SCORE.',
            {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#94a3b8'
            }
        ).setOrigin(0.5));

        this.time.delayedCall(80, () => {
            if (this.sceneAlive && this.nameInputElement && !this.saved) {
                this.nameInputElement.focus();
                this.nameInputElement.select();
            }
        });
    }

    drawSaveStatus() {
        let message = 'Score is not saved yet.';
        let color = '#cbd5e1';

        if (this.isSaving) {
            message = 'SAVING...';
        } else if (this.saved && this.saveResult?.ok) {
            const rankText = this.saveResult.rank
                ? `RANK #${this.saveResult.rank}`
                : 'OUT OF TOP 10';
            const bestText = this.saveResult.isNewBest
                ? 'NEW BEST'
                : 'SCORE SAVED';

            message = `${bestText} / ${rankText}`;
            color = '#fbbf24';
        } else if (this.saveError) {
            message = `SAVE FAILED: ${this.saveError}`;
            color = '#f87171';
        }

        this.addUi(this.add.text(640, 338, message, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color,
            align: 'center',
            wordWrap: { width: 900 }
        }).setOrigin(0.5));
    }

    drawLeaderboard(rankingResult) {
        this.addUi(this.add.rectangle(640, 468, 800, 215, 0x020617, 0.72)
            .setStrokeStyle(2, 0x334155, 1));
        this.addUi(this.add.text(640, 376, 'RANKING 1-10', {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#ffffff'
        }).setOrigin(0.5));

        if (!rankingResult.ok) {
            this.addUi(this.add.text(
                640,
                480,
                `Ranking unavailable.\n${rankingResult.error}`,
                {
                    fontFamily: 'Arial',
                    fontSize: '18px',
                    color: '#f87171',
                    align: 'center',
                    wordWrap: { width: 700 }
                }
            ).setOrigin(0.5));
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

        this.addUi(this.add.text(640, 490, rows.join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '19px',
            color: '#e5e7eb',
            align: 'left',
            lineSpacing: 4
        }).setOrigin(0.5));
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
            this.saved || this.isSaving
        );

        this.createButton(690, 640, 190, 48, 'RESTART', () => {
            this.saveIfNeededAndThen(() => this.restartMap());
        });

        this.createButton(900, 640, 180, 48, 'MENU', () => {
            this.saveIfNeededAndThen(() => this.scene.start('MenuScene'));
        });

        this.addUi(this.add.text(640, 690, 'R restart / M menu', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#64748b'
        }).setOrigin(0.5));
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
        disabled = false
    ) {
        const container = this.add.container(x, y);
        const background = this.add.rectangle(
            0,
            0,
            width,
            height,
            disabled ? 0x334155 : 0x1e293b,
            1
        ).setStrokeStyle(2, disabled ? 0x475569 : 0x64748b, 1);

        if (!disabled) {
            background.setInteractive({ useHandCursor: true });
        }

        const text = this.add.text(0, 0, label, {
            fontFamily: 'Arial',
            fontSize: `${fontSize}px`,
            color: disabled ? '#94a3b8' : '#ffffff',
            align: 'center'
        }).setOrigin(0.5);

        container.add([background, text]);

        if (!disabled) {
            background.on('pointerover', () => {
                background.setFillStyle(0x334155, 1);
                background.setStrokeStyle(2, 0x93c5fd, 1);
            });
            background.on('pointerout', () => {
                background.setFillStyle(0x1e293b, 1);
                background.setStrokeStyle(2, 0x64748b, 1);
            });
            background.on('pointerdown', onClick);
        }

        this.addUi(container);
        return container;
    }
}
