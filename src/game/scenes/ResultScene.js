import Phaser from 'phaser';
import {
    formatElapsedMs,
    getLeaderboard,
    getPlayerName,
    savePlayerName,
    submitScore
} from '../services/rankingService';

export class ResultScene extends Phaser.Scene {
    constructor() {
        super('ResultScene');
    }

    init(data = {}) {
        this.mapMeta = data.mapMeta || null;
        this.mapData = data.mapData || null;
        this.distance = Math.max(0, Math.floor(Number(data.distance) || 0));
        this.reason = data.reason || 'GAME OVER';
        this.finished = !!data.finished || this.reason === 'FINISH';
        this.elapsedMs = Math.max(0, Math.floor(Number(data.elapsedMs) || 0));

        this.playerName = 'YOU';
        this.saved = false;
        this.saveResult = null;
        this.isReady = false;
        this.isSaving = false;

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

        const loading = this.add.text(640, 360, 'LOADING RESULT...', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.uiObjects.push(loading);

        this.prepareResult();
    }

    async prepareResult() {
        this.playerName = await getPlayerName();
        this.isReady = true;
        this.render();
    }

    update() {
        if (!this.isReady || this.isSaving) {
            return;
        }

        if (this.isNameInputFocused()) {
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            if (!this.saved) {
                this.saveScoreAndRender();
            }
        }

        if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
            this.saveIfNeededAndThen(() => {
                this.restartMap();
            });
        }

        if (Phaser.Input.Keyboard.JustDown(this.menuKey)) {
            this.saveIfNeededAndThen(() => {
                this.scene.start('MenuScene');
            });
        }
    }

    drawBackground() {
        this.add.rectangle(0, 0, 1280, 720, 0x0f172a).setOrigin(0, 0);
        this.add.rectangle(0, 500, 1280, 220, 0x111827).setOrigin(0, 0);

        for (let i = 0; i < 30; i++) {
            const x = i * 48;
            const y = 548 + Math.sin(i * 0.75) * 32;
            this.add.circle(x, y, 3, 0x334155, 0.8);
        }
    }

    clearUi() {
        for (const obj of this.uiObjects) {
            if (obj && obj.destroy) {
                obj.destroy();
            }
        }

        this.uiObjects = [];
        this.nameInputElement = null;
        this.nameInputDom = null;
    }

    addUi(obj) {
        this.uiObjects.push(obj);
        return obj;
    }

