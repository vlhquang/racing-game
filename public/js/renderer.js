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

    // Smooth distance tracking
    const displayDistances = new Map(); // id -> smoothed distance
    const serverSnapshots = new Map();  // id -> { dist, time, speed }

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

    function setGameState(state, lastInputTime) {
        gameState = state;

        if (gameState && gameState.players) {
            const now = performance.now();
            for (const p of gameState.players) {
                const prev = serverSnapshots.get(p.id);

                // If we have a previous snapshot, we can calculate a more accurate "network speed"
                let networkSpeed = 200; // default fallout
                if (p.status === 'stopped') networkSpeed = 0;
                else if (p.status === 'spinning') networkSpeed = 60;
                else if (p.status === 'penalized') networkSpeed = 120;
                else if (p.status === 'rewarded') networkSpeed = 220;

                serverSnapshots.set(p.id, {
                    dist: p.distance,
                    time: now,
                    speed: networkSpeed
                });

                // Initialize display distance if new
                if (!displayDistances.has(p.id)) {
                    displayDistances.set(p.id, p.distance);
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
                const diff = predictedServerDist - current;

                // If the error is massive (>300m), snap immediately to avoid sliding cars
                if (Math.abs(diff) > 300) {
                    current = predictedServerDist;
                } else {
                    // Smoothly interpolate. 
                    // Factor depends on how much we want to favor server vs smoothness.
                    // 0.15 is responsive enough but hides jitter well.
                    current += diff * 0.15;
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

        // Draw obstacles
        for (const obs of gameState.obstacles) {
            const relDist = obs.distance - mySmoothDist;
            const screenY = height * 0.75 - relDist * 1.0;

            if (screenY < -100 || screenY > height + 100) continue;

            const obsX = Road.getLaneX(obs.lane);
            Obstacles.draw(ctx, obs, obsX, screenY, time);
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

            const smoothLane = Car.updateTransition(p.id, targetLane, dt);
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
        }

        Effects.drawParticles(ctx);
        ctx.restore();

        if (myPlayer.status !== 'normal') {
            Effects.drawEffectOverlay(ctx, width, height, myPlayer.status, myPlayer.effectType, time);
        }

        HUD.draw(ctx, width, height, gameState, myId);
        Effects.drawNotifications(ctx, width, height);
    }

    function getTime() { return time; }

    return { init, start, stop, setGameState, resize, getTime, predictMove };
})();
