import Phaser from 'phaser';
import {
    DATA_SOURCE_MODE,
    fetchDataJson,
    MAP_INDEX_PATH
} from '../config/dataConfig';
import { getPlayerBest } from '../services/rankingService';
import {
    getLatestMapMeta,
    getMapDate,
    normalizeMapIndex
} from '../utils/mapDataUtils';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    init() {
        this.mapIndex = null;
        this.maps = [];
        this.uiObjects = [];
        this.sceneAlive = true;
        this.renderToken = 0;
        this.refreshController = null;
        this.isStartingGame = false;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0f172a');
        this.drawBackground();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.sceneAlive = false;
            this.renderToken += 1;
            this.refreshController?.abort();
            this.refreshController = null;
            this.clearUi();
        });

        this.showLoading('UPDATING MARKET MAP...');
        this.refreshMapIndexAndShowMenu();
    }

    drawBackground() {
        this.add.rectangle(0, 0, 1280, 720, 0x0f172a).setOrigin(0, 0);
        this.add.rectangle(0, 500, 1280, 220, 0x111827).setOrigin(0, 0);

        for (let index = 0; index < 24; index += 1) {
            const x = index * 62;
            const y = 540 + Math.sin(index * 0.85) * 38;
            this.add.circle(x, y, 3, 0x334155, 0.85);
        }
    }

    showLoading(message) {
        this.clearUi();
        this.addUi(
            this.add.text(640, 300, message, {
                fontFamily: 'Arial',
                fontSize: '24px',
                color: '#cbd5e1'
            }).setOrigin(0.5)
        );
    }

    clearUi() {
        for (const object of this.uiObjects) {
            object?.destroy?.();
        }

        this.uiObjects = [];
    }

    addUi(object) {
        this.uiObjects.push(object);
        return object;
    }

    async refreshMapIndex() {
        this.refreshController?.abort();
        this.refreshController = new AbortController();

        try {
            const rawIndex = await fetchDataJson(MAP_INDEX_PATH, {
                signal: this.refreshController.signal
            });
            const freshIndex = normalizeMapIndex(rawIndex);

            if (!this.sceneAlive) {
                return false;
            }

            this.registry.set('mapIndex', freshIndex);
            this.mapIndex = freshIndex;
            this.maps = freshIndex.maps;
            return true;
        } catch (error) {
            if (!this.sceneAlive) {
                return false;
            }

            console.warn('최신 맵 인덱스 갱신 실패. 기존 데이터를 사용합니다.', error);

            this.mapIndex = this.registry.get('mapIndex') || null;
            this.maps = Array.isArray(this.mapIndex?.maps)
                ? this.mapIndex.maps
                : [];

            return this.maps.length > 0;
        }
    }

    async refreshMapIndexAndShowMenu() {
        await this.refreshMapIndex();

        if (this.sceneAlive) {
            await this.showMainMenu();
        }
    }

    async showMainMenu() {
        const token = ++this.renderToken;
        this.clearUi();

        this.addUi(this.add.text(640, 110, 'TRADEMILL', {
            fontFamily: 'Arial',
            fontSize: '72px',
            color: '#ffffff'
        }).setOrigin(0.5));

        const latestMap = this.getLatestMap();
        const marketLabel = latestMap?.label || latestMap?.symbol || 'market';

        this.addUi(this.add.text(
            640,
            170,
            `A daily terrain generated from ${marketLabel} data`,
            {
                fontFamily: 'Arial',
                fontSize: '22px',
                color: '#93c5fd'
            }
        ).setOrigin(0.5));

        let latestInfo = 'No market map loaded';

        if (latestMap) {
            const difficulty = latestMap.difficulty?.score
                ? ` / Difficulty ${latestMap.difficulty.score}`
                : '';
            const record = await getPlayerBest(latestMap.mapId);

            if (!this.sceneAlive || token !== this.renderToken) {
                return;
            }

            let recordText = ' / No Record';

            if (record?.bestFinished) {
                recordText = ' / Your Best FINISH';
            } else if (record) {
                recordText = ` / Your Best ${record.bestDistance}`;
            }

            latestInfo = [
                `Latest Map: ${getMapDate(latestMap, latestMap)}`,
                latestMap.symbol || '',
                latestMap.interval || ''
            ].filter(Boolean).join(' / ');

            latestInfo += `${difficulty}${recordText}`;
        }

        this.addUi(this.add.text(640, 225, latestInfo, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#cbd5e1',
            align: 'center',
            wordWrap: { width: 1100 }
        }).setOrigin(0.5));

        this.addUi(this.add.text(
            640,
            255,
            `DATA SOURCE: ${DATA_SOURCE_MODE.toUpperCase()}`,
            {
                fontFamily: 'Arial',
                fontSize: '14px',
                color: '#64748b'
            }
        ).setOrigin(0.5));

        this.createButton(640, 330, 380, 56, 'PLAY LATEST MAP', () => {
            this.playLatestMap();
        }, 20, !latestMap);

        this.createButton(640, 405, 380, 56, 'MARKET ARCHIVE', () => {
            this.scene.start('ArchiveScene');
        }, 20, this.maps.length === 0);

        this.createButton(640, 480, 380, 56, 'HOW TO PLAY', () => {
            this.showControls();
        });
    }

    async playLatestMap() {
        if (this.isStartingGame) {
            return;
        }

        this.isStartingGame = true;
        this.showLoading('CHECKING THE LATEST MAP...');
        await this.refreshMapIndex();

        if (!this.sceneAlive) {
            return;
        }

        const latestMap = this.getLatestMap();

        if (!latestMap) {
            this.isStartingGame = false;
            await this.showMainMenu();
            return;
        }

        this.scene.start('GameScene', { mapMeta: latestMap });
    }

    showControls() {
        this.renderToken += 1;
        this.clearUi();

        this.addUi(this.add.text(640, 80, 'HOW TO PLAY', {
            fontFamily: 'Arial',
            fontSize: '42px',
            color: '#ffffff'
        }).setOrigin(0.5));

        const bodyText = [
            'RIGHT hold: move forward',
            'RIGHT tap: burst forward',
            'LEFT tap on ground: brake',
            'LEFT hold: brake, then reverse',
            'DOWN hold: stronger grip',
            'SPACE or UP: jump',
            '',
            'Uphill sections build fatigue and require repeated effort.',
            'Downhill sections accelerate the wheel and demand more braking.',
            'Free fall can end the run.',
            '',
            'Each mapId has its own online ranking.'
        ].join('\n');

        this.addUi(this.add.text(640, 325, bodyText, {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#cbd5e1',
            align: 'center',
            lineSpacing: 8
        }).setOrigin(0.5));

        this.createButton(640, 620, 240, 48, 'BACK', () => {
            this.showMainMenu();
        });
    }

    getLatestMap() {
        return getLatestMapMeta(this.mapIndex);
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
            align: 'center',
            wordWrap: { width: width - 28 }
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
