import Phaser from 'phaser';
import {
    DATA_SOURCE_MODE,
    fetchDataJson,
    LEGACY_MAP_PATH,
    MAP_INDEX_PATH
} from '../config/dataConfig';
import { VISUAL_THEME } from '../config/visualTheme';
import {
    createLacquerBackground,
    createNacrePanel,
    createNacreText,
    preloadPlayerSpriteSheets
} from '../utils/visualEffects';
import {
    buildLegacyMapIndex,
    normalizeMapIndex
} from '../utils/mapDataUtils';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    init() {
        this.sceneAlive = true;
        this.loadController = null;
    }

    /*
      플레이어 스프라이트 사용을 켰을 때만 이미지 파일을 불러온다.
      visualTheme.js의 player.sprite.enabled=false 상태에서는
      누락된 파일 때문에 로딩 에러가 생기지 않는다.
    */
    preload() {
        preloadPlayerSpriteSheets(this);
    }

    create() {
        this.cameras.main.setBackgroundColor(VISUAL_THEME.lacquer.base);
        createLacquerBackground(this, {
            seed: 'BootScene',
            depth: VISUAL_THEME.depth.background
        });

        createNacrePanel(this, 640, 352, 620, 174, {
            phase: 1,
            fillAlpha: 0.72
        });

        createNacreText(this, 640, 320, 'LOADING MARKET DATA...', {
            fontFamily: VISUAL_THEME.text.displayFont,
            fontSize: '32px',
            align: 'center'
        }, {
            phase: 1
        }).setOrigin(0.5);

        createNacreText(
            this,
            640,
            373,
            `TRADEMILL / ${DATA_SOURCE_MODE.toUpperCase()} DATA`,
            {
                fontFamily: VISUAL_THEME.text.bodyFont,
                fontSize: '20px',
                color: VISUAL_THEME.text.secondary
            },
            {
                nacre: false
            }
        ).setOrigin(0.5);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.sceneAlive = false;
            this.loadController?.abort();
            this.loadController = null;
        });

        this.loadMapIndex();
    }

    async loadMapIndex() {
        this.loadController?.abort();
        this.loadController = new AbortController();

        try {
            const rawIndex = await fetchDataJson(MAP_INDEX_PATH, {
                signal: this.loadController.signal
            });
            const index = normalizeMapIndex(rawIndex);

            if (!this.sceneAlive) {
                return;
            }

            this.registry.set('mapIndex', index);
            this.registry.set('dataLoadMode', DATA_SOURCE_MODE);
            this.scene.start('MenuScene');
        } catch (indexError) {
            if (!this.sceneAlive) {
                return;
            }

            console.warn('index.json 로드 실패. legacy map으로 fallback합니다.');
            console.warn(indexError);

            await this.loadLegacyMap();
        }
    }

    async loadLegacyMap() {
        try {
            const rawLegacyMap = await fetchDataJson(LEGACY_MAP_PATH, {
                signal: this.loadController?.signal
            });
            const fallbackIndex = buildLegacyMapIndex(
                rawLegacyMap,
                LEGACY_MAP_PATH
            );

            if (!this.sceneAlive) {
                return;
            }

            this.registry.set('mapIndex', fallbackIndex);
            this.registry.set('dataLoadMode', 'legacy');
            this.scene.start('MenuScene');
        } catch (legacyError) {
            if (!this.sceneAlive) {
                return;
            }

            console.error(legacyError);

            createNacrePanel(this, 640, 505, 850, 146, {
                phase: 4,
                fillAlpha: 0.9,
                coreAlpha: 0.88
            });

            createNacreText(
                this,
                640,
                505,
                'FAILED TO LOAD MARKET MAP\nCheck network, GitHub Pages data, or local data mode.',
                {
                    fontFamily: VISUAL_THEME.text.bodyFont,
                    fontSize: '22px',
                    color: VISUAL_THEME.text.danger,
                    align: 'center'
                },
                {
                    nacre: false
                }
            ).setOrigin(0.5);
        }
    }
}