    async render() {
        this.clearUi();

        const mapId = this.getMapId();
        const leaderboard = await getLeaderboard(mapId);

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

        const mapLine = [
            this.mapData?.date || this.mapMeta?.date || 'unknown date',
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
        this.drawLeaderboard(leaderboard);
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

        input.style.width = '430px';
        input.style.height = '46px';
        input.style.boxSizing = 'border-box';
        input.style.background = '#020617';
        input.style.border = '2px solid #93c5fd';
        input.style.borderRadius = '0px';
        input.style.color = '#ffffff';
        input.style.fontFamily = 'Courier New, monospace';
        input.style.fontSize = '25px';
        input.style.textAlign = 'center';
        input.style.outline = 'none';
        input.style.textTransform = 'uppercase';

        input.addEventListener('keydown', (event) => {
            event.stopPropagation();

            if (event.key === 'Enter') {
                event.preventDefault();
                this.playerName = input.value;
                this.saveScoreAndRender();
            }
        });

        input.addEventListener('input', () => {
            const cleaned = input.value
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

        this.addUi(this.add.text(640, 309, 'Type your name, then press ENTER or SAVE SCORE.', {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: '#94a3b8'
        }).setOrigin(0.5));

        this.time.delayedCall(80, () => {
            if (this.nameInputElement && !this.saved) {
                this.nameInputElement.focus();
                this.nameInputElement.select();
            }
        });
    }

    drawSaveStatus() {
        let message = '';

        if (this.saved && this.saveResult) {
            const rankText = this.saveResult.rank
                ? `RANK #${this.saveResult.rank}`
                : 'OUT OF TOP 10';

            const bestText = this.saveResult.isNewBest
                ? 'NEW BEST'
                : 'SCORE SAVED';

            message = `${bestText} / ${rankText}`;
        } else if (this.isSaving) {
            message = 'SAVING...';
        } else {
            message = 'Score is not saved yet.';
        }

        this.addUi(this.add.text(640, 338, message, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: this.saved ? '#fbbf24' : '#cbd5e1'
        }).setOrigin(0.5));
    }

    drawLeaderboard(leaderboard) {
        this.addUi(this.add.rectangle(640, 468, 800, 215, 0x020617, 0.72)
            .setStrokeStyle(2, 0x334155, 1));

        this.addUi(this.add.text(640, 376, 'RANKING 1-10', {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#ffffff'
        }).setOrigin(0.5));

        const rows = [];

        for (let i = 0; i < 10; i++) {
            const entry = leaderboard[i];

            if (!entry) {
                rows.push(`${String(i + 1).padStart(2, ' ')}. ---          ---`);
                continue;
            }

            const rank = String(i + 1).padStart(2, ' ');
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
        if (!this.saved) {
            this.createButton(470, 640, 220, 48, this.isSaving ? 'SAVING...' : 'SAVE SCORE', () => {
                if (this.nameInputElement) {
                    this.playerName = this.nameInputElement.value;
                }

                this.saveScoreAndRender();
            }, 20, this.isSaving);
        } else {
            this.createButton(470, 640, 220, 48, 'SAVED', () => {}, 20, true);
        }

        this.createButton(690, 640, 190, 48, 'RESTART', () => {
            this.saveIfNeededAndThen(() => {
                this.restartMap();
            });
        });

        this.createButton(900, 640, 180, 48, 'MENU', () => {
            this.saveIfNeededAndThen(() => {
                this.scene.start('MenuScene');
            });
        });

        this.addUi(this.add.text(640, 690, 'After saving: R restart / M menu', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#64748b'
        }).setOrigin(0.5));
    }

    isNameInputFocused() {
        return (
            this.nameInputElement &&
            document.activeElement === this.nameInputElement
        );
    }

    async saveScore() {
        if (this.saved || this.isSaving) {
            return;
        }

        this.isSaving = true;

        const cleanName =
            this.nameInputElement?.value ||
            this.playerName ||
            'YOU';

        this.playerName = await savePlayerName(cleanName);

        if (this.nameInputElement) {
            this.nameInputElement.blur();
        }

        this.saveResult = await submitScore({
            mapId: this.getMapId(),
            distance: this.distance,
            reason: this.reason,
            finished: this.finished,
            elapsedMs: this.elapsedMs,
            playerName: this.playerName,
            mapMeta: this.mapMeta,
            mapData: this.mapData
        });

        this.saved = true;
        this.isSaving = false;
    }

    async saveScoreAndRender() {
        await this.saveScore();
        await this.render();
    }

    async saveIfNeededAndThen(callback) {
        if (!this.saved) {
            await this.saveScore();
        }

        callback();
    }

    restartMap() {
        this.scene.start('GameScene', {
            mapMeta: this.mapMeta
        });
    }

    getMapId() {
        return this.mapData?.mapId || this.mapMeta?.mapId || 'unknown-map';
    }

    createButton(x, y, width, height, label, onClick, fontSize = 20, disabled = false) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, disabled ? 0x334155 : 0x1e293b, 1)
            .setStrokeStyle(2, disabled ? 0x475569 : 0x64748b, 1);

        if (!disabled) {
            bg.setInteractive({ useHandCursor: true });
        }

        const text = this.add.text(0, 0, label, {
            fontFamily: 'Arial',
            fontSize: `${fontSize}px`,
            color: disabled ? '#94a3b8' : '#ffffff',
            align: 'center'
        }).setOrigin(0.5);

        container.add(bg);
        container.add(text);

        if (!disabled) {
            bg.on('pointerover', () => {
                bg.setFillStyle(0x334155, 1);
                bg.setStrokeStyle(2, 0x93c5fd, 1);
            });

            bg.on('pointerout', () => {
                bg.setFillStyle(0x1e293b, 1);
                bg.setStrokeStyle(2, 0x64748b, 1);
            });

            bg.on('pointerdown', () => {
                onClick();
            });
        }

        this.addUi(container);
        return container;
    }
}