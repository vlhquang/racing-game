const CONFIG = {
    // Cấu hình chung
    maxPlayers: 4,
    raceDuration: 120,        // thời lượng đua (giây)
    baseSpeed: 300,           // tốc độ cơ bản (px/giây)
    laneWidth: 80,            // độ rộng mỗi làn (px)

    // Chướng ngại vật
    stoneStopTime: 1.0,         // thời gian dừng khi dính đá (giây)
    oilSpinTime: 1.5,           // thời gian xoay khi dính dầu (giây)
    initialObstacleDelay: 3.0,  // độ trễ trước khi chướng ngại vật xuất hiện (giây)

    // Câu hỏi
    questionTime: 15,          // thời gian trả lời (giây)
    questionImageMaxWait: 8,  // thời gian chờ tải ảnh trước khi đếm ngược (giây)
    questionSpawnOffset: 100,  // khoảng cách cộng thêm để spawn hộp câu hỏi (px)
    questionLeadTime: 2.5,    // thời gian đệm (giây) để hộp câu hỏi xuất hiện đủ xa phía trước
    correctRewardTime: 2,     // thời gian miễn nhiễm khi trả lời đúng (giây)
    rewardSpeedMultiplier: 1.3, // hệ số tăng tốc khi được thưởng
    questionIntervalMin: 8,  // thời gian tối thiểu giữa các câu hỏi (giây)
    questionIntervalMax: 15,  // thời gian tối đa giữa các câu hỏi (giây)
    maxQuestions: 100,           // số câu hỏi tối đa mỗi ván

    // Cấu hình phạt
    penalties: {
        // Các loại phạt
        types: {
            stop: {
                duration: 3.0,        // thời gian phạt (giây)
                speedMultiplier: 0.0  // hệ số tốc độ khi bị phạt
            },
            reverse: {
                duration: 4.0,
                speedMultiplier: 1.0 // tốc độ giữ nguyên, đảo điều khiển
            },
            spin: {
                duration: 2.0,
                speedMultiplier: 0.1 // giảm còn 10% tốc độ
            },
            blur: {
                duration: 5.0,
                speedMultiplier: 1.0, // tốc độ giữ nguyên
                opacity: 1          // độ mờ màn hình
            },
            rocket: {
                duration: 3.0,
                speedMultiplier: 0.0,
                wrongDuration: 3.0,   // thời gian phạt khi trả lời sai
                noAnswerDuration: 3.0 // thời gian phạt khi không trả lời
            },
            bubble: {
                duration: 3.0,
                speedMultiplier: 0.0,
                wrongDuration: 3.0,   // thời gian phạt khi trả lời sai
                noAnswerDuration: 3.0 // thời gian phạt khi không trả lời
            }
        },

        // Phạt khi trả lời SAI
        wrongAnswer: {
            durationMultiplier: 1.0, // hệ số nhân thời gian mặc định
            availableTypes: ['stop', 'reverse', 'spin', 'blur', 'rocket', 'bubble']
        },

        // Phạt khi KHÔNG trả lời (hết giờ)
        noAnswer: {
            durationMultiplier: 2, // tăng thời gian phạt so với mặc định
            availableTypes: ['stop', 'reverse', 'spin', 'blur', 'rocket', 'bubble']
        }
    }
};

module.exports = CONFIG;
