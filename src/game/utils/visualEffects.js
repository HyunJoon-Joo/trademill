import Phaser from 'phaser';
import { trademillAudio } from '../audio/TrademillAudio';
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
        phase = 0,
        hoverSound = true,
        clickSound = true
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
        /*
          ==========================================================
          UI INPUT - Phaser 공식 Container hit-area 방식
          ==========================================================

          이전 버전에서는 container에 직접 custom Rectangle을 넣으면서
          좌표를 -width/2, -height/2부터 시작했다.

          하지만 Phaser Container는 setSize(width, height) 뒤 setInteractive()를
          호출하면 Container의 내부 display origin을 고려해 사각 hit area를
          자동으로 만들어 준다. 이게 Phaser 공식 예제에서 사용하는 방식이다.

          custom 음수 좌표 hit area를 직접 넣으면 Container의 input local 좌표와
          우리가 만든 Rectangle 좌표계가 어긋나서 다음 증상이 생길 수 있다.

          - 그림 왼쪽/오른쪽 일부만 hover됨
          - 눈에 보이는 버튼과 실제 클릭 영역이 어긋남
          - 빠르게 포인터를 움직이면 pointerover / pointerout이 엉뚱하게 반응
          - GameScene처럼 camera scroll + setScrollFactor(0) UI에서 더 두드러짐

          그래서 이제 hit area 좌표를 수동 계산하지 않는다.
          버튼의 시각 Container 자체 크기만 지정하고 Phaser가 입력영역을 만든다.
        */
        container.setSize(width, height);
        container.setInteractive();

        if (container.input) {
            container.input.cursor = 'pointer';
        }

        const setHovered = (nextHovered) => {
            if (hovered === nextHovered) {
                return;
            }

            hovered = nextHovered;

            if (hovered) {
                fill.setFillStyle(0x101316, 0.96);

                /*
                  mouse hover 자체는 브라우저의 Web Audio autoplay 제한을
                  처음 해제할 수 없지만, AudioContext가 이미 unlock된 이후에는
                  여기서 정상적으로 hover coin이 재생된다.
                */
                if (hoverSound) {
                    trademillAudio.playUiHover();
                }
            } else {
                fill.setFillStyle(VISUAL_THEME.lacquer.panel, 0.88);
            }
        };

        container.on('pointerover', () => {
            setHovered(true);
        });

        container.on('pointerout', () => {
            setHovered(false);
        });

        /*
          클릭은 pointerdown 한 번으로 처리한다.
          onClick이 Scene 전환이나 버튼 destroy를 바로 실행하는 경우에도
          pointerup을 기다리지 않으므로 기존 버튼 동작 감각을 유지한다.
        */
        container.on('pointerdown', () => {
            if (clickSound) {
                trademillAudio.playUiClick();
            }

            onClick?.();
        });

        /*
          Scene이 UI를 다시 그리면서 버튼을 destroy할 때 hover 상태가 남아
          다음 버튼 렌더링에 영향을 주는 것을 방지한다.
        */
        container.once('destroy', () => {
            hovered = false;
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

/*
  =========================================================
  절차적 러너 — 햄스터 휠 내부
  =========================================================

  이전 구현과의 핵심 차이 네 가지.

  1. 발과 손이 "바퀴 안쪽 림"에 실제로 붙는다.
     접지 구간에서는 림의 한 점을 잡고 림과 함께 뒤로 실려 간다.
     보행 위상을 바퀴 회전량에 고정하므로 발이 미끄러지지 않는다.
     (이전에는 바퀴 중심에서 고정 거리의 평평한 가상선 위를 사인파로 훑었다.)

  2. 상태가 문자열이 아니라 연속값이다.
     속도 · 경사 · 피로도 · 착지 충격량이 포즈에 직접 들어간다.
     같은 'run'이어도 느리게 굴러갈 때와 전력으로 굴릴 때의 자세가 다르다.

  3. 상체가 강체가 아니다.
     가속도에 스프링-댐퍼로 반응해 지연과 오버슛이 생기고,
     머리는 상체보다 한 박자 늦게 따라온다.

  4. 실루엣이 굵기가 변하는 면이다.
     균일한 선 대신 테이퍼드 캡슐로 채워 질량감을 만든다.
*/

const runnerMemory = new WeakMap();

function clampDeltaSeconds(value) {
    return Phaser.Math.Clamp(Number(value) || 0, 0, 0.05);
}

/*
  프레임률에 독립적인 지수 보간.
  rate가 클수록 목표값에 빨리 붙는다.
*/
function approach(current, target, rate, deltaSeconds) {
    const amount = 1 - Math.exp(-Math.max(0, rate) * deltaSeconds);
    return Phaser.Math.Linear(
        Number(current) || 0,
        Number(target) || 0,
        amount
    );
}

function createSpring(value = 0) {
    return { value, velocity: 0 };
}

/*
  2차 스프링-댐퍼. 상체 지연, 착지 흡수, 머리 따라오기에 사용한다.

  큰 delta에서 발산하지 않도록 내부에서 8ms 단위로 잘게 적분한다.
  이 함수가 "무게가 느껴지는 동작"의 대부분을 담당하므로
  stiffness/damping을 바꿀 때는 항상 함께 조절한다.
  damping ≈ 2 * sqrt(stiffness)면 거의 튀지 않고,
  그보다 작으면 출렁임이 남는다.
*/
function stepSpring(spring, target, stiffness, damping, deltaSeconds) {
    const steps = Math.max(1, Math.ceil(deltaSeconds / 0.008));
    const step = deltaSeconds / steps;

    for (let index = 0; index < steps; index += 1) {
        const accel =
            (target - spring.value) * stiffness -
            spring.velocity * damping;

        spring.velocity += accel * step;
        spring.value += spring.velocity * step;
    }

    if (!Number.isFinite(spring.value)) {
        spring.value = target;
        spring.velocity = 0;
    }

    return spring.value;
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
  바퀴 안쪽 림 위의 한 점.

  offsetAngle은 바퀴 "바닥"에서 잰 각도이며, 양수가 진행 방향 앞쪽이다.
  dir이 -1이면 좌우가 뒤집힌다.
*/
function rimPoint(centerX, centerY, rimRadius, offsetAngle, dir) {
    const worldAngle = Math.PI / 2 - dir * offsetAngle;

    return {
        x: centerX + Math.cos(worldAngle) * rimRadius,
        y: centerY + Math.sin(worldAngle) * rimRadius
    };
}

/*
  한 발(또는 한 손)의 접지-스윙 주기를 푼다.

  cyclePosition은 "회전 수" 단위다. 0~1이 한 바퀴이고
  앞발과 뒷발은 정확히 0.5만큼 어긋난다.

  접지 구간(stance):
    림 위의 한 점을 잡고 있으므로 각도가 앞에서 뒤로 일정하게 흘러간다.
    cyclePosition 자체가 바퀴 회전량에 고정되어 있기 때문에
    여기서 선형 보간만 해도 발이 림 위에서 정확히 정지한다.
    이것이 발 미끄러짐(foot skating)을 없애는 지점이다.

  스윙 구간(swing):
    발이 림에서 안쪽으로 떨어져 앞으로 되돌아온다.
    smoothstep으로 가감속을 주어 발을 휙 던지지 않는다.
*/
function solveContactCycle(cyclePosition, sweepAngle, stanceRatio) {
    const t = cyclePosition - Math.floor(cyclePosition);
    const half = sweepAngle * 0.5;
    const stance = Phaser.Math.Clamp(stanceRatio, 0.05, 0.95);

    if (t < stance) {
        const progress = t / stance;

        return {
            angle: half - sweepAngle * progress,
            lift: 0,
            planted: 1
        };
    }

    const progress = (t - stance) / (1 - stance);
    const eased = progress * progress * (3 - 2 * progress);

    return {
        angle: -half + sweepAngle * eased,
        lift: Math.sin(Math.PI * progress),
        planted: 0
    };
}

/*
  두 관절 길이를 가진 팔/다리의 중간 관절 위치를 계산한다.
  목표점이 닿을 수 없는 거리면 도달 가능한 범위로 당겨서 푼다.
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

    return {
        joint: {
            x: baseX + -unitY * height * bendDirection,
            y: baseY + unitX * height * bendDirection
        },
        target
    };
}

/*
  =========================
  볼륨 실루엣 그리기
  =========================

  선(lineStyle) 대신 면(fillPoints)을 쓴다.
  시작·끝 굵기가 다른 캡슐이므로 허벅지→종아리,
  어깨→손목처럼 실제로 가늘어지는 형태를 만들 수 있다.
*/
function fillTaperedCapsule(
    graphics,
    pointA,
    pointB,
    radiusA,
    radiusB,
    color,
    alpha
) {
    const dx = pointB.x - pointA.x;
    const dy = pointB.y - pointA.y;
    const length = Math.hypot(dx, dy);

    graphics.fillStyle(color, alpha);

    if (length < 0.0001) {
        graphics.fillCircle(pointA.x, pointA.y, Math.max(radiusA, radiusB));
        return;
    }

    const normalX = -dy / length;
    const normalY = dx / length;

    graphics.fillPoints(
        [
            { x: pointA.x + normalX * radiusA, y: pointA.y + normalY * radiusA },
            { x: pointB.x + normalX * radiusB, y: pointB.y + normalY * radiusB },
            { x: pointB.x - normalX * radiusB, y: pointB.y - normalY * radiusB },
            { x: pointA.x - normalX * radiusA, y: pointA.y - normalY * radiusA }
        ],
        true
    );

    graphics.fillCircle(pointA.x, pointA.y, radiusA);
    graphics.fillCircle(pointB.x, pointB.y, radiusB);
}

/*
  두 색을 섞는다. 뒤쪽 팔다리를 뒤로 물러나 보이게 할 때 쓴다.
*/
function shadeColor(color, towardColor, amount) {
    const a = splitColor(color);
    const b = splitColor(towardColor);
    const t = clamp01(amount);

    return joinColor(
        Phaser.Math.Linear(a.r, b.r, t),
        Phaser.Math.Linear(a.g, b.g, t),
        Phaser.Math.Linear(a.b, b.b, t)
    );
}

function drawRunnerPass(graphics, rig, { color, rearColor, grow, alpha }) {
    const width = rig.width;

    /*
      뒤쪽 팔다리는 알파를 낮추지 않고 어두운 색으로 칠한다.

      반투명으로 처리하면 아래에 깔린 어두운 외곽선이 그대로 비쳐서
      가뜩이나 얇은 팔이 외곽선만 남은 것처럼 보인다.
      불투명한 어두운 색이면 두께는 유지되면서 뒤로 물러나 보인다.
    */
    const backColor = rearColor === undefined ? color : rearColor;
    const back = alpha;

    /* 뒤쪽 팔다리 → 몸통 → 앞쪽 팔다리 순으로 겹친다. */
    fillTaperedCapsule(
        graphics,
        rig.hipRear,
        rig.kneeRear,
        width.thighTop + grow,
        width.thighEnd + grow,
        backColor,
        back
    );
    fillTaperedCapsule(
        graphics,
        rig.kneeRear,
        rig.footRear,
        width.thighEnd + grow,
        width.ankle + grow,
        backColor,
        back
    );
    fillTaperedCapsule(
        graphics,
        rig.footRear,
        rig.toeRear,
        width.ankle + grow,
        width.toe + grow,
        backColor,
        back
    );
    fillTaperedCapsule(
        graphics,
        rig.shoulderRear,
        rig.elbowRear,
        width.upperArmTop + grow,
        width.upperArmEnd + grow,
        backColor,
        back
    );
    fillTaperedCapsule(
        graphics,
        rig.elbowRear,
        rig.handRear,
        width.upperArmEnd + grow,
        width.wrist + grow,
        backColor,
        back
    );

    fillTaperedCapsule(
        graphics,
        rig.hip,
        rig.waist,
        width.hip + grow,
        width.waist + grow,
        color,
        alpha
    );
    fillTaperedCapsule(
        graphics,
        rig.waist,
        rig.chest,
        width.waist + grow,
        width.chest + grow,
        color,
        alpha
    );
    fillTaperedCapsule(
        graphics,
        rig.shoulderRear,
        rig.shoulderFront,
        width.shoulder + grow,
        width.shoulder + grow,
        color,
        alpha
    );
    fillTaperedCapsule(
        graphics,
        rig.chest,
        rig.head,
        width.neck + grow,
        width.neck + grow,
        color,
        alpha
    );

    graphics.fillStyle(color, alpha);
    graphics.fillCircle(rig.head.x, rig.head.y, rig.headRadius + grow);

    /* 얼굴 방향을 짧은 돌출로 표시한다. 작은 크기에서도 앞뒤가 읽힌다. */
    fillTaperedCapsule(
        graphics,
        rig.head,
        rig.face,
        rig.headRadius * 0.55 + grow,
        rig.headRadius * 0.3 + grow,
        color,
        alpha
    );

    fillTaperedCapsule(
        graphics,
        rig.hipFront,
        rig.kneeFront,
        width.thighTop + grow,
        width.thighEnd + grow,
        color,
        alpha
    );
    fillTaperedCapsule(
        graphics,
        rig.kneeFront,
        rig.footFront,
        width.thighEnd + grow,
        width.ankle + grow,
        color,
        alpha
    );
    fillTaperedCapsule(
        graphics,
        rig.footFront,
        rig.toeFront,
        width.ankle + grow,
        width.toe + grow,
        color,
        alpha
    );
    fillTaperedCapsule(
        graphics,
        rig.shoulderFront,
        rig.elbowFront,
        width.upperArmTop + grow,
        width.upperArmEnd + grow,
        color,
        alpha
    );
    fillTaperedCapsule(
        graphics,
        rig.elbowFront,
        rig.handFront,
        width.upperArmEnd + grow,
        width.wrist + grow,
        color,
        alpha
    );
}

/*
  목표점을 루트에서 멀리 밀어 관절을 펴게 만든다.

  방향 전환 순간에만 쓴다. 관절이 꺾이는 쪽이 뒤집힐 때
  팔이 접혀 있으면 팔꿈치가 좌우로 9px 가까이 튀지만,
  거의 펴져 있으면 팔꿈치가 뼈 선 위에 있어 튐이 보이지 않는다.
*/
function straightenTarget(root, target, fullLength, amount) {
    const strength = clamp01(amount);

    if (strength < 0.001) {
        return target;
    }

    const dx = target.x - root.x;
    const dy = target.y - root.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 0.0001) {
        return target;
    }

    const wanted = Phaser.Math.Linear(distance, fullLength, strength);
    const ratio = wanted / distance;

    return {
        x: root.x + dx * ratio,
        y: root.y + dy * ratio
    };
}

/*
  목표점을 도달 가능한 거리 안으로 당긴다.

  두 관절 체인은 목표가 멀면 완전히 펴진 직선이 된다.
  팔꿈치·무릎 각도가 175도를 넘으면 관절이 사라져 막대기처럼 보이고,
  각도가 미세하게 흔들릴 때 꺾이는 쪽이 튀기도 한다.
  전체 길이의 90% 정도까지만 뻗게 하면 항상 관절이 남는다.
*/
function limitReach(root, target, maxDistance) {
    const dx = target.x - root.x;
    const dy = target.y - root.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= maxDistance || distance < 0.0001) {
        return target;
    }

    const ratio = maxDistance / distance;

    return {
        x: root.x + dx * ratio,
        y: root.y + dy * ratio
    };
}

/*
  다리가 실제로 닿을 수 있는 최대 반보폭(라디안)을 구한다.

  이것이 없으면 고속에서 보폭이 다리 길이를 넘어가고,
  solveTwoBoneJoint이 목표를 당겨버려 발이 림에서 떨어진다.
  화면에서는 다리가 쭉 뻗은 채 발이 허공에서 미끄러지는 것으로 보인다.

  hipDx / hipDy 는 바퀴 중심 기준 골반 위치(진행 방향을 +x로 정규화한 좌표계).
  앞뒤 양쪽 극단을 모두 검사해 더 빡빡한 쪽을 택한다.
*/
function solveReachableHalfSweep(hipDx, hipDy, rimRadius, reachLength, limit) {
    const distanceAt = (half) => {
        const forward = Math.hypot(
            Math.sin(half) * rimRadius - hipDx,
            Math.cos(half) * rimRadius - hipDy
        );
        const backward = Math.hypot(
            -Math.sin(half) * rimRadius - hipDx,
            Math.cos(half) * rimRadius - hipDy
        );

        return Math.max(forward, backward);
    };

    if (distanceAt(limit) <= reachLength) {
        return limit;
    }

    let low = 0;
    let high = limit;

    for (let index = 0; index < 14; index += 1) {
        const mid = (low + high) * 0.5;

        if (distanceAt(mid) <= reachLength) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return low;
}

function getRunnerMemory(graphics, timeMs) {
    let memory = runnerMemory.get(graphics);

    if (!memory) {
        memory = {
            lastTimeMs: Number(timeMs) || 0,
            gaitPhase: 0,
            strideArc: 0,
            facing: 1,
            bendDir: 1,
            rimSpeed: 0,
            smoothAccel: 0,
            lastVelocityX: 0,
            lastImpactId: -1,

            push: 0,
            effort: 0,
            brake: 0,
            reverse: 0,
            grip: 0,
            air: 0,
            slump: 0,

            leanSpring: createSpring(0),
            crouchSpring: createSpring(0),
            headSpring: createSpring(0),
            armLagSpring: createSpring(0)
        };

        runnerMemory.set(graphics, memory);
    }

    return memory;
}

/*
  motion 객체 (모두 선택 사항, GameScene이 매 프레임 계산해 넘긴다)

    grounded     접지 여부
    finished     FINISH 연출 여부
    velocityX    Matter 선속도 x (프레임당 px)
    spinRate     바퀴 각속도 (라디안/초)
    slope        현재 지형 경사
    uphill       오르막 강도 0~1
    fatigue      오르막 피로도 0~1
    pushing      RIGHT 유지 여부 0~1
    braking      브레이크 중 0~1
    reversing    후진 중 0~1
    gripping     DOWN 그립 0~1
    impactId     착지가 발생할 때마다 증가하는 정수
    impactPower  마지막 착지 충격 강도 0~1
*/
export function drawProceduralHuman(
    graphics,
    x,
    y,
    radius,
    timeMs,
    motion = {}
) {
    const player = VISUAL_THEME.player;
    const settings = player.proceduralHuman;

    if (!settings?.enabled) {
        return;
    }

    const memory = getRunnerMemory(graphics, timeMs);
    const deltaSeconds = clampDeltaSeconds(
        (Number(timeMs) - Number(memory.lastTimeMs)) / 1000
    );

    memory.lastTimeMs = Number(timeMs) || memory.lastTimeMs;

    /*
      =========================
      1. 연속 상태 갱신
      =========================
    */
    const velocityX = Number(motion.velocityX) || 0;
    const grounded = motion.grounded === undefined ? true : !!motion.grounded;
    const driverRate = settings.driverSmoothing;

    memory.air = approach(
        memory.air,
        grounded ? 0 : 1,
        settings.airSmoothing,
        deltaSeconds
    );
    memory.push = approach(
        memory.push,
        clamp01(motion.pushing),
        driverRate,
        deltaSeconds
    );
    /*
      브레이크와 힘주기는 손을 몸에서 림까지 크게 옮긴다.
      일반 상태 전이 속도(driverSmoothing)를 그대로 쓰면
      키를 누른 첫 프레임에 손이 8px 가까이 순간이동한다.
      그래서 이 둘만 느린 gripSmoothing을 쓴다.
    */
    memory.brake = approach(
        memory.brake,
        clamp01(motion.braking),
        settings.gripSmoothing,
        deltaSeconds
    );
    memory.reverse = approach(
        memory.reverse,
        clamp01(motion.reversing),
        driverRate,
        deltaSeconds
    );
    memory.grip = approach(
        memory.grip,
        clamp01(motion.gripping),
        driverRate,
        deltaSeconds
    );
    memory.slump = approach(
        memory.slump,
        motion.finished ? 1 : 0,
        settings.finishSmoothing,
        deltaSeconds
    );

    /*
      "힘주는 정도"는 단일 상태가 아니라 합성값이다.
      RIGHT를 누르고 있어도 평지에서 여유롭게 굴릴 때와
      가파른 오르막에서 지친 채로 밀 때의 자세가 달라진다.
    */
    const effortTarget = clamp01(
        clamp01(motion.pushing) *
            (settings.effortFromPush +
                clamp01(motion.fatigue) * settings.effortFromFatigue) +
            clamp01(motion.uphill) * settings.effortFromUphill
    );

    memory.effort = approach(
        memory.effort,
        effortTarget,
        settings.gripSmoothing,
        deltaSeconds
    );

    /* 진행 방향. 히스테리시스를 두어 속도가 0을 스칠 때 깜빡이지 않게 한다. */
    let facingTarget = memory.facing >= 0 ? 1 : -1;

    if (velocityX > settings.facingDeadzone) {
        facingTarget = 1;
    } else if (velocityX < -settings.facingDeadzone) {
        facingTarget = -1;
    }

    memory.facing = approach(
        memory.facing,
        facingTarget,
        settings.facingSmoothing,
        deltaSeconds
    );

    /*
      dir 은 관절이 꺾이는 쪽처럼 반드시 둘 중 하나여야 하는 곳에만 쓴다.

      좌우를 뒤집는 기하 계산에는 연속값 facingSigned 를 쓴다.
      예전처럼 dir 로 뒤집으면 속도가 0을 지나는 순간 손발 목표가
      바퀴 반대편으로 한 프레임에 순간이동한다. 실측에서 23px 점프가 나왔다.
      facingSigned 를 쓰면 방향이 바뀔 때 손발이 바퀴 아래쪽으로 모였다가
      반대편으로 갈라지므로 몸을 돌리는 동작처럼 보인다.
    */
    const facingSigned = Phaser.Math.Clamp(memory.facing, -1, 1);

    /*
      관절이 꺾이는 쪽은 연속값으로 만들 수 없다.
      (중간값을 주면 관절이 뼈 선 위에 놓여 팔다리가 짧아 보인다.)

      그래서 방향은 유지하되, 뒤집는 시점에 히스테리시스를 둔다.
      0에서 바로 뒤집으면 경사에서 앞뒤로 밀릴 때 무릎과 팔꿈치가
      매 진동마다 좌우로 튄다. 실측에서 360프레임 동안 7번 뒤집혔다.
    */
    if (facingSigned > settings.bendFlipThreshold) {
        memory.bendDir = 1;
    } else if (facingSigned < -settings.bendFlipThreshold) {
        memory.bendDir = -1;
    }

    const dir = memory.bendDir;

    /*
      방향을 바꾸는 순간에는 팔다리를 거의 곧게 편다.

      2D에서 관절이 꺾이는 쪽은 연속으로 바꿀 수 없어 언젠가 한 번은 뒤집힌다.
      다만 뒤집히는 순간 팔다리가 펴져 있으면 관절이 움직이는 거리가 0에 가까워
      튀는 것이 보이지 않는다. 실측에서 팔꿈치가 한 프레임에 9px 튀던 것을
      이 처리로 없앤다. 몸을 돌리며 일어서는 동작으로도 읽힌다.
    */
    const turnStraighten =
        1 -
        Phaser.Math.Clamp(
            (Math.abs(facingSigned) - settings.turnStraightenHold) /
                settings.turnStraightenFade,
            0,
            1
        );
    const facingAmount = Math.abs(facingSigned);

    /*
      =========================
      2. 보행 위상 = 바퀴 회전량
      =========================

      햄스터 휠에서 발이 밟는 것은 지면이 아니라 안쪽 림이다.
      따라서 걸음 주기는 이동 거리가 아니라 "림 표면이 지나간 길이"로 정해야 한다.
      이렇게 해야 바퀴가 헛돌 때도 발이 함께 헛돈다.
    */
    const rimRadius = Math.max(2, radius * (1 - settings.rimInsetRatio));
    const spinRate = Number(motion.spinRate) || 0;

    memory.rimSpeed = approach(
        memory.rimSpeed,
        spinRate * rimRadius,
        settings.velocitySmoothing,
        deltaSeconds
    );

    const rimSpeedAbs = Math.abs(memory.rimSpeed);
    const moveAmount = Phaser.Math.Clamp(
        rimSpeedAbs / (radius * settings.moveReferenceRatio),
        0,
        1
    );


    /*
      =========================
      3. 2차 모션 (관성 반응)
      =========================
    */
    const accelRaw =
        (velocityX - memory.lastVelocityX) / Math.max(deltaSeconds, 0.0005);

    memory.lastVelocityX = velocityX;
    memory.smoothAccel = approach(
        memory.smoothAccel,
        accelRaw,
        settings.accelSmoothing,
        deltaSeconds
    );

    const accelForward = Phaser.Math.Clamp(
        (memory.smoothAccel * facingSigned) / settings.accelReference,
        -1,
        1
    );

    /*
      가속하면 상체가 뒤로 처지고, 감속하면 앞으로 쏠린다.
      이 한 줄이 "바퀴에 사람이 얹혀 있다"와 "사람이 바퀴를 굴린다"를 가른다.
    */
    stepSpring(
        memory.leanSpring,
        -accelForward * settings.accelLeanAmount,
        settings.leanStiffness,
        settings.leanDamping,
        deltaSeconds
    );

    /* 착지 충격은 새 impactId가 들어올 때 한 번만 스프링에 속도로 주입한다. */
    const impactId = Number(motion.impactId);

    if (Number.isFinite(impactId) && impactId !== memory.lastImpactId) {
        const power = clamp01(motion.impactPower);

        memory.lastImpactId = impactId;
        memory.crouchSpring.velocity += power * settings.impactCrouchKick;
        memory.headSpring.velocity += power * settings.impactHeadKick;
        memory.armLagSpring.velocity += power * settings.impactArmKick;
    }

    stepSpring(
        memory.crouchSpring,
        0,
        settings.impactStiffness,
        settings.impactDamping,
        deltaSeconds
    );
    stepSpring(
        memory.armLagSpring,
        0,
        settings.impactStiffness * 0.8,
        settings.impactDamping * 0.9,
        deltaSeconds
    );

    /*
      =========================
      4. 몸통 배치
      =========================
    */
    const scale = radius * settings.bodyScale;
    const thighLength = scale * settings.thighRatio;
    const shinLength = scale * settings.shinRatio;
    const upperArmLength = scale * settings.upperArmRatio;
    const foreArmLength = scale * settings.foreArmRatio;
    const legLength = thighLength + shinLength;

    const crouchAmount = Phaser.Math.Clamp(
        settings.baseCrouch +
            memory.effort * settings.effortCrouch +
            memory.brake * settings.brakeCrouch +
            memory.grip * settings.gripCrouch +
            memory.air * settings.airCrouch +
            memory.slump * settings.slumpCrouch +
            memory.crouchSpring.value,
        0,
        0.95
    );

    /*
      골반 높이는 "림 최하점에서 다리 길이만큼 위"로 정한다.
      보폭에 의존하지 않게 해야 보폭 계산과 순환 참조가 생기지 않는다.
    */
    const contactY = y + rimRadius;
    const standHeight =
        legLength *
        Phaser.Math.Linear(
            settings.standExtension - crouchAmount * settings.crouchDepth,
            settings.turnStraightenExtension,
            turnStraighten
        );

    const breathing =
        Math.sin(Number(timeMs) * 0.0021) *
        settings.breathingAmount *
        scale *
        (1 - moveAmount * 0.7);
    const idleSway =
        Math.sin(Number(timeMs) * 0.00135 + 0.8) *
        settings.idleSwayAmount *
        scale *
        (1 - moveAmount);

    /*
      달릴 때의 상하 진동.
      두 발이 모두 떠 있는 순간 몸이 살짝 뜨고, 착지에서 내려앉는다.
    */
    const bobPhase = memory.gaitPhase * Math.PI * 2;
    const bob =
        Math.sin(bobPhase * 2) *
        settings.bobAmount *
        scale *
        moveAmount *
        (1 - memory.air);

    const leanForward =
        settings.baseLean +
        memory.effort * settings.effortLean +
        clamp01(motion.uphill) * settings.uphillLean -
        memory.brake * settings.brakeLean -
        memory.slump * settings.slumpLean;

    const leanAngle =
        facingSigned * leanForward + memory.leanSpring.value;

    /*
      골반 전후 위치.

      팔 길이는 바퀴 반지름보다 짧기 때문에, 몸이 바퀴 정중앙에 있으면
      손이 림에 절대 닿지 않는다. 힘을 줄 때는 상체가 앞으로 넘어가고
      브레이크에서는 골반을 뒤로 빼서 손이 실제로 림을 잡을 수 있게 한다.
    */
    const hipShift =
        settings.hipForwardShift +
        memory.effort * settings.effortHipShift -
        memory.brake * settings.brakeHipShift;

    const hip = {
        x: x + idleSway + facingSigned * hipShift * scale,
        y: contactY - standHeight + bob
    };
    /*
      =========================
      보폭 · 스윕 · 위상
      =========================

      골반 위치가 정해진 뒤에 계산한다.
      보폭은 속도가 붙을수록 커지지만, 다리가 닿을 수 있는 범위를 넘지 못한다.

      중요: strideArc / sweepAngle / stepsPerSecond 는 반드시 같은 strideArc에서
      유도해야 한다. 보폭에만 상한을 걸고 위상 속도를 그대로 두면
      발이 림 위에서 다시 미끄러진다.
    */
    /*
      도달 범위 계산에는 상하 진동(bob)과 좌우 흔들림(idleSway)을 뺀
      "안정된 골반 위치"를 쓴다.

      이유: 이 계산 결과가 보폭 → 스윕 각도 → 위상 속도로 이어지는데,
      매 프레임 진동하는 값을 넣으면 접지 중에 스윕 각도가 흔들려
      발이 다시 미끄러진다. 실측에서 이것만으로 평균 오차가 10% 넘게 나왔다.
    */
    const steadyHipDx = hipShift * scale * facingAmount;
    const steadyHipDy = contactY - standHeight - y;
    const reachableHalfSweep = solveReachableHalfSweep(
        steadyHipDx,
        steadyHipDy,
        rimRadius,
        legLength * settings.maxLegExtension,
        settings.maxSweepAngle * 0.5
    );
    const maxStrideArc =
        (2 * reachableHalfSweep * rimRadius) / (2 * settings.stanceRatio);
    const strideArcTarget = Math.max(
        1,
        Math.min(
            radius *
                settings.strideArcRatio *
                (1 + moveAmount * settings.strideSpeedGain),
            maxStrideArc
        )
    );

    /*
      보폭은 천천히만 변한다.
      한 걸음이 진행되는 도중에 보폭이 갑자기 바뀌면 그만큼이 미끄러짐이 된다.
    */
    memory.strideArc = memory.strideArc
        ? approach(
            memory.strideArc,
            strideArcTarget,
            settings.strideSmoothing,
            deltaSeconds
        )
        : strideArcTarget;

    const strideArc = memory.strideArc;
    const sweepAngle = (2 * settings.stanceRatio * strideArc) / rimRadius;
    const stepsPerSecond = Phaser.Math.Clamp(
        rimSpeedAbs / strideArc,
        0,
        settings.maxStepsPerSecond
    );

    /* 1 사이클 = 양발 2걸음이므로 0.5를 곱한다. 공중에서는 주기를 멈춘다. */
    memory.gaitPhase +=
        stepsPerSecond * 0.5 * (1 - memory.air) * deltaSeconds;

    if (memory.gaitPhase > 1024) {
        memory.gaitPhase -= 1024;
    }

    const torsoLength = scale * settings.torsoRatio * (1 - crouchAmount * 0.12);
    const torsoAngle = -Math.PI / 2 + leanAngle;

    const waist = pointFromAngle(hip, torsoAngle, torsoLength * 0.42);
    const chest = pointFromAngle(hip, torsoAngle, torsoLength);

    /*
      머리는 상체를 그대로 따라가지 않고 한 박자 늦게 따라온다.
      스프링 값만큼 상체 각도에서 어긋나게 두어 목이 살아 있게 만든다.
    */
    stepSpring(
        memory.headSpring,
        leanAngle * settings.headFollowRatio,
        settings.headStiffness,
        settings.headDamping,
        deltaSeconds
    );

    const headAngle =
        -Math.PI / 2 +
        memory.headSpring.value +
        memory.slump * facingSigned * settings.slumpHeadDrop;
    const headRadius = scale * settings.headRadiusRatio;
    const head = pointFromAngle(
        chest,
        headAngle,
        scale * settings.neckRatio + headRadius
    );

    head.y += breathing;

    const face = {
        x: head.x + facingSigned * headRadius * 0.95,
        y: head.y + headRadius * 0.18
    };

    /*
      앞뒤 팔다리를 벌려 두는 거리.

      어깨 간격이 몸통 반지름보다 좁으면 두 팔이 모두 몸통 실루엣에 파묻혀
      뒤팔이 어디서 나오는지 읽히지 않는다. 그래서 어깨만 따로 키운다.
    */
    const hipOffset = scale * settings.limbSeparation;
    const shoulderOffset =
        scale * settings.limbSeparation * settings.shoulderSeparationRatio;
    const shoulderAxisX = Math.cos(torsoAngle + Math.PI / 2);
    const shoulderAxisY = Math.sin(torsoAngle + Math.PI / 2);

    const hipFront = {
        x: hip.x + facingSigned * hipOffset,
        y: hip.y
    };
    const hipRear = {
        x: hip.x - facingSigned * hipOffset,
        y: hip.y + 0.5
    };
    const shoulderFront = {
        x: chest.x + shoulderAxisX * shoulderOffset * facingSigned,
        y: chest.y + shoulderAxisY * shoulderOffset * facingSigned
    };
    const shoulderRear = {
        x: chest.x - shoulderAxisX * shoulderOffset * facingSigned,
        y: chest.y - shoulderAxisY * shoulderOffset * facingSigned + 0.4
    };

    /*
      =========================
      5. 발 — 림 접지
      =========================
    */
    const frontCycle = solveContactCycle(
        memory.gaitPhase,
        sweepAngle,
        settings.stanceRatio
    );
    const rearCycle = solveContactCycle(
        memory.gaitPhase + 0.5,
        sweepAngle,
        settings.stanceRatio
    );

    const swingLift = radius * settings.swingLiftRatio;

    /*
      발 각도는 절대로 보간하지 않는다.

      예전에는 저속에서 "정지 자세"로 lerp했는데, 그러면 위상은 림 회전량을
      따라가지만 실제 각도는 그 일부만 반영되어 저속 구간에서 발이 미끄러졌다.
      (측정 결과 v가 낮을수록 오차가 커졌다.)

      대신 들어올림(lift)만 속도에 비례시킨다.
      속도가 0이면 위상도 멈추므로 두 발은 벌어진 채 림 위에 그대로 서 있게 되고,
      공중에 뜬 발이 얼어붙는 문제도 생기지 않는다.
    */
    const frontAngle = frontCycle.angle;
    const rearAngle = rearCycle.angle;
    const frontLift = frontCycle.lift * swingLift * moveAmount;
    const rearLift = rearCycle.lift * swingLift * moveAmount;

    let footFrontTarget = rimPoint(
        x,
        y,
        rimRadius - frontLift,
        frontAngle,
        facingSigned
    );
    let footRearTarget = rimPoint(
        x,
        y,
        rimRadius - rearLift,
        rearAngle,
        facingSigned
    );

    /*
      브레이크: 두 발을 앞으로 내밀어 림을 버틴다.
      공중: 무릎을 접어 몸 쪽으로 당긴다.
      FINISH: 발을 모으고 몸이 주저앉는다.
    */
    const bracedFront = rimPoint(x, y, rimRadius, sweepAngle * 0.85, facingSigned);
    const bracedRear = rimPoint(x, y, rimRadius, sweepAngle * 0.3, facingSigned);

    footFrontTarget = mixPoint(footFrontTarget, bracedFront, memory.brake);
    footRearTarget = mixPoint(footRearTarget, bracedRear, memory.brake);

    const airFront = {
        x: hip.x + facingSigned * scale * 0.3,
        y: hip.y + scale * 0.42
    };
    const airRear = {
        x: hip.x - facingSigned * scale * 0.16,
        y: hip.y + scale * 0.34
    };

    footFrontTarget = mixPoint(footFrontTarget, airFront, memory.air);
    footRearTarget = mixPoint(footRearTarget, airRear, memory.air);

    const slumpFront = rimPoint(
        x,
        y,
        rimRadius,
        settings.idleStanceAngle * 0.5,
        facingSigned
    );
    const slumpRear = rimPoint(
        x,
        y,
        rimRadius,
        -settings.idleStanceAngle * 0.5,
        facingSigned
    );

    footFrontTarget = mixPoint(footFrontTarget, slumpFront, memory.slump);
    footRearTarget = mixPoint(footRearTarget, slumpRear, memory.slump);

    /*
      방향 전환 구간에서는 뻗을 수 있는 한계도 같이 풀어야 한다.
      한계를 그대로 두면 straightenTarget이 밀어낸 목표를
      limitReach가 곧바로 다시 당겨서 펴기가 무효가 된다.
    */
    const maxLegReach =
        legLength *
        Phaser.Math.Linear(
            settings.maxLegExtension,
            settings.turnStraightenExtension,
            turnStraighten
        );
    const frontLeg = solveTwoBoneJoint(
        hipFront,
        limitReach(hipFront, footFrontTarget, maxLegReach),
        thighLength,
        shinLength,
        -dir
    );
    const rearLeg = solveTwoBoneJoint(
        hipRear,
        limitReach(hipRear, footRearTarget, maxLegReach),
        thighLength,
        shinLength,
        -dir
    );

    /*
      =========================
      6. 손 — 림 그립과 팔 스윙
      =========================

      힘을 줄 때는 손도 발과 같은 방식으로 림을 잡고 뒤로 당긴다.
      팔 위상을 다리보다 약간 늦춰 몸 전체가 한 덩어리로 움직이지 않게 한다.
    */
    const armPhase = memory.gaitPhase + settings.armPhaseOffset;
    const armCycleFront = solveContactCycle(
        armPhase,
        sweepAngle * settings.armSweepRatio,
        settings.stanceRatio
    );
    const armCycleRear = solveContactCycle(
        armPhase + 0.5,
        sweepAngle * settings.armSweepRatio,
        settings.stanceRatio
    );

    const armLag = memory.armLagSpring.value * scale;

    /*
      자유 스윙 팔 — 어깨 기준 극좌표로 잡는다.

      이전에는 손 목표를 가슴 근처의 절대 좌표로 두었다.
      그 지점은 어깨에서 5px 남짓 떨어져 있는데 팔 길이는 17px이라,
      팔이 갈 곳이 없어 팔꿈치가 18도까지 접혔다.
      내리막이나 뒤로 미끄러질 때 팔이 닭 날개처럼 접히던 원인이다.

      지금은 "어깨에서 팔 길이의 일정 비율만큼 떨어진 지점"을 잡고
      각도만 흔든다. 그래서 팔꿈치 각도가 항상 자연스러운 범위에 머문다.
    */
    const freeArmReach =
        (upperArmLength + foreArmLength) * settings.freeArmExtension;
    const armSwingWave =
        Math.sin(armPhase * Math.PI * 2) *
        settings.armSwingAmount *
        moveAmount;

    /* Math.PI / 2 는 화면 기준 정확히 아래쪽이다. */
    const freeAngleFront =
        Math.PI / 2 -
        facingSigned * (settings.freeArmBaseAngle + armSwingWave);
    const freeAngleRear =
        Math.PI / 2 -
        facingSigned * (settings.freeArmBaseAngle - armSwingWave);

    /*
      스윙 중 뻗은 정도도 함께 변한다.

      거리를 고정하면 팔꿈치 각도가 내내 같아서 팔이 통짜로 흔들린다.
      팔이 앞으로 나올 때 더 접히고 뒤로 갈 때 펴지게 하면
      사람이 팔을 젓는 것처럼 보인다.
    */
    const swingNormalized =
        settings.armSwingAmount > 0
            ? armSwingWave / settings.armSwingAmount
            : 0;
    const freeReachFront =
        freeArmReach * (1 - settings.armReachSwing * swingNormalized);
    const freeReachRear =
        freeArmReach * (1 + settings.armReachSwing * swingNormalized);

    const freeHandFront = pointFromAngle(
        shoulderFront,
        freeAngleFront,
        freeReachFront
    );
    const freeHandRear = pointFromAngle(
        shoulderRear,
        freeAngleRear,
        freeReachRear
    );

    let handFrontTarget = {
        x: freeHandFront.x,
        y: freeHandFront.y + armLag
    };
    let handRearTarget = {
        x: freeHandRear.x,
        y: freeHandRear.y + armLag
    };

    /* 힘주기: 앞쪽 위 림을 잡고 아래로 끌어내린다. */
    const pushGripFront = rimPoint(
        x,
        y,
        rimRadius,
        settings.forwardGripAngle + armCycleFront.angle,
        facingSigned
    );
    const pushGripRear = rimPoint(
        x,
        y,
        rimRadius,
        settings.forwardGripAngle + armCycleRear.angle * 0.7,
        facingSigned
    );

    handFrontTarget = mixPoint(handFrontTarget, pushGripFront, memory.effort);
    handRearTarget = mixPoint(handRearTarget, pushGripRear, memory.effort);

    /* 브레이크: 뒤쪽 림을 잡고 몸을 뒤로 당긴다. */
    const brakeGripFront = rimPoint(
        x,
        y,
        rimRadius,
        settings.backwardGripAngle,
        facingSigned
    );
    const brakeGripRear = rimPoint(
        x,
        y,
        rimRadius,
        settings.backwardGripAngle + 0.28,
        facingSigned
    );

    handFrontTarget = mixPoint(handFrontTarget, brakeGripFront, memory.brake);
    handRearTarget = mixPoint(handRearTarget, brakeGripRear, memory.brake);

    /* 공중: 양팔을 벌려 균형을 잡는다. */
    const airHandFront = {
        x: chest.x + facingSigned * scale * 0.42,
        y: chest.y - scale * 0.2
    };
    const airHandRear = {
        x: chest.x - facingSigned * scale * 0.36,
        y: chest.y - scale * 0.14
    };

    handFrontTarget = mixPoint(handFrontTarget, airHandFront, memory.air);
    handRearTarget = mixPoint(handRearTarget, airHandRear, memory.air);

    /* FINISH: 팔을 늘어뜨린다. */
    const slumpHandFront = {
        x: chest.x + facingSigned * scale * 0.06,
        y: chest.y + scale * 0.4
    };
    const slumpHandRear = {
        x: chest.x - facingSigned * scale * 0.06,
        y: chest.y + scale * 0.37
    };

    handFrontTarget = mixPoint(handFrontTarget, slumpHandFront, memory.slump);
    handRearTarget = mixPoint(handRearTarget, slumpHandRear, memory.slump);

    /*
      손이 림까지 닿지 않는 자세(오르막 그립, 브레이크)에서
      팔이 175도 이상으로 펴져 관절이 사라지던 것을 막는다.
      닿지 않으면 닿지 않는 대로 팔꿈치를 남긴 채 뻗는다.
    */
    const armLength = upperArmLength + foreArmLength;
    const turnArmReach = armLength * settings.turnStraightenExtension;
    const maxArmReach =
        armLength *
        Phaser.Math.Linear(
            settings.maxArmExtension,
            settings.turnStraightenExtension,
            turnStraighten
        );

    /*
      방향이 뒤집히는 구간에서는 어떤 자세(자유 스윙, 림 그립, 공중)든
      손을 어깨에서 멀리 밀어 팔을 편다.
      자유 스윙만 처리하면, 브레이크로 림을 잡은 채 방향이 바뀔 때
      팔꿈치가 그대로 튄다. 실측에서 그 경우가 남아 있었다.
    */
    handFrontTarget = straightenTarget(
        shoulderFront,
        handFrontTarget,
        turnArmReach,
        turnStraighten
    );
    handRearTarget = straightenTarget(
        shoulderRear,
        handRearTarget,
        turnArmReach,
        turnStraighten
    );

    const frontArm = solveTwoBoneJoint(
        shoulderFront,
        limitReach(shoulderFront, handFrontTarget, maxArmReach),
        upperArmLength,
        foreArmLength,
        dir
    );
    /*
      뒤팔도 앞팔과 같은 방향으로 꺾어야 한다.

      사람의 팔꿈치는 양쪽 다 뒤로 접힌다. 여기에 -dir을 주면
      뒤팔만 팔꿈치가 앞으로 튀어나와 관절이 반대로 꺾인 것처럼 보인다.
      (다리는 양쪽 다 -dir이 맞다. 무릎은 앞으로 접히기 때문이다.)
    */
    const rearArm = solveTwoBoneJoint(
        shoulderRear,
        limitReach(shoulderRear, handRearTarget, maxArmReach),
        upperArmLength,
        foreArmLength,
        dir
    );

    /*
      =========================
      7. 발끝
      =========================

      접지 중에는 발끝이 림 접선을 따라 눕고,
      스윙 중에는 앞으로 들린다. 발목이 꺾이는 느낌을 만든다.
    */
    const toeLength = scale * settings.toeRatio;

    const buildToe = (footPoint, cycleAngle, lift) => {
        /*
          림 위 그 지점의 접선 방향(진행 방향 쪽)을 구한다.
          접지 중에는 발바닥이 림 곡면에 눕고, 스윙 중에는 발끝이 들린다.
        */
        const worldAngle = Math.PI / 2 - facingSigned * cycleAngle;
        const tangentX = facingSigned * Math.sin(worldAngle);
        const tangentY = -facingSigned * Math.cos(worldAngle);

        return {
            x: footPoint.x + tangentX * toeLength,
            y: footPoint.y + tangentY * toeLength - lift * 0.45
        };
    };

    const footFront = frontLeg.target;
    const footRear = rearLeg.target;
    const toeFront = buildToe(footFront, frontAngle, frontLift);
    const toeRear = buildToe(footRear, rearAngle, rearLift);

    /*
      =========================
      8. 실루엣 두께
      =========================
    */
    const unit = scale;
    const bulk = settings.bulk;
    const rig = {
        hip,
        waist,
        chest,
        head,
        face,
        headRadius,
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
        width: {
            hip: unit * 0.088 * bulk,
            waist: unit * 0.072 * bulk,
            chest: unit * 0.092 * bulk,
            shoulder: unit * 0.058 * bulk,
            neck: unit * 0.042 * bulk,
            thighTop: unit * 0.062 * bulk,
            thighEnd: unit * 0.044 * bulk,
            ankle: unit * 0.038 * bulk,
            toe: unit * 0.026 * bulk,

            /*
              팔 두께.

              외곽선이 양쪽으로 outlineWidth씩 붙기 때문에, 원래 값(0.05/0.036/0.03)에서는
              팔뚝의 밝은 부분이 전체 폭의 34%밖에 되지 않아 외곽선만 보였다.
              지금 값은 약 47%로, 다리(약 50%)와 비슷하게 읽힌다.
            */
            upperArmTop: unit * 0.064 * bulk,
            upperArmEnd: unit * 0.05 * bulk,
            wrist: unit * 0.044 * bulk
        }
    };

    /*
      어두운 외곽을 먼저 크게 깔고 밝은 몸을 위에 올린다.
      자개 바퀴와 흑칠 배경 사이에서 인물 실루엣이 묻히지 않게 하는 장치다.
    */
    if (settings.outlineEnabled) {
        drawRunnerPass(graphics, rig, {
            color: player.humanShadowColor,
            rearColor: player.humanShadowColor,
            grow: settings.outlineWidth,
            alpha: 0.95
        });
    }

    drawRunnerPass(graphics, rig, {
        color: player.humanColor,
        rearColor: shadeColor(
            player.humanColor,
            player.humanShadowColor,
            settings.rearLimbShade
        ),
        grow: 0,
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
