import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

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
        physics: {
            default: 'matter',
            matter: {
                gravity: { y: 1.2 },
                debug: false
            }
        },
        scene: [GameScene]
    };

    game = new Phaser.Game(config);
    return game;
}