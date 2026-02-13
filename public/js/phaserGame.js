// ============================================
// PHASER GAME MODULE — Phaser Renderer + Logic
// ============================================
const PhaserGame = (() => {
    let game = null;
    let scene = null;
    let containerId = null;
    let rendererType = null;
    let webglFallbackInstalled = false;
    let fallbackInProgress = false;
    let rendererReady = false;
    let lastInitError = null;
    const readyWaiters = [];

    // Shared state from network
    let gameState = null;
    let myId = '';
    let config = null;
    let seed = null;
    let racePlan = null;

    // Prediction
    let predictedLane = null;
    let predictionTimestamp = 0;

    // Smooth distance tracking (ported from old Renderer)
    const displayDistances = new Map();
    const serverSnapshots = new Map();
    let localDistance = 0;
    let localImmediateEffect = null;
    const syncedObstacleEffects = new Map();

    // Callback for collision hit
    let onHitCallback = null;

    // Phaser objects
    let road = null;
    let cars = null;
    let obstacles = null;
    let hud = null;
    let effects = null;

    function init(containerElId) {
        if (game) return;

        // Remember container for possible renderer fallback.
        containerId = containerElId;

        // Prefer WebGL, but allow forcing Canvas renderer for problematic drivers.
        const forced = (typeof localStorage !== 'undefined')
            ? localStorage.getItem('phaser_force_canvas')
            : null;
        rendererType = forced ? Phaser.CANVAS : Phaser.AUTO;

        installWebglFallbackOnce();

        const RacingScene = new Phaser.Class({
            Extends: Phaser.Scene,
            initialize: function RacingScene() {
                Phaser.Scene.call(this, { key: 'RacingScene' });
            },
            preload: function () {
                // Vehicle sprites (optional). If missing, we fall back to canvas shapes.
                const vehicles = [
                    'car', 'taxi', 'bus', 'police', 'trafficpolice',
                    'truck', 'sport', 'icecream', 'tank', 'f1', 'bike'
                ];
                for (const v of vehicles) {
                    this.load.image(`veh_${v}`, `assets/vehicles/${v}.png`);
                }
            },
            create: function () {
                scene = this;
                rendererReady = true;
                lastInitError = null;
                while (readyWaiters.length > 0) {
                    const waiter = readyWaiters.shift();
                    waiter.resolve(true);
                }

                this.scale.on('resize', (size) => {
                    resize(size.width, size.height);
                });

                effects = createEffects(this);
                road = createRoad(this);
                obstacles = createObstacles(this);
                cars = createCars(this);
                hud = createHud(this);
            },
            update: function (timeMs, deltaMs) {
                const dt = Math.min(deltaMs / 1000, 0.05);
                if (!gameState || !gameState.players || !myId) return;

                updateSmoothDistances(dt);

                const myPlayer = gameState.players.find(p => p.id === myId);
                if (!myPlayer) return;

                const mySmoothDist = displayDistances.get(myId) ?? myPlayer.distance;
                const laneCount = getLaneCount();
                const myLane = (predictedLane !== null) ? predictedLane : myPlayer.lane;

                road.update(mySmoothDist, laneCount);
                obstacles.update(mySmoothDist, myLane, laneCount);
                cars.update(mySmoothDist, laneCount);
                hud.update(mySmoothDist);
                effects.update(dt);

                if (gameState.state === 'RACING' && myPlayer.status !== 'rewarded') {
                    obstacles.checkCollisions(mySmoothDist, myLane, laneCount);
                }
            }
        });

        const gameConfig = {
            type: rendererType,
            parent: containerId,
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: '#1a1a2e',
            scale: {
                mode: Phaser.Scale.RESIZE,
                autoCenter: Phaser.Scale.CENTER_BOTH
            },
            render: {
                antialias: false,
                pixelArt: false,
                roundPixels: true,
                powerPreference: 'high-performance'
            },
            fps: {
                target: 60,
                min: 30,
                forceSetTimeOut: false
            },
            scene: [RacingScene]
        };

        // Some devices throw WebGL framebuffer errors synchronously during boot.
        try {
            game = new Phaser.Game(gameConfig);
        } catch (e) {
            // Force Canvas and retry once.
            forceCanvasAndReinit();
        }
    }

    function forceCanvasAndReinit() {
        if (fallbackInProgress) return;
        fallbackInProgress = true;

        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('phaser_force_canvas', '1');
            }
        } catch (err) {
            // ignore
        }

        try { if (game) game.destroy(true); } catch (e) { }
        game = null;
        scene = null;

        // Retry init using Canvas renderer.
        try {
            rendererType = Phaser.CANVAS;
            init(containerId);
        } catch (e) {
            lastInitError = e;
            while (readyWaiters.length > 0) {
                const waiter = readyWaiters.shift();
                waiter.reject(e);
            }
        } finally {
            fallbackInProgress = false;
        }
    }

    function installWebglFallbackOnce() {
        if (webglFallbackInstalled) return;
        webglFallbackInstalled = true;

        // Some GPUs/drivers throw framebuffer init errors during WebGL boot.
        // Auto-fallback to Canvas to keep the game playable.
        window.addEventListener('error', (e) => {
            const msg = (e && e.message) ? String(e.message) : '';
            if (!msg.includes('Framebuffer status: Incomplete Attachment')) return;

            // Handle both sync-boot (game not assigned yet) and async runtime errors.
            forceCanvasAndReinit();
        }, true);
    }

    function destroy() {
        if (!game) return;
        try { game.destroy(true); } catch (e) { }
        game = null;
        scene = null;
        rendererReady = false;
    }

    function waitUntilReady(timeoutMs = 10000) {
        if (rendererReady && scene && game) {
            return Promise.resolve(true);
        }
        if (lastInitError) {
            return Promise.reject(lastInitError);
        }
        return new Promise((resolve, reject) => {
            const waiter = { resolve, reject };
            readyWaiters.push(waiter);

            const timeout = setTimeout(() => {
                const idx = readyWaiters.indexOf(waiter);
                if (idx >= 0) readyWaiters.splice(idx, 1);
                reject(new Error('Khởi tạo màn hình game quá thời gian chờ'));
            }, timeoutMs);

            waiter.resolve = (value) => {
                clearTimeout(timeout);
                resolve(value);
            };
            waiter.reject = (err) => {
                clearTimeout(timeout);
                reject(err);
            };
        });
    }

    function start(playerId) {
        myId = playerId;
    }

    function stop() {
        // Phaser loop keeps running; we just stop updating via clearing state.
        gameState = null;
        racePlan = null;
        localImmediateEffect = null;
        syncedObstacleEffects.clear();

        if (cars && cars.hideAll) cars.hideAll();
        if (obstacles && obstacles.hideAll) obstacles.hideAll();
        if (hud && hud.hideAll) hud.hideAll();
    }

    function setGameState(state, lastInputTime, gameConfig) {
        gameState = state;
        if (gameConfig) config = gameConfig;
        if (state && state.seed) seed = state.seed;

        if (hud && hud.showAll) hud.showAll();

        if (gameState && gameState.players) {
            const now = performance.now();
            for (const p of gameState.players) {
                const networkSpeed = (p.speed !== undefined) ? p.speed : 0;
                serverSnapshots.set(p.id, { dist: p.distance, time: now, speed: networkSpeed });

                if (!displayDistances.has(p.id)) {
                    displayDistances.set(p.id, p.distance);
                    if (p.id === myId) localDistance = p.distance;
                }
            }
        }

        // Reconciliation logic
        if (myId && gameState && gameState.players) {
            const serverPlayer = gameState.players.find(p => p.id === myId);
            if (serverPlayer && predictedLane !== null) {
                if (serverPlayer.lane === predictedLane) {
                    predictedLane = null;
                } else if (Date.now() - predictionTimestamp > 500) {
                    predictedLane = null;
                }
            }
            if (serverPlayer && localImmediateEffect) {
                const confirmedByServer =
                    (localImmediateEffect.type === 'stone' && serverPlayer.status === 'stopped') ||
                    (localImmediateEffect.type === 'oil' && serverPlayer.status === 'spinning');
                if (confirmedByServer) {
                    localImmediateEffect = null;
                }
            }
        }
    }

    function setRacePlan(plan) {
        if (!plan) return;
        racePlan = {
            ...plan,
            obstacles: Array.isArray(plan.obstacles)
                ? [...plan.obstacles].sort((a, b) => (a.distance || 0) - (b.distance || 0))
                : []
        };
        if (plan.seed) seed = plan.seed;
        if (plan.config) config = plan.config;
    }

    function predictMove(direction, laneCount) {
        if (!gameState || !myId) return;
        const p = gameState.players.find(p => p.id === myId);
        if (!p) return;

        let currentLane = (predictedLane !== null) ? predictedLane : p.lane;
        if (direction === 'left' && currentLane > 0) currentLane--;
        else if (direction === 'right' && currentLane < laneCount - 1) currentLane++;

        predictedLane = currentLane;
        predictionTimestamp = Date.now();
    }

    function getGameState() {
        return gameState;
    }

    function setOnHit(callback) {
        onHitCallback = callback;
    }

    function applyLocalObstacleHit(type) {
        if (!gameState || !gameState.players || !myId) return;
        const me = gameState.players.find((p) => p.id === myId);
        if (!me) return;

        const base = (config && Number(config.baseSpeed)) || 300;
        const stoneTime = (config && Number(config.stoneStopTime)) || 1.0;
        const oilTime = (config && Number(config.oilSpinTime)) || 1.5;

        if (type === 'stone') {
            me.status = 'stopped';
            me.effectType = null;
            me.effectTimer = stoneTime;
            me.speed = 0;
        } else if (type === 'oil') {
            me.status = 'spinning';
            me.effectType = null;
            me.effectTimer = oilTime;
            me.speed = base * 0.1;
        } else {
            return;
        }

        localImmediateEffect = {
            type,
            until: Date.now() + ((type === 'stone' ? stoneTime : oilTime) * 1000)
        };

        const snap = serverSnapshots.get(myId);
        if (snap) {
            const myDisplayDist = displayDistances.get(myId);
            if (Number.isFinite(myDisplayDist)) {
                localDistance = myDisplayDist;
                snap.dist = myDisplayDist;
            }
            snap.speed = me.speed;
            snap.time = performance.now();
            serverSnapshots.set(myId, snap);
        }
    }

    function applySyncedObstacleEffect(playerId, type, durationSec) {
        if (!playerId || (type !== 'stone' && type !== 'oil')) return;
        const dur = Math.max(0.1, Number(durationSec) || 0.8);
        syncedObstacleEffects.set(playerId, {
            type,
            until: Date.now() + (dur * 1000)
        });
    }

    function clearPredictionLane() {
        predictedLane = null;
    }

    function updateSmoothDistances(dt) {
        if (!gameState || !gameState.players) return;
        const now = performance.now();

        for (const p of gameState.players) {
            const snap = serverSnapshots.get(p.id);
            let current = displayDistances.get(p.id) ?? p.distance;
            const syncedFx = syncedObstacleEffects.get(p.id);
            const syncedActive = !!(syncedFx && Date.now() < syncedFx.until);
            if (syncedFx && !syncedActive) {
                syncedObstacleEffects.delete(p.id);
            }

            if (snap) {
                const timeSince = (now - snap.time) / 1000;
                const predictedServerDist = snap.dist + snap.speed * timeSince;
                const isLocal = (p.id === myId);
                const syncedSpeed = syncedActive
                    ? (syncedFx.type === 'stone'
                        ? 0
                        : (((config && Number(config.baseSpeed)) || 300) * 0.1))
                    : null;

                if (isLocal) {
                    const overrideActive = !!(localImmediateEffect && Date.now() < localImmediateEffect.until);
                    const localSpeed = overrideActive
                        ? ((localImmediateEffect.type === 'stone') ? 0 : (((config && Number(config.baseSpeed)) || 300) * 0.1))
                        : null;
                    const overrideSpeed = (localSpeed !== null) ? localSpeed : ((syncedSpeed !== null) ? syncedSpeed : snap.speed);
                    const predictedRefDist = snap.dist + overrideSpeed * timeSince;
                    localDistance += overrideSpeed * dt;
                    const diff = predictedRefDist - localDistance;

                    if (gameState.state !== 'RACING') {
                        localDistance = snap.dist;
                    } else if (Math.abs(diff) > 300) {
                        localDistance = predictedRefDist;
                    } else {
                        localDistance += diff * ((localSpeed !== null || syncedSpeed !== null) ? 0.02 : 0.05);
                    }
                    current = localDistance;
                } else {
                    const predictedDist = (syncedSpeed !== null) ? (snap.dist + syncedSpeed * timeSince) : predictedServerDist;
                    const diff = predictedDist - current;
                    if (gameState.state !== 'RACING') {
                        current = snap.dist;
                    } else if (Math.abs(diff) > 300) {
                        current = predictedDist;
                    } else {
                        current += diff * 0.15;
                    }
                }
            }

            displayDistances.set(p.id, current);
        }
    }

    function resize(width, height) {
        if (!scene) return;
        if (road) road.resize(width, height);
        if (hud) hud.resize(width, height);
        if (effects) effects.resize(width, height);
    }

    function getLaneCount() {
        if (!gameState || !gameState.players) return 3;
        return (gameState.players.length || 2) + 1;
    }

    function laneX(laneIndex, laneCount) {
        const laneWidth = (config && config.laneWidth) ? config.laneWidth : 80;
        const roadWidth = laneCount * laneWidth;
        const roadX = (scene.scale.width - roadWidth) / 2;
        return roadX + laneIndex * laneWidth + laneWidth / 2;
    }

    function getSeedRandom(modifier) {
        if (!seed) return Math.random();
        let s = (seed + Math.floor(modifier)) >>> 0;
        s = Math.imul(s, 1103515245) + 12345;
        s = s >>> 0;
        return (s & 0x7fffffff) / 0x7fffffff;
    }

    function deterministicObstacleLanes(rowDistance, laneCount) {
        const numRand = getSeedRandom(rowDistance + 789);
        const numObstacles = Math.floor(numRand * (laneCount - 1)) + 1;

        const lanes = [];
        for (let i = 0; i < laneCount; i++) lanes.push(i);
        for (let i = lanes.length - 1; i > 0; i--) {
            const jRand = getSeedRandom(rowDistance + i + 999);
            const j = Math.floor(jRand * (i + 1));
            const tmp = lanes[i];
            lanes[i] = lanes[j];
            lanes[j] = tmp;
        }

        return lanes.slice(0, numObstacles);
    }

    function deterministicObstacleType(d, lane) {
        const typeRand = getSeedRandom(d + lane + 555);
        return (typeRand < 0.6) ? 'stone' : 'oil';
    }

    function ensureCanvasTexture(s, key, w, h, drawFn) {
        if (s.textures.exists(key)) return;
        const tex = s.textures.createCanvas(key, w, h);
        const ctx = tex.getContext();
        ctx.clearRect(0, 0, w, h);
        drawFn(ctx, w, h);
        tex.refresh();
    }

    function createRoad(s) {
        const textures = {};

        const posMod = (n, mod) => ((n % mod) + mod) % mod;

        // Generate small repeating textures for tiles
        const makeTexture = (key, drawFn, w, h) => {
            const g = s.make.graphics({ x: 0, y: 0, add: false });
            drawFn(g, w, h);
            g.generateTexture(key, w, h);
            g.destroy();
            textures[key] = key;
        };

        makeTexture('__grass1', (g, w, h) => {
            g.fillStyle(0x3a8c2e, 1);
            g.fillRect(0, 0, w, h);
            g.fillStyle(0x2d7a22, 1);
            g.fillRect(0, 0, w, h / 2);
        }, 32, 80);

        makeTexture('__road', (g, w, h) => {
            g.fillStyle(0x505050, 1);
            g.fillRect(0, 0, w, h);
        }, 32, 32);

        const grass = s.add.tileSprite(0, 0, s.scale.width, s.scale.height, textures['__grass1']).setOrigin(0, 0);

        // Shoulder base + moving rumble strip overlay
        ensureCanvasTexture(s, '__shoulder_strip', 16, 64, (ctx, w, h) => {
            ctx.fillStyle = '#d4a843';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            for (let y = 0; y < h; y += 16) {
                ctx.fillRect(0, y, w, 8);
            }
            ctx.fillStyle = 'rgba(255,255,255,0.10)';
            ctx.fillRect(w - 3, 0, 3, h);
        });

        const shoulder = s.add.rectangle(0, 0, 10, s.scale.height, 0xd4a843).setOrigin(0, 0);
        const leftShoulder = s.add.tileSprite(0, 0, 10, s.scale.height, '__shoulder_strip').setOrigin(0, 0).setAlpha(0.9);
        const rightShoulder = s.add.tileSprite(0, 0, 10, s.scale.height, '__shoulder_strip').setOrigin(0, 0).setAlpha(0.9);
        const roadRect = s.add.rectangle(0, 0, 10, s.scale.height, 0x505050).setOrigin(0, 0);
        const leftEdge = s.add.rectangle(0, 0, 4, s.scale.height, 0xffffff).setOrigin(0, 0);
        const rightEdge = s.add.rectangle(0, 0, 4, s.scale.height, 0xffffff).setOrigin(0, 0);

        // Lane markers are drawn by a graphics object for flexibility (lane count changes)
        const laneGfx = s.add.graphics();
        laneGfx.setDepth(5);

        // Roadside decor (trees/bushes)
        const decorSpacing = 200;
        const decorPool = [];
        const decorActive = [];

        ensureCanvasTexture(s, '__decor_tree', 64, 96, (ctx, w, h) => {
            ctx.save();
            ctx.translate(w / 2, h / 2);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            ctx.beginPath();
            ctx.ellipse(0, 34, 18, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Trunk
            ctx.fillStyle = '#5a3a1a';
            ctx.fillRect(-5, 10, 10, 26);

            // Canopy
            ctx.fillStyle = '#1e7a1e';
            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2a9a2a';
            ctx.beginPath();
            ctx.arc(-10, -10, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.beginPath();
            ctx.arc(10, -10, 12, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });

        ensureCanvasTexture(s, '__decor_bush', 64, 48, (ctx, w, h) => {
            ctx.save();
            ctx.translate(w / 2, h / 2);

            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.beginPath();
            ctx.ellipse(0, 14, 22, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#2d7a22';
            ctx.beginPath();
            ctx.arc(-14, 4, 14, 0, Math.PI * 2);
            ctx.arc(0, -2, 18, 0, Math.PI * 2);
            ctx.arc(14, 6, 12, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.10)';
            ctx.beginPath();
            ctx.arc(-6, -8, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });

        function layout(laneCount) {
            const laneWidth = (config && config.laneWidth) ? config.laneWidth : 80;
            const roadWidth = laneCount * laneWidth;
            const roadX = (s.scale.width - roadWidth) / 2;
            const shoulderW = 8;

            grass.setSize(s.scale.width, s.scale.height);
            shoulder.setPosition(roadX - shoulderW, 0);
            shoulder.setSize(roadWidth + shoulderW * 2, s.scale.height);

            leftShoulder.setPosition(roadX - shoulderW, 0);
            leftShoulder.setSize(shoulderW, s.scale.height);
            rightShoulder.setPosition(roadX + roadWidth, 0);
            rightShoulder.setSize(shoulderW, s.scale.height);

            roadRect.setPosition(roadX, 0);
            roadRect.setSize(roadWidth, s.scale.height);

            leftEdge.setPosition(roadX, 0);
            leftEdge.setSize(3, s.scale.height);
            rightEdge.setPosition(roadX + roadWidth - 3, 0);
            rightEdge.setSize(3, s.scale.height);

            laneGfx.clear();
            laneGfx.fillStyle(0xffffff, 0.5);

            const dashH = 40;
            const dashGap = 30;
            const dashW = 3;
            for (let i = 1; i < laneCount; i++) {
                const x = roadX + i * laneWidth - dashW / 2;
                for (let y = -dashH; y < s.scale.height + dashH; y += dashH + dashGap) {
                    laneGfx.fillRect(x, y, dashW, dashH);
                }
            }

            // Update decor x positions on relayout
            for (const spr of decorActive) {
                spr.__roadX = roadX;
                spr.__roadWidth = roadWidth;
            }
        }

        let lastLaneCount = -1;
        function update(distance, laneCount) {
            if (laneCount !== lastLaneCount) {
                layout(laneCount);
                lastLaneCount = laneCount;
            }

            // Make road, lane marks, shoulders, and decor scroll the same
            // direction and at the same speed.
            const grassStride = 80;
            grass.tilePositionY = posMod(-distance, grassStride);

            const totalDash = 40 + 30;
            laneGfx.y = posMod(distance, totalDash);

            leftShoulder.tilePositionY = posMod(-distance, 64);
            rightShoulder.tilePositionY = posMod(-distance, 64);

            updateDecor(distance, laneCount);
        }

        function acquireDecor() {
            if (decorPool.length) return decorPool.pop();
            const spr = s.add.image(0, 0, '__decor_tree');
            spr.setOrigin(0.5, 0.5);
            spr.setDepth(2);
            return spr;
        }

        function updateDecor(distance, laneCount) {
            const laneWidth = (config && config.laneWidth) ? config.laneWidth : 80;
            const roadWidth = laneCount * laneWidth;
            const roadX = (s.scale.width - roadWidth) / 2;

            const offset = posMod(distance, decorSpacing);
            const numRows = Math.ceil((s.scale.height + decorSpacing * 2) / decorSpacing);
            const desired = numRows * 2;

            while (decorActive.length < desired) {
                const spr = acquireDecor();
                decorActive.push(spr);
            }

            // Position items along both sides, staggered.
            let i = 0;
            for (let y = -decorSpacing + offset; y < s.scale.height + decorSpacing; y += decorSpacing) {
                const left = decorActive[i++];
                const right = decorActive[i++];

                const wobble = Math.sin((distance / 300) + y * 0.01) * 6;
                const leftX = roadX - 44 + wobble;
                const rightX = roadX + roadWidth + 44 - wobble;

                // Alternate tree/bush to add variety
                const isTree = ((Math.floor((distance + y) / decorSpacing) % 2) === 0);
                left.setTexture(isTree ? '__decor_tree' : '__decor_bush');
                right.setTexture(isTree ? '__decor_bush' : '__decor_tree');

                left.setPosition(leftX, y);
                right.setPosition(rightX, y + decorSpacing / 2);

                left.setVisible(true);
                right.setVisible(true);

                left.setScale(isTree ? 0.85 : 1.0);
                right.setScale(isTree ? 1.0 : 0.85);

                left.setAlpha(0.95);
                right.setAlpha(0.95);
            }

            // Hide any extra pooled sprites
            for (; i < decorActive.length; i++) {
                decorActive[i].setVisible(false);
            }
        }

        function resize() {
            // force relayout on next update
            lastLaneCount = -1;
        }

        return { update, resize };
    }

    function createCars(s) {
        const sprites = new Map();
        const nameTags = new Map();
        const laneSmooth = new Map();
        const bubbleBurstAt = new Map();
        const bubbleBurstDone = new Set();
        const bubbleParticles = [];

        function ensureCarTextures() {
            // Split into layers so tint only affects body.
            const w = 72;
            const h = 120;
            const bodyW = 36;
            const bodyH = 60;
            const scale = w / bodyW;

            ensureCanvasTexture(s, '__car_shadow', w, h, (ctx, W, H) => {
                ctx.save();
                ctx.translate(W / 2, H / 2);
                ctx.fillStyle = 'rgba(0,0,0,0.22)';
                ctx.beginPath();
                ctx.ellipse(4 * scale, 8 * scale, 20 * scale, 30 * scale, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });

            function drawBody(ctx, W, H, variant) {
                const bw = variant.bodyW * scale;
                const bh = variant.bodyH * scale;
                const x = (W - bw) / 2;
                const y = (H - bh) / 2;
                const r = 8 * scale;

                ctx.save();
                ctx.fillStyle = variant.color;
                roundRect(ctx, x, y, bw, bh, r);
                ctx.fill();

                ctx.fillStyle = 'rgba(0,0,0,0.18)';
                roundRectTop(ctx, x, y, bw, bh / 2 + 6 * scale, r);
                ctx.fill();

                if (variant.stripe) {
                    ctx.fillStyle = variant.stripe;
                    ctx.fillRect(W / 2 - 3 * scale, y, 6 * scale, bh);
                }

                if (variant.checker) {
                    ctx.fillStyle = variant.checker;
                    const size = 6 * scale;
                    for (let i = 0; i < 4; i++) {
                        const cx = x + 6 * scale + i * size;
                        const cy = y + bh - 12 * scale;
                        ctx.fillRect(cx, cy, size - 2, size - 2);
                    }
                }

                if (variant.windows) {
                    ctx.fillStyle = variant.windows;
                    const winW = 8 * scale;
                    const winH = 10 * scale;
                    for (let i = 0; i < 4; i++) {
                        const wx = x + 6 * scale + i * (winW + 4 * scale);
                        const wy = y + 10 * scale;
                        ctx.fillRect(wx, wy, winW, winH);
                    }
                }

                if (variant.siren) {
                    ctx.fillStyle = variant.siren;
                    ctx.fillRect(W / 2 - 6 * scale, y - 2 * scale, 12 * scale, 6 * scale);
                }

                ctx.restore();
            }

            ensureCanvasTexture(s, '__car_body_car', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 36,
                    bodyH: 60,
                    color: '#ffffff',
                    stripe: 'rgba(255,255,255,0.14)'
                });
            });

            ensureCanvasTexture(s, '__car_body_taxi', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 36,
                    bodyH: 60,
                    color: '#f5c518',
                    stripe: 'rgba(0,0,0,0.2)',
                    checker: '#1a1a1a'
                });
            });

            ensureCanvasTexture(s, '__car_body_bus', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 44,
                    bodyH: 80,
                    color: '#e84a3a',
                    stripe: 'rgba(255,255,255,0.12)',
                    windows: 'rgba(180, 220, 255, 0.7)'
                });
            });

            ensureCanvasTexture(s, '__car_body_police', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 36,
                    bodyH: 60,
                    color: '#3b4b7a',
                    stripe: 'rgba(255,255,255,0.35)',
                    siren: '#ff4444'
                });
                ctx.save();
                const scale = W / 36;
                ctx.fillStyle = '#ffffff';
                ctx.font = `${8 * scale}px Outfit, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('POLICE', W / 2, H * 0.55);
                ctx.fillStyle = '#1e90ff';
                ctx.fillRect(W / 2 - 12 * scale, H * 0.18, 8 * scale, 5 * scale);
                ctx.fillStyle = '#ff4444';
                ctx.fillRect(W / 2 + 4 * scale, H * 0.18, 8 * scale, 5 * scale);
                ctx.restore();
            });

            ensureCanvasTexture(s, '__car_body_ambulance', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 40,
                    bodyH: 70,
                    color: '#ffffff',
                    stripe: '#e94560',
                    siren: '#27ae60'
                });
            });

            ensureCanvasTexture(s, '__car_body_truck', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 46,
                    bodyH: 76,
                    color: '#6b5b95',
                    stripe: 'rgba(255,255,255,0.12)'
                });
            });

            ensureCanvasTexture(s, '__car_body_sport', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 34,
                    bodyH: 56,
                    color: '#ff6b6b',
                    stripe: '#ffffff'
                });
            });

            ensureCanvasTexture(s, '__car_body_icecream', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 38,
                    bodyH: 62,
                    color: '#ffd1dc',
                    stripe: '#8be9fd',
                    checker: '#ffffff'
                });
                ctx.save();
                const scale = W / 36;
                ctx.translate(W / 2, H * 0.28);
                ctx.fillStyle = '#f5c518';
                ctx.beginPath();
                ctx.moveTo(0, 12 * scale);
                ctx.lineTo(-6 * scale, -2 * scale);
                ctx.lineTo(6 * scale, -2 * scale);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#ff8dc7';
                ctx.beginPath();
                ctx.arc(0, -6 * scale, 7 * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });

            // Traffic police car (yellow + black stripe + siren)
            ensureCanvasTexture(s, '__car_body_trafficpolice', w, h, (ctx, W, H) => {
                drawBody(ctx, W, H, {
                    bodyW: 36,
                    bodyH: 60,
                    color: '#f5c518',
                    stripe: '#111111',
                    siren: '#1e90ff'
                });
            });

            // Tank (distinct shape)
            ensureCanvasTexture(s, '__car_body_tank', w, h, (ctx, W, H) => {
                const scale = W / 36;
                ctx.save();
                // Tracks
                ctx.fillStyle = '#2f2f2f';
                ctx.fillRect(W * 0.2, H * 0.62, W * 0.6, H * 0.22);
                // Body
                ctx.fillStyle = '#5b6b4f';
                ctx.fillRect(W * 0.22, H * 0.35, W * 0.56, H * 0.3);
                // Turret
                ctx.fillStyle = '#4a5a40';
                ctx.fillRect(W * 0.38, H * 0.22, W * 0.24, H * 0.14);
                // Barrel
                ctx.fillStyle = '#3a4532';
                ctx.fillRect(W * 0.5, H * 0.16, W * 0.32, H * 0.06);
                ctx.fillRect(W * 0.78, H * 0.14, W * 0.08, H * 0.1);
                ctx.restore();
            });

            // F1 car (low + wide + wings)
            ensureCanvasTexture(s, '__car_body_f1', w, h, (ctx, W, H) => {
                ctx.save();
                // Main body
                ctx.fillStyle = '#ff3b30';
                ctx.fillRect(W * 0.24, H * 0.52, W * 0.52, H * 0.2);
                // Nose
                ctx.fillRect(W * 0.46, H * 0.22, W * 0.08, H * 0.3);
                // Side pods
                ctx.fillRect(W * 0.18, H * 0.56, W * 0.1, H * 0.14);
                ctx.fillRect(W * 0.72, H * 0.56, W * 0.1, H * 0.14);
                // Front wing
                ctx.fillStyle = '#111111';
                ctx.fillRect(W * 0.2, H * 0.72, W * 0.6, H * 0.05);
                // Rear wing
                ctx.fillRect(W * 0.22, H * 0.46, W * 0.56, H * 0.06);
                // Wheels
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(W * 0.18, H * 0.72, W * 0.12, H * 0.08);
                ctx.fillRect(W * 0.7, H * 0.72, W * 0.12, H * 0.08);
                ctx.restore();
            });

            // Bike (slim body + wheels)
            ensureCanvasTexture(s, '__car_body_bike', w, h, (ctx, W, H) => {
                ctx.save();
                ctx.fillStyle = '#222222';
                ctx.beginPath();
                ctx.arc(W * 0.35, H * 0.75, W * 0.08, 0, Math.PI * 2);
                ctx.arc(W * 0.65, H * 0.75, W * 0.08, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#4a90e2';
                ctx.fillRect(W * 0.44, H * 0.45, W * 0.12, H * 0.25);
                ctx.fillRect(W * 0.5, H * 0.35, W * 0.18, H * 0.06);
                ctx.restore();
            });

            ensureCanvasTexture(s, '__car_details', w, h, (ctx, W, H) => {
                const bw = 36 * scale;
                const bh = 60 * scale;
                const x = (W - bw) / 2;
                const y = (H - bh) / 2;

                ctx.save();

                // Windshield
                ctx.fillStyle = '#87ceeb';
                roundRect(ctx, x + 5 * scale, y + 8 * scale, bw - 10 * scale, 18 * scale, 4 * scale);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                roundRect(ctx, x + 7 * scale, y + 10 * scale, 10 * scale, 14 * scale, 3 * scale);
                ctx.fill();

                // Rear window
                ctx.fillStyle = '#87ceeb';
                roundRect(ctx, x + 6 * scale, y + bh - 20 * scale, bw - 12 * scale, 12 * scale, 3 * scale);
                ctx.fill();

                // Wheels
                ctx.fillStyle = '#222222';
                ctx.fillRect(x - 4 * scale, y + 6 * scale, 6 * scale, 14 * scale);
                ctx.fillRect(x + bw - 2 * scale, y + 6 * scale, 6 * scale, 14 * scale);
                ctx.fillRect(x - 4 * scale, y + bh - 20 * scale, 6 * scale, 14 * scale);
                ctx.fillRect(x + bw - 2 * scale, y + bh - 20 * scale, 6 * scale, 14 * scale);

                // Headlights
                ctx.fillStyle = '#fff3b0';
                ctx.beginPath();
                ctx.arc(x + 8 * scale, y + 2 * scale, 4 * scale, 0, Math.PI * 2);
                ctx.arc(x + bw - 8 * scale, y + 2 * scale, 4 * scale, 0, Math.PI * 2);
                ctx.fill();

                // Tail lights
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(x + 7 * scale, y + bh - 3 * scale, 3 * scale, 0, Math.PI * 2);
                ctx.arc(x + bw - 7 * scale, y + bh - 3 * scale, 3 * scale, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            });

            ensureCanvasTexture(s, '__car_details_bus', w, h, (ctx, W, H) => {
                const bw = 44 * scale;
                const bh = 80 * scale;
                const x = (W - bw) / 2;
                const y = (H - bh) / 2;

                ctx.save();
                // Long windows row
                ctx.fillStyle = 'rgba(180, 220, 255, 0.85)';
                const winW = 10 * scale;
                const winH = 12 * scale;
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(x + 6 * scale + i * (winW + 4 * scale), y + 10 * scale, winW, winH);
                }

                // Wheels (bigger)
                ctx.fillStyle = '#222222';
                ctx.fillRect(x - 2 * scale, y + 10 * scale, 7 * scale, 16 * scale);
                ctx.fillRect(x + bw - 5 * scale, y + 10 * scale, 7 * scale, 16 * scale);
                ctx.fillRect(x - 2 * scale, y + bh - 22 * scale, 7 * scale, 16 * scale);
                ctx.fillRect(x + bw - 5 * scale, y + bh - 22 * scale, 7 * scale, 16 * scale);

                // Headlights
                ctx.fillStyle = '#fff3b0';
                ctx.fillRect(x + 4 * scale, y + 2 * scale, 6 * scale, 3 * scale);
                ctx.fillRect(x + bw - 10 * scale, y + 2 * scale, 6 * scale, 3 * scale);

                ctx.restore();
            });
        }

        function roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        function roundRectTop(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x, y + h);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        function ensureBubbleTextures() {
            ensureCanvasTexture(s, '__bubble_piece', 10, 10, (ctx, w, h) => {
                ctx.save();
                ctx.translate(w / 2, h / 2);
                ctx.fillStyle = 'rgba(180, 220, 255, 0.9)';
                ctx.beginPath();
                ctx.ellipse(0, 0, 4, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }

        ensureCarTextures();
        ensureBubbleTextures();

        function update(mySmoothDist, laneCount) {
            if (!gameState || !gameState.players) return;
            const height = s.scale.height;
            const w = s.scale.width;
            const dt = Math.min((s.game.loop.delta || 16) / 1000, 0.05);

            const seen = new Set();
            for (const p of gameState.players) {
                seen.add(p.id);

                let sprite = sprites.get(p.id);
                let label = nameTags.get(p.id);
                if (!sprite) {
                    const container = s.add.container(0, 0);
                    const shadow = s.add.image(0, 0, '__car_shadow').setOrigin(0.5, 0.5);
                    const body = s.add.image(0, 0, '__car_body_car').setOrigin(0.5, 0.5);
                    const details = s.add.image(0, 0, '__car_details').setOrigin(0.5, 0.5);
                    container.add([shadow, body, details]);
                    container.setDepth(4);
                    sprites.set(p.id, { container, body, details, shadow });

                    label = s.add.text(0, 0, p.name || '', {
                        fontFamily: 'Inter',
                        fontSize: '12px',
                        color: '#ffffff',
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        padding: { x: 6, y: 3 }
                    });
                    label.setOrigin(0.5, 1);
                    nameTags.set(p.id, label);
                }

                const isLocal = p.id === myId;
                const vehicleType = p.vehicleType || 'car';
                console.log('Rendering vehicle type:', vehicleType);
                const targetLane = (isLocal && predictedLane !== null) ? predictedLane : p.lane;

                const prevLane = laneSmooth.get(p.id);
                const currentLane = (prevLane === undefined) ? targetLane : prevLane;
                const speed = isLocal ? 18 : 8;
                const nextLane = currentLane + (targetLane - currentLane) * Math.min(speed * (s.game.loop.delta / 1000), 1);
                laneSmooth.set(p.id, nextLane);

                const x = laneX(nextLane, laneCount);
                const pSmoothDist = displayDistances.get(p.id) ?? p.distance;
                const y = isLocal ? height * 0.75 : (height * 0.75 - (pSmoothDist - mySmoothDist));
                const baseScale = isLocal ? 0.5 : 0.45;

                const car = sprites.get(p.id);
                car.container.setPosition(x, y);
                const scaleMult = 1.0;
                car.container.setScale(baseScale * scaleMult);
                car.container.setRotation(0);
                car.container.setAlpha(1);

                const imgKey = `veh_${vehicleType}`;
                const hasImg = s.textures.exists(imgKey);
                if (hasImg) {
                    if (car.body.texture && car.body.texture.key !== imgKey) {
                        car.body.setTexture(imgKey);
                    }
                    car.body.clearTint();
                    car.details.setVisible(false);
                    car.shadow.setVisible(false);

                    const laneWidth = (config && config.laneWidth) ? config.laneWidth : 80;
                    const tex = car.body.texture;
                    if (tex && tex.source && tex.source[0]) {
                        const wTex = tex.source[0].width || 1;
                        const hTex = tex.source[0].height || 1;
                        const targetW = laneWidth * 2.5;
                        const targetH = targetW * (hTex / wTex);
                        car.body.setDisplaySize(targetW, targetH);
                    }

                    // Per-vehicle rotation for image sprites
                    car.body.setRotation(Phaser.Math.DegToRad(118));
                } else {
                    const bodyKey = (vehicleType === 'taxi')
                        ? '__car_body_taxi'
                        : (vehicleType === 'bus')
                            ? '__car_body_bus'
                            : (vehicleType === 'police')
                                ? '__car_body_police'
                                : (vehicleType === 'trafficpolice')
                                    ? '__car_body_trafficpolice'
                                    : (vehicleType === 'ambulance')
                                        ? '__car_body_ambulance'
                                        : (vehicleType === 'truck')
                                            ? '__car_body_truck'
                                            : (vehicleType === 'sport')
                                                ? '__car_body_sport'
                                                : (vehicleType === 'icecream')
                                                    ? '__car_body_icecream'
                                                    : (vehicleType === 'tank')
                                                        ? '__car_body_tank'
                                                        : (vehicleType === 'f1')
                                                            ? '__car_body_f1'
                                                            : (vehicleType === 'bike')
                                                                ? '__car_body_bike'
                                                                : '__car_body_car';
                    if (car.body.texture && car.body.texture.key !== bodyKey) {
                        car.body.setTexture(bodyKey);
                    }

                    const detailsKey = (vehicleType === 'bus') ? '__car_details_bus' : '__car_details';
                    if (car.details.texture && car.details.texture.key !== detailsKey) {
                        car.details.setTexture(detailsKey);
                    }
                    if (vehicleType === 'tank' || vehicleType === 'f1' || vehicleType === 'bike') {
                        car.details.setVisible(false);
                    } else {
                        car.details.setVisible(true);
                    }

                    if (p.color && vehicleType === 'car') {
                        const tint = Phaser.Display.Color.HexStringToColor(p.color).color;
                        car.body.setTint(tint);
                    } else {
                        car.body.clearTint();
                    }
                }

                // Status effects (visual only)
                const syncedFx = syncedObstacleEffects.get(p.id);
                const syncedFxActive = !!(syncedFx && Date.now() < syncedFx.until);
                const localOverrideActive = (p.id === myId) && localImmediateEffect && (Date.now() < localImmediateEffect.until);
                const syncedStatus = syncedFxActive
                    ? ((syncedFx.type === 'oil') ? 'spinning' : 'stopped')
                    : null;
                const displayStatus = localOverrideActive
                    ? ((localImmediateEffect.type === 'oil') ? 'spinning' : 'stopped')
                    : (syncedStatus || p.status);
                if (displayStatus === 'spinning' || (p.status === 'penalized' && p.effectType === 'spin')) {
                    car.container.setRotation((s.time.now / 1000) * 6);
                    car.container.setAlpha(0.85);
                } else if (displayStatus === 'stopped') {
                    car.container.x += Math.sin((s.time.now / 1000) * 30) * 2;
                } else if (p.status === 'penalized' && p.effectType === 'blur') {
                    car.container.setAlpha(0.6);
                } else if (p.status === 'penalized' && p.effectType === 'rocket') {
                    const maxTime = Math.max(p.effectTimer || 0, getPenaltyMaxTime('rocket'));
                    const progress = maxTime > 0 ? (1 - (p.effectTimer / maxTime)) : 0;
                    const angle = progress * Math.PI * 4;
                    const radius = Math.min(w, height) * 0.35;
                    const cx = w / 2;
                    const cy = height / 2;
                    car.container.setRotation(angle * 6);
                    car.container.setPosition(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
                    car.container.setAlpha(0.9);
                } else if (p.status === 'penalized' && p.effectType === 'bubble') {
                    const maxTime = Math.max(p.effectTimer || 0, getPenaltyMaxTime('bubble'));
                    const progress = maxTime > 0 ? (1 - (p.effectTimer / maxTime)) : 0;
                    const scaleBoost = 1 + Math.min(1.2, progress * 1.4);
                    car.container.setScale(baseScale * scaleBoost);
                    if (progress > 0.8) {
                        car.container.setAlpha(Math.max(0.2, 1 - (progress - 0.8) / 0.2));
                    }

                    const burstKey = `${p.id}-bubble`;
                    if (progress >= 1 && !bubbleBurstDone.has(burstKey)) {
                        bubbleBurstDone.add(burstKey);
                        bubbleBurstAt.set(burstKey, s.time.now);
                        emitBubbleBurst(x, y);
                    }
                    const burstAt = bubbleBurstAt.get(burstKey);
                    if (burstAt) {
                        const t = (s.time.now - burstAt) / 300;
                        if (t <= 1) {
                            car.container.setAlpha(1 - t);
                        } else {
                            bubbleBurstAt.delete(burstKey);
                        }
                    }
                } else if (p.status === 'rewarded') {
                    // subtle glow by boosting shadow alpha
                    car.shadow.setAlpha(0.28 + Math.sin((s.time.now / 1000) * 10) * 0.06);
                } else {
                    car.shadow.setAlpha(1);
                }

                if (!(p.status === 'penalized' && p.effectType === 'bubble')) {
                    const burstKey = `${p.id}-bubble`;
                    if (bubbleBurstDone.has(burstKey)) bubbleBurstDone.delete(burstKey);
                }

                const statusBadge = getPlayerStatusBadge(p);
                if (statusBadge) {
                    label.setText(`${p.name || ''} ${statusBadge}`);
                } else {
                    label.setText(p.name || '');
                }
                label.setPosition(x, y - 40);
                label.setVisible(y > -120 && y < height + 120);
                car.container.setVisible(y > -120 && y < height + 120);
            }

            // Update bubble particles
            for (let i = bubbleParticles.length - 1; i >= 0; i--) {
                const p = bubbleParticles[i];
                p.life -= dt;
                if (p.life <= 0) {
                    p.sprite.destroy();
                    bubbleParticles.splice(i, 1);
                    continue;
                }
                p.vy += 40 * dt;
                p.sprite.x += p.vx * dt;
                p.sprite.y += p.vy * dt;
                p.sprite.setRotation(p.sprite.rotation + p.rot * dt);
                p.sprite.setAlpha(Math.max(0, p.life / p.maxLife));
            }

            // Hide removed players
            for (const [id, car] of sprites.entries()) {
                if (!seen.has(id)) {
                    car.container.destroy(true);
                    sprites.delete(id);
                }
            }
            for (const [id, label] of nameTags.entries()) {
                if (!seen.has(id)) {
                    label.destroy();
                    nameTags.delete(id);
                }
            }
        }

        function hideAll() {
            for (const car of sprites.values()) {
                car.container.setVisible(false);
            }
            for (const label of nameTags.values()) {
                label.setVisible(false);
            }
        }

        function getPenaltyMaxTime(effectType) {
            if (config && config.penalties && config.penalties.types && config.penalties.types[effectType]) {
                return Number(config.penalties.types[effectType].duration) || 3;
            }
            return 3;
        }

        function emitBubbleBurst(x, y) {
            const count = 10;
            for (let i = 0; i < count; i++) {
                const spr = s.add.image(x, y, '__bubble_piece');
                spr.setOrigin(0.5, 0.5);
                spr.setDepth(8);
                const angle = (Math.PI * 2 * i) / count;
                const speed = 80 + Math.random() * 60;
                bubbleParticles.push({
                    sprite: spr,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 40,
                    rot: (Math.random() - 0.5) * 6,
                    life: 0.45 + Math.random() * 0.25,
                    maxLife: 0.7
                });
            }
        }

        function getPlayerStatusBadge(player) {
            if (!player || player.status === 'normal') return '';
            if (player.status === 'stopped') return '🛑';
            if (player.status === 'spinning') return '🌀';
            if (player.status === 'rewarded') return '🛡️';
            if (player.status === 'penalized') {
                switch (player.effectType) {
                    case 'stop': return '🛑';
                    case 'reverse': return '🔄';
                    case 'spin': return '🌀';
                    case 'blur': return '👻';
                    case 'rocket': return '🚀';
                    case 'bubble': return '🫧';
                    default: return '⚠️';
                }
            }
            return '';
        }

        return { update, hideAll };
    }

    function createObstacles(s) {
        // Texture generation using Canvas2D for richer look
        ensureCanvasTexture(s, '__stone', 64, 64, (ctx, w, h) => {
            ctx.save();
            ctx.translate(w / 2, h / 2);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(3, 12, 22, 14, 0, 0, Math.PI * 2);
            ctx.fill();

            // Rock body
            ctx.fillStyle = '#8a8a8a';
            ctx.beginPath();
            ctx.moveTo(-18, 12);
            ctx.lineTo(-14, -10);
            ctx.lineTo(-4, -18);
            ctx.lineTo(10, -15);
            ctx.lineTo(18, -5);
            ctx.lineTo(16, 14);
            ctx.lineTo(4, 18);
            ctx.lineTo(-10, 16);
            ctx.closePath();
            ctx.fill();

            // Highlight
            ctx.fillStyle = '#a0a0a0';
            ctx.beginPath();
            ctx.moveTo(-12, -6);
            ctx.lineTo(-4, -16);
            ctx.lineTo(6, -13);
            ctx.lineTo(2, -2);
            ctx.closePath();
            ctx.fill();

            // Crack
            ctx.strokeStyle = '#5a5a5a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-6, -10);
            ctx.lineTo(0, 2);
            ctx.lineTo(6, 6);
            ctx.stroke();

            // Exclamation
            ctx.fillStyle = '#ff4444';
            ctx.font = '900 18px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', 0, -26);

            ctx.restore();
        });

        ensureCanvasTexture(s, '__oil', 64, 64, (ctx, w, h) => {
            ctx.save();
            ctx.translate(w / 2, h / 2);

            // Puddle
            ctx.fillStyle = '#1a1a2e';
            ctx.beginPath();
            ctx.ellipse(0, 8, 26, 16, 0, 0, Math.PI * 2);
            ctx.fill();

            // Sheen
            const grad = ctx.createRadialGradient(-8, 2, 2, 0, 8, 26);
            grad.addColorStop(0, 'rgba(100, 200, 255, 0.28)');
            grad.addColorStop(0.45, 'rgba(200, 100, 255, 0.18)');
            grad.addColorStop(0.75, 'rgba(255, 200, 100, 0.14)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(0, 8, 24, 14, 0, 0, Math.PI * 2);
            ctx.fill();

            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.beginPath();
            ctx.ellipse(-10, 2, 9, 4, -0.3, 0, Math.PI * 2);
            ctx.fill();

            // Drip
            ctx.fillStyle = 'rgba(68,136,255,0.85)';
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.quadraticCurveTo(10, -8, 0, -4);
            ctx.quadraticCurveTo(-10, -8, 0, -18);
            ctx.fill();

            ctx.restore();
        });

        ensureCanvasTexture(s, '__qbox', 64, 64, (ctx, w, h) => {
            ctx.save();
            ctx.translate(w / 2, h / 2);

            // Glow
            ctx.shadowColor = 'rgba(245,197,24,0.7)';
            ctx.shadowBlur = 12;

            // Box
            ctx.fillStyle = '#f5c518';
            roundRect(ctx, -16, -16, 32, 32, 6);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Top shade
            ctx.fillStyle = '#d4a810';
            roundRect(ctx, -16, -16, 32, 11, 6);
            ctx.fill();

            // Question mark
            ctx.fillStyle = '#1a1a2e';
            ctx.font = '900 22px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 0, 2);

            ctx.restore();

            function roundRect(ctx2, x, y, ww, hh, rr) {
                ctx2.beginPath();
                ctx2.moveTo(x + rr, y);
                ctx2.arcTo(x + ww, y, x + ww, y + hh, rr);
                ctx2.arcTo(x + ww, y + hh, x, y + hh, rr);
                ctx2.arcTo(x, y + hh, x, y, rr);
                ctx2.arcTo(x, y, x + ww, y, rr);
                ctx2.closePath();
            }
        });

        function roundRect(ctx, x, y, ww, hh, rr) {
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
            ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
            ctx.arcTo(x, y + hh, x, y, rr);
            ctx.arcTo(x, y, x + ww, y, rr);
            ctx.closePath();
        }

        const pool = {
            stone: [],
            oil: [],
            question: []
        };
        const activeById = new Map();
        let lastCollisionDist = null;

        function acquire(type) {
            const arr = pool[type];
            if (arr && arr.length) {
                const spr = arr.pop();
                spr.setActive(true);
                spr.setVisible(true);
                return spr;
            }
            const key = (type === 'stone') ? '__stone' : (type === 'oil') ? '__oil' : '__qbox';
            const spr = s.add.image(0, 0, key);
            spr.setOrigin(0.5, 0.5);
            spr.setDepth(3);
            return spr;
        }

        function release(id) {
            const entry = activeById.get(id);
            if (!entry) return;
            const { type, sprite } = entry;
            activeById.delete(id);
            sprite.setActive(false);
            sprite.setVisible(false);
            pool[type].push(sprite);
        }

        function update(mySmoothDist, myLane, laneCount) {
            if (!racePlan || !Array.isArray(racePlan.obstacles) || !config) return;
            const height = s.scale.height;
            const renderStart = mySmoothDist - 700;
            const renderEnd = mySmoothDist + 2000;

            const visibleIds = new Set();
            const inactiveQuestionIds = new Set(
                (gameState && Array.isArray(gameState.inactiveQuestionIds)) ? gameState.inactiveQuestionIds : []
            );
            for (const obs of racePlan.obstacles) {
                if (obs.distance < renderStart || obs.distance > renderEnd) continue;
                if (obs.type === 'question' && inactiveQuestionIds.has(obs.id)) continue;
                const rel = obs.distance - mySmoothDist;
                const y = height * 0.75 - rel;
                if (y < -120 || y > height + 120) continue;
                const id = obs.id;
                visibleIds.add(id);

                let entry = activeById.get(id);
                if (!entry) {
                    const spr = acquire(obs.type);
                    entry = { type: obs.type, sprite: spr, distance: obs.distance, lane: obs.lane };
                    activeById.set(id, entry);
                }
                entry.distance = obs.distance;
                entry.lane = obs.lane;
                entry.sprite.setPosition(laneX(obs.lane, laneCount), y);
                if (obs.type === 'oil') {
                    entry.sprite.setScale(1 + Math.sin((s.time.now / 1000) * 3) * 0.04);
                } else if (obs.type === 'question') {
                    entry.sprite.setScale(1 + Math.sin((s.time.now / 1000) * 4) * 0.06);
                } else {
                    entry.sprite.setScale(1);
                }
            }

            // Release non-visible
            for (const id of Array.from(activeById.keys())) {
                if (!visibleIds.has(id)) {
                    release(id);
                }
            }
        }

        function checkCollisions(mySmoothDist, myLane, laneCount) {
            if (!racePlan || !Array.isArray(racePlan.obstacles) || !config || !gameState || !onHitCallback) return;
            if (!Number.isFinite(mySmoothDist)) return;
            if (lastCollisionDist === null) {
                lastCollisionDist = mySmoothDist;
                return;
            }
            const fromDist = lastCollisionDist;
            const toDist = mySmoothDist;
            const minDist = Math.min(fromDist, toDist) - 12;
            const maxDist = Math.max(fromDist, toDist) + 12;
            lastCollisionDist = mySmoothDist;

            const inactiveQuestionIds = new Set(
                (gameState && Array.isArray(gameState.inactiveQuestionIds)) ? gameState.inactiveQuestionIds : []
            );
            for (const obs of racePlan.obstacles) {
                if (obs.lane !== myLane) continue;
                if (obs.type === 'question' && inactiveQuestionIds.has(obs.id)) continue;
                if (obs.distance >= minDist && obs.distance <= maxDist) {
                    onHitCallback({ type: obs.type, id: obs.id, lane: obs.lane, distance: obs.distance });
                }
            }
        }

        function hideAll() {
            lastCollisionDist = null;
            for (const entry of activeById.values()) {
                entry.sprite.setVisible(false);
            }
        }

        return { update, checkCollisions, hideAll };
    }

    function createHud(s) {
        const g = s.add.graphics();
        g.setDepth(10);

        const timerText = s.add.text(0, 0, '', {
            fontFamily: 'Outfit',
            fontSize: '22px',
            color: '#ffffff'
        }).setDepth(11).setOrigin(0.5, 0.5);

        const distText = s.add.text(0, 0, '', {
            fontFamily: 'Outfit',
            fontSize: '16px',
            color: '#f5c518'
        }).setDepth(11).setOrigin(0.5, 0.5);

        const nextQText = s.add.text(0, 0, '', {
            fontFamily: 'Inter',
            fontSize: '12px',
            color: '#ffffff'
        }).setDepth(11).setOrigin(0.5, 0.5);

        const minimap = {
            gfx: s.add.graphics().setDepth(10),
            label1: s.add.text(0, 0, 'FINISH', { fontFamily: 'Inter', fontSize: '8px', color: '#f5c518' }).setDepth(11),
            label2: s.add.text(0, 0, 'START', { fontFamily: 'Inter', fontSize: '8px', color: 'rgba(255,255,255,0.6)' }).setDepth(11)
        };

        const penaltyHud = {
            bg: s.add.graphics().setDepth(12),
            bar: s.add.graphics().setDepth(13),
            label: s.add.text(0, 0, '', { fontFamily: 'Outfit', fontSize: '16px', color: '#ffffff' }).setDepth(13),
            time: s.add.text(0, 0, '', { fontFamily: 'Outfit', fontSize: '14px', color: '#ffffff' }).setDepth(13)
        };

        const penaltyList = {
            title: s.add.text(0, 0, 'PHẠT', { fontFamily: 'Inter', fontSize: '10px', color: '#f5c518' }).setDepth(11),
            text: s.add.text(0, 0, '', { fontFamily: 'Inter', fontSize: '10px', color: '#ffffff' }).setDepth(11)
        };

        function getPenaltyLabel(effectType) {
            switch (effectType) {
                case 'stop': return '🛑 DỪNG LẠI!';
                case 'slow': return '🐌 CHẬM LẠI!';
                case 'reverse': return '🔄 ĐẢO ĐIỀU KHIỂN!';
                case 'blur': return '👻 MỜ MÀN HÌNH!';
                case 'spin': return '🌀 QUAY VÒNG!';
                case 'rocket': return '🚀 BAY VÒNG!';
                case 'bubble': return '🫧 BÓNG BÓNG!';
                default: return '⚠️ PHẠT!';
            }
        }

        function getPenaltyMaxTime(effectType) {
            if (config && config.penalties && config.penalties.types && config.penalties.types[effectType]) {
                return Number(config.penalties.types[effectType].duration) || 3;
            }
            return 3;
        }

        function draw() {
            if (!gameState || !gameState.players) return;
            const w = s.scale.width;
            const h = s.scale.height;
            const myPlayer = gameState.players.find(p => p.id === myId);
            if (!myPlayer) return;

            // Timer
            const time = Math.max(0, Math.ceil(gameState.timeRemaining || 0));
            const min = Math.floor(time / 60);
            const sec = time % 60;
            const timeStr = `${min}:${sec.toString().padStart(2, '0')}`;
            timerText.setText(`⏱ ${timeStr}`);
            timerText.setColor(time <= 10 ? '#ff4444' : '#ffffff');
            timerText.setPosition(w / 2, 34);

            // Distance
            const dist = Math.floor((myPlayer.distance || 0) / 10);
            distText.setText(`${dist}m`);
            distText.setPosition(w / 2, 77);

            // Backplates
            g.clear();
            g.fillStyle(0x000000, 0.6);
            g.fillRoundedRect(w / 2 - 60, 12, 120, 44, 12);
            g.fillRoundedRect(w / 2 - 50, 60, 100, 34, 10);
            const nextQW = 120;
            const nextQX = 16;
            const nextQY = 16;
            g.fillRoundedRect(nextQX, nextQY, nextQW, 26, 10);

            // Next question timer
            if (gameState.state === 'RACING' && gameState.questionsUsed < gameState.maxQuestions) {
                const sec = Math.ceil(Math.max(0, gameState.nextQuestionIn || 0));
                const text = (sec > 0) ? `❓ ${sec}s` : '❓ READY';
                nextQText.setText(text);
                nextQText.setColor(sec > 0 ? '#ffffff' : '#f5c518');
                nextQText.setPosition(nextQX + nextQW / 2, nextQY + 13);
                nextQText.setVisible(true);
            } else {
                nextQText.setVisible(false);
            }

            // Minimap
            const mapW = 36;
            const mapH = h * 0.35;
            const mapX = w - mapW - 12;
            const mapY = 12;

            minimap.gfx.clear();
            minimap.gfx.fillStyle(0x000000, 0.5);
            minimap.gfx.fillRoundedRect(mapX, mapY, mapW, mapH, 8);
            minimap.gfx.lineStyle(1, 0xffffff, 0.2);
            minimap.gfx.strokeRoundedRect(mapX, mapY, mapW, mapH, 8);

            minimap.gfx.lineStyle(1, 0xffffff, 0.3);
            minimap.gfx.beginPath();
            minimap.gfx.moveTo(mapX + 5, mapY + 25);
            minimap.gfx.lineTo(mapX + mapW - 5, mapY + 25);
            minimap.gfx.strokePath();
            minimap.gfx.beginPath();
            minimap.gfx.moveTo(mapX + 5, mapY + mapH - 10);
            minimap.gfx.lineTo(mapX + mapW - 5, mapY + mapH - 10);
            minimap.gfx.strokePath();

            minimap.label1.setPosition(mapX + 2, mapY + 14);
            minimap.label2.setPosition(mapX + 4, mapY + mapH - 10);

            const totalDist = ((config ? (config.baseSpeed * config.raceDuration) : 36000) * 1.05) || 36000;
            const usableHeight = mapH - 45;
            for (const p of gameState.players) {
                const progress = Math.min(1, Math.max(0, (p.distance || 0) / totalDist));
                const dotY = (mapY + mapH - 10) - progress * usableHeight;
                const dotX = mapX + mapW / 2;
                const color = p.color ? Phaser.Display.Color.HexStringToColor(p.color).color : 0xffffff;
                minimap.gfx.fillStyle(color, 1);
                minimap.gfx.fillCircle(dotX, dotY, (p.id === myId) ? 5 : 4);
                if (p.id === myId) {
                    minimap.gfx.lineStyle(2, 0xffffff, 1);
                    minimap.gfx.strokeCircle(dotX, dotY, 6);
                }
            }

            // Penalty list under minimap (players currently penalized)
            const penalized = gameState.players
                .filter(p => p.status === 'penalized' && p.effectTimer > 0)
                .map(p => {
                    const icon = (p.effectType === 'rocket') ? '🚀'
                        : (p.effectType === 'bubble') ? '🫧'
                            : (p.effectType === 'spin') ? '🌀'
                                : (p.effectType === 'blur') ? '👻'
                                    : (p.effectType === 'reverse') ? '🔄'
                                        : (p.effectType === 'stop') ? '🛑'
                                            : '⚠️';
                    const t = Math.ceil(p.effectTimer);
                    return `${icon} ${p.name || ''} ${t}s`;
                });

            if (penalized.length) {
                const listX = w / 2 - 60;
                const listY = 100;
                penaltyList.title.setPosition(listX, listY);
                penaltyList.text.setPosition(listX, listY + 12);
                penaltyList.text.setText(penalized.join('\n'));
                penaltyList.title.setVisible(true);
                penaltyList.text.setVisible(true);
            } else {
                penaltyList.title.setVisible(false);
                penaltyList.text.setVisible(false);
            }

            // Penalty countdown (wrong/no-answer)
            if (myPlayer.status === 'penalized' && myPlayer.effectTimer > 0) {
                const bgW = 220;
                const bgH = 38;
                const bgX = w / 2 - bgW / 2;
                const bgY = h - 130;

                penaltyHud.bg.clear();
                penaltyHud.bg.fillStyle(0xe94560, 0.85);
                penaltyHud.bg.fillRoundedRect(bgX, bgY, bgW, bgH, 8);

                const label = getPenaltyLabel(myPlayer.effectType);
                penaltyHud.label.setText(label);
                penaltyHud.label.setPosition(bgX + 12, bgY + bgH / 2);
                penaltyHud.label.setOrigin(0, 0.5);

                const maxTime = Math.max(myPlayer.effectTimer, getPenaltyMaxTime(myPlayer.effectType));
                const ratio = Math.min(1, myPlayer.effectTimer / maxTime);
                penaltyHud.bar.clear();
                penaltyHud.bar.fillStyle(0xffffff, 0.3);
                penaltyHud.bar.fillRect(bgX + 4, bgY + bgH - 6, (bgW - 8) * ratio, 3);

                const timeLeft = Math.ceil(myPlayer.effectTimer * 10) / 10;
                penaltyHud.time.setText(`${timeLeft}s`);
                penaltyHud.time.setPosition(bgX + bgW - 10, bgY + bgH / 2);
                penaltyHud.time.setOrigin(1, 0.5);

                penaltyHud.bg.setVisible(true);
                penaltyHud.bar.setVisible(true);
                penaltyHud.label.setVisible(true);
                penaltyHud.time.setVisible(true);
            } else {
                penaltyHud.bg.setVisible(false);
                penaltyHud.bar.setVisible(false);
                penaltyHud.label.setVisible(false);
                penaltyHud.time.setVisible(false);
            }
        }

        function update(mySmoothDist) {
            draw();
        }

        function resize() {
            // No-op: uses scale size each frame
        }

        function hideAll() {
            g.setVisible(false);
            timerText.setVisible(false);
            distText.setVisible(false);
            nextQText.setVisible(false);
            minimap.gfx.setVisible(false);
            minimap.label1.setVisible(false);
            minimap.label2.setVisible(false);
            penaltyList.title.setVisible(false);
            penaltyList.text.setVisible(false);
            penaltyHud.bg.setVisible(false);
            penaltyHud.bar.setVisible(false);
            penaltyHud.label.setVisible(false);
            penaltyHud.time.setVisible(false);
        }

        function showAll() {
            g.setVisible(true);
            timerText.setVisible(true);
            distText.setVisible(true);
            nextQText.setVisible(true);
            minimap.gfx.setVisible(true);
            minimap.label1.setVisible(true);
            minimap.label2.setVisible(true);
            penaltyList.title.setVisible(true);
            penaltyList.text.setVisible(true);
            penaltyHud.bg.setVisible(true);
            penaltyHud.bar.setVisible(true);
            penaltyHud.label.setVisible(true);
            penaltyHud.time.setVisible(true);
        }

        return { update, resize, hideAll, showAll };
    }

    function createEffects(s) {
        const overlay = s.add.rectangle(0, 0, s.scale.width, s.scale.height, 0x000000, 0);
        overlay.setOrigin(0, 0);
        overlay.setDepth(50);

        let currentShakeUntil = 0;
        let lastStatusKey = '';

        function update(dt) {
            if (!gameState || !gameState.players || !myId) {
                overlay.setAlpha(0);
                return;
            }
            const me = gameState.players.find(p => p.id === myId);
            if (!me) return;

            // Screen overlays (ported from old Effects)
            overlay.setAlpha(0);
            if (me.status === 'rewarded') {
                overlay.setFillStyle(0xffd700, 0.12);
                overlay.setAlpha(1);
            } else if (me.status === 'penalized') {
                if (me.effectType === 'blur') {
                    const opacity = (config && config.penalties && config.penalties.types && config.penalties.types.blur)
                        ? (config.penalties.types.blur.opacity || 0.8)
                        : 0.8;
                    overlay.setFillStyle(0x000000, opacity);
                    overlay.setAlpha(1);
                } else if (me.effectType === 'reverse') {
                    overlay.setFillStyle(0xe94560, 0.12);
                    overlay.setAlpha(1);
                }
            } else if (me.status === 'stopped') {
                const a = 0.1 + Math.sin((s.time.now / 1000) * 10) * 0.05;
                overlay.setFillStyle(0xff6432, Math.max(0, a));
                overlay.setAlpha(1);
            }

            // Auto shake on impact statuses (only on transition)
            const statusKey = `${me.status}:${me.effectType || ''}`;
            if (statusKey !== lastStatusKey) {
                if (me.status === 'stopped') {
                    s.cameras.main.shake(250, 0.01);
                } else if (me.status === 'spinning') {
                    s.cameras.main.shake(200, 0.008);
                }
                lastStatusKey = statusKey;
            }
        }

        function notify(text, colorHex, durationSec) {
            const t = s.add.text(s.scale.width / 2, s.scale.height * 0.35, text, {
                fontFamily: 'Outfit',
                fontSize: '24px',
                color: colorHex || '#ffffff',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5, 0.5).setDepth(60);

            s.tweens.add({
                targets: t,
                y: t.y - 30,
                alpha: 0,
                duration: Math.max(300, (durationSec || 1.5) * 1000),
                ease: 'Cubic.easeOut',
                onComplete: () => t.destroy()
            });
        }

        function resize(width, height) {
            overlay.setSize(width, height);
        }

        return { update, notify, resize };
    }

    // External helpers used by main.js
    function triggerShake(intensity, duration) {
        if (!scene) return;
        const durMs = Math.max(50, (duration || 0.3) * 1000);
        const strength = Math.min(0.03, Math.max(0.002, (intensity || 5) / 500));
        scene.cameras.main.shake(durMs, strength);
    }

    function addNotification(text, color, duration) {
        if (!effects) return;
        effects.notify(text, color || '#ffffff', duration || 1.5);
    }

    return {
        init,
        waitUntilReady,
        destroy,
        start,
        stop,
        setRacePlan,
        setGameState,
        predictMove,
        getGameState,
        setOnHit,
        applyLocalObstacleHit,
        applySyncedObstacleEffect,
        clearPredictionLane,
        triggerShake,
        addNotification
    };
})();
