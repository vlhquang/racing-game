// ============================================
// UI MODULE — Lobby, Question Modal, Results
// ============================================
const UI = (() => {
    const CONFIG_FIELDS = [
        { path: 'maxPlayers', label: 'Số người chơi tối đa', description: 'Số người chơi tối đa trong 1 phòng.', type: 'number', min: 1, step: 1 },
        { path: 'raceDuration', label: 'Thời lượng ván đua (giây)', description: 'Thời gian tối đa của một trận đua.', type: 'number', min: 10, step: 1 },
        { path: 'baseSpeed', label: 'Tốc độ cơ bản (px/giây)', description: 'Tốc độ mặc định của xe khi không có thưởng/phạt.', type: 'number', min: 10, step: 1 },
        { path: 'laneWidth', label: 'Độ rộng làn đường (px)', description: 'Độ rộng một làn dùng cho tính toán vị trí xe.', type: 'number', min: 20, step: 1 },
        { path: 'stoneStopTime', label: 'Dừng khi đụng đá (giây)', description: 'Thời gian xe bị dừng khi va vào đá.', type: 'number', min: 0, step: 0.1 },
        { path: 'oilSpinTime', label: 'Xoay khi đụng dầu (giây)', description: 'Thời gian xe bị xoay khi va vào vệt dầu.', type: 'number', min: 0, step: 0.1 },
        { path: 'initialObstacleDelay', label: 'Trễ sinh chướng ngại (giây)', description: 'Độ trễ từ lúc bắt đầu game tới khi xuất hiện chướng ngại vật.', type: 'number', min: 0, step: 0.1 },
        { path: 'questionTime', label: 'Thời gian trả lời (giây)', description: 'Thời gian tối đa người chơi được chọn đáp án.', type: 'number', min: 1, step: 1 },
        { path: 'questionImageMaxWait', label: 'Chờ tải ảnh câu hỏi (giây)', description: 'Thời gian chờ tối đa để client tải ảnh trước khi bắt đầu đếm ngược.', type: 'number', min: 0, step: 1 },
        { path: 'questionSpawnOffset', label: 'Khoảng cách spawn câu hỏi (px)', description: 'Khoảng cộng thêm để hộp câu hỏi xuất hiện phía trước xe.', type: 'number', min: 0, step: 1 },
        { path: 'questionLeadTime', label: 'Thời gian đệm spawn câu hỏi (giây)', description: 'Khoảng đệm để hộp câu hỏi xuất hiện đủ xa, tránh quá gần xe.', type: 'number', min: 0, step: 0.1 },
        { path: 'correctRewardTime', label: 'Miễn nhiễm khi trả lời đúng (giây)', description: 'Thời gian được miễn nhiễm chướng ngại sau khi trả lời đúng.', type: 'number', min: 0, step: 0.1 },
        { path: 'rewardSpeedMultiplier', label: 'Hệ số tăng tốc khi thưởng', description: 'Hệ số nhân tốc độ khi người chơi được thưởng.', type: 'number', min: 0, step: 0.1 },
        { path: 'questionIntervalMin', label: 'Khoảng cách câu hỏi tối thiểu (giây)', description: 'Khoảng thời gian nhỏ nhất giữa hai lần xuất hiện câu hỏi.', type: 'number', min: 0, step: 1 },
        { path: 'questionIntervalMax', label: 'Khoảng cách câu hỏi tối đa (giây)', description: 'Khoảng thời gian lớn nhất giữa hai lần xuất hiện câu hỏi.', type: 'number', min: 0, step: 1 },
        { path: 'maxQuestions', label: 'Số câu hỏi tối đa mỗi ván', description: 'Giới hạn tổng số câu hỏi trong một trận.', type: 'number', min: 1, step: 1 },
        { path: 'penalties.types.stop.duration', label: 'Phạt dừng - thời gian (giây)', description: 'Thời gian áp dụng phạt dừng.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.stop.speedMultiplier', label: 'Phạt dừng - hệ số tốc độ', description: 'Hệ số tốc độ khi bị dừng. 0 nghĩa là đứng yên.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.reverse.duration', label: 'Phạt đảo điều khiển - thời gian (giây)', description: 'Thời gian áp dụng phạt đảo điều khiển.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.reverse.speedMultiplier', label: 'Phạt đảo điều khiển - hệ số tốc độ', description: 'Hệ số tốc độ trong lúc bị đảo điều khiển.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.spin.duration', label: 'Phạt quay vòng - thời gian (giây)', description: 'Thời gian áp dụng phạt quay vòng.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.spin.speedMultiplier', label: 'Phạt quay vòng - hệ số tốc độ', description: 'Hệ số tốc độ trong lúc bị quay vòng.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.blur.duration', label: 'Phạt mờ màn hình - thời gian (giây)', description: 'Thời gian áp dụng hiệu ứng làm mờ màn hình.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.blur.speedMultiplier', label: 'Phạt mờ màn hình - hệ số tốc độ', description: 'Hệ số tốc độ trong lúc bị mờ màn hình.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.blur.opacity', label: 'Phạt mờ màn hình - độ mờ', description: 'Độ mờ của overlay màn hình (0 đến 1).', type: 'number', min: 0, max: 1, step: 0.1 },
        { path: 'penalties.types.rocket.duration', label: 'Phạt tên lửa - thời gian mặc định (giây)', description: 'Thời lượng mặc định của hiệu ứng bay kiểu tên lửa.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.rocket.speedMultiplier', label: 'Phạt tên lửa - hệ số tốc độ', description: 'Hệ số tốc độ trong lúc bị phạt tên lửa.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.rocket.wrongDuration', label: 'Phạt tên lửa khi trả lời sai (giây)', description: 'Thời lượng tên lửa khi người chơi chọn sai đáp án.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.rocket.noAnswerDuration', label: 'Phạt tên lửa khi không trả lời (giây)', description: 'Thời lượng tên lửa khi hết giờ mà không trả lời.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.bubble.duration', label: 'Phạt bong bóng - thời gian mặc định (giây)', description: 'Thời lượng mặc định của hiệu ứng bong bóng.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.bubble.speedMultiplier', label: 'Phạt bong bóng - hệ số tốc độ', description: 'Hệ số tốc độ trong lúc bị phạt bong bóng.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.bubble.wrongDuration', label: 'Phạt bong bóng khi trả lời sai (giây)', description: 'Thời lượng bong bóng khi người chơi chọn sai đáp án.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.types.bubble.noAnswerDuration', label: 'Phạt bong bóng khi không trả lời (giây)', description: 'Thời lượng bong bóng khi hết giờ mà không trả lời.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.wrongAnswer.durationMultiplier', label: 'Nhân thời gian phạt khi trả lời sai', description: 'Hệ số nhân thời gian phạt cho trường hợp trả lời sai.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.wrongAnswer.availableTypes', label: 'Loại phạt cho trả lời sai', description: 'Danh sách loại phạt áp dụng cho trả lời sai. Cách nhau bằng dấu phẩy.', type: 'csv' },
        { path: 'penalties.noAnswer.durationMultiplier', label: 'Nhân thời gian phạt khi không trả lời', description: 'Hệ số nhân thời gian phạt cho trường hợp hết giờ không trả lời.', type: 'number', min: 0, step: 0.1 },
        { path: 'penalties.noAnswer.availableTypes', label: 'Loại phạt cho không trả lời', description: 'Danh sách loại phạt áp dụng cho không trả lời. Cách nhau bằng dấu phẩy.', type: 'csv' }
    ];

    function getByPath(obj, path) {
        return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
    }

    function setByPath(obj, path, value) {
        const keys = path.split('.');
        let ref = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!ref[key] || typeof ref[key] !== 'object') ref[key] = {};
            ref = ref[key];
        }
        ref[keys[keys.length - 1]] = value;
    }

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
        const btnConfig = document.getElementById('btn-config');
        const configOverlay = document.getElementById('config-overlay');
        const configForm = document.getElementById('config-form');
        const btnConfigClose = document.getElementById('btn-config-close');
        const btnConfigSave = document.getElementById('btn-config-save');
        const configMsg = document.getElementById('config-msg');
        const playerNameInput = document.getElementById('player-name');
        const vehicleSelect = document.getElementById('vehicle-type');
        const resultsVehicleSelect = document.getElementById('results-vehicle-type');
        const roomCodeInput = document.getElementById('room-code-input');
        const errorMsg = document.getElementById('error-msg');
        let configSnapshot = null;

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

        function showConfigMsg(msg, isError = true) {
            configMsg.textContent = msg;
            configMsg.style.color = isError ? 'var(--accent-primary)' : 'var(--accent-green)';
            configMsg.classList.remove('hidden');
        }

        function renderConfigForm(cfg) {
            if (!configForm) return;
            const fieldsHtml = CONFIG_FIELDS.map((field) => {
                const inputId = `cfg-${field.path.replace(/\./g, '-')}`;
                const value = getByPath(cfg, field.path);
                const valueText = Array.isArray(value) ? value.join(', ') : (value ?? '');
                const type = field.type === 'number' ? 'number' : 'text';
                const stepAttr = field.step != null ? `step="${field.step}"` : '';
                const minAttr = field.min != null ? `min="${field.min}"` : '';
                const maxAttr = field.max != null ? `max="${field.max}"` : '';
                return `
                    <div class="config-field-row">
                        <label class="config-field-label" for="${inputId}">${field.label}</label>
                        <div class="config-field-path">${field.path}</div>
                        <div class="config-field-desc">${field.description}</div>
                        <input
                            id="${inputId}"
                            class="input-field"
                            style="margin-bottom:0;"
                            type="${type}"
                            ${stepAttr}
                            ${minAttr}
                            ${maxAttr}
                            data-config-path="${field.path}"
                            data-config-type="${field.type}"
                            value="${valueText}">
                    </div>
                `;
            }).join('');
            configForm.innerHTML = fieldsHtml;
        }

        function readConfigFromForm(baseConfig) {
            const nextConfig = JSON.parse(JSON.stringify(baseConfig || {}));
            const inputs = configForm.querySelectorAll('[data-config-path]');
            inputs.forEach((input) => {
                const path = input.dataset.configPath;
                const type = input.dataset.configType;
                const raw = (input.value || '').trim();
                let parsed;
                if (type === 'number') {
                    parsed = Number(raw);
                } else if (type === 'csv') {
                    parsed = raw ? raw.split(',').map((v) => v.trim()).filter(Boolean) : [];
                } else {
                    parsed = raw;
                }
                setByPath(nextConfig, path, parsed);
            });
            return nextConfig;
        }

        async function openConfig() {
            configMsg.classList.add('hidden');
            configOverlay.classList.remove('hidden');
            configForm.innerHTML = '<div class="config-form-loading">Đang tải cấu hình...</div>';
            btnConfigSave.disabled = true;
            try {
                const cfg = await Network.getConfig();
                configSnapshot = cfg;
                renderConfigForm(cfg);
                btnConfigSave.disabled = false;
            } catch (err) {
                configForm.innerHTML = '<div class="config-form-loading">Không tải được cấu hình.</div>';
                showConfigMsg(err.message || 'Không tải được cấu hình');
            }
        }

        function closeConfig() {
            configOverlay.classList.add('hidden');
            configMsg.classList.add('hidden');
            configSnapshot = null;
        }

        btnConfig.addEventListener('click', () => {
            openConfig();
        });

        btnConfigClose.addEventListener('click', () => {
            closeConfig();
        });

        btnConfigSave.addEventListener('click', async () => {
            configMsg.classList.add('hidden');
            if (!configSnapshot) {
                showConfigMsg('Chưa có dữ liệu cấu hình để lưu');
                return;
            }
            const payload = readConfigFromForm(configSnapshot);
            const invalidNumber = CONFIG_FIELDS
                .filter((f) => f.type === 'number')
                .find((f) => Number.isNaN(getByPath(payload, f.path)));
            if (invalidNumber) {
                showConfigMsg(`Giá trị số không hợp lệ: ${invalidNumber.label}`);
                return;
            }
            btnConfigSave.disabled = true;
            try {
                const saved = await Network.saveConfig(payload);
                configSnapshot = saved;
                renderConfigForm(saved);
                showConfigMsg('Đã lưu cấu hình runtime', false);
            } catch (err) {
                showConfigMsg(err.message || 'Lưu cấu hình thất bại');
            } finally {
                btnConfigSave.disabled = false;
            }
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
