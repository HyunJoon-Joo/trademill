import { StartGame } from './game/main';

const root = document.getElementById('app') || document.body;
root.innerHTML = '<div id="game-container"></div>';

StartGame('game-container');