const DATA_URL = "./data/content.json";
const STORAGE_KEY = "historyQuizPwaProgress.v1";

const $ = (selector) => document.querySelector(selector);

const elements = {
  installButton: $("#install-button"),
  startTodayQuestion: $("#start-today-question"),
  quoteText: $("#quote-text"),
  quoteMeta: $("#quote-meta"),
  quoteNote: $("#quote-note"),
  quoteCertainty: $("#quote-certainty"),
  quoteSource: $("#quote-source"),
  speakQuote: $("#speak-quote"),
  todayTheme: $("#today-theme"),
  todayPrompt: $("#today-prompt"),
  openTodayQuestion: $("#open-today-question"),
  themeList: $("#theme-list"),
  savedState: $("#saved-state"),
  quizShell: $("#quiz-shell"),
  backToThemes: $("#back-to-themes"),
  quizProgress: $("#quiz-progress"),
  quizTheme: $("#quiz-theme"),
  quizCertainty: $("#quiz-certainty"),
  quizPrompt: $("#quiz-prompt"),
  choiceList: $("#choice-list"),
  result: $("#result"),
  resultTitle: $("#result-title"),
  resultExplanation: $("#result-explanation"),
  contestedNote: $("#contested-note"),
  sourceList: $("#source-list"),
  nextQuestion: $("#next-question"),
  retryQuestion: $("#retry-question"),
};

