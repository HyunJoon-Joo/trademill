import Phaser from 'phaser';
import {
    DATA_SOURCE_MODE,
    fetchDataJson,
    MAP_INDEX_PATH
} from '../config/dataConfig';
import { VISUAL_THEME } from '../config/visualTheme';
import { getPlayerBest } from '../services/rankingService';
import {
    createLacquerBackground,
    createNacreButton,
    createNacrePanel,
    createNacreText
} from '../utils/visualEffects';
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
        this.cameras.main.setBackgroundColor(VISUAL_THEME.lacquer.base);
        createLacquerBackground(this, {
            seed: 'MenuScene',
            depth: VISUAL_THEME.depth.background
        });

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

    showLoading(message) {
        this.clearUi();
        this.addUi(createNacrePanel(this, 640, 320, 560, 120, {
            phase: 1,
            fillAlpha: 0.72
        }));
        this.addUi(
            createNacreText(this, 640, 320, message, {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '24px'
            }, {
                phase: 1
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

        this.addUi(
            createNacreText(this, 640, 100, 'TRADEMILL', {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '72px',
                fontStyle: 'bold'
            }, {
                phase: 0
            }).setOrigin(0.5)
        );

        const latestMap = this.getLatestMap();
        const marketLabel = latestMap?.label || latestMap?.symbol || 'market';

        this.addUi(
            createNacreText(
                this,
                640,
                162,
                `A daily terrain generated from ${marketLabel} data`,
                {
                    fontFamily: VISUAL_THEME.text.bodyFont,
                    fontSize: '21px',
                    color: VISUAL_THEME.text.secondary
                },
                {
                    nacre: false
                }
            ).setOrigin(0.5)
        );

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

        this.addUi(createNacrePanel(this, 640, 226, 940, 70, {
            phase: 3,
            fillAlpha: 0.52,
            glowAlpha: 0.06,
            coreAlpha: 0.34
        }));

        this.addUi(
            createNacreText(this, 640, 216, latestInfo, {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: '18px',
                color: VISUAL_THEME.text.primary,
                align: 'center',
                wordWrap: { width: 900 }
            }, {
                nacre: false
            }).setOrigin(0.5)
        );

        this.addUi(
            createNacreText(
                this,
                640,
                246,
                `DATA SOURCE: ${DATA_SOURCE_MODE.toUpperCase()}`,
                {
                    fontFamily: VISUAL_THEME.text.monoFont,
                    fontSize: '13px',
                    color: VISUAL_THEME.text.muted
                },
                {
                    nacre: false
                }
            ).setOrigin(0.5)
        );

        this.createButton(640, 330, 380, 56, 'PLAY LATEST MAP', () => {
            this.playLatestMap();
        }, 20, !latestMap, 0);

        this.createButton(640, 405, 380, 56, 'MARKET ARCHIVE', () => {
            this.scene.start('ArchiveScene');
        }, 20, this.maps.length === 0, 2);

        this.createButton(640, 480, 380, 56, 'HOW TO PLAY', () => {
            this.showControls();
        }, 20, false, 4);

        this.addUi(
            createNacreText(
                this,
                640,
                575,
                'BLACK LACQUER / DIGITAL NACRE / MARKET TERRAIN',
                {
                    fontFamily: VISUAL_THEME.text.monoFont,
                    fontSize: '13px',
                    letterSpacing: 2,
                    color: VISUAL_THEME.text.subtle
                },
                {
                    nacre: false
                }
            ).setOrigin(0.5)
        );
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

        this.addUi(
            createNacreText(this, 640, 72, 'HOW TO PLAY', {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '42px',
                fontStyle: 'bold'
            }, {
                phase: 2
            }).setOrigin(0.5)
        );

        this.addUi(createNacrePanel(this, 640, 330, 790, 430, {
            phase: 1,
            fillAlpha: 0.69
        }));

        const bodyText = [
            'RIGHT hold: move forward',
            'RIGHT tap: burst forward',
            'LEFT tap on ground: brake',
            'LEFT hold: brake, then reverse',
            'DOWN hold: stronger grip',
            '',
            'Uphill sections build fatigue and require repeated effort.',
            'Downhill sections accelerate the wheel and demand more braking.',
            'Free fall can end the run.',
            '',
            'Each mapId has its own online ranking.'
        ].join('\n');

        this.addUi(
            createNacreText(this, 640, 325, bodyText, {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: '22px',
                color: VISUAL_THEME.text.secondary,
                align: 'center',
                lineSpacing: 8
            }, {
                nacre: false
            }).setOrigin(0.5)
        );

        this.createButton(640, 620, 240, 48, 'BACK', () => {
            this.showMainMenu();
        }, 20, false, 5);
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
