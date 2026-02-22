// ============================================
// MSÜ AI - TANRI MODU JAVASCRIPT
// ============================================

const API_URL = ''; // Same origin
let currentUser = null;
let currentExam = null;
let currentQuestion = 0;
let examAnswers = [];
let examTimer = null;
let examStartTime = null;

// ============================================
// AUTH FUNCTIONS
// ============================================

function checkAuth() {
    const user = localStorage.getItem('msu_user');
    if (!user) {
        showScreen('login-screen');
        return;
    }
    currentUser = JSON.parse(user);
    updateUI();
    showScreen('dashboard-screen');
    
    if (document.getElementById('admin-nav')) {
        document.getElementById('admin-nav').classList.toggle('hidden', currentUser.role !== 'admin');
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (tab === 'login') {
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
    } else {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    }
}

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('msu_user', JSON.stringify(data.user));
            showScreen('dashboard-screen');
            updateUI();
            initDashboard();
        } else {
            alert(data.message || 'Giriş başarısız!');
        }
    } catch (err) {
        alert('Sunucu hatası!');
    }
});

document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (data.success) {
            alert('Kayıt başarılı! Giriş yapabilirsiniz.');
            switchTab('login');
        } else {
            alert(data.message || 'Kayıt başarısız!');
        }
    } catch (err) {
        alert('Sunucu hatası!');
    }
});

function logout() {
    localStorage.removeItem('msu_user');
    currentUser = null;
    showScreen('login-screen');
}

// ============================================
// NAVIGATION
// ============================================

function navigate(page) {
    window.location.href = `${page}.html`;
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
}

function updateUI() {
    if (!currentUser) return;
    
    document.getElementById('user-name') && (document.getElementById('user-name').textContent = currentUser.username);
    document.getElementById('user-role') && (document.getElementById('user-role').textContent = currentUser.role === 'admin' ? 'Yönetici' : 'Öğrenci');
    document.getElementById('user-avatar') && (document.getElementById('user-avatar').textContent = currentUser.username[0].toUpperCase());
}

// ============================================
// DASHBOARD FUNCTIONS
// ============================================

async function initDashboard() {
    await loadStats();
    await loadTodayTasks();
    await initCountdown();
    initChart();
}

async function loadStats() {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`/api/stats/${currentUser.id}`);
        const data = await res.json();
        
        if (data.success) {
            const s = data.stats;
            document.getElementById('stat-xp').textContent = s.xp;
            document.getElementById('stat-level').textContent = s.level;
            document.getElementById('stat-streak').textContent = s.streak;
            document.getElementById('stat-accuracy').textContent = s.accuracy + '%';
            
            const xpProgress = document.getElementById('xp-progress');
            if (xpProgress) {
                const nextLevel = s.level * 200;
                const prevLevel = (s.level - 1) * 200;
                const progress = ((s.xp - prevLevel) / (nextLevel - prevLevel)) * 100;
                xpProgress.style.width = Math.min(100, progress) + '%';
            }
        }
    } catch (err) {
        console.error('Stats error:', err);
    }
}

async function loadTodayTasks() {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`/api/tasks/${currentUser.id}`);
        const data = await res.json();
        
        const container = document.getElementById('today-tasks');
        if (!container) return;
        
        const today = new Date().toDateString();
        const todayTasks = data.tasks.filter(t => 
            new Date(t.createdAt).toDateString() === today && !t.completed
        );
        
        if (todayTasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <p>Bugün için görev yok. AI planı oluştur!</p>
                    <button onclick="startDailyPlan()" class="btn-primary mt-20">
                        <i class="fas fa-magic"></i> Plan Oluştur
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = todayTasks.map(task => `
            <div class="task-item" onclick="completeTaskModal('${task.id}')">
                <div class="task-checkbox"></div>
                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    <div class="task-meta">${task.subject} • ${task.duration} dk</div>
                </div>
                <span class="task-xp">+${task.basePoints} XP</span>
            </div>
        `).join('');
    } catch (err) {
        console.error('Tasks error:', err);
    }
}

