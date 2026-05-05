import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    init() {
        this.mapIndex = null;
        this.maps = [];
        this.selectedPage = 0;
        this.mapsPerPage = 7;
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

        for (let i = 0; i < 22; i++) {
            const x = i * 70;
            const y = 515 + Math.sin(i * 0.8) * 35;
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

    showMainMenu() {
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

            latestInfo = `Today Map: ${latestMap.mapId}${difficulty}`;
        }

        const info = this.add.text(640, 220, latestInfo, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#cbd5e1'
        }).setOrigin(0.5);

        this.addUi(info);

        this.createButton(640, 300, 360, 52, 'PLAY TODAY MAP', () => {
            const map = this.getLatestMap();

            if (map) {
                this.scene.start('GameScene', { mapMeta: map });
            }
        });

        this.createButton(640, 370, 360, 52, 'PAST MARKET MAPS', () => {
            this.selectedPage = 0;
            this.showMapSelect();
        });

        this.createButton(640, 440, 360, 52, 'LOCAL RECORDS', () => {
            this.showLocalRecords();
        });

        this.createButton(640, 510, 360, 52, 'HOW TO PLAY', () => {
            this.showControls();
        });
    }

    showMapSelect() {
        this.clearUi();

        const title = this.add.text(640, 70, 'PAST MARKET MAPS', {
            fontFamily: 'Arial',
            fontSize: '42px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.addUi(title);

        if (this.maps.length === 0) {
            const empty = this.add.text(640, 310, 'No maps found.', {
                fontFamily: 'Arial',
                fontSize: '24px',
                color: '#f87171'
            }).setOrigin(0.5);

            this.addUi(empty);
            this.createButton(640, 600, 260, 48, 'BACK', () => this.showMainMenu());
            return;
        }

        const totalPages = Math.max(1, Math.ceil(this.maps.length / this.mapsPerPage));
        this.selectedPage = Phaser.Math.Clamp(this.selectedPage, 0, totalPages - 1);

        const start = this.selectedPage * this.mapsPerPage;
        const pageMaps = this.maps.slice(start, start + this.mapsPerPage);

        let y = 135;

        for (const map of pageMaps) {
            const difficulty = map.difficulty?.score
                ? `Difficulty ${map.difficulty.score}`
                : 'Difficulty ?';

            const record = this.getBestRecord(map.mapId);
            const recordText = record ? `Best ${record.bestDistance}` : 'No record';

            const label = `${map.date}  /  ${map.symbol} ${map.interval}  /  ${difficulty}  /  ${recordText}`;

            this.createButton(640, y, 760, 44, label, () => {
                this.scene.start('GameScene', { mapMeta: map });
            }, 18);

            y += 58;
        }

        const pageText = this.add.text(640, 560, `${this.selectedPage + 1} / ${totalPages}`, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1'
        }).setOrigin(0.5);

        this.addUi(pageText);

        this.createButton(440, 610, 180, 46, 'PREV', () => {
            this.selectedPage = Math.max(0, this.selectedPage - 1);
            this.showMapSelect();
        });

        this.createButton(640, 610, 180, 46, 'BACK', () => {
            this.showMainMenu();
        });

        this.createButton(840, 610, 180, 46, 'NEXT', () => {
            this.selectedPage = Math.min(totalPages - 1, this.selectedPage + 1);
            this.showMapSelect();
        });
    }

    showLocalRecords() {
        this.clearUi();

        const title = this.add.text(640, 80, 'LOCAL RECORDS', {
            fontFamily: 'Arial',
            fontSize: '42px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.addUi(title);

        const lines = [];

        for (const map of this.maps.slice(0, 10)) {
            const record = this.getBestRecord(map.mapId);

            if (record) {
                lines.push(`${map.date} / ${map.interval} / Best ${record.bestDistance} / Attempts ${record.attempts}`);
            }
        }

        if (lines.length === 0) {
            lines.push('No local records yet.');
            lines.push('');
            lines.push('Play a market map first.');
        }

        const body = this.add.text(640, 310, lines.join('\n'), {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#cbd5e1',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5);

        this.addUi(body);

        this.createButton(640, 610, 240, 48, 'BACK', () => {
            this.showMainMenu();
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
            'Each date has its own market map and local record.'
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

    getBestRecord(mapId) {
        try {
            const raw = localStorage.getItem(`tm_best_${mapId}`);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
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