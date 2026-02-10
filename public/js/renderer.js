// ============================================
// RENDERER MODULE — Main Canvas Renderer
// ============================================
const Renderer = (() => {
    let canvas, ctx;
    let width, height;
    let gameState = null;
    let myId = '';
    let time = 0;
    let lastFrameTime = 0;
    let running = false;
    let config = null;
    let seed = null;
    let onHitCallback = null;

    // Smooth distance tracking
    const displayDistances = new Map(); // id -> smoothed distance
    const serverSnapshots = new Map();  // id -> { dist, time, speed }
    let localDistance = 0;              // Persistent local distance to prevent jitter

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        // Update road position
        if (Road.getLaneCount() > 0) {
            Road.updateRoadX(width);
        }
    }

    function start(playerId) {
        console.log('[Renderer] Starting render loop for player:', playerId);
        myId = playerId;
        running = true;
        lastFrameTime = performance.now();
        requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
    }

    let predictedLane = null;
    let predictionTimestamp = 0;

    function setGameState(state, lastInputTime, gameConfig) {
        gameState = state;
        if (gameConfig) config = gameConfig;
        if (state && state.seed) seed = state.seed;

        if (gameState && gameState.players) {
            const now = performance.now();
            for (const p of gameState.players) {
                const prev = serverSnapshots.get(p.id);

                // Use the speed provided by the server for authoritative interpolation
                const networkSpeed = p.speed !== undefined ? p.speed : 0;

                serverSnapshots.set(p.id, {
                    dist: p.distance,
                    time: now,
                    speed: networkSpeed
                });

                // Initialize display distance if new
                if (!displayDistances.has(p.id)) {
                    displayDistances.set(p.id, p.distance);
                    if (p.id === myId) localDistance = p.distance;
                }
            }
        }

        // Reconciliation logic
        if (myId && gameState.players) {
            const serverPlayer = gameState.players.find(p => p.id === myId);
            if (serverPlayer) {
                if (predictedLane !== null) {
                    if (serverPlayer.lane === predictedLane) {
                        predictedLane = null;
                    } else if (Date.now() - predictionTimestamp > 500) {
                        predictedLane = null;
                    }
                }
            }
        }
    }
    function getSeedRandom(modifier) {
        if (!seed) return Math.random();
        let s = (seed + Math.floor(modifier)) >>> 0;
        s = Math.imul(s, 1103515245) + 12345;
        s = s >>> 0;
        return (s & 0x7fffffff) / 0x7fffffff;
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

    function checkCollisions(mySmoothDist, myLane) {
        if (!seed || !config || !gameState || !onHitCallback) return;

        const initialDelayDist = config.baseSpeed * (config.initialObstacleDelay || 3);
        const laneCount = Road.getLaneCount();

        // 1. Check Deterministic Obstacles (Stone/Oil)
        // We only check a small range around the player
        const checkRangeStart = Math.floor(mySmoothDist / 300) * 300;
        const checkRangeEnd = checkRangeStart + 600;

        for (let d = checkRangeStart; d < checkRangeEnd; d += 300) {
            if (d < initialDelayDist + 600) continue;

            // Row-based logic matching server & renderer
            const numRand = getSeedRandom(d + 789);
            const numObstacles = Math.floor(numRand * (laneCount - 1)) + 1;

            const lanes = [];
            for (let i = 0; i < laneCount; i++) lanes.push(i);
            for (let i = lanes.length - 1; i > 0; i--) {
                const jRand = getSeedRandom(d + i + 999);
                const j = Math.floor(jRand * (i + 1));
                [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
            }

            const selectedLanes = lanes.slice(0, numObstacles);

            for (const lane of selectedLanes) {
                if (lane !== myLane) continue;

                // Collided?
                if (Math.abs(mySmoothDist - d) < 40) {
                    const typeRand = getSeedRandom(d + lane + 555);
                    const type = (typeRand < 0.6) ? 'stone' : 'oil';

                    // Check if already deactivated on server
                    const obsId = `obs_${Math.floor(d)}_${lane}`;
                    const isDeactivated = gameState.inactiveDeterministicIds &&
                        gameState.inactiveDeterministicIds.includes(obsId);

                    if (!isDeactivated) {
                        onHitCallback({ type, lane, distance: d, id: obsId });
                    }
                }
            }
        }

        // 2. Check Server-Authoritative Obstacles (Questions)
        if (gameState.obstacles) {
            for (const obs of gameState.obstacles) {
                if (obs.type === 'question' && obs.active && obs.lane === myLane) {
                    if (Math.abs(mySmoothDist - obs.distance) < 40) {
                        onHitCallback(obs);
                    }
                }
            }
        }
    }

    function loop(timestamp) {
        if (!running) return;

        const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
        lastFrameTime = timestamp;
        time += dt;

        render(dt);

        requestAnimationFrame(loop);
    }

    function render(dt) {
        ctx.clearRect(0, 0, width, height);

        if (!gameState || !gameState.players) return;

        // 1. Update smooth distances for all players
        const playerDistances = {};
        const now = performance.now();

        for (const p of gameState.players) {
            const snap = serverSnapshots.get(p.id);
            let current = displayDistances.get(p.id) || p.distance;

            if (snap) {
                // Prediction: where should the player be right now based on last server info?
                const timeSinceLastPacket = (now - snap.time) / 1000;
                const predictedServerDist = snap.dist + snap.speed * timeSinceLastPacket;

                // Smoothing: move current display distance towards predicted distance
                const isLocal = (p.id === myId);

                if (isLocal) {
                    // LOCAL PLAYER: Move smoothly locally, then nudge towards server
                    localDistance += snap.speed * dt;

                    const diff = predictedServerDist - localDistance;

                    if (gameState.state !== 'RACING') {
                        localDistance = snap.dist;
                    } else if (Math.abs(diff) > 300) {
                        localDistance = predictedServerDist; // Hard snap if too far
                    } else {
                        // Very subtle nudge to stay in sync with server without jitter
                        localDistance += diff * 0.05;
                    }
                    current = localDistance;
                } else {
                    // REMOTE PLAYERS: Standard interpolation
                    const diff = predictedServerDist - current;
                    if (gameState.state !== 'RACING') {
                        current = snap.dist;
                    } else if (Math.abs(diff) > 300) {
                        current = predictedServerDist;
                    } else {
                        current += diff * 0.15;
                    }
                }
            }

            displayDistances.set(p.id, current);
            playerDistances[p.id] = current;
        }

        const myPlayer = gameState.players.find(p => p.id === myId);
        if (!myPlayer) return;

        const mySmoothDist = playerDistances[myId];

        // Camera follow
        const dist = mySmoothDist;

        Effects.update(dt);
        const shake = Effects.getShakeOffset(dt);

        ctx.save();
        ctx.translate(shake.x, shake.y);

        // Draw road
        Road.draw(ctx, dist, width, height);

        // 2. Draw Obstacles
        if (seed && config) {
            const initialDelayDist = config.baseSpeed * (config.initialObstacleDelay || 3);
            const laneCount = Road.getLaneCount();

            const renderRangeStart = mySmoothDist - 500;
            const renderRangeEnd = mySmoothDist + 2000;

            // DRAW DETERMINISTIC OBSTACLES (Stone/Oil)
            for (let d = 0; d < renderRangeEnd; d += 300) {
                if (d < renderRangeStart) continue;
                if (d < initialDelayDist + 600) continue;

                // 1. Get number of obstacles for this row
                const numRand = getSeedRandom(d + 789);
                const numObstacles = Math.floor(numRand * (laneCount - 1)) + 1;

                // 2. Deterministic shuffle lanes
                const lanes = [];
                for (let i = 0; i < laneCount; i++) lanes.push(i);
                for (let i = lanes.length - 1; i > 0; i--) {
                    const jRand = getSeedRandom(d + i + 999);
                    const j = Math.floor(jRand * (i + 1));
                    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
                }

                const selectedLanes = lanes.slice(0, numObstacles);

                for (const lane of selectedLanes) {
                    const typeRand = getSeedRandom(d + lane + 555);
                    const type = (typeRand < 0.6) ? 'stone' : 'oil';

                    // Check if hit (using the new array of IDs)
                    const obsId = `obs_${Math.floor(d)}_${lane}`;
                    const isHit = gameState.inactiveDeterministicIds &&
                        gameState.inactiveDeterministicIds.includes(obsId);

                    if (!isHit) {
                        const relDist = d - mySmoothDist;
                        const carY = height * 0.75 - relDist * 1.0;
                        if (carY > -100 && carY < height + 100) {
                            const roadX = Road.getLaneX(lane);
                            Obstacles.draw(ctx, { type, lane, distance: d }, roadX, carY, time);
                        }
                    }
                }
            }

            // DRAW SERVER-AUTHORITATIVE OBSTACLES (Questions)
            if (gameState.obstacles) {
                for (const obs of gameState.obstacles) {
                    if (obs.type === 'question' && obs.active) {
                        const relDist = obs.distance - mySmoothDist;
                        const carY = height * 0.75 - relDist * 1.0;
                        if (carY > -100 && carY < height + 100) {
                            const roadX = Road.getLaneX(obs.lane);
                            Obstacles.draw(ctx, obs, roadX, carY, time);
                        }
                    }
                }
            }
        }

        // Draw cars
        const sortedPlayers = [...gameState.players].sort((a, b) => {
            if (a.id === myId) return 1;
            if (b.id === myId) return -1;
            return 0;
        });

        for (const p of sortedPlayers) {
            let targetLane = p.lane;
            if (p.id === myId && predictedLane !== null) {
                targetLane = predictedLane;
            }

            const isLocal = (p.id === myId);
            const transitionSpeed = isLocal ? 18 : 8; // Remote players glide more slowly/smoothly
            const smoothLane = Car.updateTransition(p.id, targetLane, dt, transitionSpeed);
            const carX = Road.getLaneX(smoothLane);

            let carY;
            const pSmoothDist = playerDistances[p.id];

            if (p.id === myId) {
                carY = height * 0.75;
            } else {
                const relDist = pSmoothDist - mySmoothDist;
                carY = height * 0.75 - relDist * 1.0;
            }

            if (carY < -100 || carY > height + 100) continue;

            const scale = p.id === myId ? 1 : 0.9;
            Car.draw(ctx, carX, carY, p.color, scale, p.status, p.effectType, time);
            Car.drawNameTag(ctx, carX, carY, p.name, p.color);

            // Collision Check (LOCAL ONLY)
            if (p.id === myId && gameState.state === 'RACING' && p.status !== 'rewarded') {
                checkCollisions(pSmoothDist, targetLane);
            }
        }

        Effects.drawParticles(ctx);
        ctx.restore();

        if (myPlayer.status !== 'normal') {
            Effects.drawEffectOverlay(ctx, width, height, myPlayer.status, myPlayer.effectType, time, config);
        }

        HUD.draw(ctx, width, height, gameState, myId, config);
        Effects.drawNotifications(ctx, width, height);
    }

    function getTime() { return time; }
    function getGameState() { return gameState; }

    function setOnHit(callback) { onHitCallback = callback; }

    return { init, start, stop, setGameState, resize, getTime, predictMove, getGameState, setOnHit };
})();
