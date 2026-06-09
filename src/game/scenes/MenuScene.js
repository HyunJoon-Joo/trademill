import Phaser from 'phaser';
import { getPlayerBest } from '../services/rankingService';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    init() {
        this.mapIndex = null;
        this.maps = [];
        this.uiObjects = [];
    }

    create() {
        this.cameras.main.setBackgroundColor('#0f172a');

        this.mapIndex = this.registry.get('mapIndex');
        this.maps = Array.isArray(this.mapIndex?.maps) ? this.mapIndex.maps : [];

        this.drawBackground();
        this.showMainMenu();
    }

    drawBackground() {
        this.add.rectangle(0, 0, 1280, 720, 0x0f172a).setOrigin(0, 0);
        this.add.rectangle(0, 500, 1280, 220, 0x111827).setOrigin(0, 0);

        for (let i = 0; i < 24; i++) {
            const x = i * 62;
            const y = 540 + Math.sin(i * 0.85) * 38;
            this.add.circle(x, y, 3, 0x334155, 0.85);
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

    async showMainMenu() {
        this.clearUi();

        const title = this.add.text(640, 110, 'TRADEMILL', {
            fontFamily: 'Arial',
            fontSize: '72px',
            color: '#ffffff'
        }).setOrigin(0.5);

        const subtitle = this.add.text(640, 170, 'A daily market terrain made from NASDAQ data', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#93c5fd'
        }).setOrigin(0.5);

        this.addUi(title);
        this.addUi(subtitle);

        const latestMap = this.getLatestMap();

        let latestInfo = 'No market map loaded';

        if (latestMap) {
            const difficulty = latestMap.difficulty?.score
                ? ` / Difficulty ${latestMap.difficulty.score}`
                : '';

            const record = await getPlayerBest(latestMap.mapId);
            let recordText = ' / No Record';

            if (record?.bestFinished) {
                recordText = ` / Your Best FINISH`;
            } else if (record) {
                recordText = ` / Your Best ${record.bestDistance}`;
            }

            latestInfo = `Today Map: ${latestMap.mapId}${difficulty}${recordText}`;
        }

        const info = this.add.text(640, 225, latestInfo, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#cbd5e1'
        }).setOrigin(0.5);

        this.addUi(info);

        this.createButton(640, 320, 380, 56, 'PLAY TODAY MAP', () => {
            const map = this.getLatestMap();

            if (map) {
                this.scene.start('GameScene', { mapMeta: map });
            }
        });

        this.createButton(640, 395, 380, 56, 'MARKET ARCHIVE', () => {
            this.scene.start('ArchiveScene');
        });

        this.createButton(640, 470, 380, 56, 'HOW TO PLAY', () => {
            this.showControls();
        });
    }

    showControls() {
        this.clearUi();

        const title = this.add.text(640, 80, 'HOW TO PLAY', {
            fontFamily: 'Arial',
            fontSize: '42px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.addUi(title);

        const bodyText = [
            'RIGHT hold: move forward',
            'RIGHT tap: burst forward',
            'SPACE or UP: jump',
            'LEFT tap on ground: brake',
            '',
            'Uphill sections require repeated effort.',
            'Downhill sections are dangerous.',
            'Free fall can kill you instantly.',
            'Hard landing triggers a brake challenge.',
            '',
            'Each date has its own market map and ranking.'
        ].join('\n');

        const body = this.add.text(640, 325, bodyText, {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#cbd5e1',
            align: 'center',
            lineSpacing: 9
        }).setOrigin(0.5);

        this.addUi(body);

        this.createButton(640, 620, 240, 48, 'BACK', () => {
            this.showMainMenu();
        });
    }

    getLatestMap() {
        if (!this.mapIndex || !Array.isArray(this.maps) || this.maps.length === 0) {
            return null;
        }

        return (
            this.maps.find((m) => m.mapId === this.mapIndex.latestMapId) ||
            this.maps[0]
        );
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
}