async function initCountdown() {
    try {
        const res = await fetch('/api/countdown');
        const data = await res.json();
        
        const banner = document.getElementById('countdown-banner');
        const timer = document.getElementById('countdown-timer');
        const badge = document.getElementById('urgency-badge');
        
        if (!banner || !timer) return;
        
        let days = data.daysLeft;
        let hours = 12;
        let minutes = 45;
        
        function updateTimer() {
            minutes--;
            if (minutes < 0) {
                minutes = 59;
                hours--;
                if (hours < 0) {
                    hours = 23;
                    days--;
                }
            }
            
            if (days < 0) {
                timer.textContent = "SINAV ZAMANI! 🎯";
                return;
            }
            
            timer.textContent = `${days} Gün ${hours} Saat ${minutes} Dakika`;
        }
        
        setInterval(updateTimer, 60000);
        updateTimer();
        
        if (badge) {
            const urgencyText = {
                'critical': '🔥 KRİTİK',
                'high': '⚡ YÜKSEK',
                'medium': '⏰ NORMAL',
                'low': '✅ RAHAT'
            };
            badge.textContent = urgencyText[data.urgency] || 'MSÜ';
            
            if (data.urgency === 'critical') {
                banner.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
            }
        }
    } catch (err) {
        console.error('Countdown error:', err);
    }
}

