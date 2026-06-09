import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { ArchiveScene } from './scenes/ArchiveScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';

let game = null;

export function StartGame(parentId) {
    if (game) {
        return game;
    }

    const config = {
        type: Phaser.AUTO,
        parent: parentId,
        width: 1280,
        height: 720,
        backgroundColor: '#0f172a',

        dom: {
            createContainer: true
        },

        physics: {
            default: 'matter',
            matter: {
                gravity: { y: 1.2 },
                debug: false
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