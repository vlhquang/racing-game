// ============================================
// UI MODULE — Lobby, Question Modal, Results
// ============================================
const UI = (() => {
    let currentRoomCode = '';
    let isHost = false;
    let myPlayerId = '';
    let questionTimerInterval = null;
    let activeQuestionId = null;
    let questionCountdownStarted = false;
    let questionEndTimeMs = 0;
    let questionTimeLimitSec = 0;

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
        const vehicleSelect = document.getElementById('vehicle-type');
        const resultsVehicleSelect = document.getElementById('results-vehicle-type');
        const roomCodeInput = document.getElementById('room-code-input');
        const errorMsg = document.getElementById('error-msg');

        function setLoading(btn, isLoading, loadingText = 'Đang xử lý...') {
            if (isLoading) {
                btn.dataset.originalText = btn.textContent;
                btn.textContent = loadingText;
                btn.classList.add('btn-loading');
                btn.disabled = true;
            } else {
                btn.textContent = btn.dataset.originalText || btn.textContent;
                btn.classList.remove('btn-loading');
                btn.disabled = false;
            }
        }

        // Create room
        btnCreate.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            if (!name) {
                showError('Vui lòng nhập tên!');
                return;
            }
            setLoading(btnCreate, true);
            const vehicleType = vehicleSelect ? (vehicleSelect.value || 'car') : 'car';
            Network.createRoom(name, vehicleType);
        });

        // Join room
        btnJoin.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            const code = roomCodeInput.value.trim().toUpperCase();
            if (!name) { showError('Vui lòng nhập tên!'); return; }
            if (!code || code.length < 4) { showError('Mã phòng không hợp lệ!'); return; }
            setLoading(btnJoin, true);
            const vehicleType = vehicleSelect ? (vehicleSelect.value || 'car') : 'car';
            Network.joinRoom(code, name, vehicleType);
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
            setLoading(btnStart, true);
            Network.startGame(currentRoomCode);
        });

        // Copy Link
        const btnCopyLink = document.getElementById('btn-copy-link');
        btnCopyLink.addEventListener('click', () => {
            const url = new URL(window.location.href);
            url.searchParams.set('room', currentRoomCode);

            navigator.clipboard.writeText(url.toString()).then(() => {
                const originalText = btnCopyLink.textContent;
                btnCopyLink.textContent = '✅ Đã sao chép!';
                btnCopyLink.classList.replace('btn-secondary', 'btn-primary');
                setTimeout(() => {
                    btnCopyLink.textContent = originalText;
                    btnCopyLink.classList.replace('btn-primary', 'btn-secondary');
                }, 2000);
            });
        });

        // Play again (host restarts game in same room)
        btnPlayAgain.addEventListener('click', () => {
            if (!currentRoomCode) {
                location.reload();
                return;
            }
            if (resultsVehicleSelect) {
                vehicleSelect.value = resultsVehicleSelect.value || 'car';
            }
            Network.restartGame(currentRoomCode, vehicleSelect.value || 'car');
        });

        function showError(msg) {
            errorMsg.textContent = msg;
            errorMsg.classList.remove('hidden');
            setLoading(btnCreate, false);
            setLoading(btnJoin, false);
            setLoading(btnStart, false);
            setTimeout(() => errorMsg.classList.add('hidden'), 3000);
        }

        // Network callbacks
        Network.on('onRoomCreated', (data) => {
            setLoading(btnCreate, false);
            currentRoomCode = data.roomCode;
            myPlayerId = data.playerId;
            isHost = true;
            lobbyMenu.classList.add('hidden');
            lobbyRoom.classList.remove('hidden');
            document.getElementById('room-code-label').textContent = data.roomCode;
            document.getElementById('btn-start').classList.remove('hidden');
            document.getElementById('waiting-msg').classList.add('hidden');
            updatePlayerList(data.players);
            updateQR(data.roomCode);
        });

        Network.on('onRoomJoined', (data) => {
            setLoading(btnJoin, false);
            currentRoomCode = data.roomCode;
            myPlayerId = data.playerId;
            isHost = false;
            lobbyMenu.classList.add('hidden');
            lobbyRoom.classList.remove('hidden');
            document.getElementById('room-code-label').textContent = data.roomCode;
            document.getElementById('btn-start').classList.add('hidden');
            document.getElementById('waiting-msg').classList.remove('hidden');
            updatePlayerList(data.players);
            updateQR(data.roomCode);
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
            setLoading(btnStart, false);
            showGameScreen();
            showCountdown(data.count);
        });

        Network.on('onGameOver', (data) => {
            showResults(data.rankings);
        });

        // Auto-fill room from URL
        const params = new URLSearchParams(window.location.search);
        const roomFromUrl = params.get('room');
        if (roomFromUrl) {
            roomCodeInput.value = roomFromUrl.toUpperCase();
            // Hide create options as per requirement
            btnCreate.classList.add('hidden');
            document.querySelector('.divider').classList.add('hidden');
        }
    }

    function updatePlayerList(players) {
        const list = document.getElementById('player-list');
        list.innerHTML = '';
        players.forEach(p => {
            const vehicleLabel = (p.vehicleType === 'taxi')
                ? 'TAXI'
                : (p.vehicleType === 'bus')
                    ? 'BUS'
                : (p.vehicleType === 'police')
                    ? 'POLICE'
                    : (p.vehicleType === 'trafficpolice')
                        ? 'TRAFFIC'
                    : (p.vehicleType === 'truck')
                        ? 'TRUCK'
                    : (p.vehicleType === 'sport')
                        ? 'SPORT'
                    : (p.vehicleType === 'icecream')
                        ? 'ICECREAM'
                    : (p.vehicleType === 'tank')
                        ? 'TANK'
                        : (p.vehicleType === 'f1')
                            ? 'F1'
                            : (p.vehicleType === 'bike')
                                ? 'BIKE'
                                : 'CAR';
            const item = document.createElement('div');
            item.className = 'player-item';
            item.innerHTML = `
        <div class="player-dot" style="background:${p.color}"></div>
        <span>${escapeHtml(p.name)}</span>
        <span class="player-vehicle-badge">${vehicleLabel}</span>
        ${p.isHost ? '<span class="player-host-badge">HOST</span>' : ''}
      `;
            list.appendChild(item);
        });
    }

    function updateQR(code) {
        const qrContainer = document.getElementById('room-qr-container');
        if (!qrContainer) return;

        // Requirement: Only show for Host
        if (!isHost) {
            qrContainer.innerHTML = '';
            qrContainer.classList.add('hidden');
            return;
        }

        qrContainer.classList.remove('hidden');
        const url = new URL(window.location.href);
        url.searchParams.set('room', code);

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url.toString())}`;
        qrContainer.innerHTML = `<img src="${qrUrl}" alt="Mã QR tham gia phòng">`;
    }

    function showGameScreen() {
        console.log('[UI] showGameScreen called - Transitioning to game canvas');
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('results-screen').classList.remove('active');
        document.getElementById('results-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('active');
        setControlsVisible(true);
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

        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

        overlay.classList.remove('hidden');
        qText.textContent = data.question;
        qAnswers.innerHTML = '';

        activeQuestionId = data.questionId || null;
        questionCountdownStarted = false;
        questionEndTimeMs = 0;
        questionTimeLimitSec = Number(data.timeLimit) || 0;

        // Reset timer UI until server says GO
        if (questionTimerInterval) clearInterval(questionTimerInterval);
        timerFill.style.transition = 'none';
        timerFill.style.width = '100%';
        timerText.textContent = data.imageUrl ? 'Đang tải ảnh...' : 'Chuẩn bị...';
        timerText.style.color = '';

        // Render answers but lock until countdown starts
        data.answers.forEach((ans, idx) => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn locked';
            btn.textContent = ans;
            btn.disabled = true;
            btn.onclick = () => {
                if (!questionCountdownStarted) return;
                Network.answerQuestion(currentRoomCode, idx);
                qAnswers.querySelectorAll('.answer-btn').forEach(b => b.classList.add('locked'));
                btn.classList.add('selected');
                btn.blur();
            };
            qAnswers.appendChild(btn);
        });

        // Handle image
        const imgContainer = document.getElementById('question-image-container');
        if (imgContainer) {
            imgContainer.innerHTML = '';
            if (data.imageUrl) {
                const img = document.createElement('img');
                const notifyReady = () => {
                    // Tell server we can start countdown now
                    Network.questionReady(currentRoomCode, activeQuestionId);
                };
                img.onload = notifyReady;
                img.onerror = notifyReady;
                img.src = data.imageUrl;
                img.alt = 'Question image';
                imgContainer.appendChild(img);
                imgContainer.classList.remove('hidden');
            } else {
                imgContainer.classList.add('hidden');
                Network.questionReady(currentRoomCode, activeQuestionId);
            }
        } else {
            Network.questionReady(currentRoomCode, activeQuestionId);
        }
    }

    function startQuestionCountdown(data) {
        if (!data) return;
        if (activeQuestionId && data.questionId && activeQuestionId !== data.questionId) return;

        const overlay = document.getElementById('question-overlay');
        if (overlay.classList.contains('hidden')) return;

        const qAnswers = document.getElementById('question-answers');
        const timerFill = document.getElementById('question-timer-fill');
        const timerText = document.getElementById('question-timer-text');

        const timeLimit = Number(data.timeLimit) || 0;
        questionTimeLimitSec = timeLimit;

        let initialLeftMs = Math.max(0, timeLimit * 1000);
        const serverTime = Number(data.serverTime);
        if (Number.isFinite(serverTime)) {
            const driftMs = Date.now() - serverTime;
            // If clocks look wildly different, ignore drift.
            if (Math.abs(driftMs) <= 5 * 60 * 1000) {
                initialLeftMs = Math.max(0, initialLeftMs - Math.max(0, driftMs));
            }
        }

        questionEndTimeMs = Date.now() + initialLeftMs;

        questionCountdownStarted = true;

        // Unlock answers at start
        qAnswers.querySelectorAll('.answer-btn').forEach(b => {
            b.classList.remove('locked');
            b.disabled = false;
        });

        const initialLeftSec = initialLeftMs / 1000;
        timerText.textContent = `${initialLeftSec.toFixed(1)}s`;
        timerText.style.color = '';

        if (questionTimerInterval) clearInterval(questionTimerInterval);
        questionTimerInterval = setInterval(() => {
            const leftMs = Math.max(0, questionEndTimeMs - Date.now());
            const leftSec = leftMs / 1000;

            if (leftMs > 0) {
                timerText.textContent = `${leftSec.toFixed(1)}s`;
                if (leftSec < 3) timerText.style.color = '#e94560';
            } else {
                clearInterval(questionTimerInterval);
                timerText.textContent = 'Hết giờ!';
            }

            const denom = Math.max(1, (questionTimeLimitSec || timeLimit) * 1000);
            const progress = (leftMs / denom) * 100;
            timerFill.style.transition = 'none';
            timerFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
        }, 50);
    }

    function hideQuestion() {
        if (questionTimerInterval) clearInterval(questionTimerInterval);
        document.getElementById('question-overlay').classList.add('hidden');
        activeQuestionId = null;
        questionCountdownStarted = false;
        questionEndTimeMs = 0;
        questionTimeLimitSec = 0;
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
                spin: '🌀 QUAY VÒNG',
                rocket: '🚀 BAY VÒNG',
                bubble: '🫧 BÓNG BÓNG'
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

        // Only host can restart the room.
        const btnPlayAgain = document.getElementById('btn-play-again');
        if (btnPlayAgain) {
            if (isHost) {
                btnPlayAgain.classList.remove('hidden');
                btnPlayAgain.disabled = false;
                btnPlayAgain.textContent = '🔄 Chơi Lại';
            } else {
                btnPlayAgain.classList.add('hidden');
            }
        }

        const list = document.getElementById('rankings-list');
        list.innerHTML = '';
        if (resultsVehicleSelect) {
            resultsVehicleSelect.value = vehicleSelect.value || 'car';
        }

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

    function setControlsVisible(visible) {
        const controls = document.getElementById('mobile-controls');
        if (!controls) return;
        const isMobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (isMobile) {
            controls.classList.add('hidden');
            controls.style.display = 'none';
            return;
        }
        if (visible) {
            controls.classList.remove('hidden');
            controls.style.display = 'flex';
        } else {
            controls.classList.add('hidden');
        }
    }

    function ensureControlsVisible() {
        setControlsVisible(true);
    }

    function getRoomCode() { return currentRoomCode; }
    function getPlayerId() { return myPlayerId; }
    function getIsHost() { return isHost; }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    return { init, showQuestion, startQuestionCountdown, hideQuestion, showQuestionResult, showResults, getRoomCode, getPlayerId, getIsHost, ensureControlsVisible };
})();
