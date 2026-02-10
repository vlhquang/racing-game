const QuestionManager = require('./QuestionManager');
const CONFIG = require('./Config');

class GameRoom {
    constructor(roomCode, io) {
        this.roomCode = roomCode;
        this.io = io;
        this.state = 'WAITING';
        this.players = new Map();
        this.hostId = null;
        this.obstacles = [];
        this.gameLoopInterval = null;
        this.lastTick = 0;
        this.timeRemaining = 0;
        this.activeQuestion = null;
        this.questionAnswers = new Map();
        this.questionTimer = null;

        // Load config
        this.config = { ...CONFIG };
        this.nextObstacleDistance = 500;

        // Track questions
        this.questionsUsed = 0;
        this.questionCooldownTimer = 0;
        this.questionManager = new QuestionManager();
        this.lastBroadcastTime = 0;
    }

    addPlayer(socket, name) {
        const playerIndex = this.players.size;
        const player = {
            id: socket.id,
            name: name,
            lane: Math.floor((this.config.maxPlayers + 1) / 2),
            distance: 0,
            speed: this.config.baseSpeed,
            color: ['#FF4444', '#4488FF', '#FFCC00', '#44CC44'][playerIndex] || '#ffffff',
            colorName: ['red', 'blue', 'yellow', 'green'][playerIndex] || 'white',
            status: 'normal',
            effectTimer: 0,
            effectType: null,
            index: playerIndex
        };
        this.players.set(socket.id, player);
        if (!this.hostId) this.hostId = socket.id;
    }

    removePlayer(id) {
        this.players.delete(id);
        if (this.hostId === id) {
            const firstPlayer = this.players.keys().next().value;
            this.hostId = firstPlayer || null;
        }
    }

    hasPlayer(id) { return this.players.has(id); }
    getPlayerCount() { return this.players.size; }
    getLaneCount() { return this.players.size + 1; }

    getPlayersInfo() {
        const infos = [];
        for (const p of this.players.values()) {
            infos.push({
                id: p.id,
                name: p.name,
                color: p.color,
                colorName: p.colorName,
                index: p.index,
                isHost: p.id === this.hostId
            });
        }
        return infos;
    }

