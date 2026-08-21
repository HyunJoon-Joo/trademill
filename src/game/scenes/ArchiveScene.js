import Phaser from 'phaser';
import { trademillAudio } from '../audio/TrademillAudio';
import { fetchDataJson, MAP_INDEX_PATH } from '../config/dataConfig';
import { VISUAL_THEME } from '../config/visualTheme';
import {
    formatElapsedMs,
    formatRankingReason,
    getLeaderboardResult
} from '../services/rankingService';
import {
    applyNacreTint,
    createLacquerBackground,
    createNacreButton,
    createNacrePanel,
    createNacreText
} from '../utils/visualEffects';
import {
    getMapDate,
    normalizeMapIndex,
    sortMapsOldestToNewest
} from '../utils/mapDataUtils';

export class ArchiveScene extends Phaser.Scene {
    constructor() {
        super('ArchiveScene');
    }

    init() {
        this.mapIndex = null;
        this.maps = [];
        this.selectedIndex = 0;
        this.uiObjects = [];
        this.sceneAlive = true;
        this.renderToken = 0;
        this.refreshController = null;

        this.leftKey = null;
        this.rightKey = null;
        this.enterKey = null;
        this.backKey = null;
    }

    create() {
        this.cameras.main.setBackgroundColor(VISUAL_THEME.lacquer.base);
        createLacquerBackground(this, {
            seed: 'ArchiveScene',
            depth: VISUAL_THEME.depth.background
        });

        this.leftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
        this.rightKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.backKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.sceneAlive = false;
            this.renderToken += 1;
            this.refreshController?.abort();
            this.refreshController = null;
            this.clearUi();
        });

        this.loadLatestIndexAndRender();
    }

    update() {
        if (!this.sceneAlive || this.maps.length === 0) {
            if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
                trademillAudio.playUiClick();
                this.scene.start('MenuScene');
            }
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
            trademillAudio.playUiClick();
            this.selectPreviousMap();
        }

        if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
            trademillAudio.playUiClick();
            this.selectNextMap();
        }

        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            trademillAudio.playUiClick();
            this.playSelectedMap();
        }

        if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
            trademillAudio.playUiClick();
            this.scene.start('MenuScene');
        }
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

    async loadLatestIndexAndRender() {
        const previousSelectedMapId = this.getSelectedMap()?.mapId || '';
        this.clearUi();
        this.addUi(createNacrePanel(this, 640, 330, 520, 112, {
            phase: 2,
            fillAlpha: 0.72
        }));
        this.addUi(
            createNacreText(this, 640, 330, 'UPDATING ARCHIVE...', {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '25px'
            }, {
                phase: 2
            }).setOrigin(0.5)
        );

        this.refreshController?.abort();
        this.refreshController = new AbortController();

        try {
            const rawIndex = await fetchDataJson(MAP_INDEX_PATH, {
                signal: this.refreshController.signal
            });
            this.mapIndex = normalizeMapIndex(rawIndex);
            this.registry.set('mapIndex', this.mapIndex);
        } catch (error) {
            console.warn('Archive 최신 인덱스 갱신 실패. Registry 데이터를 사용합니다.', error);
            this.mapIndex = this.registry.get('mapIndex') || null;
        }

        if (!this.sceneAlive) {
            return;
        }

        this.maps = sortMapsOldestToNewest(this.mapIndex?.maps);

        if (this.maps.length > 0) {
            const selectedByPrevious = this.maps.findIndex(
                (map) => map.mapId === previousSelectedMapId
            );
            const selectedByLatest = this.maps.findIndex(
                (map) => map.mapId === this.mapIndex?.latestMapId
            );

            this.selectedIndex = selectedByPrevious >= 0
                ? selectedByPrevious
                : selectedByLatest >= 0
                    ? selectedByLatest
                    : this.maps.length - 1;
        }

        await this.renderArchive();
    }

    async renderArchive() {
        const token = ++this.renderToken;
        this.clearUi();

        this.addUi(
            createNacreText(this, 640, 48, 'MARKET ARCHIVE', {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '42px',
                fontStyle: 'bold'
            }, {
                phase: 1
            }).setOrigin(0.5)
        );

        this.addUi(
            createNacreText(
                this,
                640,
                88,
                'KOSPI / 1-MINUTE MAPS · LEFT OLDER / RIGHT NEWER · EACH DATE HAS ITS OWN RANKING',
                {
                    fontFamily: VISUAL_THEME.text.bodyFont,
                    fontSize: '17px',
                    color: VISUAL_THEME.text.secondary
                },
                {
                    nacre: false
                }
            ).setOrigin(0.5)
        );

        if (this.maps.length === 0) {
            this.addUi(
                createNacreText(this, 640, 330, 'No market maps found.', {
                    fontFamily: VISUAL_THEME.text.bodyFont,
                    fontSize: '28px',
                    color: VISUAL_THEME.text.danger
                }, {
                    nacre: false
                }).setOrigin(0.5)
            );

            this.createButton(640, 620, 220, 48, 'BACK', () => {
                this.scene.start('MenuScene');
            }, 20, 5);
            return;
        }

        this.drawMapCarousel();

        const map = this.getSelectedMap();
        const rankingResult = await getLeaderboardResult(map.mapId);

        if (!this.sceneAlive || token !== this.renderToken) {
            return;
        }

        this.drawSelectedMapInfo(map);
        this.drawRankingPanel(rankingResult);
        this.drawBottomButtons();
    }

    drawMapCarousel() {
        const centerX = 640;
        const y = 162;

        for (const offset of [-2, -1, 0, 1, 2]) {
            const index = this.selectedIndex + offset;

            if (index < 0 || index >= this.maps.length) {
                continue;
            }

            const map = this.maps[index];
            const selected = offset === 0;
            const x = centerX + offset * 210;
            const width = selected ? 190 : 170;
            const height = selected ? 86 : 70;
            const container = createNacrePanel(this, x, y, width, height, {
                phase: index,
                fillAlpha: selected ? 0.92 : 0.68,
                glowAlpha: selected ? 0.26 : 0.05,
                coreAlpha: selected ? 0.98 : 0.34,
                glowWidth: selected ? 10 : 5,
                coreWidth: selected ? 2.2 : 1.2
            });
            const hitArea = this.add.rectangle(x, y, width, height, 0xffffff, 0.001)
                .setInteractive({ useHandCursor: true });

            const dateText = createNacreText(this, x, y, getMapDate(map, map), {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: selected ? '21px' : '17px',
                color: VISUAL_THEME.text.primary
            }, {
                nacre: selected,
                phase: index
            }).setOrigin(0.5);

            hitArea.on('pointerover', () => {
                if (!selected) {
                    applyNacreTint(dateText, index + 2);
                }
            });
            hitArea.on('pointerdown', () => {
                this.selectedIndex = index;
                this.renderArchive();
            });

            this.addUi(container);
            this.addUi(hitArea);
            this.addUi(dateText);
        }

        this.createSmallButton(116, y, 58, 48, '<', () => this.selectPreviousMap(), 6);
        this.createSmallButton(1164, y, 58, 48, '>', () => this.selectNextMap(), 2);
    }

    drawSelectedMapInfo(map) {
        this.addUi(
            createNacreText(this, 640, 252, getMapDate(map, map), {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '28px',
                color: VISUAL_THEME.text.primary
            }, {
                phase: this.selectedIndex + 1
            }).setOrigin(0.5)
        );
    }

    drawRankingPanel(rankingResult) {
        this.addUi(createNacrePanel(this, 640, 445, 800, 290, {
            phase: 3,
            fillAlpha: 0.78,
            glowAlpha: 0.09,
            coreAlpha: 0.52
        }));

        this.addUi(
            createNacreText(this, 640, 318, 'RANKING 1-10', {
                fontFamily: VISUAL_THEME.text.displayFont,
                fontSize: '24px'
            }, {
                phase: 3
            }).setOrigin(0.5)
        );

        if (!rankingResult.ok) {
            this.addUi(
                createNacreText(
                    this,
                    640,
                    442,
                    `Ranking unavailable.\n${rankingResult.error}`,
                    {
                        fontFamily: VISUAL_THEME.text.bodyFont,
                        fontSize: '19px',
                        color: VISUAL_THEME.text.danger,
                        align: 'center',
                        wordWrap: { width: 700 }
                    },
                    {
                        nacre: false
                    }
                ).setOrigin(0.5)
            );
            return;
        }

        if (rankingResult.leaderboard.length === 0) {
            this.addUi(
                createNacreText(
                    this,
                    640,
                    442,
                    'No ranking yet.\nPlay this map and leave a record.',
                    {
                        fontFamily: VISUAL_THEME.text.bodyFont,
                        fontSize: '21px',
                        color: VISUAL_THEME.text.muted,
                        align: 'center',
                        lineSpacing: 8
                    },
                    {
                        nacre: false
                    }
                ).setOrigin(0.5)
            );
            return;
        }

        /*
          ResultScene과 동일하게 10줄을 하나의 Text로 묶지 않는다.
          고정 간격으로 각각 그려 마지막 10위 줄이 패널 테두리에 걸리지 않게 한다.
        */
        const firstRowY = 350;
        const rowStep = 23;

        /*
          랭킹 한 줄을 긴 문자열 하나로 만들지 않고, 각 값을 독립된 컬럼으로 그린다.
          이렇게 해야 이름 길이와 폰트 메트릭에 관계없이 NAME / DIST / TIME / RESULT 사이의
          실제 화면 간격이 항상 고정된다.

          panel: x 240 ~ 1040
          rank   : x 300
          name   : x 360
          dist   : x 610
          time   : x 780
          result : x 930
        */
        const columns = {
            rank: 300,
            name: 360,
            distance: 610,
            time: 780,
            reason: 930
        };

        const rowTextStyle = {
            fontFamily: VISUAL_THEME.text.monoFont,
            fontSize: '18px',
            color: VISUAL_THEME.text.primary,
            align: 'left'
        };

        const addRankingCell = (x, y, text) => {
            this.addUi(
                createNacreText(this, x, y, text, rowTextStyle, {
                    nacre: false
                }).setOrigin(0, 0.5)
            );
        };

        for (let index = 0; index < 10; index += 1) {
            const entry = rankingResult.leaderboard[index];
            const y = firstRowY + index * rowStep;
            const rankText = `${String(index + 1).padStart(2, ' ')}.`;

            if (!entry) {
                addRankingCell(columns.rank, y, rankText);
                addRankingCell(columns.name, y, '---');
                addRankingCell(columns.distance, y, 'D  -');
                addRankingCell(columns.time, y, 'T --:--.-');
                addRankingCell(columns.reason, y, '---');
                continue;
            }

            const nameText = String(entry.playerName || 'YOU').slice(0, 12);
            const distanceText = `D ${String(entry.bestDistance || 0).padStart(5, ' ')}`;
            const elapsedText = entry.bestElapsedMs === null
                ? '--:--.-'
                : formatElapsedMs(entry.bestElapsedMs);
            const timeText = `T ${String(elapsedText).padStart(7, ' ')}`;
            const reasonText = formatRankingReason(
                entry.bestReason,
                entry.bestFinished
            );

            addRankingCell(columns.rank, y, rankText);
            addRankingCell(columns.name, y, nameText);
            addRankingCell(columns.distance, y, distanceText);
            addRankingCell(columns.time, y, timeText);
            addRankingCell(columns.reason, y, reasonText);
        }
    }

    drawBottomButtons() {
        this.createButton(520, 650, 280, 50, 'PLAY THIS MAP', () => {
            this.playSelectedMap();
        }, 20, 0);

        this.createButton(800, 650, 220, 50, 'BACK', () => {
            this.scene.start('MenuScene');
        }, 20, 4);
    }

    getSelectedMap() {
        if (this.maps.length === 0) {
            return null;
        }

        const safeIndex = Phaser.Math.Clamp(
            this.selectedIndex,
            0,
            this.maps.length - 1
        );

        return this.maps[safeIndex];
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

        if (map) {
            this.scene.start('GameScene', { mapMeta: map });
        }
    }

    createButton(x, y, width, height, label, onClick, fontSize = 20, phase = 0) {
        const button = createNacreButton(this, {
            x,
            y,
            width,
            height,
            label,
            onClick,
            fontSize,
            phase
        });

        this.addUi(button);
        return button;
    }

    createSmallButton(x, y, width, height, label, onClick, phase = 0) {
        return this.createButton(x, y, width, height, label, onClick, 24, phase);
    }
}
