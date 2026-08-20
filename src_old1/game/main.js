import Phaser from 'phaser';
import { GAME_TUNING } from './config/gameTuning';
import { VISUAL_THEME } from './config/visualTheme';
import { ArchiveScene } from './scenes/ArchiveScene';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';

let game = null;

export function StartGame(parentId) {
    if (game) {
        return game;
    }

    if (!document.getElementById(parentId)) {
        throw new Error(`Phaser parent element를 찾을 수 없습니다: #${parentId}`);
    }

    const config = {
        type: Phaser.AUTO,
        parent: parentId,
        width: 1280,
        height: 720,
        backgroundColor: `#${VISUAL_THEME.lacquer.base.toString(16).padStart(6, '0')}`,

        /* 브라우저 크기가 달라도 1280x720 기준 화면 비율을 유지한다. */
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },

        dom: {
            createContainer: true
        },

        physics: {
            default: 'matter',
            matter: {
                gravity: { y: GAME_TUNING.physics.gravityY },
                debug: GAME_TUNING.physics.debug
            }
        },

        scene: [
            BootScene,
            MenuScene,
            ArchiveScene,
            GameScene,
            ResultScene
        ]
    };

    game = new Phaser.Game(config);
    return game;
}

export function DestroyGame() {
    if (!game) {
        return;
    }

    game.destroy(true);
    game = null;
}