    startGame() {
        if (this.state !== 'WAITING') {
            console.log(`[GameRoom] Room ${this.roomCode}: Cannot start, state is ${this.state}`);
            return;
        }
        console.log(`[GameRoom] Room ${this.roomCode}: Countdown initiated`);
        this.state = 'COUNTDOWN';
        this.config.roadWidth = this.getLaneCount() * this.config.laneWidth;
        this.seed = Math.floor(Math.random() * 1000000);

        const laneCount = this.getLaneCount();
        let i = 0;
        for (const p of this.players.values()) {
            p.lane = i % laneCount;
            p.distance = 0;
            p.speed = this.config.baseSpeed;
            p.status = 'normal';
            p.effectTimer = 0;
            p.effectType = null;
            i++;
        }

        let count = 3;
        this.io.to(this.roomCode).emit('countdown', { count, laneCount, config: this.config, seed: this.seed });
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                this.io.to(this.roomCode).emit('countdown', { count, laneCount, config: this.config, seed: this.seed });
            } else {
                clearInterval(countdownInterval);
                this.io.to(this.roomCode).emit('countdown', { count: 0, laneCount, config: this.config, seed: this.seed });
                this.beginRace();
            }
        }, 1000);
    }

    beginRace() {
        console.log(`[GameRoom] Room ${this.roomCode}: Race started!`);
        this.state = 'RACING';
        this.timeRemaining = this.config.raceDuration;
        this.lastTick = Date.now();
        this.obstacles = [];

        // Calculate distance for 3s delay (e.g. 300 speed * 3s = 900 distance)
        // Spawn distance is checked as maxDistance >= nextObstacleDistance - 600
        const initialDelayDist = this.config.baseSpeed * (this.config.initialObstacleDelay || 3);
        this.nextObstacleDistance = initialDelayDist + 600;

        this.questionsUsed = 0;

        // Random initial cooldown between 10-15s
        this.questionCooldownTimer = this.config.questionIntervalMin +
            Math.random() * (this.config.questionIntervalMax - this.config.questionIntervalMin);

        this.gameLoopInterval = setInterval(() => this.tick(), 16);
    }

    tick() {
        const now = Date.now();
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        if (this.state === 'RACING') {

            this.timeRemaining -= dt;
            if (this.timeRemaining <= 0) {
                this.timeRemaining = 0;
                this.finishGame();
                return;
            }

            if (this.questionCooldownTimer > 0) {
                this.questionCooldownTimer -= dt;
            }

            let maxDistance = 0;
            for (const p of this.players.values()) {
                if (p.distance > maxDistance) maxDistance = p.distance;
            }

            if (maxDistance >= this.nextObstacleDistance - 600) {
                this.spawnObstacles(this.nextObstacleDistance);
                this.nextObstacleDistance += 300; // Deterministic step
            }

            for (const p of this.players.values()) {
                // 1. Handle effects expiration
                if (p.effectTimer > 0) {
                    p.effectTimer -= dt;
                    if (p.effectTimer <= 0) {
                        p.effectTimer = 0;
                        p.status = 'normal';
                        p.effectType = null;
                        p.speed = this.config.baseSpeed;
                    }
                }

                // 2. Apply movement based on status/penalty
                let moveSpeed = p.speed;

                if (p.status === 'stopped') {
                    moveSpeed = 0;
                } else if (p.status === 'spinning') {
                    moveSpeed = p.speed * this.config.penalties.types.spin.speedMultiplier;
                } else if (p.status === 'penalized') {
                    // Apply penalty speed multipliers
                    const pConfig = this.config.penalties.types[p.effectType];
                    if (pConfig) {
                        moveSpeed = p.speed * pConfig.speedMultiplier;
                    }
                } else if (p.status === 'rewarded') {
                    // Shield/Invincible: Apply reward speed boost
                    moveSpeed = p.speed * (this.config.rewardSpeedMultiplier || 1.1);
                }

                p.distance += moveSpeed * dt;

                // 3. Collision Logic
                // "rewarded" = Invincible Shield -> NO collisions allowed
                if (p.status !== 'rewarded') {
                    // Check obstacle collisions
                    for (const obs of this.obstacles) {
                        if (obs.active && obs.lane === p.lane &&
                            Math.abs(p.distance - obs.distance) < 40) {

                            // Special rule: BLUR penalty still allows collisions!
                            // Other penalties might also allow collision if they don't stop movement
                            // But if player is 'stopped' or 'spinning', they usually can't hit another? 
                            // Actually 'spinning' moves slowly, so could hit. 'stopped' is stationary.

                            // Prevent multi-hit if already stopped/spinning (unless it's a question)
                            const isDisabled = (p.status === 'stopped' || p.status === 'spinning');

                            // If Disabled, likely shouldn't trigger new stone/oil, 
                            // BUT if it's a Question, maybe? 
                            // Let's keep it simple: if disabled, ignore collisions to avoid lock-lock.
                            if (isDisabled && obs.type !== 'question') continue;

                            obs.active = false;
                            this.handleObstacleHit(p, obs);
                        }
                    }
                }
            }

            const minDist = Math.min(...[...this.players.values()].map(p => p.distance)) - 500;
            const previousObstacleCount = this.obstacles.length;
            this.obstacles = this.obstacles.filter(o => o.distance > minDist);

            // If an active question was missed, reset the state (so next one can spawn)
            // Note: we don't necessarily reset the cooldown here if we want a fixed interval
        }

        // Broadcast every ~45ms (approx 22 times per second)
        // This reduces bandwidth and jitter over TCP/ngrok
        if (now - this.lastBroadcastTime >= 45) {
            this.broadcastState();
            this.lastBroadcastTime = now;
        }
    }

    getSeedRandom(seedModifier) {
        let s = (this.seed + Math.floor(seedModifier)) >>> 0;
        s = Math.imul(s, 1103515245) + 12345;
        s = s >>> 0;
        return (s & 0x7fffffff) / 0x7fffffff;
    }

    spawnObstacles(atDistance) {
        const laneCount = this.getLaneCount();

        // 1. Regular Deterministic Obstacles (Stone/Oil) - Row-based logic
        // We use the same count/shuffle logic as before, but deterministically.
        const numRand = this.getSeedRandom(atDistance + 789);
        const numObstacles = Math.floor(numRand * (laneCount - 1)) + 1;

        const lanes = [];
        for (let i = 0; i < laneCount; i++) lanes.push(i);

        // Deterministic shuffle using seeds
        for (let i = lanes.length - 1; i > 0; i--) {
            const jRand = this.getSeedRandom(atDistance + i + 999);
            const j = Math.floor(jRand * (i + 1));
            [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
        }

        const selectedLanes = lanes.slice(0, numObstacles);

        for (const lane of selectedLanes) {
            const typeRand = this.getSeedRandom(atDistance + lane + 555);
            const type = (typeRand < 0.6) ? 'stone' : 'oil';

            this.obstacles.push({
                id: `obs_${Math.floor(atDistance)}_${lane}`,
                type,
                lane,
                distance: atDistance,
                active: true
            });
        }

        // 2. Question Spawning (Server Authoritative)
        const canSpawnQuestion = this.questionCooldownTimer <= 0 &&
            this.questionsUsed < this.config.maxQuestions &&
            !this.obstacles.some(o => o.type === 'question' && o.active);

        if (canSpawnQuestion) {
            const spawnRand = Math.random();
            if (spawnRand < 0.4) { // 40% chance if ready
                const lane = Math.floor(Math.random() * laneCount);
                this.obstacles.push({
                    id: 'q_' + Math.random().toString(36).substr(2, 5),
                    type: 'question',
                    lane,
                    distance: atDistance + 60,
                    active: true
                });

                // Reset cooldown AS SOON AS it spawns on the road
                this.questionCooldownTimer = this.config.questionIntervalMin +
                    Math.random() * (this.config.questionIntervalMax - this.config.questionIntervalMin);

                console.log(`[GameRoom] Room ${this.roomCode}: Question box spawned. Next cooldown: ${Math.floor(this.questionCooldownTimer)}s`);
            }
        }
    }

    onObstacleHit(playerId, obstacleData) {
        // If player is penalized, they CAN hit obstacles (stone/oil/question)
        // EXCEPT if the penalty is "stop" or "spin" (handled in tick loop check)

        switch (obstacle.type) {
            case 'stone':
                player.status = 'stopped';
                player.effectTimer = this.config.stoneStopTime;
                this.io.to(this.roomCode).emit('obstacle-hit', {
                    playerId: player.id,
                    type: 'stone',
                    duration: this.config.stoneStopTime
                });
                break;

            case 'oil':
                player.status = 'spinning';
                player.effectTimer = this.config.oilSpinTime;
                this.io.to(this.roomCode).emit('obstacle-hit', {
                    playerId: player.id,
                    type: 'oil',
                    duration: this.config.oilSpinTime
                });
                break;

            case 'question':
                // Check if anyone is penalized. Rule: "Trong thời gian bị phạt không hiển thị câu hỏi"
                // Meaning: if THIS player is penalized, do they NOT trigger it? 
                // Or if ANYONE is penalized? usually question pauses game for EVERYONE.
                // Interpretation: If the player hitting the box is currently penalized, ignore it?
                // OR: If the global state implies penalties are active?

                // Let's implement: If the player hitting the box is penalized, they cannot trigger the question.
                if (player.status === 'penalized') return;

                this.triggerQuestion(player.id);
                break;
        }
    }

    triggerQuestion(triggeredBy) {
        if (this.state !== 'RACING') return;
        this.questionsUsed++;

        // Set next random cooldown between 10-15s
        this.questionCooldownTimer = this.config.questionIntervalMin +
            Math.random() * (this.config.questionIntervalMax - this.config.questionIntervalMin);

        const question = this.questionManager.getRandomQuestion();
        if (!question) return;

        this.state = 'QUESTION';
        this.activeQuestion = question;
        this.questionAnswers.clear();
        this.questionStartTime = Date.now();

        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }

        const timeLimit = question.timeLimit || this.config.questionTime;
        this.io.to(this.roomCode).emit('question-start', {
            triggeredBy,
            question: question.question,
            answers: question.answers,
            timeLimit
        });

        // IMMEDIATELY broadcast state so everyone stops
        this.broadcastState();

        const questionTimeLimit = timeLimit * 1000;
        this.questionTimer = setTimeout(() => {
            this.resolveQuestion();
        }, questionTimeLimit + 500);
    }

    handleAnswer(playerId, answerIndex) {
        if (this.state !== 'QUESTION' || !this.activeQuestion) return;

        const timeLimit = this.activeQuestion.timeLimit || this.config.questionTime;
        const elapsed = (Date.now() - this.questionStartTime) / 1000;

        // Lock answers in the last 2 seconds
        if (elapsed > timeLimit - 2) return;

        this.questionAnswers.set(playerId, answerIndex);
    }

    resolveQuestion() {
        if (!this.activeQuestion) return;

        const results = [];
        for (const p of this.players.values()) {
            const answer = this.questionAnswers.get(p.id);
            let correct = false;
            let penalty = null;
            let duration = 0;

            if (answer === undefined) {
                // No Answer
                penalty = this.getRandomPenalty(true); // true = noAnswer
                const pConfig = this.config.penalties.types[penalty];
                duration = pConfig.duration * this.config.penalties.noAnswer.durationMultiplier;

                p.status = 'penalized';
                p.effectType = penalty;
                p.effectTimer = duration;

            } else if (answer === this.activeQuestion.correctIndex) {
                // Correct
                correct = true;
                duration = this.config.correctRewardTime;
                p.status = 'rewarded'; // Invincible Shield!
                p.effectTimer = duration;

            } else {
                // Wrong Answer
                penalty = this.getRandomPenalty(false); // false = wrongAnswer
                const pConfig = this.config.penalties.types[penalty];
                duration = pConfig.duration * this.config.penalties.wrongAnswer.durationMultiplier;

                p.status = 'penalized';
                p.effectType = penalty;
                p.effectTimer = duration;
            }

            results.push({
                playerId: p.id,
                playerName: p.name,
                correct,
                penalty,
                duration: Math.round(duration * 10) / 10,
                answered: answer !== undefined
            });
        }

        this.io.to(this.roomCode).emit('question-result', { results, correctIndex: this.activeQuestion.correctIndex });

        // Broadcast the new rewarded/penalized statuses immediately
        this.broadcastState();

        this.activeQuestion = null;
        this.questionAnswers.clear();

        setTimeout(() => {
            if (this.state === 'QUESTION') {
                this.state = 'RACING';
                this.lastTick = Date.now();
                this.gameLoopInterval = setInterval(() => this.tick(), 16);

                // Immediate sync on resume
                this.broadcastState();
                this.io.to(this.roomCode).emit('race-resume');
            }
        }, 2000);
    }

    getRandomPenalty(isNoAnswer) {
        const pool = isNoAnswer
            ? this.config.penalties.noAnswer.availableTypes
            : this.config.penalties.wrongAnswer.availableTypes;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    handleInput(playerId, direction) {
        const player = this.players.get(playerId);
        if (!player) return;
        if (this.state !== 'RACING') return;

        if (player.status === 'stopped' || player.status === 'spinning') return;

        const laneCount = this.getLaneCount();

        // Reverse control logic
        if (player.status === 'penalized' && player.effectType === 'reverse') {
            if (direction === 'left' && player.lane < laneCount - 1) player.lane++;
            else if (direction === 'right' && player.lane > 0) player.lane--;
        } else {
            if (direction === 'left' && player.lane > 0) player.lane--;
            else if (direction === 'right' && player.lane < laneCount - 1) player.lane++;
        }
    }

    broadcastState() {
        const playersData = [];
        for (const p of this.players.values()) {
            let speed = this.config.baseSpeed;
            if (this.state !== 'RACING') {
                speed = 0;
            } else {
                if (p.status === 'stopped') speed = 0;
                else if (p.status === 'spinning') speed = this.config.baseSpeed * 0.1;
                else if (p.status === 'penalized') {
                    const pCfg = this.config.penalties.types[p.effectType];
                    speed = this.config.baseSpeed * (pCfg ? pCfg.speedMultiplier : 0.5);
                } else if (p.status === 'rewarded') {
                    speed = this.config.baseSpeed * (this.config.rewardSpeedMultiplier || 1.1);
                }
            }

            playersData.push({
                id: p.id,
                name: p.name,
                lane: p.lane,
                distance: p.distance,
                color: p.color,
                colorName: p.colorName,
                status: p.status,
                effectType: p.effectType,
                effectTimer: p.effectTimer,
                speed: speed // Crucial for client-side interpolation
            });
        }

        this.io.to(this.roomCode).emit('game-state', {
            players: playersData,
            obstacles: this.obstacles.filter(o => o.active),
            timeRemaining: Math.ceil(this.timeRemaining),
            state: this.state,
            nextQuestionIn: Math.max(0, this.questionCooldownTimer),
            questionsUsed: this.questionsUsed,
            maxQuestions: this.config.maxQuestions,
            serverTime: Date.now(),
            seed: this.seed
        });
    }

    finishGame() {
        this.state = 'FINISHED';
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }

        const rankings = [...this.players.values()]
            .sort((a, b) => b.distance - a.distance)
            .map((p, i) => ({
                rank: i + 1,
                id: p.id,
                name: p.name,
                distance: Math.floor(p.distance),
                color: p.color,
                colorName: p.colorName
            }));

        this.io.to(this.roomCode).emit('game-over', { rankings });
    }

    stop() {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }
    }
}

module.exports = GameRoom;
