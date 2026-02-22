require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= GROQ API CONFIG ================= */
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/* ================= DATA AUTO CREATE ================= */
const dataDir = path.join(__dirname, "data");
async function initData() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const files = ["users.json", "tasks.json", "rewards.json", "stats.json", "exam_history.json", "daily_logs.json"];
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, JSON.stringify([], null, 2));
      }
    }
    console.log("✅ Data directory initialized");
  } catch (err) {
    console.error("DATA INIT ERROR:", err);
  }
}
initData();

/* ================= AUTH ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const usersPath = path.join(dataDir, "users.json");
    const users = JSON.parse(await fs.readFile(usersPath, "utf8"));
    
    if (users.find(u => u.username === username)) {
      return res.json({ success: false, message: "Bu kullanıcı adı zaten var!" });
    }

    const isAdmin = username.toLowerCase() === "baba" || username.toLowerCase() === "admin";
    
    const newUser = {
      id: Date.now(),
      username,
      password,
      xp: 0,
      level: 1,
      streak: 0,
      role: isAdmin ? "admin" : "student",
      createdAt: new Date(),
      lastLogin: new Date(),
      totalStudyTime: 0,
      examCount: 0,
      totalQuestions: 0,
      correctAnswers: 0,
      weakTopics: [],
      strongTopics: [],
      dailyGoal: 4,
      targetScore: 85
    };

    users.push(newUser);
    await fs.writeFile(usersPath, JSON.stringify(users, null, 2));
    res.json({ success: true, user: newUser });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const usersPath = path.join(dataDir, "users.json");
    const users = JSON.parse(await fs.readFile(usersPath, "utf8"));
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) return res.json({ success: false, message: "Kullanıcı adı veya şifre hatalı!" });
    
    user.lastLogin = new Date();
    await fs.writeFile(usersPath, JSON.stringify(users, null, 2));
    
    res.json({ success: true, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

app.get("/api/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const usersPath = path.join(dataDir, "users.json");
    const users = JSON.parse(await fs.readFile(usersPath, "utf8"));
    const user = users.find(u => u.id == userId);
    
    if (!user) return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* ================= TASK SYSTEM ================= */
app.post("/api/tasks/create", async (req, res) => {
  try {
    const { userId, title, subject, topic, duration, basePoints, type } = req.body;
    const tasksPath = path.join(dataDir, "tasks.json");
    const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));
    
    const newTask = {
      id: Date.now().toString(),
      userId: parseInt(userId),
      title,
      subject,
      topic,
      duration: duration || 60,
      basePoints: basePoints || 20,
      type: type || "manual",
      createdAt: new Date(),
      completed: false,
      correct: null,
      completedAt: null,
      timeSpent: 0
    };

    tasks.push(newTask);
    await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2));
    res.json({ success: true, task: newTask });
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/tasks/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const tasksPath = path.join(dataDir, "tasks.json");
    const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));
    const userTasks = tasks.filter(t => t.userId == userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, tasks: userTasks });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post("/api/tasks/complete", async (req, res) => {
  try {
    const { userId, taskId, correct = true, timeSpent = 0 } = req.body;
    const usersPath = path.join(dataDir, "users.json");
    const tasksPath = path.join(dataDir, "tasks.json");
    
    const users = JSON.parse(await fs.readFile(usersPath, "utf8"));
    const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));
    
    const user = users.find(u => u.id == userId);
    const task = tasks.find(t => t.id == taskId);
    
    if (!user || !task) {
      return res.json({ success: false, message: "Kullanıcı veya görev bulunamadı" });
    }

    task.completed = true;
    task.correct = correct;
    task.completedAt = new Date();
    task.timeSpent = timeSpent;

    let gainedXP = correct ? (task.basePoints || 20) : Math.floor((task.basePoints || 20) * 0.25);
    const streakBonus = user.streak >= 5 ? 1.5 : user.streak >= 3 ? 1.2 : 1;
    const finalXP = Math.floor(gainedXP * streakBonus);
    
    user.xp += finalXP;
    user.totalStudyTime += timeSpent;
    user.totalQuestions += 1;
    if (correct) user.correctAnswers += 1;
    
    const oldLevel = user.level;
    while (user.xp >= user.level * 200) {
      user.level += 1;
    }
    const leveledUp = user.level > oldLevel;

    if (correct) {
      user.streak += 1;
    } else {
      user.streak = 0;
    }

    if (task.topic) {
      if (correct) {
        if (!user.strongTopics.includes(task.topic)) user.strongTopics.push(task.topic);
        user.weakTopics = user.weakTopics.filter(t => t !== task.topic);
      } else {
        if (!user.weakTopics.includes(task.topic)) user.weakTopics.push(task.topic);
      }
    }

    await fs.writeFile(usersPath, JSON.stringify(users, null, 2));
    await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2));
    
    res.json({ 
      success: true, 
      xp: user.xp, 
      level: user.level, 
      gainedXP: finalXP,
      leveledUp,
      streak: user.streak,
      accuracy: ((user.correctAnswers / user.totalQuestions) * 100).toFixed(1)
    });
  } catch (err) {
    console.error("Complete task error:", err);
    res.status(500).json({ success: false });
  }
});

