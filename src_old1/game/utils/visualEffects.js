import Phaser from 'phaser';
import { VISUAL_THEME } from '../config/visualTheme';

function clamp01(value) {
    return Phaser.Math.Clamp(Number(value) || 0, 0, 1);
}

function createSeededRandom(seedText = 'TRADEMILL') {
    let seed = 2166136261;

    for (const char of String(seedText)) {
        seed ^= char.charCodeAt(0);
        seed = Math.imul(seed, 16777619);
    }

    return () => {
        seed += 0x6d2b79f5;
        let value = seed;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function toCssColor(color) {
    return `#${Number(color || 0).toString(16).padStart(6, '0')}`;
}

function wrapPalettePhase(phase, paletteLength) {
    const length = Math.max(1, paletteLength);
    return ((Number(phase) || 0) % length + length) % length;
}

function splitColor(color) {
    const value = Number(color) || 0;

    return {
        r: (value >> 16) & 0xff,
        g: (value >> 8) & 0xff,
        b: value & 0xff
    };
}

function joinColor(r, g, b) {
    return (
        (Phaser.Math.Clamp(Math.round(r), 0, 255) << 16) |
        (Phaser.Math.Clamp(Math.round(g), 0, 255) << 8) |
        Phaser.Math.Clamp(Math.round(b), 0, 255)
    );
}

/*
  팔레트 색을 단계적으로 고르는 대신 인접한 두 색 사이를 연속 보간한다.

  예:
  phase=2.0  -> palette[2]
  phase=2.5  -> palette[2]와 palette[3]의 정확한 중간색
  phase=2.99 -> palette[3]에 거의 도달한 색

  이 함수 덕분에 모든 자개가 "색이 딱딱 바뀌는 네온"이 아니라
  시간에 따라 은은하게 변하는 자개 반사광처럼 보인다.
*/
export function getNacreColor(phase = 0) {
    const palette = VISUAL_THEME.nacre.palette;

    if (!Array.isArray(palette) || palette.length === 0) {
        return 0xffffff;
    }

    if (palette.length === 1) {
        return palette[0];
    }

    const wrapped = wrapPalettePhase(phase, palette.length);
    const indexA = Math.floor(wrapped);
    const indexB = (indexA + 1) % palette.length;
    const ratio = wrapped - indexA;
    const colorA = splitColor(palette[indexA]);
    const colorB = splitColor(palette[indexB]);

    return joinColor(
        Phaser.Math.Linear(colorA.r, colorB.r, ratio),
        Phaser.Math.Linear(colorA.g, colorB.g, ratio),
        Phaser.Math.Linear(colorA.b, colorB.b, ratio)
    );
}

export function getNacrePhase(worldX = 0, timeMs = 0, offset = 0) {
    const nacre = VISUAL_THEME.nacre;

    return (
        Number(worldX || 0) * nacre.worldPhaseScale +
        Number(timeMs || 0) * nacre.timePhaseSpeed +
        Number(offset || 0)
    );
}

function getUiNacrePhase(timeMs = 0, offset = 0) {
    const nacre = VISUAL_THEME.nacre;

    return (
        Number(timeMs || 0) *
            nacre.timePhaseSpeed *
            nacre.uiTimeMultiplier +
        Number(offset || 0)
    );
}

function getTerrainNacrePhase(pathDistance = 0, timeMs = 0, offset = 0) {
    const nacre = VISUAL_THEME.nacre;

    return (
        Number(pathDistance || 0) * nacre.terrainPathPhaseScale +
        Number(timeMs || 0) * nacre.timePhaseSpeed +
        Number(offset || 0)
    );
}

function getNacreShimmer(pathDistance = 0, timeMs = 0, phaseOffset = 0) {
    const nacre = VISUAL_THEME.nacre;
    const wave = Math.sin(
        Number(pathDistance || 0) * nacre.shimmerSpatialScale +
        Number(timeMs || 0) * nacre.shimmerTimeSpeed +
        Number(phaseOffset || 0)
    );

    return 1 - nacre.shimmerAmount * 0.5 + wave * nacre.shimmerAmount * 0.5;
}

export function applyNacreTint(gameObject, phase = 0) {
    if (!gameObject?.setTint) {
        return gameObject;
    }

    /*
      Phaser Text/Sprite의 네 모서리에 서로 다른 자개색을 넣는다.
      같은 텍스트 안에서도 단색이 아니라 청록·보라·분홍·금빛이 섞이며,
      phase가 계속 움직이므로 모서리 색도 부드럽게 순환한다.
    */
    gameObject.setTint(
        getNacreColor(phase),
        getNacreColor(phase + 1.75),
        getNacreColor(phase + 5.25),
        getNacreColor(phase + 3.5)
    );

    return gameObject;
}

/*
  한 Scene 안의 모든 자개 오브젝트를 하나의 update listener로 관리한다.

  각 Text/Button/Panel마다 scene.events.on('update')를 따로 등록하면
  메뉴를 여러 번 열고 닫을 때 listener가 많아질 수 있다.
  아래 관리자는 Scene당 listener 하나만 만들고, 살아 있는 대상만 갱신한다.
*/
function getNacreAnimationManager(scene) {
    if (scene.__trademillNacreAnimationManager) {
        return scene.__trademillNacreAnimationManager;
    }

    const entries = new Set();

    const onUpdate = (time) => {
        for (const entry of [...entries]) {
            if (
                !entry.target ||
                entry.target.scene !== scene ||
                !entry.target.active
            ) {
                entries.delete(entry);
                continue;
            }

            entry.update(Number(time) || scene.time.now || 0);
        }
    };

    const cleanup = () => {
        scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
        entries.clear();

        if (scene.__trademillNacreAnimationManager) {
            delete scene.__trademillNacreAnimationManager;
        }
    };

    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    const manager = {
        add(target, update) {
            const entry = { target, update };
            entries.add(entry);

            target.once?.(Phaser.GameObjects.Events.DESTROY, () => {
                entries.delete(entry);
            });

            return entry;
        }
    };

    scene.__trademillNacreAnimationManager = manager;
    return manager;
}

function registerNacreAnimation(scene, target, update) {
    if (!scene || !target || typeof update !== 'function') {
        return;
    }

    getNacreAnimationManager(scene).add(target, update);
}

export function createNacreText(
    scene,
    x,
    y,
    text,
    style = {},
    options = {}
) {
    const themeText = VISUAL_THEME.text;
    const nacreEnabled = options.nacre !== false;
    const basePhase = Number(options.phase || 0);

    const gameObject = scene.add.text(x, y, text, {
        fontFamily: themeText.bodyFont,
        color: themeText.primary,
        stroke: '#000000',
        strokeThickness: nacreEnabled ? 3 : 0,
        shadow: nacreEnabled
            ? {
                offsetX: 0,
                offsetY: 0,
                color: '#78eaff',
                blur: 8,
                stroke: true,
                fill: false
            }
            : undefined,
        ...style
    });

    if (nacreEnabled) {
        const animate = options.animate !== false;

        const updateTint = (timeMs) => {
            const phase =
                getUiNacrePhase(timeMs, basePhase) +
                gameObject.x * 0.0021 +
                gameObject.y * 0.0011;

            applyNacreTint(gameObject, phase);
        };

        updateTint(scene.time.now || 0);

        if (animate) {
            registerNacreAnimation(scene, gameObject, updateTint);
        }
    }

    return gameObject;
}

function drawSegmentedLine(
    graphics,
    startX,
    startY,
    endX,
    endY,
    phase,
    lineWidth,
    alpha,
    options = {}
) {
    const nacre = VISUAL_THEME.nacre;
    const length = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const segmentLength =
        options.segmentLength ?? nacre.borderColorSegmentLength;
    const phaseStep = options.phaseStep ?? nacre.borderPhaseStep;
    const segmentCount = Math.max(1, Math.ceil(length / segmentLength));

    for (let index = 0; index < segmentCount; index += 1) {
        const t0 = index / segmentCount;

        /*
          아주 미세하게 다음 조각 쪽으로 겹쳐 그린다.
          WebGL의 선 끝 모양 때문에 색 조각 사이에 검은 실금이 생기는 것을 막는다.
        */
        const t1 = Math.min(1, (index + 1.025) / segmentCount);
        const middleT = (t0 + t1) * 0.5;
        const x0 = Phaser.Math.Linear(startX, endX, t0);
        const y0 = Phaser.Math.Linear(startY, endY, t0);
        const x1 = Phaser.Math.Linear(startX, endX, t1);
        const y1 = Phaser.Math.Linear(startY, endY, t1);
        const color = getNacreColor(phase + middleT * segmentCount * phaseStep);

        graphics.lineStyle(lineWidth, color, alpha);
        graphics.lineBetween(x0, y0, x1, y1);
    }
}

export function drawNacreRectBorder(
    graphics,
    width,
    height,
    phase = 0,
    options = {}
) {
    const nacre = VISUAL_THEME.nacre;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const glowWidth = options.glowWidth ?? nacre.buttonGlowWidth;
    const coreWidth = options.coreWidth ?? nacre.buttonCoreWidth;
    const glowAlpha = options.glowAlpha ?? nacre.buttonGlowAlpha;
    const coreAlpha = options.coreAlpha ?? nacre.buttonCoreAlpha;

    const edges = [
        [-halfWidth, -halfHeight, halfWidth, -halfHeight],
        [halfWidth, -halfHeight, halfWidth, halfHeight],
        [halfWidth, halfHeight, -halfWidth, halfHeight],
        [-halfWidth, halfHeight, -halfWidth, -halfHeight]
    ];

    /*
      한 변을 한 색으로 칠하지 않고 다시 짧게 분할한다.
      phase는 시간에 따라 움직이므로 각 변 안의 여러 색 띠가 천천히 흐른다.
    */
    for (let index = 0; index < edges.length; index += 1) {
        const [x0, y0, x1, y1] = edges[index];

        drawSegmentedLine(
            graphics,
            x0,
            y0,
            x1,
            y1,
            phase + index * 1.35,
            glowWidth,
            glowAlpha
        );
    }

    for (let index = 0; index < edges.length; index += 1) {
        const [x0, y0, x1, y1] = edges[index];

        drawSegmentedLine(
            graphics,
            x0,
            y0,
            x1,
            y1,
            phase + index * 1.35 + 0.22,
            coreWidth,
            coreAlpha
        );
    }
}

export function createNacrePanel(
    scene,
    x,
    y,
    width,
    height,
    options = {}
) {
    const container = scene.add.container(x, y);
    const fill = scene.add.rectangle(
        0,
        0,
        width,
        height,
        options.fillColor ?? VISUAL_THEME.lacquer.panel,
        options.fillAlpha ?? 0.8
    );
    const border = scene.add.graphics();
    const basePhase = Number(options.phase || 0);

    const redrawBorder = (timeMs) => {
        border.clear();

        drawNacreRectBorder(
            border,
            width,
            height,
            getUiNacrePhase(timeMs, basePhase),
            {
                glowAlpha:
                    options.glowAlpha ?? VISUAL_THEME.nacre.panelGlowAlpha,
                coreAlpha: options.coreAlpha ?? 0.74,
                glowWidth: options.glowWidth ?? 7,
                coreWidth: options.coreWidth ?? 1.6
            }
        );
    };

    redrawBorder(scene.time.now || 0);
    container.add([fill, border]);
    registerNacreAnimation(scene, container, redrawBorder);

    return container;
}

export function createNacreButton(
    scene,
    {
        x,
        y,
        width,
        height,
        label,
        onClick,
        fontSize = 20,
        disabled = false,
        phase = 0
    }
) {
    const container = scene.add.container(x, y);
    const fill = scene.add.rectangle(
        0,
        0,
        width,
        height,
        disabled ? 0x111416 : VISUAL_THEME.lacquer.panel,
        disabled ? 0.74 : 0.88
    );
    const border = scene.add.graphics();
    const text = createNacreText(
        scene,
        0,
        0,
        label,
        {
            fontFamily: VISUAL_THEME.text.displayFont,
            fontSize: `${fontSize}px`,
            color: disabled ? VISUAL_THEME.text.muted : VISUAL_THEME.text.primary,
            align: 'center',
            wordWrap: { width: width - 28 }
        },
        {
            nacre: !disabled,
            phase
        }
    ).setOrigin(0.5);

    let hovered = false;

    const redrawBorder = (timeMs) => {
        border.clear();

        drawNacreRectBorder(
            border,
            width,
            height,
            getUiNacrePhase(
                timeMs,
                Number(phase || 0) + (hovered ? 1.8 : 0)
            ),
            {
                glowAlpha: disabled
                    ? 0.025
                    : hovered
                        ? 0.32
                        : VISUAL_THEME.nacre.buttonGlowAlpha,
                coreAlpha: disabled
                    ? 0.18
                    : hovered
                        ? 1
                        : VISUAL_THEME.nacre.buttonCoreAlpha,
                glowWidth: hovered
                    ? VISUAL_THEME.nacre.buttonGlowWidth + 3
                    : VISUAL_THEME.nacre.buttonGlowWidth
            }
        );
    };

    redrawBorder(scene.time.now || 0);
    container.add([fill, border, text]);
    registerNacreAnimation(scene, container, redrawBorder);

    if (!disabled) {
        fill.setInteractive({ useHandCursor: true });

        fill.on('pointerover', () => {
            hovered = true;
            fill.setFillStyle(0x101316, 0.96);
        });

        fill.on('pointerout', () => {
            hovered = false;
            fill.setFillStyle(VISUAL_THEME.lacquer.panel, 0.88);
        });

        fill.on('pointerdown', () => {
            onClick?.();
        });
    }

    return container;
}

export function styleNacreInput(input) {
    const palette = VISUAL_THEME.nacre.palette.map(toCssColor);

    Object.assign(input.style, {
        boxSizing: 'border-box',
        color: VISUAL_THEME.text.primary,
        caretColor: palette[0],
        background:
            `linear-gradient(${toCssColor(VISUAL_THEME.lacquer.panelStrong)}, ${toCssColor(VISUAL_THEME.lacquer.panelStrong)}) padding-box, ` +
            `linear-gradient(90deg, ${palette.join(', ')}, ${palette[0]}) border-box`,
        backgroundSize: '100% 100%, 300% 100%',
        backgroundPosition: '0 0, 0% 50%',
        border: '2px solid transparent',
        borderRadius: '2px',
        outline: 'none',
        boxShadow:
            `0 0 12px ${palette[0]}38, ` +
            `0 0 18px ${palette[3]}20`
    });

    /*
      DOM input은 Phaser Graphics가 아니므로 Web Animations API로
      자개 테두리의 background-position을 천천히 이동시킨다.
    */
    const animation = input.animate?.(
        [
            { backgroundPosition: '0 0, 0% 50%' },
            { backgroundPosition: '0 0, 150% 50%' },
            { backgroundPosition: '0 0, 300% 50%' }
        ],
        {
            duration: 32000,
            iterations: Infinity,
            easing: 'linear'
        }
    );

    input.addEventListener('focus', () => {
        input.style.boxShadow =
            `0 0 14px ${palette[0]}70, ` +
            `0 0 24px ${palette[3]}45`;

        if (animation) {
            animation.playbackRate = 1.35;
        }
    });

    input.addEventListener('blur', () => {
        input.style.boxShadow =
            `0 0 12px ${palette[0]}38, ` +
            `0 0 18px ${palette[3]}20`;

        if (animation) {
            animation.playbackRate = 1;
        }
    });
}

export function createLacquerBackground(scene, options = {}) {
    const theme = VISUAL_THEME;
    const lacquer = theme.lacquer;
    const width = options.width || theme.canvas.width;
    const height = options.height || theme.canvas.height;
    const depth = options.depth ?? theme.depth.background;
    const seed = options.seed || scene.scene.key || 'TRADEMILL';
    const random = createSeededRandom(seed);
    const objects = [];

    const base = scene.add.rectangle(0, 0, width, height, lacquer.base)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(depth);
    const lower = scene.add.rectangle(0, height * 0.63, width, height * 0.37, lacquer.lower, 0.86)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(depth + 1);

    objects.push(base, lower);

    const grain = scene.add.graphics()
        .setScrollFactor(0)
        .setDepth(depth + 2);

    for (let index = 0; index < lacquer.grainCount; index += 1) {
        const x = random() * width;
        const y = random() * height;
        const radius = Phaser.Math.Linear(
            lacquer.grainRadiusMin,
            lacquer.grainRadiusMax,
            random()
        );
        const alpha = Phaser.Math.Linear(
            lacquer.grainAlphaMin,
            lacquer.grainAlphaMax,
            random()
        );

        grain.fillStyle(lacquer.grainColor, alpha);
        grain.fillCircle(x, y, radius);
    }

    objects.push(grain);

    for (let index = 0; index < lacquer.sheenCount; index += 1) {
        const sheen = scene.add.graphics()
            .setScrollFactor(0)
            .setDepth(depth + 3)
            .setBlendMode(Phaser.BlendModes.ADD);
        const color = lacquer.sheenColors[index % lacquer.sheenColors.length];
        const alpha = Phaser.Math.Linear(
            lacquer.sheenAlphaMin,
            lacquer.sheenAlphaMax,
            random()
        );
        const ellipseWidth = Phaser.Math.Linear(260, 720, random());
        const ellipseHeight = Phaser.Math.Linear(70, 210, random());

        sheen.fillStyle(color, alpha);
        sheen.fillEllipse(0, 0, ellipseWidth, ellipseHeight);
        sheen.setPosition(
            Phaser.Math.Linear(-100, width + 100, random()),
            Phaser.Math.Linear(40, height - 40, random())
        );
        sheen.setRotation(Phaser.Math.Linear(-0.45, 0.45, random()));
        sheen.setAlpha(Phaser.Math.Linear(0.6, 1, random()));

        scene.tweens.add({
            targets: sheen,
            x: sheen.x + Phaser.Math.Linear(-180, 180, random()),
            y: sheen.y + Phaser.Math.Linear(-90, 90, random()),
            rotation: sheen.rotation + Phaser.Math.Linear(-0.12, 0.12, random()),
            alpha: Phaser.Math.Linear(0.35, 0.85, random()),
            duration: Phaser.Math.Linear(
                lacquer.sheenDurationMinMs,
                lacquer.sheenDurationMaxMs,
                random()
            ),
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        objects.push(sheen);
    }

    const vignette = scene.add.graphics()
        .setScrollFactor(0)
        .setDepth(depth + 4);
    const vignetteAlpha = clamp01(lacquer.vignetteAlpha);

    vignette.fillStyle(0x000000, vignetteAlpha);
    vignette.fillRect(0, 0, width, 28);
    vignette.fillRect(0, height - 36, width, 36);
    vignette.fillRect(0, 0, 32, height);
    vignette.fillRect(width - 32, 0, 32, height);

    objects.push(vignette);
    return objects;
}

function getPointPathDistance(point, fallbackDistance = 0) {
    const explicit = Number(point?.pathDistance);

    if (Number.isFinite(explicit)) {
        return explicit;
    }

    /*
      pathDistance가 없는 오래된 데이터도 색이 카메라 이동 때마다 점프하지 않도록
      월드 좌표를 이용한 안정적인 대체값을 만든다.
    */
    const x = Number(point?.x) || 0;
    const y = Number(point?.y) || 0;

    return Math.max(
        Number(fallbackDistance) || 0,
        x + Math.abs(y) * 0.16
    );
}

function drawNacrePolylinePass(
    graphics,
    points,
    timeMs,
    {
        lineWidth,
        alpha,
        phaseOffset,
        phaseShift = 0,
        segmentLength
    }
) {
    let fallbackPathDistance = getPointPathDistance(points[0], 0);

    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const pointA = points[pointIndex - 1];
        const pointB = points[pointIndex];
        const physicalLength = Phaser.Math.Distance.Between(
            pointA.x,
            pointA.y,
            pointB.x,
            pointB.y
        );

        if (!Number.isFinite(physicalLength) || physicalLength <= 0) {
            continue;
        }

        const pathA = getPointPathDistance(pointA, fallbackPathDistance);
        const pathB = getPointPathDistance(
            pointB,
            pathA + physicalLength
        );
        const microCount = Math.max(
            1,
            Math.ceil(physicalLength / segmentLength)
        );

        /*
          하나의 원본 데이터 선분을 다시 18px 안팎의 작은 색 조각으로 나눈다.
          따라서 오르막 한 줄, 정상 이후 한 줄, 내리막 한 줄도 각각 단색이 아니라
          여러 자개색이 섞인 띠로 보인다.
        */
        for (let microIndex = 0; microIndex < microCount; microIndex += 1) {
            const t0 = microIndex / microCount;
            const t1 = Math.min(1, (microIndex + 1.035) / microCount);
            const middleT = (t0 + t1) * 0.5;
            const x0 = Phaser.Math.Linear(pointA.x, pointB.x, t0);
            const y0 = Phaser.Math.Linear(pointA.y, pointB.y, t0);
            const x1 = Phaser.Math.Linear(pointA.x, pointB.x, t1);
            const y1 = Phaser.Math.Linear(pointA.y, pointB.y, t1);
            const pathAtMiddle = Phaser.Math.Linear(pathA, pathB, middleT);
            const phase = getTerrainNacrePhase(
                pathAtMiddle,
                timeMs,
                phaseOffset + phaseShift
            );
            const shimmer = getNacreShimmer(
                pathAtMiddle,
                timeMs,
                phaseShift
            );
            const color = getNacreColor(phase);

            graphics.lineStyle(
                lineWidth,
                color,
                clamp01(alpha * shimmer)
            );
            graphics.lineBetween(x0, y0, x1, y1);
        }

        fallbackPathDistance = pathB;
    }
}

export function drawNacrePolyline(
    graphics,
    points,
    timeMs,
    options = {}
) {
    if (!graphics || !Array.isArray(points) || points.length < 2) {
        return;
    }

    const nacre = VISUAL_THEME.nacre;
    const phaseOffset = Number(options.phaseOffset || 0);
    const glowWidth = options.glowWidth ?? nacre.terrainGlowWidth;
    const coreWidth = options.coreWidth ?? nacre.terrainCoreWidth;
    const highlightWidth =
        options.highlightWidth ?? nacre.terrainHighlightWidth;
    const glowAlpha = options.glowAlpha ?? nacre.terrainGlowAlpha;
    const coreAlpha = options.coreAlpha ?? nacre.terrainCoreAlpha;
    const highlightAlpha =
        options.highlightAlpha ?? nacre.terrainHighlightAlpha;
    const segmentLength =
        options.segmentLength ?? nacre.terrainColorSegmentLength;

    /*
      가장 바깥 검은 받침선은 연속된 원본 표면 그대로 그린다.
      자개 glow가 밝아도 실제 접촉선의 실루엣이 흐려지지 않는다.
    */
    graphics.lineStyle(glowWidth + 4, 0x000000, 0.82);

    for (let index = 1; index < points.length; index += 1) {
        const pointA = points[index - 1];
        const pointB = points[index];

        graphics.lineBetween(pointA.x, pointA.y, pointB.x, pointB.y);
    }

    /*
      세 패스가 같은 색 배치를 완전히 겹치지 않도록 phaseShift를 다르게 준다.
      넓은 glow, 본선, 미세 하이라이트에 서로 다른 반사색이 겹치면서
      단순 무지개 선이 아니라 자개 층처럼 보인다.
    */
    drawNacrePolylinePass(graphics, points, timeMs, {
        lineWidth: glowWidth,
        alpha: glowAlpha,
        phaseOffset,
        phaseShift: -0.42,
        segmentLength: segmentLength * 1.18
    });

    drawNacrePolylinePass(graphics, points, timeMs, {
        lineWidth: coreWidth,
        alpha: coreAlpha,
        phaseOffset,
        phaseShift: 0,
        segmentLength
    });

    drawNacrePolylinePass(graphics, points, timeMs, {
        lineWidth: highlightWidth,
        alpha: highlightAlpha,
        phaseOffset,
        phaseShift: 1.85,
        segmentLength: segmentLength * 0.78
    });
}

export function drawNacreVerticalLine(
    graphics,
    x,
    top,
    bottom,
    timeMs,
    phaseOffset = 0
) {
    const nacre = VISUAL_THEME.nacre;
    const animatedPhase = getNacrePhase(x, timeMs, phaseOffset);

    drawSegmentedLine(
        graphics,
        x,
        top,
        x,
        bottom,
        animatedPhase - 0.35,
        12,
        0.17,
        {
            segmentLength: nacre.terrainColorSegmentLength * 1.2,
            phaseStep: 0.8
        }
    );

    drawSegmentedLine(
        graphics,
        x,
        top,
        x,
        bottom,
        animatedPhase,
        4,
        0.96,
        {
            segmentLength: nacre.terrainColorSegmentLength,
            phaseStep: 0.8
        }
    );
}

function strokeArc(graphics, x, y, radius, startAngle, endAngle, color, width, alpha) {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.arc(x, y, radius, startAngle, endAngle, false);
    graphics.strokePath();
}

export function drawNacreWheel(
    graphics,
    x,
    y,
    radius,
    rotation,
    timeMs
) {
    const nacre = VISUAL_THEME.nacre;
    const arcCount = Math.max(8, Math.floor(nacre.wheelArcCount || 12));
    const arcSize = (Math.PI * 2) / arcCount;
    const phase =
        x * nacre.worldPhaseScale +
        timeMs *
            nacre.timePhaseSpeed *
            nacre.wheelTimeMultiplier +
        rotation * 0.28;

    graphics.lineStyle(nacre.wheelGlowWidth + 4, 0x000000, 0.86);
    graphics.strokeCircle(x, y, radius);

    for (let index = 0; index < arcCount; index += 1) {
        const start = rotation + index * arcSize;
        const end = start + arcSize + 0.035;
        const color = getNacreColor(phase + index * 0.72);
        const shimmer = getNacreShimmer(
            index * radius * 0.35,
            timeMs,
            index * 0.6
        );

        strokeArc(
            graphics,
            x,
            y,
            radius,
            start,
            end,
            color,
            nacre.wheelGlowWidth,
            clamp01(nacre.wheelGlowAlpha * shimmer)
        );
    }

    for (let index = 0; index < arcCount; index += 1) {
        const start = rotation + index * arcSize;
        const end = start + arcSize + 0.025;
        const color = getNacreColor(phase + index * 0.72 + 0.24);
        const shimmer = getNacreShimmer(
            index * radius * 0.35,
            timeMs,
            index * 0.6 + 1.2
        );

        strokeArc(
            graphics,
            x,
            y,
            radius,
            start,
            end,
            color,
            nacre.wheelCoreWidth,
            clamp01(nacre.wheelCoreAlpha * shimmer)
        );
    }

    for (let index = 0; index < arcCount; index += 2) {
        const start = rotation + index * arcSize + 0.055;
        const end = start + arcSize * 0.62;
        const color = getNacreColor(phase + index * 0.72 + 2.1);

        strokeArc(
            graphics,
            x,
            y,
            radius,
            start,
            end,
            color,
            nacre.wheelHighlightWidth,
            0.84
        );
    }
}

const proceduralHumanMemory = new WeakMap();

function smoothValue(current, target, rate, deltaSeconds) {
    const amount = 1 - Math.exp(-Math.max(0, rate) * deltaSeconds);
    return Phaser.Math.Linear(current, target, amount);
}

function pointFromAngle(origin, angle, length) {
    return {
        x: origin.x + Math.cos(angle) * length,
        y: origin.y + Math.sin(angle) * length
    };
}

function mixPoint(pointA, pointB, amount) {
    const ratio = clamp01(amount);

    return {
        x: Phaser.Math.Linear(pointA.x, pointB.x, ratio),
        y: Phaser.Math.Linear(pointA.y, pointB.y, ratio)
    };
}

/*
  두 관절 길이를 가진 팔/다리의 중간 관절 위치를 계산한다.

  시작점(root), 끝점(target), 위·아래 관절 길이를 이용해
  사람의 무릎과 팔꿈치가 자연스럽게 꺾이도록 한다.
  단순히 어깨에서 손까지 직선 하나를 긋는 것보다 스프라이트 같은 동작이 난다.
*/
function solveTwoBoneJoint(
    root,
    rawTarget,
    upperLength,
    lowerLength,
    bendDirection
) {
    const dx = rawTarget.x - root.x;
    const dy = rawTarget.y - root.y;
    const rawDistance = Math.max(0.001, Math.hypot(dx, dy));
    const minimumDistance = Math.abs(upperLength - lowerLength) + 0.001;
    const maximumDistance = upperLength + lowerLength - 0.001;
    const distance = Phaser.Math.Clamp(
        rawDistance,
        minimumDistance,
        maximumDistance
    );
    const unitX = dx / rawDistance;
    const unitY = dy / rawDistance;
    const target = {
        x: root.x + unitX * distance,
        y: root.y + unitY * distance
    };

    const along =
        (upperLength * upperLength -
            lowerLength * lowerLength +
            distance * distance) /
        (2 * distance);
    const height = Math.sqrt(
        Math.max(0, upperLength * upperLength - along * along)
    );
    const baseX = root.x + unitX * along;
    const baseY = root.y + unitY * along;
    const perpendicularX = -unitY;
    const perpendicularY = unitX;

    return {
        joint: {
            x: baseX + perpendicularX * height * bendDirection,
            y: baseY + perpendicularY * height * bendDirection
        },
        target
    };
}

function getProceduralPoseTarget(state) {
    const presets = {
        idle: {
            lean: 0.02,
            crouch: 0.02,
            stride: 0.08,
            footLift: 0.04,
            armSwing: 0.08,
            forwardGrip: 0,
            backwardGrip: 0,
            brace: 0,
            airOpen: 0,
            slump: 0,
            bob: 0.04
        },
        run: {
            lean: 0.1,
            crouch: 0.04,
            stride: 0.82,
            footLift: 0.72,
            armSwing: 0.84,
            forwardGrip: 0,
            backwardGrip: 0,
            brace: 0,
            airOpen: 0,
            slump: 0,
            bob: 0.1
        },
        strain: {
            lean: 0.37,
            crouch: 0.15,
            stride: 0.42,
            footLift: 0.62,
            armSwing: 0.16,
            forwardGrip: 1,
            backwardGrip: 0,
            brace: 0.08,
            airOpen: 0,
            slump: 0,
            bob: 0.075
        },
        brake: {
            lean: -0.36,
            crouch: 0.18,
            stride: 0.08,
            footLift: 0.05,
            armSwing: 0.08,
            forwardGrip: 0,
            backwardGrip: 0.84,
            brace: 1,
            airOpen: 0,
            slump: 0,
            bob: 0.025
        },
        reverse: {
            lean: 0.16,
            crouch: 0.08,
            stride: 0.65,
            footLift: 0.54,
            armSwing: 0.68,
            forwardGrip: 0,
            backwardGrip: 0,
            brace: 0,
            airOpen: 0,
            slump: 0,
            bob: 0.08
        },
        air: {
            lean: 0.04,
            crouch: 0.24,
            stride: 0.18,
            footLift: 0.72,
            armSwing: 0,
            forwardGrip: 0,
            backwardGrip: 0,
            brace: 0,
            airOpen: 1,
            slump: 0,
            bob: 0
        },
        land: {
            lean: 0.13,
            crouch: 0.46,
            stride: 0.08,
            footLift: 0,
            armSwing: 0.05,
            forwardGrip: 0.18,
            backwardGrip: 0,
            brace: 0.65,
            airOpen: 0,
            slump: 0,
            bob: 0
        },
        finish: {
            lean: -0.08,
            crouch: 0.3,
            stride: 0.04,
            footLift: 0,
            armSwing: 0,
            forwardGrip: 0,
            backwardGrip: 0,
            brace: 0.25,
            airOpen: 0,
            slump: 1,
            bob: 0.015
        }
    };

    return presets[state] || presets.idle;
}

function updateProceduralHumanMemory(
    graphics,
    velocityX,
    timeMs,
    state,
    settings
) {
    let memory = proceduralHumanMemory.get(graphics);

    if (!memory) {
        const target = getProceduralPoseTarget(state);

        memory = {
            lastTimeMs: timeMs,
            phase: 0,
            smoothedVelocity: Number(velocityX) || 0,
            pose: { ...target }
        };

        proceduralHumanMemory.set(graphics, memory);
    }

    const deltaSeconds = Phaser.Math.Clamp(
        (Number(timeMs) - Number(memory.lastTimeMs || timeMs)) / 1000,
        0,
        0.05
    );
    const targetVelocity = Number(velocityX) || 0;

    memory.smoothedVelocity = smoothValue(
        memory.smoothedVelocity,
        targetVelocity,
        settings.velocitySmoothing,
        deltaSeconds
    );

    const speed = Math.abs(memory.smoothedVelocity);
    const activeGait =
        state === 'run' ||
        state === 'strain' ||
        state === 'reverse' ||
        state === 'brake';
    const cadence = activeGait
        ? settings.gaitBaseSpeed + speed * settings.gaitSpeedGain
        : state === 'idle' || state === 'finish'
            ? 1.15
            : 0.55;

    memory.phase += deltaSeconds * cadence;
    memory.lastTimeMs = Number(timeMs) || memory.lastTimeMs;

    const targetPose = getProceduralPoseTarget(state);

    for (const [key, value] of Object.entries(targetPose)) {
        memory.pose[key] = smoothValue(
            Number(memory.pose[key]) || 0,
            value,
            settings.poseSmoothing,
            deltaSeconds
        );
    }

    return memory;
}

function drawBone(
    graphics,
    pointA,
    pointB,
    width,
    color,
    alpha = 1
) {
    graphics.lineStyle(width, color, alpha);
    graphics.lineBetween(pointA.x, pointA.y, pointB.x, pointB.y);
}

function drawJoint(
    graphics,
    point,
    radius,
    color,
    alpha = 1
) {
    graphics.fillStyle(color, alpha);
    graphics.fillCircle(point.x, point.y, radius);
}

function drawArticulatedHumanPass(
    graphics,
    skeleton,
    {
        color,
        lineWidth,
        jointRadius,
        headRadius,
        alpha
    }
) {
    /*
      뒤쪽 팔·다리를 먼저 그린 뒤 몸통, 앞쪽 팔다리를 올린다.
      아주 작은 졸라맨이어도 앞뒤 동작이 읽히게 하는 2D 스프라이트식 레이어링이다.
    */
    drawBone(
        graphics,
        skeleton.hipRear,
        skeleton.kneeRear,
        lineWidth,
        color,
        alpha * 0.68
    );
    drawBone(
        graphics,
        skeleton.kneeRear,
        skeleton.footRear,
        lineWidth,
        color,
        alpha * 0.68
    );
    drawBone(
        graphics,
        skeleton.shoulderRear,
        skeleton.elbowRear,
        lineWidth,
        color,
        alpha * 0.68
    );
    drawBone(
        graphics,
        skeleton.elbowRear,
        skeleton.handRear,
        lineWidth,
        color,
        alpha * 0.68
    );

    drawBone(
        graphics,
        skeleton.hip,
        skeleton.shoulder,
        lineWidth,
        color,
        alpha
    );
    drawBone(
        graphics,
        skeleton.shoulder,
        skeleton.neck,
        lineWidth,
        color,
        alpha
    );

    drawBone(
        graphics,
        skeleton.hipFront,
        skeleton.kneeFront,
        lineWidth,
        color,
        alpha
    );
    drawBone(
        graphics,
        skeleton.kneeFront,
        skeleton.footFront,
        lineWidth,
        color,
        alpha
    );
    drawBone(
        graphics,
        skeleton.shoulderFront,
        skeleton.elbowFront,
        lineWidth,
        color,
        alpha
    );
    drawBone(
        graphics,
        skeleton.elbowFront,
        skeleton.handFront,
        lineWidth,
        color,
        alpha
    );

    /*
      짧은 발 선을 추가해 다리가 바퀴 바닥을 실제로 디디는 느낌을 만든다.
    */
    drawBone(
        graphics,
        skeleton.footRear,
        skeleton.toeRear,
        Math.max(1, lineWidth * 0.72),
        color,
        alpha * 0.7
    );
    drawBone(
        graphics,
        skeleton.footFront,
        skeleton.toeFront,
        Math.max(1, lineWidth * 0.72),
        color,
        alpha
    );

    drawJoint(
        graphics,
        skeleton.kneeFront,
        jointRadius,
        color,
        alpha
    );
    drawJoint(
        graphics,
        skeleton.elbowFront,
        jointRadius * 0.85,
        color,
        alpha
    );
    drawJoint(
        graphics,
        skeleton.handFront,
        jointRadius * 0.78,
        color,
        alpha
    );

    graphics.fillStyle(color, alpha);
    graphics.fillCircle(
        skeleton.head.x,
        skeleton.head.y,
        headRadius
    );

    /*
      얼굴 방향을 아주 짧은 선으로 표시한다.
      작은 코드 인간이 어느 쪽을 향하고 있는지 바로 읽히게 한다.
    */
    drawBone(
        graphics,
        skeleton.faceStart,
        skeleton.faceEnd,
        Math.max(1, lineWidth * 0.55),
        color,
        alpha * 0.9
    );
}

export function drawProceduralHuman(
    graphics,
    x,
    y,
    radius,
    velocityX,
    timeMs,
    state = 'idle'
) {
    const player = VISUAL_THEME.player;
    const settings = player.proceduralHuman;

    if (!settings?.enabled) {
        return;
    }

    const memory = updateProceduralHumanMemory(
        graphics,
        velocityX,
        timeMs,
        state,
        settings
    );
    const pose = memory.pose;
    const speed = Math.abs(memory.smoothedVelocity);
    const direction = memory.smoothedVelocity < -0.08 ? -1 : 1;
    const scale = radius * settings.bodyScale;
    const phase = memory.phase;
    const breathing =
        Math.sin(timeMs * 0.0021) *
        settings.breathingAmount *
        scale;
    const idleSway =
        Math.sin(timeMs * 0.00135 + 0.8) *
        settings.idleSwayAmount *
        scale *
        (1 - Phaser.Math.Clamp(speed / 1.2, 0, 1));
    const gaitWaveFront = Math.sin(phase);
    const gaitWaveRear = Math.sin(phase + Math.PI);
    const gaitLiftFront = Math.max(0, -Math.cos(phase));
    const gaitLiftRear = Math.max(0, -Math.cos(phase + Math.PI));
    const bob =
        Math.abs(Math.sin(phase * 2)) *
        pose.bob *
        scale *
        Phaser.Math.Clamp(speed / 1.5, 0.25, 1);

    /*
      몸통은 바퀴와 함께 회전하지 않는다.
      이동 방향·오르막 힘주기·브레이크 상태에 따라 화면 기준으로 기울어진다.
    */
    const hip = {
        x:
            x +
            idleSway +
            direction * pose.lean * scale * 0.22,
        y:
            y +
            scale * (0.07 + pose.crouch * 0.16) +
            bob
    };
    const torsoLength = scale * (0.36 - pose.crouch * 0.08);
    const torsoAngle =
        -Math.PI / 2 +
        direction * pose.lean * 0.82 +
        direction * pose.slump * 0.2;
    const shoulder = pointFromAngle(hip, torsoAngle, torsoLength);
    const neck = pointFromAngle(
        shoulder,
        torsoAngle,
        scale * 0.075
    );
    const head = pointFromAngle(
        neck,
        torsoAngle,
        scale * (0.13 - pose.slump * 0.015)
    );

    head.y += breathing + pose.slump * scale * 0.075;
    head.x -= direction * pose.slump * scale * 0.06;

    const hipOffset = scale * 0.025;
    const shoulderOffset = scale * 0.035;
    const hipFront = {
        x: hip.x + direction * hipOffset,
        y: hip.y
    };
    const hipRear = {
        x: hip.x - direction * hipOffset,
        y: hip.y + 0.6
    };
    const shoulderFront = {
        x: shoulder.x + direction * shoulderOffset,
        y: shoulder.y
    };
    const shoulderRear = {
        x: shoulder.x - direction * shoulderOffset,
        y: shoulder.y + 0.5
    };

    const baseFootY =
        y +
        scale *
            (0.51 -
                pose.crouch * 0.035);
    const strideDistance = pose.stride * scale * 0.31;
    const footLiftDistance = pose.footLift * scale * 0.15;

    let footFrontTarget = {
        x:
            hip.x +
            direction *
                gaitWaveFront *
                strideDistance,
        y:
            baseFootY -
            gaitLiftFront *
                footLiftDistance
    };
    let footRearTarget = {
        x:
            hip.x +
            direction *
                gaitWaveRear *
                strideDistance,
        y:
            baseFootY -
            gaitLiftRear *
                footLiftDistance
    };

    /*
      브레이크에서는 두 발을 진행 방향으로 내밀어 몸을 버틴다.
      공중에서는 무릎을 접고 양발을 벌린다.
      FINISH에서는 발 간격을 좁히고 몸이 처지게 한다.
    */
    const bracedFront = {
        x: hip.x + direction * scale * 0.28,
        y: baseFootY - scale * 0.012
    };
    const bracedRear = {
        x: hip.x + direction * scale * 0.11,
        y: baseFootY + scale * 0.008
    };
    footFrontTarget = mixPoint(
        footFrontTarget,
        bracedFront,
        pose.brace
    );
    footRearTarget = mixPoint(
        footRearTarget,
        bracedRear,
        pose.brace
    );

    const airFront = {
        x: hip.x + direction * scale * 0.19,
        y: hip.y + scale * 0.25
    };
    const airRear = {
        x: hip.x - direction * scale * 0.17,
        y: hip.y + scale * 0.22
    };
    footFrontTarget = mixPoint(
        footFrontTarget,
        airFront,
        pose.airOpen
    );
    footRearTarget = mixPoint(
        footRearTarget,
        airRear,
        pose.airOpen
    );

    const slumpedFront = {
        x: hip.x + direction * scale * 0.1,
        y: baseFootY
    };
    const slumpedRear = {
        x: hip.x - direction * scale * 0.07,
        y: baseFootY
    };
    footFrontTarget = mixPoint(
        footFrontTarget,
        slumpedFront,
        pose.slump
    );
    footRearTarget = mixPoint(
        footRearTarget,
        slumpedRear,
        pose.slump
    );

    const thighLength = scale * 0.27;
    const shinLength = scale * 0.27;
    const frontLeg = solveTwoBoneJoint(
        hipFront,
        footFrontTarget,
        thighLength,
        shinLength,
        -direction
    );
    const rearLeg = solveTwoBoneJoint(
        hipRear,
        footRearTarget,
        thighLength,
        shinLength,
        -direction
    );

    const armWaveFront = -Math.sin(phase);
    const armWaveRear = -Math.sin(phase + Math.PI);
    const normalHandY = shoulder.y + scale * 0.18;

    let handFrontTarget = {
        x:
            shoulder.x +
            direction *
                armWaveFront *
                pose.armSwing *
                scale *
                0.24,
        y:
            normalHandY +
            Math.cos(phase) *
                pose.armSwing *
                scale *
                0.055
    };
    let handRearTarget = {
        x:
            shoulder.x +
            direction *
                armWaveRear *
                pose.armSwing *
                scale *
                0.24,
        y:
            normalHandY +
            Math.cos(phase + Math.PI) *
                pose.armSwing *
                scale *
                0.055
    };

    /*
      STRAIN: 양손으로 앞쪽 쳇바퀴를 밀어 올리는 자세
      BRAKE: 뒤쪽 프레임을 잡고 몸을 뒤로 당기는 자세
    */
    const forwardHandFront = {
        x: x + direction * radius * 0.72,
        y: y - scale * 0.17
    };
    const forwardHandRear = {
        x: x + direction * radius * 0.67,
        y: y + scale * 0.03
    };
    handFrontTarget = mixPoint(
        handFrontTarget,
        forwardHandFront,
        pose.forwardGrip
    );
    handRearTarget = mixPoint(
        handRearTarget,
        forwardHandRear,
        pose.forwardGrip
    );

    const backwardHandFront = {
        x: x - direction * radius * 0.58,
        y: y - scale * 0.08
    };
    const backwardHandRear = {
        x: x - direction * radius * 0.5,
        y: y + scale * 0.1
    };
    handFrontTarget = mixPoint(
        handFrontTarget,
        backwardHandFront,
        pose.backwardGrip
    );
    handRearTarget = mixPoint(
        handRearTarget,
        backwardHandRear,
        pose.backwardGrip
    );

    const airHandFront = {
        x: shoulder.x + direction * scale * 0.29,
        y: shoulder.y - scale * 0.16
    };
    const airHandRear = {
        x: shoulder.x - direction * scale * 0.25,
        y: shoulder.y - scale * 0.11
    };
    handFrontTarget = mixPoint(
        handFrontTarget,
        airHandFront,
        pose.airOpen
    );
    handRearTarget = mixPoint(
        handRearTarget,
        airHandRear,
        pose.airOpen
    );

    const slumpHandFront = {
        x: shoulder.x + direction * scale * 0.04,
        y: shoulder.y + scale * 0.31
    };
    const slumpHandRear = {
        x: shoulder.x - direction * scale * 0.04,
        y: shoulder.y + scale * 0.29
    };
    handFrontTarget = mixPoint(
        handFrontTarget,
        slumpHandFront,
        pose.slump
    );
    handRearTarget = mixPoint(
        handRearTarget,
        slumpHandRear,
        pose.slump
    );

    const upperArmLength = scale * 0.22;
    const lowerArmLength = scale * 0.21;
    const frontArm = solveTwoBoneJoint(
        shoulderFront,
        handFrontTarget,
        upperArmLength,
        lowerArmLength,
        direction
    );
    const rearArm = solveTwoBoneJoint(
        shoulderRear,
        handRearTarget,
        upperArmLength,
        lowerArmLength,
        -direction
    );

    const toeLength = scale * 0.075;
    const footFront = frontLeg.target;
    const footRear = rearLeg.target;
    const toeFront = {
        x: footFront.x + direction * toeLength,
        y: footFront.y + scale * 0.005
    };
    const toeRear = {
        x: footRear.x + direction * toeLength,
        y: footRear.y + scale * 0.005
    };
    const headRadius =
        scale * settings.headRadiusRatio;
    const faceStart = {
        x: head.x + direction * headRadius * 0.35,
        y: head.y - headRadius * 0.03
    };
    const faceEnd = {
        x: head.x + direction * headRadius * 0.92,
        y: head.y + headRadius * 0.08
    };

    const skeleton = {
        hip,
        shoulder,
        neck,
        head,
        hipFront,
        hipRear,
        shoulderFront,
        shoulderRear,
        kneeFront: frontLeg.joint,
        kneeRear: rearLeg.joint,
        footFront,
        footRear,
        toeFront,
        toeRear,
        elbowFront: frontArm.joint,
        elbowRear: rearArm.joint,
        handFront: frontArm.target,
        handRear: rearArm.target,
        faceStart,
        faceEnd
    };

    const lineWidth = Math.max(1.55, scale * 0.076);
    const jointRadius = Math.max(
        0.85,
        settings.jointRadius
    );

    /*
      먼저 굵은 어두운 그림자를 그린 뒤 밝은 인체선을 위에 올린다.
      자개 바퀴와 흑칠 배경 사이에서도 작은 인물이 묻히지 않는다.
    */
    drawArticulatedHumanPass(graphics, skeleton, {
        color: player.humanShadowColor,
        lineWidth: lineWidth + settings.shadowWidthExtra,
        jointRadius: jointRadius + 1.1,
        headRadius: headRadius + 2.1,
        alpha: 0.93
    });

    drawArticulatedHumanPass(graphics, skeleton, {
        color: player.humanColor,
        lineWidth,
        jointRadius,
        headRadius,
        alpha: 1
    });
}

export function drawWheelCage(graphics, x, y, radius, rotation) {
    const player = VISUAL_THEME.player;
    const spokeRadius = radius * 0.88;

    graphics.lineStyle(2, player.cageColor, 0.74);

    for (let index = 0; index < 6; index += 1) {
        const angle = rotation + (Math.PI * 2 * index) / 6;
        graphics.lineBetween(
            x,
            y,
            x + Math.cos(angle) * spokeRadius,
            y + Math.sin(angle) * spokeRadius
        );
    }

    graphics.lineStyle(2, 0x0b0d0f, 0.9);
    graphics.strokeCircle(x, y, radius * 0.23);
}

export function drawWheelDust(
    graphics,
    x,
    y,
    radius,
    velocityX,
    timeMs,
    grounded
) {
    const player = VISUAL_THEME.player;

    if (
        !player.dustEnabled ||
        !grounded ||
        Math.abs(velocityX) < player.dustSpeedThreshold
    ) {
        return;
    }

    const direction = velocityX >= 0 ? -1 : 1;
    const speedRatio = Phaser.Math.Clamp(Math.abs(velocityX) / 10, 0, 1);

    for (let index = 0; index < 4; index += 1) {
        const phase = timeMs * 0.006 + index * 1.8;
        const distance = radius * (0.55 + index * 0.32) * speedRatio;
        const dustX = x + direction * (radius * 0.58 + distance);
        const dustY = y + radius * 0.72 + Math.sin(phase) * 3;
        const color = getNacreColor(
            index * 0.85 +
            timeMs *
                VISUAL_THEME.nacre.timePhaseSpeed *
                VISUAL_THEME.nacre.wheelTimeMultiplier
        );
        const alpha = 0.12 + (4 - index) * 0.045;

        graphics.fillStyle(color, alpha);
        graphics.fillCircle(dustX, dustY, 1.2 + speedRatio * 1.8);
    }
}

export function preloadPlayerSpriteSheets(scene) {
    const sprite = VISUAL_THEME.player.sprite;

    if (!sprite.enabled) {
        return;
    }

    for (const sheet of Object.values(sprite.sheets)) {
        scene.load.spritesheet(sheet.key, sheet.path, {
            frameWidth: sprite.frameWidth,
            frameHeight: sprite.frameHeight
        });
    }
}

export function createPlayerAnimations(scene) {
    const sprite = VISUAL_THEME.player.sprite;

    if (!sprite.enabled) {
        return;
    }

    for (const [state, sheet] of Object.entries(sprite.sheets)) {
        const animationKey = `player-${state}`;

        if (scene.anims.exists(animationKey) || !scene.textures.exists(sheet.key)) {
            continue;
        }

        scene.anims.create({
            key: animationKey,
            frames: scene.anims.generateFrameNumbers(sheet.key, {
                start: 0,
                end: Math.max(0, sheet.frameCount - 1)
            }),
            frameRate: sheet.frameRate,
            repeat: sheet.repeat
        });
    }
}

export function canUsePlayerSprite(scene) {
    const sprite = VISUAL_THEME.player.sprite;
    const idleKey = sprite.sheets.idle.key;
    return sprite.enabled && scene.textures.exists(idleKey);
}
