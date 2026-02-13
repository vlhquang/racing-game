const QuestionManager = require('./QuestionManager');
const { getConfig } = require('./configCache');

class GameRoom {
    constructor(roomCode, io) {
        this.roomCode = roomCode;
        this.io = io;
        this.state = 'WAITING';
        this.players = new Map();
        this.hostId = null;
        this.gameLoopInterval = null;
        this.lastTick = 0;
        this.timeRemaining = 0;
        this.activeQuestion = null;
        this.activeQuestionTimeLimit = null;
        this.questionAnswers = new Map();
        this.questionTimer = null;
        this.questionReadyTimer = null;
        this.questionReadyPlayers = new Set();
        this.questionCountdownStarted = false;

        // Load config
        this.config = getConfig();

        // Track questions
        this.questionsUsed = 0;
        this.fixedObstacles = [];
        this.questionPlan = [];
        this.obstacleLookup = new Map();
        this.questionManager = new QuestionManager();
        this.lastBroadcastTime = 0;
    }

    getQuestionTimeLimit(question) {
        const qLimit = Number(question && question.timeLimit);
        if (Number.isFinite(qLimit) && qLimit > 0) return qLimit;
        return this.config.questionTime;
    }

    addPlayer(socket, name, vehicleType) {
        const playerIndex = this.players.size;
        const allowed = new Set([
            'car', 'taxi', 'bus', 'police', 'trafficpolice',
            'truck', 'sport', 'icecream', 'tank', 'f1', 'bike'
        ]);
        const type = allowed.has(vehicleType) ? vehicleType : 'car';
        const player = {
            id: socket.id,
            name: name,
            lane: Math.floor((this.config.maxPlayers + 1) / 2),
            distance: 0,
            speed: this.config.baseSpeed,
            color: ['#FF4444', '#4488FF', '#FFCC00', '#44CC44'][playerIndex] || '#ffffff',
            colorName: ['red', 'blue', 'yellow', 'green'][playerIndex] || 'white',
            vehicleType: type,
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

        if (this.state === 'QUESTION' && !this.questionCountdownStarted) {
            this.maybeStartQuestionCountdown();
        }
    }

    hasPlayer(id) { return this.players.has(id); }
    getPlayerCount() { return this.players.size; }
    getLaneCount() { return this.players.size + 1; }

    setPlayerVehicle(playerId, vehicleType) {
        const allowed = new Set([
            'car', 'taxi', 'bus', 'police', 'trafficpolice',
            'truck', 'sport', 'icecream', 'tank', 'f1', 'bike'
        ]);
        const p = this.players.get(playerId);
        if (!p) return;
        if (allowed.has(vehicleType)) {
            p.vehicleType = vehicleType;
        }
    }

    getPlayersInfo() {
        const infos = [];
        for (const p of this.players.values()) {
            infos.push({
                id: p.id,
                name: p.name,
                color: p.color,
                colorName: p.colorName,
                vehicleType: p.vehicleType,
                index: p.index,
                isHost: p.id === this.hostId
            });
        }
        return infos;
    }

    startGame() {
        if (this.state !== 'WAITING' && this.state !== 'FINISHED') {
            console.log(`[GameRoom] Room ${this.roomCode}: Cannot start, state is ${this.state}`);
            return;
        }

        // Ensure no timers from previous run.
        this.stop();
        // Refresh runtime config for each round.
        this.config = getConfig();

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

        this.io.to(this.roomCode).emit('race-loading', { message: 'Đang tải vòng đua...' });
        this.prepareRacePlan();

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

        this.questionsUsed = 0;
        this.io.to(this.roomCode).emit('race-plan', {
            seed: this.seed,
            laneCount: this.getLaneCount(),
            config: this.config,
            obstacles: this.getRacePlanObstacles(),
            serverTime: Date.now()
        });

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

        }

        // Lower frequency network snapshots for smoother online play on weak devices/networks.
        if (now - this.lastBroadcastTime >= 100) {
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

    getDeterministicObstacleLanes(rowDistance, laneCount) {
        const numRand = this.getSeedRandom(rowDistance + 789);
        const numObstacles = Math.floor(numRand * (laneCount - 1)) + 1;

        const lanes = [];
        for (let i = 0; i < laneCount; i++) lanes.push(i);
        for (let i = lanes.length - 1; i > 0; i--) {
            const jRand = this.getSeedRandom(rowDistance + i + 999);
            const j = Math.floor(jRand * (i + 1));
            [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
        }

        return lanes.slice(0, numObstacles);
    }

    getDeterministicObstacleType(distance, lane) {
        const typeRand = this.getSeedRandom(distance + lane + 555);
        return (typeRand < 0.6) ? 'stone' : 'oil';
    }

    prepareRacePlan() {
        this.fixedObstacles = this.buildFixedObstaclePlan();
        this.questionPlan = this.buildQuestionPlan();
        this.obstacleLookup.clear();
        for (const obs of this.fixedObstacles) {
            this.obstacleLookup.set(obs.id, obs);
        }
        for (const q of this.questionPlan) {
            this.obstacleLookup.set(q.id, q);
        }
    }

    buildFixedObstaclePlan() {
        const laneCount = this.getLaneCount();
        const baseSpeed = Number(this.config.baseSpeed) || 300;
        const raceDuration = Number(this.config.raceDuration) || 120;
        const raceDistanceCap = baseSpeed * raceDuration * 1.2;
        const initialDelayDist = baseSpeed * (this.config.initialObstacleDelay || 3);
        const step = 300;
        const plan = [];

        const startRow = Math.max(0, Math.floor((initialDelayDist + 600) / step) * step);
        for (let d = startRow; d <= raceDistanceCap; d += step) {
            const lanes = this.getDeterministicObstacleLanes(d, laneCount);
            for (const lane of lanes) {
                plan.push({
                    id: `obs_${Math.floor(d)}_${lane}`,
                    type: this.getDeterministicObstacleType(d, lane),
                    lane,
                    distance: Math.floor(d)
                });
            }
        }
        return plan;
    }

    getRacePlanObstacles() {
        const questionObstacles = this.questionPlan.map((q) => ({
            id: q.id,
            type: 'question',
            lane: q.lane,
            distance: q.distance
        }));
        return [...this.fixedObstacles, ...questionObstacles];
    }

    pickQuestionLaneAtDistance(distance, laneCount) {
        const row = Math.floor(distance / 300) * 300;
        const laneBlocked = new Set();
        try {
            const prevRow = row;
            const nextRow = row + 300;
            for (const l of this.getDeterministicObstacleLanes(prevRow, laneCount)) laneBlocked.add(l);
            for (const l of this.getDeterministicObstacleLanes(nextRow, laneCount)) laneBlocked.add(l);
        } catch (e) {
            // ignore and fallback below
        }

        const allLanes = Array.from({ length: laneCount }, (_, i) => i);
        let candidates = allLanes.filter(l => !laneBlocked.has(l));
        if (candidates.length === 0) {
            const curBlocked = new Set(this.getDeterministicObstacleLanes(row, laneCount));
            candidates = allLanes.filter(l => !curBlocked.has(l));
        }
        if (candidates.length === 0) candidates = allLanes;

        const nearRows = [row - 300, row, row + 300];
        const safeLanes = candidates.filter(l => {
            for (const r of nearRows) {
                if (r < 0) continue;
                const lanes = this.getDeterministicObstacleLanes(r, laneCount);
                if (lanes.includes(l)) return false;
            }
            return true;
        });
        const finalList = safeLanes.length > 0 ? safeLanes : candidates;
        return finalList[Math.floor(Math.random() * finalList.length)];
    }

    buildQuestionPlan() {
        const laneCount = this.getLaneCount();
        const plan = [];
        const maxQuestions = Math.max(0, Number(this.config.maxQuestions) || 0);
        const minInterval = Number(this.config.questionIntervalMin) || 8;
        const maxInterval = Number(this.config.questionIntervalMax) || minInterval;
        const baseSpeed = Number(this.config.baseSpeed) || 300;
        const raceDistanceCap = baseSpeed * (Number(this.config.raceDuration) || 120) * 1.2;
        const leadTime = Number(this.config.questionLeadTime) || 2.5;
        const spawnOffset = Number.isFinite(this.config.questionSpawnOffset)
            ? this.config.questionSpawnOffset
            : 100;
        const initialDelay = Number(this.config.initialObstacleDelay) || 3;
        let distanceCursor = Math.max(600, baseSpeed * (initialDelay + leadTime) + spawnOffset);

        for (let i = 0; i < maxQuestions; i++) {
            const intervalSec = minInterval + Math.random() * Math.max(0, (maxInterval - minInterval));
            distanceCursor += intervalSec * baseSpeed;
            if (distanceCursor > raceDistanceCap) break;
            const row = Math.floor(distanceCursor / 300) * 300;
            const spawnDistance = Math.max(distanceCursor, row + spawnOffset);
            const lane = this.pickQuestionLaneAtDistance(spawnDistance, laneCount);
            plan.push({
                id: `q_${i}_${Math.random().toString(36).slice(2, 6)}`,
                lane,
                distance: Math.floor(spawnDistance),
                active: true
            });
        }

        return plan;
    }

    onObstacleHit(playerId, obstacleData) {
        if (this.state !== 'RACING') return;
        const player = this.players.get(playerId);
        if (!player || player.status === 'rewarded') return;

        // 1. Handle Questions (Server Authoritative)
        if (obstacleData.type === 'question') {
            const planItem = this.questionPlan.find(q => q.id === obstacleData.id && q.active);
            if (planItem && player.status !== 'penalized') {
                planItem.active = false;
                this.triggerQuestion(player.id);
            }
            return;
        }

        // 2. Stone/Oil from pre-built race plan.
        const obs = this.obstacleLookup.get(obstacleData.id);
        if (!obs || obs.type !== obstacleData.type || obs.lane !== obstacleData.lane) {
            return;
        }

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

        const question = this.questionManager.getRandomQuestion();
        if (!question) return;

        this.state = 'QUESTION';
        this.activeQuestion = question;
        this.activeQuestionTimeLimit = this.getQuestionTimeLimit(question);
        this.questionAnswers.clear();
        this.questionStartTime = null;
        this.questionCountdownStarted = false;
        this.questionReadyPlayers.clear();

        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }

        const timeLimit = this.activeQuestionTimeLimit;
        this.io.to(this.roomCode).emit('question-start', {
            triggeredBy,
            questionId: question.id,
            question: question.question,
            answers: question.answers,
            imageUrl: question.imageUrl,
            timeLimit
        });

        this.broadcastState();

        if (this.questionReadyTimer) {
            clearTimeout(this.questionReadyTimer);
            this.questionReadyTimer = null;
        }

        const maxWaitMs = Math.max(0, (this.config.questionImageMaxWait || 0) * 1000);
        this.questionReadyTimer = setTimeout(() => {
            this.startQuestionCountdown();
        }, maxWaitMs);
    }

    handleQuestionReady(playerId, questionId) {
        if (this.state !== 'QUESTION' || !this.activeQuestion) return;
        if (this.questionCountdownStarted) return;
        if (!this.players.has(playerId)) return;
        if (questionId && this.activeQuestion.id && questionId !== this.activeQuestion.id) return;

        this.questionReadyPlayers.add(playerId);
        this.maybeStartQuestionCountdown();
    }

    maybeStartQuestionCountdown() {
        if (this.state !== 'QUESTION' || !this.activeQuestion) return;
        if (this.questionCountdownStarted) return;

        const playerIds = [...this.players.keys()];
        if (playerIds.length === 0) return;

        const allReady = playerIds.every(id => this.questionReadyPlayers.has(id));
        if (allReady) {
            this.startQuestionCountdown();
        }
    }

    startQuestionCountdown() {
        if (this.state !== 'QUESTION' || !this.activeQuestion) return;
        if (this.questionCountdownStarted) return;

        this.questionCountdownStarted = true;
        this.questionStartTime = Date.now();

        if (this.questionReadyTimer) {
            clearTimeout(this.questionReadyTimer);
            this.questionReadyTimer = null;
        }

        const timeLimit = this.activeQuestionTimeLimit || this.config.questionTime;
        this.io.to(this.roomCode).emit('question-go', {
            questionId: this.activeQuestion.id,
            timeLimit,
            serverTime: this.questionStartTime
        });

        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }

        this.questionTimer = setTimeout(() => {
            this.resolveQuestion();
        }, Math.max(0, timeLimit * 1000));
    }

    handleAnswer(playerId, answerIndex) {
        if (this.state !== 'QUESTION' || !this.activeQuestion) return;
        if (!this.questionStartTime) return;
        const timeLimit = this.activeQuestionTimeLimit || this.config.questionTime;
        const elapsed = (Date.now() - this.questionStartTime) / 1000;
        if (elapsed > timeLimit - 2) return;
        this.questionAnswers.set(playerId, answerIndex);
    }

    resolveQuestion() {
        if (!this.activeQuestion) return;

        if (this.questionReadyTimer) {
            clearTimeout(this.questionReadyTimer);
            this.questionReadyTimer = null;
        }

        const results = [];
        for (const p of this.players.values()) {
            const answer = this.questionAnswers.get(p.id);
            let correct = false;
            let penalty = null;
            let duration = 0;

            if (answer === undefined) {
                penalty = this.getRandomPenalty(true);
                duration = this.getPenaltyDuration(penalty, true);
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
                duration = this.getPenaltyDuration(penalty, false);
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
        this.activeQuestionTimeLimit = null;
        this.questionAnswers.clear();
        this.questionCountdownStarted = false;
        this.questionReadyPlayers.clear();
        this.questionStartTime = null;

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

    getPenaltyDuration(penaltyType, isNoAnswer) {
        const pConfig = this.config.penalties.types[penaltyType];
        if (!pConfig) return 0;

        if (isNoAnswer && Number.isFinite(pConfig.noAnswerDuration)) {
            return pConfig.noAnswerDuration;
        }
        if (!isNoAnswer && Number.isFinite(pConfig.wrongDuration)) {
            return pConfig.wrongDuration;
        }

        const base = Number.isFinite(pConfig.duration) ? pConfig.duration : 0;
        if (isNoAnswer) {
            return base * (this.config.penalties.noAnswer.durationMultiplier || 1);
        }
        return base * (this.config.penalties.wrongAnswer.durationMultiplier || 1);
    }

    handleInput(playerId, direction) {
        const player = this.players.get(playerId);
        if (!player || this.state !== 'RACING') return;
        // Only block if stopped (oil allows movement now)
        if (player.status === 'stopped') return;
        if (player.status === 'penalized' && (player.effectType === 'rocket' || player.effectType === 'bubble')) return;

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
                vehicleType: p.vehicleType,
                status: p.status,
                effectType: p.effectType,
                effectTimer: p.effectTimer,
                speed: speed
            });
        }

        this.io.to(this.roomCode).emit('game-state', {
            players: playersData,
            inactiveQuestionIds: this.questionPlan.filter((q) => !q.active).map((q) => q.id),
            timeRemaining: Math.ceil(this.timeRemaining),
            state: this.state,
            nextQuestionIn: this.getNextQuestionInSec(),
            questionsUsed: this.questionsUsed,
            maxQuestions: this.config.maxQuestions,
            serverTime: Date.now(),
            seed: this.seed
        });
    }

    getNextQuestionInSec() {
        if (this.state !== 'RACING') return 0;
        let maxDistance = 0;
        for (const p of this.players.values()) {
            if (p.distance > maxDistance) maxDistance = p.distance;
        }
        const next = this.questionPlan.find((q) => q.active && q.distance > maxDistance);
        if (!next) return 0;
        const speed = Math.max(1, Number(this.config.baseSpeed) || 300);
        return Math.max(0, (next.distance - maxDistance) / speed);
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
        if (this.questionReadyTimer) {
            clearTimeout(this.questionReadyTimer);
            this.questionReadyTimer = null;
        }
    }
}

module.exports = GameRoom;