app.delete("/api/tasks/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const tasksPath = path.join(dataDir, "tasks.json");
    let tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));
    tasks = tasks.filter(t => t.id != taskId);
    await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= EXAM SYSTEM ================= */
app.post("/api/exam/start", async (req, res) => {
  try {
    const { userId, subject, questionCount = 10 } = req.body;
    const examId = Date.now().toString();
    
    const prompt = `Sen MSÜ (Millî Savunma Üniversitesi Askerî Öğrenci Aday Belirleme Sınavı) soru komisyonundasın.
    
Ders: ${subject || "Genel Yetenek"}
Soru Sayısı: ${questionCount}
Seviye: MSÜ gerçek sınav zorluğunda

KRİTİK KURALLAR:
1. Her soru 5 şıklı (A,B,C,D,E) olacak
2. Çeldiriciler gerçekçi ve güçlü olmalı
3. Paragraf soruları uzun ve analiz gerektirmeli
4. Matematik/Fen soruları çok adımlı olmalı
5. Süre baskısı hissettirmeli
6. JSON dışında HİÇBİR şey yazma

FORMAT:
[
  {
    "question": "Soru metni...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
    "correctIndex": 0,
    "subject": "${subject}",
    "topic": "Konu adı",
    "difficulty": "easy/medium/hard",
    "explanation": "Detaylı çözüm...",
    "timeLimit": 120,
    "msuTip": "MSÜ'de bu soru tipi için taktik..."
  }
]`;

    const questions = await askGroq(prompt);
    if (!questions) return res.status(500).json({ success: false, message: "AI yanıt vermedi" });

    const examData = {
      examId,
      userId,
      subject,
      questions,
      startedAt: new Date(),
      completed: false,
      answers: [],
      score: 0
    };

    const historyPath = path.join(dataDir, "exam_history.json");
    const history = JSON.parse(await fs.readFile(historyPath, "utf8"));
    history.push(examData);
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));

    res.json({ success: true, examId, questions });
  } catch (err) {
    console.error("Exam start error:", err);
    res.status(500).json({ success: false, message: "Sınav başlatılamadı" });
  }
});

