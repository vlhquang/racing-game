// ============================================
// UI MODULE — Lobby, Question Modal, Results
// ============================================
const UI = (() => {
    let currentRoomCode = '';
    let isHost = false;
    let myPlayerId = '';
    let questionTimerInterval = null;

    function init() {
        // DOM elements
        const lobbyScreen = document.getElementById('lobby-screen');
        const gameScreen = document.getElementById('game-screen');
        const resultsScreen = document.getElementById('results-screen');
        const lobbyMenu = document.getElementById('lobby-menu');
        const lobbyRoom = document.getElementById('lobby-room');
        const btnCreate = document.getElementById('btn-create');
        const btnJoin = document.getElementById('btn-join');
        const btnStart = document.getElementById('btn-start');
        const btnPlayAgain = document.getElementById('btn-play-again');
        const playerNameInput = document.getElementById('player-name');
        const roomCodeInput = document.getElementById('room-code-input');
        const errorMsg = document.getElementById('error-msg');

        // Create room
        btnCreate.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            if (!name) {
                showError('Vui lòng nhập tên!');
                return;
            }
            Network.createRoom(name);
        });

        // Join room
        btnJoin.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            const code = roomCodeInput.value.trim().toUpperCase();
            if (!name) { showError('Vui lòng nhập tên!'); return; }
            if (!code || code.length < 4) { showError('Mã phòng không hợp lệ!'); return; }
            Network.joinRoom(code, name);
        });

        // Enter key to join
        roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnJoin.click();
        });
        playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (roomCodeInput.value.trim()) btnJoin.click();
                else btnCreate.click();
            }
        });

        // Start game
        btnStart.addEventListener('click', () => {
            Network.startGame(currentRoomCode);
        });

        // Play again
        btnPlayAgain.addEventListener('click', () => {
            window.location.reload();
        });

        function showError(msg) {
            errorMsg.textContent = msg;
            errorMsg.classList.remove('hidden');
            setTimeout(() => errorMsg.classList.add('hidden'), 3000);
        }

        // Network callbacks
        Network.on('onRoomCreated', (data) => {
            currentRoomCode = data.roomCode;
            myPlayerId = data.playerId;
            isHost = true;
            lobbyMenu.classList.add('hidden');
            lobbyRoom.classList.remove('hidden');
            document.getElementById('room-code-label').textContent = data.roomCode;
            document.getElementById('btn-start').classList.remove('hidden');
            document.getElementById('waiting-msg').classList.add('hidden');
            updatePlayerList(data.players);
        });

        Network.on('onRoomJoined', (data) => {
            currentRoomCode = data.roomCode;
            myPlayerId = data.playerId;
            isHost = false;
            lobbyMenu.classList.add('hidden');
            lobbyRoom.classList.remove('hidden');
            document.getElementById('room-code-label').textContent = data.roomCode;
            document.getElementById('btn-start').classList.add('hidden');
            document.getElementById('waiting-msg').classList.remove('hidden');
            updatePlayerList(data.players);
        });

        Network.on('onPlayerJoined', (data) => {
            updatePlayerList(data.players);
        });

        Network.on('onPlayerLeft', (data) => {
            updatePlayerList(data.players);
        });

        Network.on('onError', (msg) => {
            showError(msg);
        });

        Network.on('onCountdown', (data) => {
            showGameScreen();
            showCountdown(data.count);
        });

        Network.on('onGameOver', (data) => {
            showResults(data.rankings);
        });
    }

    function updatePlayerList(players) {
        const list = document.getElementById('player-list');
        list.innerHTML = '';
        players.forEach(p => {
            const item = document.createElement('div');
            item.className = 'player-item';
            item.innerHTML = `
        <div class="player-dot" style="background:${p.color}"></div>
        <span>${escapeHtml(p.name)}</span>
        ${p.isHost ? '<span class="player-host-badge">HOST</span>' : ''}
      `;
            list.appendChild(item);
        });
    }

    function showGameScreen() {
        console.log('[UI] showGameScreen called - Transitioning to game canvas');
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('active');
    }

    function showCountdown(count) {
        const overlay = document.getElementById('countdown-overlay');
        const text = document.getElementById('countdown-text');

        if (count > 0) {
            overlay.classList.remove('hidden');
            text.textContent = count;
            text.style.animation = 'none';
            text.offsetHeight; // trigger reflow
            text.style.animation = 'countPop 0.5s ease-out';
        } else {
            text.textContent = 'GO!';
            text.style.color = '#27ae60';
            text.style.animation = 'none';
            text.offsetHeight;
            text.style.animation = 'countPop 0.5s ease-out';
            setTimeout(() => {
                overlay.classList.add('hidden');
                text.style.color = '';
            }, 800);
        }
    }

    function showQuestion(data) {
        const overlay = document.getElementById('question-overlay');
        const qText = document.getElementById('question-text');
        const qAnswers = document.getElementById('question-answers');
        const timerFill = document.getElementById('question-timer-fill');
        const timerText = document.getElementById('question-timer-text');

        overlay.classList.remove('hidden');
        qText.textContent = data.question;
        qAnswers.innerHTML = '';

        // Timer numerical countdown
        let timeLeft = data.timeLimit;
        timerText.textContent = `${timeLeft.toFixed(1)}s`;
        timerText.style.color = ''; // Reset color
        if (questionTimerInterval) clearInterval(questionTimerInterval);
        questionTimerInterval = setInterval(() => {
            timeLeft -= 0.1;
            if (timeLeft >= 0) {
                timerText.textContent = `${timeLeft.toFixed(1)}s`;
                // Turn red when low time (< 3s)
                if (timeLeft < 3) {
                    timerText.style.color = '#e94560';
                }
            } else {
                timerText.textContent = "0.0s";
                clearInterval(questionTimerInterval);
            }
        }, 1000 / 10);

        let answered = false;

        data.answers.forEach((ans, i) => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn';
            btn.textContent = ans;
            btn.addEventListener('click', () => {
                if (answered) return;
                answered = true;
                // Mark selected
                qAnswers.querySelectorAll('.answer-btn').forEach(b => b.style.pointerEvents = 'none');
                btn.classList.add('selected');
                Network.answerQuestion(currentRoomCode, i);
            });
            qAnswers.appendChild(btn);
        });

        // Timer animation
        timerFill.style.transition = 'none';
        timerFill.style.width = '100%';
        requestAnimationFrame(() => {
            timerFill.style.transition = `width ${data.timeLimit}s linear`;
            timerFill.style.width = '0%';
        });
    }

    function hideQuestion() {
        if (questionTimerInterval) clearInterval(questionTimerInterval);
        document.getElementById('question-overlay').classList.add('hidden');
    }

    function showQuestionResult(results, correctIndex) {
        hideQuestion();

        const overlay = document.getElementById('result-overlay');
        const content = document.getElementById('result-content');

        const myResult = results.find(r => r.playerId === myPlayerId);
        if (!myResult) return;

        overlay.classList.remove('hidden');

        if (myResult.correct) {
            content.innerHTML = `
        <div class="result-correct">✅ ĐÚNG RỒI!</div>
        <p style="color:#a0b4d0;margin-top:8px">Miễn nhiễm chướng ngại vật ${myResult.duration}s</p>
      `;
        } else {
            const penaltyIcons = {
                stop: '🛑 DỪNG LẠI',
                slow: '🐌 CHẬM LẠI',
                reverse: '🔄 ĐẢO ĐIỀU KHIỂN',
                blur: '👻 MỜ MÀN HÌNH',
                spin: '🌀 QUAY VÒNG'
            };

            // Slot machine effect
            const penaltyKeys = Object.keys(penaltyIcons);
            const finalPenalty = myResult.penalty;
            let spinCount = 0;
            const maxSpin = 12;

            content.innerHTML = `
        <div class="result-wrong">${myResult.answered ? '❌ SAI RỒI!' : '⏰ HẾT GIỜ!'}</div>
        <div class="penalty-name" id="penalty-spin">${penaltyIcons[penaltyKeys[0]]}</div>
        <p class="penalty-duration">${myResult.duration}s phạt</p>
      `;

            const penaltySpin = document.getElementById('penalty-spin');
            const spinInterval = setInterval(() => {
                spinCount++;
                const idx = spinCount % penaltyKeys.length;
                penaltySpin.textContent = penaltyIcons[penaltyKeys[idx]];
                if (spinCount >= maxSpin) {
                    clearInterval(spinInterval);
                    penaltySpin.textContent = penaltyIcons[finalPenalty] || '⚠️ PHẠT';
                    penaltySpin.style.color = '#e94560';
                    penaltySpin.style.transform = 'scale(1.2)';
                }
            }, 100);
        }

        // Auto hide after 2s
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 2000);
    }

    function showResults(rankings) {
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('results-screen').classList.remove('hidden');
        document.getElementById('results-screen').classList.add('active');

        const list = document.getElementById('rankings-list');
        list.innerHTML = '';

        const medals = ['🥇', '🥈', '🥉', '4️⃣'];

        rankings.forEach((r, i) => {
            const dist = Math.floor(r.distance / 10);
            const item = document.createElement('div');
            item.className = 'rank-item';
            item.innerHTML = `
        <div class="rank-number">${medals[i] || (i + 1)}</div>
        <div class="player-dot" style="background:${r.color}"></div>
        <span class="rank-name">${escapeHtml(r.name)}</span>
        <span class="rank-distance">${dist}m</span>
      `;
            list.appendChild(item);
        });
    }

    function getRoomCode() { return currentRoomCode; }
    function getPlayerId() { return myPlayerId; }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    return { init, showQuestion, hideQuestion, showQuestionResult, showResults, getRoomCode, getPlayerId };
})();
