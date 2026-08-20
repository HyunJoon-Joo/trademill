import Phaser from 'phaser';
import {
    DATA_SOURCE_MODE,
    fetchDataJson,
    LEGACY_MAP_PATH,
    MAP_INDEX_PATH
} from '../config/dataConfig';
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

    create() {
        this.cameras.main.setBackgroundColor('#0f172a');

        this.add.text(640, 320, 'LOADING MARKET DATA...', {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(640, 365, `TRADEMILL / ${DATA_SOURCE_MODE.toUpperCase()} DATA`, {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#93c5fd'
        }).setOrigin(0.5);

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

            this.add.rectangle(640, 420, 820, 130, 0x000000, 0.55);
            this.add.text(
                640,
                420,
                'FAILED TO LOAD MARKET MAP\nCheck network, GitHub Pages data, or local data mode.',
                {
                    fontFamily: 'Arial',
                    fontSize: '22px',
                    color: '#f87171',
                    align: 'center'
                }
            ).setOrigin(0.5);
        }
    }
}
