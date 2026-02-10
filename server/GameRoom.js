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
        this.inactiveDeterministicIds = new Set();
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
        this.questionManager.reset();
        this.timeRemaining = this.config.raceDuration;
        this.lastTick = Date.now();
        this.obstacles = [];
        this.inactiveDeterministicIds.clear();

        const initialDelayDist = this.config.baseSpeed * (this.config.initialObstacleDelay || 3);
        this.nextObstacleDistance = initialDelayDist + 600;

        this.questionsUsed = 0;

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
                // We only spawn Questions now, Deterministic items are handled by client
                this.spawnQuestionsOnly(this.nextObstacleDistance);
                this.nextObstacleDistance += 300;
            }

            for (const p of this.players.values()) {
                if (p.effectTimer > 0) {
                    p.effectTimer -= dt;
                    if (p.effectTimer <= 0) {
                        p.effectTimer = 0;
                        p.status = 'normal';
                        p.effectType = null;
                        p.speed = this.config.baseSpeed;
                    }
                }

                let moveSpeed = p.speed;
                if (p.status === 'stopped') {
                    moveSpeed = 0;
                } else if (p.status === 'spinning') {
                    moveSpeed = p.speed * this.config.penalties.types.spin.speedMultiplier;
                } else if (p.status === 'penalized') {
                    const pConfig = this.config.penalties.types[p.effectType];
                    if (pConfig) moveSpeed = p.speed * pConfig.speedMultiplier;
                } else if (p.status === 'rewarded') {
                    moveSpeed = p.speed * (this.config.rewardSpeedMultiplier || 1.1);
                }

                p.distance += moveSpeed * dt;
            }

            const minDist = Math.min(...[...this.players.values()].map(p => p.distance)) - 500;
            this.obstacles = this.obstacles.filter(o => o.distance > minDist);
        }

        // Broadcast more frequently (30ms = ~33Hz) for smoother road
        if (now - this.lastBroadcastTime >= 30) {
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

    spawnQuestionsOnly(atDistance) {
        const laneCount = this.getLaneCount();
        const canSpawnQuestion = this.questionCooldownTimer <= 0 &&
            this.questionsUsed < this.config.maxQuestions &&
            !this.obstacles.some(o => o.type === 'question' && o.active);

        if (canSpawnQuestion) {
            const spawnRand = Math.random();
            if (spawnRand < 0.4) {
                const lane = Math.floor(Math.random() * laneCount);
                this.obstacles.push({
                    id: 'q_' + Math.random().toString(36).substr(2, 5),
                    type: 'question',
                    lane,
                    distance: atDistance + 60,
                    active: true
                });

                this.questionCooldownTimer = this.config.questionIntervalMin +
                    Math.random() * (this.config.questionIntervalMax - this.config.questionIntervalMin);

                console.log(`[GameRoom] Room ${this.roomCode}: Question box spawned.`);
            }
        }
    }

    onObstacleHit(playerId, obstacleData) {
        if (this.state !== 'RACING') return;
        const player = this.players.get(playerId);
        if (!player || player.status === 'rewarded') return;

        // 1. Handle Questions (Server Authoritative)
        if (obstacleData.type === 'question') {
            const obs = this.obstacles.find(o => o.id === obstacleData.id && o.active);
            if (obs) {
                obs.active = false;
                if (player.status !== 'penalized') {
                    this.triggerQuestion(player.id);
                }
            }
            return;
        }

        // 2. Handle Deterministic Obstacles (Stone/Oil) - Verify on Server
        const d = obstacleData.distance;
        const lane = obstacleData.lane;
        const obsId = obstacleData.id || `obs_${Math.floor(d)}_${lane}`;

        if (this.inactiveDeterministicIds.has(obsId)) return;

        // VERIFY: Did this obstacle actually exist?
        const laneCount = this.getLaneCount();
        const numRand = this.getSeedRandom(d + 789);
        const numObstacles = Math.floor(numRand * (laneCount - 1)) + 1;

        const lanes = [];
        for (let i = 0; i < laneCount; i++) lanes.push(i);
        for (let i = lanes.length - 1; i > 0; i--) {
            const jRand = this.getSeedRandom(d + i + 999);
            const j = Math.floor(jRand * (i + 1));
            [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
        }

        const selectedLanes = lanes.slice(0, numObstacles);
        if (!selectedLanes.includes(lane)) {
            console.log(`[GameRoom] REJECTED hit: No obstacle at ${d}, lane ${lane}`);
            return;
        }

        // Valid hit
        this.inactiveDeterministicIds.add(obsId);

        if (obstacleData.type === 'stone') {
            player.status = 'stopped';
            player.effectTimer = this.config.stoneStopTime;
            this.io.to(this.roomCode).emit('obstacle-hit', {
                playerId: player.id,
                type: 'stone',
                duration: this.config.stoneStopTime
            });
        } else if (obstacleData.type === 'oil') {
            player.status = 'spinning';
            player.effectTimer = this.config.oilSpinTime;
            this.io.to(this.roomCode).emit('obstacle-hit', {
                playerId: player.id,
                type: 'oil',
                duration: this.config.oilSpinTime
            });
        }
    }

    triggerQuestion(triggeredBy) {
        if (this.state !== 'RACING') return;
        this.questionsUsed++;

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
                penalty = this.getRandomPenalty(true);
                const pConfig = this.config.penalties.types[penalty];
                duration = pConfig.duration * this.config.penalties.noAnswer.durationMultiplier;
                p.status = 'penalized';
                p.effectType = penalty;
                p.effectTimer = duration;
            } else if (answer === this.activeQuestion.correctIndex) {
                correct = true;
                duration = this.config.correctRewardTime;
                p.status = 'rewarded';
                p.effectTimer = duration;
            } else {
                penalty = this.getRandomPenalty(false);
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
        this.broadcastState();
        this.activeQuestion = null;
        this.questionAnswers.clear();

        setTimeout(() => {
            if (this.state === 'QUESTION') {
                this.state = 'RACING';
                this.lastTick = Date.now();
                this.gameLoopInterval = setInterval(() => this.tick(), 16);
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
        if (!player || this.state !== 'RACING') return;
        // Only block if stopped (oil allows movement now)
        if (player.status === 'stopped') return;

        const laneCount = this.getLaneCount();
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
                speed: speed
            });
        }

        this.io.to(this.roomCode).emit('game-state', {
            players: playersData,
            obstacles: this.obstacles.filter(o => o.active), // Only questions here
            inactiveDeterministicIds: Array.from(this.inactiveDeterministicIds),
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