app.post("/api/exam/submit", async (req, res) => {
  try {
    const { examId, answers, timeSpent } = req.body;
    const historyPath = path.join(dataDir, "exam_history.json");
    const usersPath = path.join(dataDir, "users.json");
    
    const history = JSON.parse(await fs.readFile(historyPath, "utf8"));
    const users = JSON.parse(await fs.readFile(usersPath, "utf8"));
    
    const exam = history.find(e => e.examId === examId);
    if (!exam) return res.status(404).json({ success: false });

    let correct = 0;
    const results = exam.questions.map((q, idx) => {
      const isCorrect = answers[idx] === q.correctIndex;
      if (isCorrect) correct++;
      return {
        question: q.question,
        yourAnswer: answers[idx],
        correctAnswer: q.correctIndex,
        isCorrect,
        explanation: q.explanation,
        msuTip: q.msuTip
      };
    });

    const score = (correct / exam.questions.length) * 100;
    exam.answers = answers;
    exam.score = score;
    exam.completed = true;
    exam.completedAt = new Date();
    exam.timeSpent = timeSpent;

    const user = users.find(u => u.id == exam.userId);
    if (user) {
      user.examCount += 1;
      user.totalQuestions += exam.questions.length;
      user.correctAnswers += correct;
      user.xp += Math.floor(score / 2);
      user.totalStudyTime += timeSpent;
    }

    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
    await fs.writeFile(usersPath, JSON.stringify(users, null, 2));

    res.json({
      success: true,
      score: score.toFixed(1),
      correct,
      total: exam.questions.length,
      results,
      timeSpent
    });
  } catch (err) {
    console.error("Exam submit error:", err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/exam/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const historyPath = path.join(dataDir, "exam_history.json");
    const history = JSON.parse(await fs.readFile(historyPath, "utf8"));
    const userHistory = history.filter(e => e.userId == userId && e.completed).reverse();
    res.json({ success: true, history: userHistory });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= GROQ API FUNCTIONS ================= */
async function askGroq(prompt, temperature = 0.7) {
  try {
    if (!GROQ_API_KEY) {
      console.error("GROQ_API_KEY not found!");
      return null;
    }

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama3-70b-8192", // veya "mixtral-8x7b-32768"
        messages: [
          {
            role: "system",
            content: "Sen bir MSÜ hazırlık uzmanısın. Sadece istenen formatta JSON veya düz metin yanıt ver. Türkçe olarak cevap ver."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: temperature,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API Error:", errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // JSON temizleme
    const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
      return JSON.parse(cleaned);
    } catch {
      return cleaned; // Düz metin olarak döndür
    }
  } catch (err) {
    console.error("Groq Error:", err);
    return null;
  }
}

/* ================= AI QUESTION GENERATOR ================= */
app.post("/api/ai/generate-question", async (req, res) => {
  try {
    const { subject, topic, difficulty, count = 1 } = req.body;
    
    const prompt = `Sen MSÜ (Millî Savunma Üniversitesi) sınav komisyonundasın.

Ders: ${subject}
Konu: ${topic}
Zorluk: ${difficulty}
Soru Sayısı: ${count}

MSÜ SORU STANDARTLARI:
- 5 şık (A,B,C,D,E) kesinlikle
- Çeldiriciler mantıklı ama yanlış
- Paragraf sorularında uzun metinler
- Matematikte çok adımlı çözüm
- Fen'de grafik/tablo yorumlama
- Sosyal'de tarihsel bağlam

JSON FORMAT:
[
  {
    "question": "Soru metni...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
    "correctIndex": 0,
    "explanation": "Adım adım çözüm...",
    "msuTip": "MSÜ'de bu soruyu 60 saniyede çözme taktiği...",
    "topic": "${topic}",
    "difficulty": "${difficulty}"
  }
]

Sadece JSON array yaz, başka hiçbir şey yazma!`;

    const questions = await askGroq(prompt, 0.8);
    if (!questions) return res.status(500).json({ success: false, message: "AI yanıt vermedi" });
    
    res.json({ success: true, questions });
  } catch (err) {
    console.error("Generate question error:", err);
    res.status(500).json({ success: false, message: "Soru üretilemedi" });
  }
});

/* ================= AI DAILY PLAN ================= */
app.post("/api/ai/generate-daily", async (req, res) => {
  try {
    const { userId, daysLeft = 7, weakTopics = [], dailyHours = 4, strongTopics = [] } = req.body;
    
    const tempo = daysLeft <= 3 ? "SON 3 GÜN: Sadece deneme ve tekrar" : 
                  daysLeft <= 7 ? "SON HAFTA: Deneme ağırlıklı + zayıf konular" : 
                  "NORMAL: Konu anlatımı + soru çözümü";

    const prompt = `Sen MSÜ hazırlık koçusun. Öğrenciye 7 günde MSÜ'ye hazırlanması için program yapıyorsun.

Sınava kalan süre: ${daysLeft} gün
Günlük çalışma: ${dailyHours} saat
Zayıf konular: ${weakTopics.join(", ") || "Belirtilmedi"}
Güçlü konular: ${strongTopics.join(", ") || "Belirtilmedi"}
Tempo: ${tempo}

MSÜ GÜNLÜK PROGRAM KURALLARI:
1. Her gün mutlaka: Paragraf, Matematik, Geometri, Fen, Sosyal
2. Zayıf konulara %40 daha fazla zaman
3. Her 50 dakika çalışma + 10 dakika mola
4. Akşamüstü mutlaka mini deneme (20 soru)
5. Gece yatmadan önce günün tekrarı (15 dk)

GÖREV FORMATI:
[
  {
    "title": "Görev başlığı",
    "subject": "Ders adı",
    "topic": "Konu adı",
    "duration": 50,
    "basePoints": 25,
    "type": "ai",
    "description": "Detaylı açıklama",
    "priority": "high/medium/low",
    "technique": "Kullanılacak teknik"
  }
]

Sadece JSON array yaz, başka hiçbir şey yazma!`;

    const tasks = await askGroq(prompt, 0.9);
    if (!tasks) return res.status(500).json({ success: false, message: "AI yanıt vermedi" });
    
    const tasksPath = path.join(dataDir, "tasks.json");
    const existing = JSON.parse(await fs.readFile(tasksPath, "utf8"));
    
    const newTasks = tasks.map((t, i) => ({
      id: `ai-${Date.now()}-${i}`,
      userId: parseInt(userId),
      ...t,
      createdAt: new Date(),
      completed: false,
      correct: null
    }));

    await fs.writeFile(tasksPath, JSON.stringify([...existing, ...newTasks], null, 2));
    
    res.json({ success: true, tasks: newTasks, count: newTasks.length });
  } catch (err) {
    console.error("Daily plan error:", err);
    res.status(500).json({ success: false, message: "Plan oluşturulamadı: " + err.message });
  }
});

/* ================= AI TOPIC EXPLANATION ================= */
app.post("/api/ai/topic", async (req, res) => {
  try {
    const { subject, topic, level = "detailed" } = req.body;
    
    const prompt = `Sen MSÜ hazırlık uzmanısın. ${subject} dersinin "${topic}" konusunu anlatacaksın.

SEVİYE: ${level === "quick" ? "Hızlı tekrar (10 dk)" : "Detaylı anlatım (30 dk)"}

İÇERİK YAPISI:
1. KONU ÖZETİ (3-4 cümle)
2. MSÜ'DE ÇIKIŞ SIKLIĞI (Yıllara göre istatistik)
3. TEMEL KAVRAMLAR (Madde madde)
4. HIZLI ÇÖZÜM TEKNİKLERİ (Formüller, taktikler)
5. ÇIKMIŞ SORU ANALİZİ (En az 2 örnek)
6. SIK YAPILAN HATALAR
7. 7 GÜNLÜK TEKRAR PLANI

MSÜ SPESİFİK:
- Hangi yıllarda soru çıktı?
- Ortalama zorluk derecesi?
- En çok hangi konuyla birlikte soruluyor?
- 60 saniyede çözüm taktiği nedir?

Sadece düz metin yaz, markdown kullan.`;

    const result = await askGroq(prompt, 0.7);
    res.json({ success: true, content: result || "AI yanıt veremedi", subject, topic });
  } catch (err) {
    console.error("Topic explanation error:", err);
    res.status(500).json({ success: false, message: "Konu anlatımı alınamadı" });
  }
});

/* ================= AI PARAGRAPH TACTICS ================= */
app.post("/api/ai/paragraph-tactics", async (req, res) => {
  try {
    const prompt = `Sen MSÜ Paragraf uzmanısın. Türkçe dersindeki paragraf soruları için ULTIMATE TAKTİK rehberi hazırla.

İÇERİK:
1. PARAGRAF TÜRLERİ (Her biri için tanım + örnek)
   - Bilgi verici
   - Tartışmacı
   - Öyküleyici
   - Betimleyici

2. SORU TİPLERİ VE ÇÖZÜM STRATEJİLERİ
   - Ana fikir bulma (3 adımda)
   - Yardımcı fikir bulma
   - Başlık seçme (4 kriter)
   - Sonuç çıkarma
   - Yazarın amacı
   - Düşünceyi destekleyen cümle

3. HIZLI OKUMA TEKNİKLERİ
   - SKIMMING (Genel bakış)
   - SCANNING (Detay arama)
   - 60 saniyede paragraf çözümü

4. KELİME TAHMİN TAKTİKLERİ
   - Bağlamdan anlam çıkarma
   - Kök-Ek analizi
   - Olumsuzluk ekleri (ma-me, -sız/-siz vb.)

5. YANLIŞ ŞIK ELEME STRATEJİSİ
   - %100 eleme yöntemi
   - %50 şüphe yöntemi
   - 2 şık arasında kaldığımda ne yapmalı?

6. 7 GÜNLÜK PARAGRAF ANTRENMANI
   - Gün 1-2: Temel kavramlar
   - Gün 3-4: Orta seviye
   - Gün 5-6: Zor seviye
   - Gün 7: Full deneme

Sadece düz metin yaz, maddeler halinde, anlaşılır ol.`;

    const result = await askGroq(prompt, 0.8);
    res.json({ success: true, content: result || "Taktikler yüklenemedi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Taktikler alınamadı" });
  }
});

/* ================= AI MATH TACTICS ================= */
app.post("/api/ai/math-tactics", async (req, res) => {
  try {
    const prompt = `Sen MSÜ Matematik uzmanısın. Problem çözme için ULTIMATE TAKTİK rehberi hazırla.

İÇERİK:
1. PROBLEM ÇÖZME ADIMLARI
   - Problemi okuma (30 saniye)
   - Verileri belirleme
   - İstenen nedir?
   - Denklem kurma
   - Kontrol etme

2. SAYI PROBLEMLERİ HIZLI ÇÖZÜM
   - Yaş problemleri (Tablo yöntemi)
   - İşçi problemleri (Ters orantı)
   - Yüzde problemleri (Pratik oran)
   - Kar-zarar (Maliyet üzerinden)
   - Karışım (Oran yöntemi)

3. GEOMETRİ TAKTİKLERİ
   - Üçgende kenar-bağıntı
   - Açıortay-kenarortay
   - Dik üçgen özel durumlar (3-4-5, 5-12-13, 8-15-17)
   - Çemberde açılar (Yay-çap formülü)
   - Alan hesaplama (Pratik formüller)

4. 60 SANİYEDE ÇÖZÜM İPUÇLARI
   - Seçenek yerine koyma
   - Özel değer verme
   - Grafik çizme
   - Şık eleme

5. SIK YAPILAN HATALAR
   - Negatif sayı unutma
   - Birim karıştırma
   - Yüzde tabanı hatası

Sadece düz metin, maddeler halinde.`;

    const result = await askGroq(prompt, 0.8);
    res.json({ success: true, content: result || "Taktikler yüklenemedi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Taktikler alınamadı" });
  }
});

/* ================= WEAK ANALYSIS ================= */
app.get("/api/weak-real/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const tasksPath = path.join(dataDir, "tasks.json");
    const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));
    
    const userTasks = tasks.filter(t => t.userId == userId && t.completed);
    const topicStats = {};
    
    userTasks.forEach(t => {
      if (!t.topic) return;
      if (!topicStats[t.topic]) {
        topicStats[t.topic] = { total: 0, wrong: 0, correct: 0 };
      }
      topicStats[t.topic].total++;
      if (t.correct) {
        topicStats[t.topic].correct++;
      } else {
        topicStats[t.topic].wrong++;
      }
    });

    const analysis = Object.entries(topicStats).map(([topic, stats]) => ({
      topic,
      total: stats.total,
      wrong: stats.wrong,
      correct: stats.correct,
      accuracy: ((stats.correct / stats.total) * 100).toFixed(1),
      isWeak: (stats.wrong / stats.total) > 0.4
    })).sort((a, b) => parseFloat(a.accuracy) - parseFloat(b.accuracy));

    const weakTopics = analysis.filter(a => a.isWeak).map(a => a.topic);
    const strongTopics = analysis.filter(a => !a.isWeak && parseFloat(a.accuracy) > 80).map(a => a.topic);

    res.json({ 
      success: true, 
      analysis,
      weakTopics,
      strongTopics,
      totalTasks: userTasks.length
    });
  } catch (err) {
    console.error("Weak analysis error:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= AI WEAKNESS PLAN ================= */
app.post("/api/ai/weak-plan", async (req, res) => {
  try {
    const { weakTopics } = req.body;
    
    const prompt = `Sen MSÜ koçusun. Öğrencinin zayıf konuları: ${weakTopics.join(", ")}

Bu konular için 7 GÜNLÜK İNTENSİF PROGRAM hazırla:

HER KONU İÇİN:
1. Temel kavram tekrarı (30 dk)
2. Temel soru çözümü (20 soru)
3. Orta seviye soru (15 soru)
4. Zor soru (10 soru)
5. Mini deneme (5 soru)

GÜNLÜK PROGRAM:
- Sabah: Zayıf konu #1
- Öğlen: Zayıf konu #2
- Akşam: Genel tekrar + deneme

JSON FORMAT:
[
  {
    "day": 1,
    "focus": "Ana konu",
    "tasks": [
      {"title": "...", "subject": "...", "topic": "...", "duration": 30, "type": "theory"},
      {"title": "...", "subject": "...", "topic": "...", "duration": 45, "type": "practice"}
    ],
    "goal": "Hedef"
  }
]

Sadece JSON yaz.`;

    const plan = await askGroq(prompt, 0.8);
    res.json({ success: true, plan: plan || [] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= STATS & ANALYTICS ================= */
app.get("/api/stats/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const usersPath = path.join(dataDir, "users.json");
    const tasksPath = path.join(dataDir, "tasks.json");
    const examPath = path.join(dataDir, "exam_history.json");
    
    const users = JSON.parse(await fs.readFile(usersPath, "utf8"));
    const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));
    const exams = JSON.parse(await fs.readFile(examPath, "utf8"));
    
    const user = users.find(u => u.id == userId);
    if (!user) return res.status(404).json({ success: false });

    const userTasks = tasks.filter(t => t.userId == userId);
    const completedTasks = userTasks.filter(t => t.completed);
    const correctTasks = completedTasks.filter(t => t.correct);
    
    const userExams = exams.filter(e => e.userId == userId && e.completed);
    const avgScore = userExams.length > 0 
      ? (userExams.reduce((a, b) => a + b.score, 0) / userExams.length).toFixed(1)
      : 0;

    const today = new Date().toDateString();
    const todayTasks = completedTasks.filter(t => new Date(t.completedAt).toDateString() === today);
    
    const subjectStats = {};
    completedTasks.forEach(t => {
      if (!subjectStats[t.subject]) subjectStats[t.subject] = { total: 0, correct: 0 };
      subjectStats[t.subject].total++;
      if (t.correct) subjectStats[t.subject].correct++;
    });

    res.json({
      success: true,
      stats: {
        xp: user.xp,
        level: user.level,
        streak: user.streak,
        totalTasks: userTasks.length,
        completedTasks: completedTasks.length,
        accuracy: completedTasks.length > 0 ? ((correctTasks.length / completedTasks.length) * 100).toFixed(1) : 0,
        totalStudyTime: user.totalStudyTime,
        examCount: user.examCount,
        avgExamScore: avgScore,
        todayTasks: todayTasks.length,
        todayXP: todayTasks.reduce((a, t) => a + (t.basePoints || 20), 0),
        subjectStats,
        weakTopics: user.weakTopics,
        strongTopics: user.strongTopics
      }
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= REWARDS ================= */
app.post("/api/admin/reward", async (req, res) => {
  try {
    const { title, description, xpRequired, icon } = req.body;
    const rewardsPath = path.join(dataDir, "rewards.json");
    const rewards = JSON.parse(await fs.readFile(rewardsPath, "utf8"));
    
    const reward = {
      id: Date.now().toString(),
      title,
      description,
      xpRequired,
      icon: icon || "🏆",
      createdAt: new Date()
    };
    
    rewards.push(reward);
    await fs.writeFile(rewardsPath, JSON.stringify(rewards, null, 2));
    res.json({ success: true, reward });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/api/rewards/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const rewardsPath = path.join(dataDir, "rewards.json");
    const usersPath = path.join(dataDir, "users.json");
    
    const rewards = JSON.parse(await fs.readFile(rewardsPath, "utf8"));
    const users = JSON.parse(await fs.readFile(usersPath, "utf8"));
    const user = users.find(u => u.id == userId);
    
    if (!user) return res.status(404).json({ success: false });

    const userRewards = rewards.map(r => ({
      ...r,
      unlocked: user.xp >= r.xpRequired,
      progress: Math.min(100, (user.xp / r.xpRequired) * 100).toFixed(0)
    })).sort((a, b) => a.xpRequired - b.xpRequired);

    res.json({ success: true, rewards: userRewards });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= ADMIN ROUTES ================= */
app.get("/api/admin/users", async (req, res) => {
  try {
    const usersPath = path.join(dataDir, "users.json");
    const users = JSON.parse(await fs.readFile(usersPath, "utf8"));
    const safeUsers = users.map(u => ({ ...u, password: undefined }));
    res.json({ success: true, users: safeUsers });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/api/admin/all-tasks", async (req, res) => {
  try {
    const tasksPath = path.join(dataDir, "tasks.json");
    const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= 7 DAY COUNTDOWN ================= */
app.get("/api/countdown", (req, res) => {
  const examDate = new Date("2026-03-01");
  const now = new Date();
  const diff = examDate - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  
  res.json({
    success: true,
    daysLeft: Math.max(0, days),
    examDate: examDate.toISOString(),
    urgency: days <= 3 ? "critical" : days <= 7 ? "high" : days <= 14 ? "medium" : "low"
  });
});

/* ================= ERROR HANDLING ================= */
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ success: false, message: "Sunucu hatası oluştu" });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("🔥 MSÜ AI SERVER TANRI MODU AKTİF (GROQ API)");
  console.log(`🚀 Port: ${PORT}`);
  console.log(`🤖 AI: Groq (Llama 3)`);
  console.log(`📅 Tarih: ${new Date().toLocaleString("tr-TR")}`);
  console.log(`🎯 Hedef: 7 GÜNDE MSÜ BAŞARISI`);
});