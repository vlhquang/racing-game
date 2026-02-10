const fs = require('fs');
const path = require('path');

class QuestionManager {
    constructor() {
        const filePath = path.join(__dirname, 'data', 'questions.json');
        this.questions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.usedIds = new Set();
    }

    getRandomQuestion() {
        const available = this.questions.filter(q => !this.usedIds.has(q.id));
        if (available.length === 0) {
            this.usedIds.clear();
            return this.getRandomQuestion();
        }
        const q = available[Math.floor(Math.random() * available.length)];
        this.usedIds.add(q.id);
        return q;
    }

    reset() {
        this.usedIds.clear();
    }
}

module.exports = QuestionManager;
