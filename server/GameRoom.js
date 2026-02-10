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

        const laneCount = this.getLaneCount();
        let i = 0;
        for (const p of this.players.values()) {
            p.lane = i % laneCount;
            p.distance = 0;
            p.speed = this.config.baseSpeed;
            p.status = 'normal';
            p.effectTimer = 0;
            i++;
        }

        let count = 3;
        this.io.to(this.roomCode).emit('countdown', { count, laneCount, config: this.config });
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                this.io.to(this.roomCode).emit('countdown', { count, laneCount, config: this.config });
            } else {
                clearInterval(countdownInterval);
                this.io.to(this.roomCode).emit('countdown', { count: 0, laneCount, config: this.config });
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
        this.nextObstacleDistance = 400;
        this.questionsUsed = 0;
        this.questionCooldownTimer = 10;
        this.gameLoopInterval = setInterval(() => this.tick(), 16);
    }

    tick() {
        if (this.state !== 'RACING') return;

        const now = Date.now();
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

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
            this.nextObstacleDistance += 200 + Math.random() * 200;
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
                // Shield/Invincible: Ensure full speed (or even boost if desired)
                moveSpeed = p.speed;
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
        this.obstacles = this.obstacles.filter(o => o.distance > minDist);

        this.broadcastState();
    }

    spawnObstacles(atDistance) {
        const laneCount = this.getLaneCount();
        const numObstacles = Math.floor(Math.random() * (laneCount - 1)) + 1;
        const lanes = [];
        for (let i = 0; i < laneCount; i++) lanes.push(i);
        for (let i = lanes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
        }

        const selectedLanes = lanes.slice(0, numObstacles);

        for (const lane of selectedLanes) {
            let type;
            const rand = Math.random();
            // Only spawn question if cooldown ready AND not maxed out
            if (this.questionCooldownTimer <= 0 && this.questionsUsed < this.config.maxQuestions && rand < 0.08) {
                type = 'question';
            } else if (rand < 0.55) {
                type = 'stone';
            } else {
                type = 'oil';
            }

            this.obstacles.push({
                id: Math.random().toString(36).substr(2, 9),
                type,
                lane,
                distance: atDistance + (Math.random() * 50),
                active: true
            });
        }
    }

    handleObstacleHit(player, obstacle) {
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
        this.questionCooldownTimer = this.config.questionCooldown;

        const question = this.questionManager.getRandomQuestion();
        if (!question) return;

        this.state = 'QUESTION';
        this.activeQuestion = question;
        this.questionAnswers.clear();

        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }

        this.io.to(this.roomCode).emit('question-start', {
            triggeredBy,
            question: question.question,
            answers: question.answers,
            timeLimit: question.timeLimit || this.config.questionTime
        });

        const questionTimeLimit = (question.timeLimit || this.config.questionTime) * 1000;
        this.questionTimer = setTimeout(() => {
            this.resolveQuestion();
        }, questionTimeLimit + 500);
    }

    handleAnswer(playerId, answerIndex) {
        if (this.state !== 'QUESTION' || !this.activeQuestion) return;
        if (this.questionAnswers.has(playerId)) return;
        this.questionAnswers.set(playerId, answerIndex);
        if (this.questionAnswers.size >= this.players.size) {
            clearTimeout(this.questionTimer);
            setTimeout(() => this.resolveQuestion(), 500);
        }
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

        this.activeQuestion = null;
        this.questionAnswers.clear();

        setTimeout(() => {
            if (this.state === 'QUESTION') {
                this.state = 'RACING';
                this.lastTick = Date.now();
                this.gameLoopInterval = setInterval(() => this.tick(), 16);
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
            playersData.push({
                id: p.id,
                name: p.name,
                lane: p.lane,
                distance: p.distance,
                color: p.color,
                colorName: p.colorName,
                status: p.status,
                effectType: p.effectType,
                effectTimer: p.effectTimer
            });
        }

        this.io.to(this.roomCode).emit('game-state', {
            players: playersData,
            obstacles: this.obstacles.filter(o => o.active),
            timeRemaining: Math.ceil(this.timeRemaining),
            state: this.state
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