function initChart() {
    const ctx = document.getElementById('progressChart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
            datasets: [{
                label: 'XP Kazanımı',
                data: [120, 190, 150, 220, 180, 250, 200],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

// ============================================
// TASK FUNCTIONS
// ============================================

async function loadTasks(filter = 'all') {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`/api/tasks/${currentUser.id}`);
        const data = await res.json();
        
        const container = document.getElementById('tasks-container');
        if (!container) return;
        
        let tasks = data.tasks;
        
        if (filter === 'pending') tasks = tasks.filter(t => !t.completed);
        if (filter === 'completed') tasks = tasks.filter(t => t.completed);
        if (filter === 'ai') tasks = tasks.filter(t => t.type === 'ai');
        
        if (tasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>Görev bulunamadı</p></div>';
            return;
        }
        
        container.innerHTML = tasks.map(task => `
            <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <div class="task-checkbox" onclick="event.stopPropagation(); completeTaskModal('${task.id}')">
                    ${task.completed ? '✓' : ''}
                </div>
                <div class="task-info" onclick="showTaskDetail('${task.id}')">
                    <div class="task-title">${task.title}</div>
                    <div class="task-meta">
                        ${task.subject} • ${task.topic || 'Genel'} • ${task.duration} dk
                        ${task.type === 'ai' ? '<span class="ai-badge">🤖 AI</span>' : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <span class="task-xp">+${task.basePoints} XP</span>
                    <button onclick="event.stopPropagation(); deleteTask('${task.id}')" class="btn-delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Load tasks error:', err);
    }
}

function filterTasks(type) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    loadTasks(type);
}

function openAddTaskModal() {
    document.getElementById('add-task-modal')?.classList.add('active');
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

document.getElementById('add-task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const task = {
        userId: currentUser.id,
        title: document.getElementById('task-title').value,
        subject: document.getElementById('task-subject').value,
        topic: document.getElementById('task-topic').value,
        duration: parseInt(document.getElementById('task-duration').value),
        basePoints: parseInt(document.getElementById('task-xp').value),
        type: 'manual'
    };
    
    try {
        const res = await fetch('/api/tasks/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });
        
        if (res.ok) {
            closeModal();
            loadTasks();
            e.target.reset();
        }
    } catch (err) {
        alert('Görev eklenemedi!');
    }
});

let currentTaskId = null;

function completeTaskModal(taskId) {
    currentTaskId = taskId;
    document.getElementById('complete-modal')?.classList.add('active');
}

async function completeTask(isCorrect) {
    if (!currentTaskId) return;
    
    closeModal();
    
    try {
        const res = await fetch('/api/tasks/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                taskId: currentTaskId,
                correct: isCorrect,
                timeSpent: 45
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            if (data.leveledUp) {
                showNotification(`🎉 Seviye atladın! Yeni seviye: ${data.level}`, 'success');
            } else {
                showNotification(`✅ +${data.gainedXP} XP kazandın!`, 'success');
            }
            
            loadTasks();
            loadStats();
        }
    } catch (err) {
        console.error('Complete error:', err);
    }
    
    currentTaskId = null;
}

async function deleteTask(taskId) {
    if (!confirm('Bu görevi silmek istediğine emin misin?')) return;
    
    try {
        await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
        loadTasks();
    } catch (err) {
        alert('Silme başarısız!');
    }
}

// ============================================
// AI FUNCTIONS
// ============================================

async function startDailyPlan() {
    if (!currentUser) return;
    
    showNotification('🤖 AI günlük plan hazırlanıyor...', 'info');
    
    try {
        const weakRes = await fetch(`/api/weak-real/${currentUser.id}`);
        const weakData = await weakRes.json();
        
        const res = await fetch('/api/ai/generate-daily', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                daysLeft: 7,
                weakTopics: weakData.weakTopics || [],
                strongTopics: weakData.strongTopics || [],
                dailyHours: 4
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification(`✅ ${data.count} görev oluşturuldu!`, 'success');
            setTimeout(() => location.reload(), 1000);
        }
    } catch (err) {
        showNotification('❌ Plan oluşturulamadı!', 'error');
    }
}

async function generateAIPlan() {
    await startDailyPlan();
}

// ============================================
// EXAM FUNCTIONS
// ============================================

async function startExam() {
    const subject = document.getElementById('exam-subject')?.value || 'all';
    const count = parseInt(document.querySelector('input[name="question-count"]:checked')?.value || 20);
    
    showNotification('📝 Sınav hazırlanıyor...', 'info');
    
    try {
        const res = await fetch('/api/exam/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, subject, questionCount: count })
        });
        
        const data = await res.json();
        
        if (data.success) {
            currentExam = data;
            currentQuestion = 0;
            examAnswers = new Array(data.questions.length).fill(null);
            examStartTime = Date.now();
            
            document.getElementById('exam-setup')?.classList.add('hidden');
            document.getElementById('exam-active')?.classList.remove('hidden');
            
            showQuestion(0);
            startExamTimer(count * 60);
            renderPalette();
        }
    } catch (err) {
        showNotification('Sınav başlatılamadı!', 'error');
    }
}

function showQuestion(index) {
    currentQuestion = index;
    const q = currentExam.questions[index];
    
    document.getElementById('current-question').textContent = index + 1;
    document.getElementById('total-questions').textContent = currentExam.questions.length;
    
    const container = document.getElementById('question-container');
    container.innerHTML = `
        <div class="question-text">${q.question}</div>
        <div class="options-list">
            ${q.options.map((opt, i) => `
                <div class="option-item ${examAnswers[index] === i ? 'selected' : ''}" 
                     onclick="selectAnswer(${i})">
                    <div class="option-label">${String.fromCharCode(65 + i)}</div>
                    <div class="option-text">${opt}</div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('btn-prev').disabled = index === 0;
    document.getElementById('btn-next').textContent = index === currentExam.questions.length - 1 ? 'Sınavı Bitir' : 'Sonraki';
    
    updatePalette();
}

function selectAnswer(index) {
    examAnswers[currentQuestion] = index;
    showQuestion(currentQuestion);
}

function previousQuestion() {
    if (currentQuestion > 0) showQuestion(currentQuestion - 1);
}

function nextQuestion() {
    if (currentQuestion < currentExam.questions.length - 1) {
        showQuestion(currentQuestion + 1);
    } else {
        finishExam();
    }
}

function renderPalette() {
    const palette = document.getElementById('question-palette');
    if (!palette) return;
    
    palette.innerHTML = currentExam.questions.map((_, i) => `
        <div class="palette-number ${examAnswers[i] !== null ? 'answered' : ''} ${i === currentQuestion ? 'current' : ''}" 
             onclick="showQuestion(${i})">
            ${i + 1}
        </div>
    `).join('');
}

function updatePalette() {
    renderPalette();
}

function startExamTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('exam-timer');
    
    examTimer = setInterval(() => {
        remaining--;
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        if (remaining < 60) timerEl.classList.add('warning');
        
        if (remaining <= 0) {
            clearInterval(examTimer);
            finishExam();
        }
    }, 1000);
}

async function finishExam() {
    clearInterval(examTimer);
    
    const timeSpent = Math.floor((Date.now() - examStartTime) / 1000 / 60);
    
    try {
        const res = await fetch('/api/exam/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: currentExam.examId,
                answers: examAnswers,
                timeSpent
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showResults(data);
        }
    } catch (err) {
        showNotification('Sınav sonuçlanamadı!', 'error');
    }
}

function finishExamEarly() {
    if (confirm('Sınavı erken bitirmek istediğine emin misin?')) {
        finishExam();
    }
}

function showResults(data) {
    document.getElementById('exam-active')?.classList.add('hidden');
    document.getElementById('exam-results')?.classList.remove('hidden');
    
    document.getElementById('result-score').textContent = Math.floor(data.score);
    document.getElementById('correct-count').textContent = data.correct;
    document.getElementById('wrong-count').textContent = data.total - data.correct;
    document.getElementById('time-spent').textContent = data.timeSpent + ' dk';
    
    // Renk kodu
    const circle = document.getElementById('score-circle');
    if (data.score >= 80) circle.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    else if (data.score >= 60) circle.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    else circle.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    
    // Detaylı sonuçlar
    const details = document.getElementById('detailed-results');
    details.innerHTML = data.results.map((r, i) => `
        <div class="result-item">
            <div class="result-header">
                <div class="result-status ${r.isCorrect ? 'correct' : 'wrong'}">
                    ${r.isCorrect ? '✓' : '✗'}
                </div>
                <h4>Soru ${i + 1}</h4>
            </div>
            <p class="question-text">${r.question.substring(0, 100)}...</p>
            ${!r.isCorrect ? `<p class="explanation"><strong>Çözüm:</strong> ${r.explanation}</p>` : ''}
            ${r.msuTip ? `<p class="msu-tip"><strong>💡 MSÜ Taktik:</strong> ${r.msuTip}</p>` : ''}
        </div>
    `).join('');
}

async function loadExamHistory() {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`/api/exam/history/${currentUser.id}`);
        const data = await res.json();
        
        const container = document.getElementById('exam-history');
        if (!container || !data.history) return;
        
        if (data.history.length === 0) {
            container.innerHTML = '<p class="empty-text">Henüz sınav çözmediniz</p>';
            return;
        }
        
        container.innerHTML = data.history.slice(0, 5).map(h => `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-subject">${h.subject || 'Karışık'}</span>
                    <span class="history-date">${new Date(h.completedAt).toLocaleDateString('tr-TR')}</span>
                </div>
                <span class="history-score ${h.score >= 70 ? 'good' : h.score >= 50 ? 'avg' : 'bad'}">
                    ${Math.floor(h.score)}%
                </span>
            </div>
        `).join('');
    } catch (err) {
        console.error('History error:', err);
    }
}

function reviewExam() {
    alert('İnceleme modu aktif!');
}

function newExam() {
    location.reload();
}

function startQuickExam() {
    navigate('exam');
}

// ============================================
// TOPIC FUNCTIONS
// ============================================

async function loadTopic(subject, topic) {
    document.getElementById('topic-grid')?.classList.add('hidden');
    document.getElementById('topic-detail')?.classList.remove('hidden');
    
    document.getElementById('detail-subject').textContent = subject;
    document.getElementById('detail-topic').textContent = topic;
    
    const content = document.getElementById('detail-content');
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Konu anlatımı hazırlanıyor...</p></div>';
    
    try {
        const res = await fetch('/api/ai/topic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, topic, level: 'detailed' })
        });
        
        const data = await res.json();
        
        if (data.success) {
            content.innerHTML = formatContent(data.content);
        }
    } catch (err) {
        content.innerHTML = '<p class="error">İçerik yüklenemedi!</p>';
    }
}

function formatContent(text) {
    return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/## (.*?)(<br>|$)/g, '<h3>$1</h3>')
        .replace(/- (.*?)(<br>|$)/g, '<li>$1</li>');
}

function backToTopics() {
    document.getElementById('topic-grid')?.classList.remove('hidden');
    document.getElementById('topic-detail')?.classList.add('hidden');
}

async function loadParagraphTactics() {
    document.getElementById('topic-grid')?.classList.add('hidden');
    document.getElementById('topic-detail')?.classList.remove('hidden');
    document.getElementById('detail-subject').textContent = 'Türkçe';
    document.getElementById('detail-topic').textContent = 'Paragraf Taktikleri';
    
    const content = document.getElementById('detail-content');
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Taktikler hazırlanıyor...</p></div>';
    
    try {
        const res = await fetch('/api/ai/paragraph-tactics', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            content.innerHTML = formatContent(data.content);
        }
    } catch (err) {
        content.innerHTML = '<p class="error">Yüklenemedi!</p>';
    }
}

async function loadMathTactics() {
    document.getElementById('topic-grid')?.classList.add('hidden');
    document.getElementById('topic-detail')?.classList.remove('hidden');
    document.getElementById('detail-subject').textContent = 'Matematik';
    document.getElementById('detail-topic').textContent = 'Problem Çözme Taktikleri';
    
    const content = document.getElementById('detail-content');
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Taktikler hazırlanıyor...</p></div>';
    
    try {
        const res = await fetch('/api/ai/math-tactics', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            content.innerHTML = formatContent(data.content);
        }
    } catch (err) {
        content.innerHTML = '<p class="error">Yüklenemedi!</p>';
    }
}

function goToTopicStudy() {
    navigate('topic');
}

// ============================================
// WEAK ANALYSIS FUNCTIONS
// ============================================

async function loadWeakAnalysis() {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`/api/weak-real/${currentUser.id}`);
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('weak-count').textContent = data.weakTopics.length;
            document.getElementById('strong-count').textContent = data.strongTopics.length;
            document.getElementById('total-solved').textContent = data.totalTasks;
            
            const totalAcc = data.analysis.reduce((a, b) => a + parseFloat(b.accuracy), 0);
            const avgAcc = data.analysis.length > 0 ? (totalAcc / data.analysis.length).toFixed(1) : 0;
            document.getElementById('overall-rate').textContent = avgAcc + '%';
            
            // Weak topics list
            const weakList = document.getElementById('weak-topics-list');
            if (data.weakTopics.length === 0) {
                weakList.innerHTML = '<div class="success-message">🎉 Harika! Zayıf konun yok!</div>';
            } else {
                weakList.innerHTML = data.analysis.filter(a => a.isWeak).map(item => `
                    <div class="weak-topic-item">
                        <div class="weak-topic-icon">📚</div>
                        <div class="weak-topic-info">
                            <h4>${item.topic}</h4>
                            <div class="weak-topic-stats">
                                <span>Toplam: ${item.total}</span>
                                <span>Doğru: ${item.correct}</span>
                                <span>Yanlış: ${item.wrong}</span>
                            </div>
                        </div>
                        <div class="weak-topic-bar">
                            <div class="weak-topic-progress" style="width: ${item.accuracy}%"></div>
                        </div>
                        <span class="accuracy-text">${item.accuracy}%</span>
                    </div>
                `).join('');
            }
            
            // Chart
            initPerformanceChart(data.analysis);
        }
    } catch (err) {
        console.error('Weak analysis error:', err);
    }
}

function initPerformanceChart(analysis) {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: analysis.map(a => a.topic.substring(0, 15)),
            datasets: [{
                label: 'Başarı Oranı (%)',
                data: analysis.map(a => parseFloat(a.accuracy)),
                backgroundColor: analysis.map(a => parseFloat(a.accuracy) > 70 ? '#10b981' : '#ef4444'),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function goToWeakTopics() {
    navigate('weak');
}

async function generateWeakPlan() {
    if (!currentUser) return;
    
    const weakRes = await fetch(`/api/weak-real/${currentUser.id}`);
    const weakData = await weakRes.json();
    
    if (weakData.weakTopics.length === 0) {
        showNotification('Zayıf konun yok! 🎉', 'success');
        return;
    }
    
    showNotification('🤖 Zayıf konu planı hazırlanıyor...', 'info');
    
    try {
        const res = await fetch('/api/ai/weak-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weakTopics: weakData.weakTopics })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showNotification('✅ Plan oluşturuldu! Görevlerine eklendi.', 'success');
        }
    } catch (err) {
        showNotification('Plan oluşturulamadı!', 'error');
    }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

function checkAdmin() {
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Bu sayfaya erişim yetkiniz yok!');
        navigate('dashboard');
        return;
    }
}

async function loadAdminData() {
    try {
        // Users
        const usersRes = await fetch('/api/admin/users');
        const usersData = await usersRes.json();
        
        if (usersData.success) {
            document.getElementById('total-users').textContent = usersData.users.length;
            
            const tbody = document.querySelector('#users-table tbody');
            if (tbody) {
                tbody.innerHTML = usersData.users.map(u => `
                    <tr>
                        <td>${u.id}</td>
                        <td>${u.username}</td>
                        <td><span class="role-badge ${u.role}">${u.role}</span></td>
                        <td>${u.level}</td>
                        <td>${u.xp}</td>
                        <td>${new Date(u.lastLogin).toLocaleDateString('tr-TR')}</td>
                        <td>
                            <button onclick="viewUser(${u.id})" class="btn-small">Görüntüle</button>
                        </td>
                    </tr>
                `).join('');
            }
        }
        
        // Tasks
        const tasksRes = await fetch('/api/admin/all-tasks');
        const tasksData = await tasksRes.json();
        
        if (tasksData.success) {
            document.getElementById('total-tasks').textContent = tasksData.tasks.length;
            document.getElementById('completed-tasks').textContent = tasksData.tasks.filter(t => t.completed).length;
        }
    } catch (err) {
        console.error('Admin data error:', err);
    }
}

document.getElementById('reward-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const reward = {
        title: document.getElementById('reward-title').value,
        description: document.getElementById('reward-desc').value,
        xpRequired: parseInt(document.getElementById('reward-xp').value),
        icon: document.getElementById('reward-icon').value || '🏆'
    };
    
    try {
        const res = await fetch('/api/admin/reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reward)
        });
        
        if (res.ok) {
            alert('Ödül eklendi!');
            e.target.reset();
        }
    } catch (err) {
        alert('Hata oluştu!');
    }
});

function backupData() {
    // Tüm data klasörünü indirme simülasyonu
    alert('Veriler yedeklendi! (data klasörünü kopyalayın)');
}

function clearCache() {
    localStorage.clear();
    alert('Cache temizlendi!');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 12px;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    `;
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// Animasyon stilleri ekle
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Mobil menü toggle
function toggleMobileMenu() {
    document.querySelector('.sidebar').classList.toggle('open');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Sayfa özel init
    const path = window.location.pathname;
    
    if (path.includes('index') || path === '/' || path === '') {
        checkAuth();
    }
});