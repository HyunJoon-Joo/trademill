import { DestroyGame, StartGame } from './game/main';

const root = document.getElementById('app') || document.body;
root.innerHTML = '<div id="game-container"></div>';

StartGame('game-container');

/* Vite 개발 중 hot reload가 중복 Phaser 인스턴스를 남기지 않게 정리한다. */
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        DestroyGame();
    });
}
