import Phaser from 'phaser';
import {
    formatElapsedMs,
    getLeaderboard,
    getPlayerBest
} from '../services/rankingService';

export class ArchiveScene extends Phaser.Scene {
    constructor() {
        super('ArchiveScene');
    }

    init() {
        this.mapIndex = null;
        this.maps = [];
        this.selectedIndex = 0;
        this.uiObjects = [];

        this.leftKey = null;
        this.rightKey = null;
        this.enterKey = null;
        this.backKey = null;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0f172a');

        this.mapIndex = this.registry.get('mapIndex');

        const rawMaps = Array.isArray(this.mapIndex?.maps) ? this.mapIndex.maps : [];

        this.maps = [...rawMaps].sort((a, b) => {
            const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));

            if (dateCompare !== 0) {
                return dateCompare;
            }

            return String(a.generatedAt || '').localeCompare(String(b.generatedAt || ''));
        });

        if (this.maps.length > 0) {
            const latestIndex = this.maps.findIndex((m) => m.mapId === this.mapIndex?.latestMapId);
            this.selectedIndex = latestIndex >= 0 ? latestIndex : this.maps.length - 1;
        }

        this.leftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
        this.rightKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.backKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this.drawBackground();
        this.renderArchive();
    }

    update() {
        if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
            this.selectPreviousMap();
        }

        if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
            this.selectNextMap();
        }

        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.playSelectedMap();
        }

        if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
            this.scene.start('MenuScene');
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
    }

    addUi(obj) {
        this.uiObjects.push(obj);
        return obj;
    }

    async renderArchive() {
        this.clearUi();

        const title = this.add.text(640, 52, 'MARKET ARCHIVE', {
            fontFamily: 'Arial',
            fontSize: '42px',
            color: '#ffffff'
        }).setOrigin(0.5);

        const subtitle = this.add.text(640, 91, 'Left is older. Right is newer. Ranking is shown vertically.', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#93c5fd'
        }).setOrigin(0.5);

        this.addUi(title);
        this.addUi(subtitle);

        if (this.maps.length === 0) {
            const empty = this.add.text(640, 330, 'No market maps found.', {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#f87171'
            }).setOrigin(0.5);

            this.addUi(empty);
            this.createButton(640, 620, 220, 48, 'BACK', () => {
                this.scene.start('MenuScene');
            });

            return;
        }

        this.drawMapCarousel();
        await this.drawSelectedMapInfo();
        await this.drawRankingPanel();
        this.drawBottomButtons();
    }

    drawMapCarousel() {
        const centerX = 640;
        const y = 165;

        const visibleOffsets = [-2, -1, 0, 1, 2];

        for (const offset of visibleOffsets) {
            const index = this.selectedIndex + offset;

            if (index < 0 || index >= this.maps.length) {
                continue;
            }

            const map = this.maps[index];
            const isSelected = offset === 0;

            const x = centerX + offset * 210;
            const width = isSelected ? 190 : 170;
            const height = isSelected ? 86 : 70;

            const bgColor = isSelected ? 0x2563eb : 0x1e293b;
            const strokeColor = isSelected ? 0xbfdbfe : 0x64748b;

            const container = this.add.container(x, y);

            const bg = this.add.rectangle(0, 0, width, height, bgColor, 1)
                .setStrokeStyle(2, strokeColor, 1)
                .setInteractive({ useHandCursor: true });

            const dateText = this.add.text(0, -16, map.date || 'unknown', {
                fontFamily: 'Arial',
                fontSize: isSelected ? '20px' : '17px',
                color: '#ffffff'
            }).setOrigin(0.5);

            const diff = map.difficulty?.score
                ? `D ${map.difficulty.score}`
                : 'D ?';

            const subText = this.add.text(0, 17, `${map.interval} / ${diff}`, {
                fontFamily: 'Arial',
                fontSize: isSelected ? '16px' : '14px',
                color: '#cbd5e1'
            }).setOrigin(0.5);

            container.add(bg);
            container.add(dateText);
            container.add(subText);

            bg.on('pointerdown', () => {
                this.selectedIndex = index;
                this.renderArchive();
            });

            this.addUi(container);
        }

        const leftHint = this.add.text(104, y, '←', {
            fontFamily: 'Arial',
            fontSize: '42px',
            color: this.selectedIndex > 0 ? '#93c5fd' : '#334155'
        }).setOrigin(0.5);

        const rightHint = this.add.text(1176, y, '→', {
            fontFamily: 'Arial',
            fontSize: '42px',
            color: this.selectedIndex < this.maps.length - 1 ? '#93c5fd' : '#334155'
        }).setOrigin(0.5);

        this.addUi(leftHint);
        this.addUi(rightHint);

        this.createSmallButton(136, y, 56, 48, '<', () => {
            this.selectPreviousMap();
        });

        this.createSmallButton(1144, y, 56, 48, '>', () => {
            this.selectNextMap();
        });
    }

    async drawSelectedMapInfo() {
        const map = this.getSelectedMap();

        if (!map) {
            return;
        }

        const difficulty = map.difficulty?.score
            ? `${map.difficulty.score}`
            : '?';

        const record = await getPlayerBest(map.mapId);

        let bestText = '-';

        if (record?.bestFinished) {
            bestText = `FINISH ${formatElapsedMs(record.bestElapsedMs)}`;
        } else if (record) {
            bestText = `DIST ${record.bestDistance}`;
        }

        const lines = [
            `MAP ID: ${map.mapId}`,
            `DATE: ${map.date}   SYMBOL: ${map.symbol}   INTERVAL: ${map.interval}`,
            `DIFFICULTY: ${difficulty}   YOUR BEST: ${bestText}`
        ];

        const info = this.add.text(640, 255, lines.join('\n'), {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#cbd5e1',
            align: 'center',
            lineSpacing: 8
        }).setOrigin(0.5);

        this.addUi(info);
    }

    async drawRankingPanel() {
        const map = this.getSelectedMap();

        if (!map) {
            return;
        }

        const panel = this.add.rectangle(640, 430, 800, 250, 0x020617, 0.72)
            .setStrokeStyle(2, 0x334155, 1);

        const title = this.add.text(640, 320, 'RANKING 1-10', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.addUi(panel);
        this.addUi(title);

        const leaderboard = await getLeaderboard(map.mapId);

        if (leaderboard.length === 0) {
            const empty = this.add.text(640, 430, 'No ranking yet.\nPlay this map and leave a record.', {
                fontFamily: 'Arial',
                fontSize: '21px',
                color: '#94a3b8',
                align: 'center',
                lineSpacing: 8
            }).setOrigin(0.5);

            this.addUi(empty);
            return;
        }

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

        const body = this.add.text(640, 455, rows.join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '19px',
            color: '#e5e7eb',
            align: 'left',
            lineSpacing: 5
        }).setOrigin(0.5);

        this.addUi(body);
    }

    drawBottomButtons() {
        this.createButton(520, 650, 280, 50, 'PLAY THIS MAP', () => {
            this.playSelectedMap();
        });

        this.createButton(800, 650, 220, 50, 'BACK', () => {
            this.scene.start('MenuScene');
        });
    }

    getSelectedMap() {
        if (this.maps.length === 0) {
            return null;
        }

        return this.maps[Phaser.Math.Clamp(this.selectedIndex, 0, this.maps.length - 1)];
    }

    selectPreviousMap() {
        if (this.selectedIndex <= 0) {
            return;
        }

        this.selectedIndex -= 1;
        this.renderArchive();
    }

    selectNextMap() {
        if (this.selectedIndex >= this.maps.length - 1) {
            return;
        }

        this.selectedIndex += 1;
        this.renderArchive();
    }

    playSelectedMap() {
        const map = this.getSelectedMap();

        if (!map) {
            return;
        }

        this.scene.start('GameScene', { mapMeta: map });
    }

    createButton(x, y, width, height, label, onClick, fontSize = 20) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, 0x1e293b, 1)
            .setStrokeStyle(2, 0x64748b, 1)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(0, 0, label, {
            fontFamily: 'Arial',
            fontSize: `${fontSize}px`,
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: width - 28 }
        }).setOrigin(0.5);

        container.add(bg);
        container.add(text);

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

        this.addUi(container);
        return container;
    }

    createSmallButton(x, y, width, height, label, onClick) {
        return this.createButton(x, y, width, height, label, onClick, 24);
    }
}