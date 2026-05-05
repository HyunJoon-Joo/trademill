import Phaser from 'phaser';
import { getDataUrl, MAP_INDEX_PATH, LEGACY_MAP_PATH } from '../config/dataConfig';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    create() {
        this.cameras.main.setBackgroundColor('#0f172a');

        this.add.text(640, 320, 'LOADING MARKET DATA...', {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(640, 365, 'TRADEMILL', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#93c5fd'
        }).setOrigin(0.5);

        this.loadMapIndex();
    }

    async loadMapIndex() {
        try {
            const index = await this.fetchJson(MAP_INDEX_PATH);

            if (!index || !Array.isArray(index.maps) || index.maps.length === 0) {
                throw new Error('index.json에 maps 목록이 없습니다.');
            }

            this.registry.set('mapIndex', index);
            this.registry.set('dataLoadMode', 'index');

            this.scene.start('MenuScene');
        } catch (indexError) {
            console.warn('index.json 로드 실패. legacy map으로 fallback합니다.');
            console.warn(indexError);

            try {
                const legacyMap = await this.fetchJson(LEGACY_MAP_PATH);

                const fallbackIndex = {
                    schemaVersion: 1,
                    updatedAt: new Date().toISOString(),
                    latestMapId: legacyMap.mapId || 'legacy-market-terrain',
                    maps: [
                        {
                            mapId: legacyMap.mapId || 'legacy-market-terrain',
                            date: legacyMap.date || legacyMap.marketDate || 'unknown',
                            marketDate: legacyMap.marketDate || legacyMap.date || 'unknown',
                            symbol: legacyMap.symbol || '^IXIC',
                            label: legacyMap.label || 'Market Map',
                            interval: legacyMap.interval || 'unknown',
                            mode: legacyMap.mode || 'unknown',
                            barsUsed: legacyMap.barsUsed || legacyMap.points?.length || 0,
                            difficulty: legacyMap.difficulty || null,
                            generatedAt: legacyMap.generatedAt || new Date().toISOString(),
                            path: LEGACY_MAP_PATH
                        }
                    ]
                };

                this.registry.set('mapIndex', fallbackIndex);
                this.registry.set('dataLoadMode', 'legacy');

                this.scene.start('MenuScene');
            } catch (legacyError) {
                console.error(legacyError);

                this.add.rectangle(640, 420, 760, 110, 0x000000, 0.5);
                this.add.text(640, 420, 'FAILED TO LOAD MARKET MAP\nCheck GitHub Pages JSON or run fetch script.', {
                    fontFamily: 'Arial',
                    fontSize: '22px',
                    color: '#f87171',
                    align: 'center'
                }).setOrigin(0.5);
            }
        }
    }

    async fetchJson(path) {
        const response = await fetch(getDataUrl(path));

        if (!response.ok) {
            throw new Error(`${path} 로드 실패: ${response.status}`);
        }

        return response.json();
    }
}