const state = {
  data: null,
  quote: null,
  todayQuestion: null,
  currentPack: null,
  currentIndex: 0,
  deferredInstallPrompt: null,
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function localDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function dailyIndex(length, salt = "") {
  if (!length) return 0;
  return hashText(`${localDateKey()}:${salt}`) % length;
}

function allQuestions() {
  return state.data.content.packs.flatMap((pack) =>
    pack.questions.map((question, index) => ({ pack, question, index })),
  );
}

function updateProgressSummary() {
  const progress = loadProgress();
  const total = allQuestions().length;
  const solved = Object.values(progress).reduce((sum, pack) => sum + Object.keys(pack.answered || {}).length, 0);
  elements.savedState.textContent = `${solved}/${total}問 解答済み`;
}

function renderDailyQuote() {
  const quotes = state.data.content.quotes;
  const quote = quotes[dailyIndex(quotes.length, "quote")];
  state.quote = quote;

  elements.quoteText.textContent = quote.text;
  elements.quoteMeta.textContent = `${quote.person}『${quote.workTitle}』`;
  elements.quoteNote.textContent = quote.note;
  elements.quoteCertainty.textContent = quote.certainty;
  elements.quoteSource.href = quote.sourceUrl;
  elements.quoteSource.hidden = !quote.sourceUrl;
}

function renderTodayQuestion() {
  const questions = allQuestions();
  const item = questions[dailyIndex(questions.length, "question")];
  state.todayQuestion = item;
  elements.todayTheme.textContent = item.pack.title;
  elements.todayPrompt.textContent = item.question.prompt;
}

function renderThemes() {
  const progress = loadProgress();
  elements.themeList.innerHTML = "";

  for (const pack of state.data.content.packs) {
    const packProgress = progress[pack.id] || { answered: {}, correct: 0 };
    const answered = Object.keys(packProgress.answered || {}).length;
    const correct = Object.values(packProgress.answered || {}).filter(Boolean).length;
    const card = document.createElement("article");
    card.className = "theme-card";
    card.innerHTML = `
      <h3></h3>
      <p></p>
      <div class="theme-meta">
        <span>${pack.questionCount}問</span>
        <span>${answered}/${pack.questionCount}解答済み</span>
        <span>${correct}問正解</span>
      </div>
      <button type="button">このテーマを解く</button>
    `;
    card.querySelector("h3").textContent = pack.title;
    card.querySelector("p").textContent = pack.description;
    card.querySelector("button").addEventListener("click", () => openPack(pack.id));
    elements.themeList.append(card);
  }
}

function openPack(packId, questionId = null) {
  const pack = state.data.content.packs.find((item) => item.id === packId);
  if (!pack) return;

  state.currentPack = pack;
  state.currentIndex = questionId
    ? Math.max(0, pack.questions.findIndex((question) => question.id === questionId))
    : nextUnansweredIndex(pack);
  showQuiz();
}

function nextUnansweredIndex(pack) {
  const progress = loadProgress()[pack.id]?.answered || {};
  const index = pack.questions.findIndex((question) => !(question.id in progress));
  return index >= 0 ? index : 0;
}

function showQuiz() {
  elements.quizShell.hidden = false;
  elements.quizShell.scrollIntoView({ behavior: "smooth", block: "start" });
  renderQuestion();
}

function renderQuestion() {
  const pack = state.currentPack;
  const question = pack.questions[state.currentIndex];

  elements.quizProgress.textContent = `${state.currentIndex + 1}/${pack.questions.length}`;
  elements.quizTheme.textContent = pack.title;
  elements.quizCertainty.textContent = question.certainty;
  elements.quizPrompt.textContent = question.prompt;
  elements.choiceList.innerHTML = "";
  elements.result.hidden = true;

  for (const choice of question.choices) {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.innerHTML = `
      <span class="choice-id"></span>
      <span class="choice-text"></span>
    `;
    button.querySelector(".choice-id").textContent = choice.id;
    button.querySelector(".choice-text").textContent = choice.text;
    button.addEventListener("click", () => answerQuestion(choice.id));
    elements.choiceList.append(button);
  }
}

function answerQuestion(choiceId) {
  const pack = state.currentPack;
  const question = pack.questions[state.currentIndex];
  const isCorrect = choiceId === question.answer;

  const progress = loadProgress();
  progress[pack.id] ||= { answered: {} };
  progress[pack.id].answered ||= {};
  progress[pack.id].answered[question.id] = isCorrect;
  progress[pack.id].lastIndex = state.currentIndex;
  saveProgress(progress);

  for (const button of elements.choiceList.querySelectorAll(".choice")) {
    const id = button.querySelector(".choice-id").textContent;
    button.disabled = true;
    if (id === question.answer) button.classList.add("correct");
    if (id === choiceId && !isCorrect) button.classList.add("wrong");
  }

  elements.resultTitle.textContent = isCorrect ? "正解です" : "惜しいです";
  elements.resultExplanation.textContent = question.explanation;
  elements.contestedNote.textContent = question.contestedNote || "";
  elements.contestedNote.hidden = !question.contestedNote;
  renderSources(question.sources);
  elements.result.hidden = false;
  updateProgressSummary();
  renderThemes();
}

function renderSources(sources) {
  elements.sourceList.innerHTML = "";
  for (const source of sources) {
    const item = document.createElement("div");
    item.className = "source-item";
    const link = source.url
      ? `<a href="${source.url}" rel="noopener">${escapeHtml(source.title)}</a>`
      : `<strong>${escapeHtml(source.title)}</strong>`;
    item.innerHTML = `
      ${link}
      <p>${escapeHtml(source.author || "")}${source.rank ? ` / 出典ランク ${escapeHtml(source.rank)}` : ""}</p>
      <p>${escapeHtml(source.note || "")}</p>
    `;
    elements.sourceList.append(item);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nextQuestion() {
  if (!state.currentPack) return;
  state.currentIndex = (state.currentIndex + 1) % state.currentPack.questions.length;
  renderQuestion();
}

function speakQuote() {
  if (!("speechSynthesis" in window) || !state.quote) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`${state.quote.text} ${state.quote.person}`);
  utterance.lang = "ja-JP";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

function setupSpeech() {
  if (!("speechSynthesis" in window)) {
    elements.speakQuote.hidden = true;
    return;
  }
  elements.speakQuote.addEventListener("click", speakQuote);
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    // The app remains usable without offline caching.
  }
}

function bindEvents() {
  elements.startTodayQuestion.addEventListener("click", () => {
    if (!state.todayQuestion) return;
    openPack(state.todayQuestion.pack.id, state.todayQuestion.question.id);
  });
  elements.openTodayQuestion.addEventListener("click", () => {
    if (!state.todayQuestion) return;
    openPack(state.todayQuestion.pack.id, state.todayQuestion.question.id);
  });
  elements.backToThemes.addEventListener("click", () => {
    elements.quizShell.hidden = true;
    document.querySelector(".section").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  elements.nextQuestion.addEventListener("click", nextQuestion);
  elements.retryQuestion.addEventListener("click", renderQuestion);
}

async function init() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`Failed to load ${DATA_URL}`);
  state.data = await response.json();

  renderDailyQuote();
  renderTodayQuestion();
  renderThemes();
  updateProgressSummary();
  setupSpeech();
  setupInstallPrompt();
  bindEvents();
  registerServiceWorker();
}

init().catch((error) => {
  elements.themeList.innerHTML = `<p class="prompt">読み込みに失敗しました。通信状態を確認して再読み込みしてください。</p>`;
  console.error(error);
});
