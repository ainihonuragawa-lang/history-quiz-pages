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
  quoteAvatar: $("#quote-avatar"),
  quoteCharacterName: $("#quote-character-name"),
  quoteCharacterRole: $("#quote-character-role"),
  quoteCharacter: $("#quote-character"),
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
  quizAvatar: $("#quiz-avatar"),
  quizCharacterName: $("#quiz-character-name"),
  quizCharacterRole: $("#quiz-character-role"),
  quizCharacter: $("#quiz-character"),
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
  characters: new Map(),
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

function characterByKey(key) {
  return state.characters.get(key) || state.characters.get("historian") || {
    key: "historian",
    name: "史料読み係",
    role: "出典確認の案内役",
    era: "通史",
    color: "#1f4e5f",
    accent: "#d7ad51",
    prop: "book",
  };
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
  const character = characterByKey(quote.avatarKey);
  state.quote = quote;

  elements.quoteText.textContent = quote.text;
  elements.quoteMeta.textContent = `${quote.person}『${quote.workTitle}』${quote.quoteKind ? ` / ${quote.quoteKind}` : ""}`;
  elements.quoteNote.textContent = quote.note;
  elements.quoteCertainty.textContent = quote.certainty;
  elements.quoteSource.href = quote.sourceUrl;
  elements.quoteSource.hidden = !quote.sourceUrl;
  renderCharacter({
    avatar: elements.quoteAvatar,
    name: elements.quoteCharacterName,
    role: elements.quoteCharacterRole,
    stage: elements.quoteCharacter,
    character,
    mood: "neutral",
  });
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
  const character = characterByKey(question.characterKey);

  elements.quizProgress.textContent = `${state.currentIndex + 1}/${pack.questions.length}`;
  elements.quizTheme.textContent = pack.title;
  elements.quizCertainty.textContent = question.certainty;
  elements.quizPrompt.textContent = question.prompt;
  elements.choiceList.innerHTML = "";
  elements.result.hidden = true;
  renderCharacter({
    avatar: elements.quizAvatar,
    name: elements.quizCharacterName,
    role: elements.quizCharacterRole,
    stage: elements.quizCharacter,
    character,
    mood: "thinking",
  });

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
  const character = characterByKey(question.characterKey);

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

  renderCharacter({
    avatar: elements.quizAvatar,
    name: elements.quizCharacterName,
    role: elements.quizCharacterRole,
    stage: elements.quizCharacter,
    character,
    mood: isCorrect ? "correct" : "wrong",
  });
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

function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

function propSvg(prop, accent) {
  if (prop === "sword") {
    return `<path d="M108 92l30-38" stroke="${accent}" stroke-width="7" stroke-linecap="round"/><path d="M103 89l12 10" stroke="#3d332c" stroke-width="6" stroke-linecap="round"/>`;
  }
  if (prop === "fan") {
    return `<path d="M120 86l28-10-8 31z" fill="${accent}" opacity=".95"/><path d="M122 88l20 15" stroke="#7b5b25" stroke-width="3"/>`;
  }
  if (prop === "abacus") {
    return `<rect x="118" y="78" width="32" height="24" rx="5" fill="#5a4024"/><path d="M123 86h22M123 94h22" stroke="${accent}" stroke-width="3"/>`;
  }
  if (prop === "hammer") {
    return `<path d="M118 88l24 22" stroke="#6f4e2d" stroke-width="6" stroke-linecap="round"/><rect x="128" y="76" width="26" height="13" rx="4" fill="${accent}" transform="rotate(35 141 82)"/>`;
  }
  if (prop === "armor") {
    return `<path d="M121 78h28l-5 36h-18z" fill="${accent}" opacity=".95"/><path d="M126 88h18M126 98h18" stroke="#4a4238" stroke-width="3"/>`;
  }
  if (prop === "scroll") {
    return `<rect x="116" y="78" width="32" height="24" rx="6" fill="#fff8df" stroke="${accent}" stroke-width="4"/><path d="M123 88h18M123 96h15" stroke="#7b5b25" stroke-width="3"/>`;
  }
  return `<path d="M119 78h27v33h-27z" fill="#fff8df" stroke="${accent}" stroke-width="4"/><path d="M125 88h15M125 97h12" stroke="#7b5b25" stroke-width="3"/>`;
}

function expressionSvg(mood) {
  if (mood === "correct") {
    return {
      eyes: `<path d="M60 67q8 8 16 0M94 67q8 8 16 0" stroke="#2f2118" stroke-width="5" fill="none" stroke-linecap="round"/>`,
      mouth: `<path d="M76 88q14 18 30 0" stroke="#8b2f3f" stroke-width="5" fill="none" stroke-linecap="round"/>`,
      extras: `<path d="M45 35l5 10 11 2-8 8 2 12-10-6-10 6 2-12-8-8 11-2z" fill="#d7ad51"/>`,
    };
  }
  if (mood === "wrong") {
    return {
      eyes: `<path d="M61 64l13 10M74 64l-13 10M96 64l13 10M109 64l-13 10" stroke="#2f2118" stroke-width="5" stroke-linecap="round"/>`,
      mouth: `<path d="M79 94q12-10 27 0" stroke="#8b2f3f" stroke-width="5" fill="none" stroke-linecap="round"/>`,
      extras: `<circle cx="118" cy="82" r="5" fill="#d98c94" opacity=".9"/><circle cx="50" cy="82" r="5" fill="#d98c94" opacity=".9"/>`,
    };
  }
  if (mood === "speaking") {
    return {
      eyes: `<circle cx="68" cy="69" r="5" fill="#2f2118"/><circle cx="101" cy="69" r="5" fill="#2f2118"/>`,
      mouth: `<ellipse cx="85" cy="91" rx="10" ry="8" fill="#8b2f3f"/>`,
      extras: `<path d="M134 42q14 10 0 22M145 34q23 19 0 39" stroke="#1f4e5f" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    };
  }
  if (mood === "thinking") {
    return {
      eyes: `<circle cx="68" cy="69" r="5" fill="#2f2118"/><circle cx="101" cy="69" r="5" fill="#2f2118"/>`,
      mouth: `<path d="M78 91q9 5 20 0" stroke="#8b2f3f" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      extras: `<circle cx="127" cy="48" r="5" fill="#d7ad51"/><circle cx="139" cy="39" r="7" fill="#d7ad51"/>`,
    };
  }
  return {
    eyes: `<circle cx="68" cy="69" r="5" fill="#2f2118"/><circle cx="101" cy="69" r="5" fill="#2f2118"/>`,
    mouth: `<path d="M77 89q10 10 22 0" stroke="#8b2f3f" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    extras: "",
  };
}

function renderCharacter({ avatar, name, role, stage, character, mood }) {
  const base = safeColor(character.color, "#1f4e5f");
  const accent = safeColor(character.accent, "#d7ad51");
  const expression = expressionSvg(mood);
  stage.dataset.mood = mood;
  name.textContent = character.name;
  role.textContent = `${character.role} / ${character.era}`;
  avatar.innerHTML = `
    <svg viewBox="0 0 180 180" role="img" aria-label="${escapeHtml(character.name)}の2頭身キャラクター">
      <defs>
        <linearGradient id="body-${character.key}" x1="0" x2="1">
          <stop offset="0" stop-color="${base}"/>
          <stop offset="1" stop-color="${accent}"/>
        </linearGradient>
      </defs>
      <circle cx="90" cy="90" r="76" fill="#fff7e6"/>
      <path d="M48 150c7-32 24-48 42-48s35 16 42 48z" fill="url(#body-${character.key})"/>
      <path d="M76 112l14 19 14-19" fill="#fff8ec" opacity=".92"/>
      <circle cx="90" cy="70" r="42" fill="#f3c8a8"/>
      <path d="M51 63c5-28 26-43 48-37 16 4 26 17 30 37-18-8-52-10-78 0z" fill="#2f2118"/>
      <circle cx="57" cy="77" r="9" fill="#f3c8a8"/>
      <circle cx="123" cy="77" r="9" fill="#f3c8a8"/>
      ${expression.eyes}
      ${expression.mouth}
      ${expression.extras}
      ${propSvg(character.prop, accent)}
    </svg>
  `;
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
  if (!state.quote) return;
  const character = characterByKey(state.quote.avatarKey);

  renderCharacter({
    avatar: elements.quoteAvatar,
    name: elements.quoteCharacterName,
    role: elements.quoteCharacterRole,
    stage: elements.quoteCharacter,
    character,
    mood: "speaking",
  });

  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`${state.quote.text} ${state.quote.person}`);
  utterance.lang = "ja-JP";
  utterance.rate = 0.92;
  utterance.onend = () => renderCharacter({
    avatar: elements.quoteAvatar,
    name: elements.quoteCharacterName,
    role: elements.quoteCharacterRole,
    stage: elements.quoteCharacter,
    character,
    mood: "neutral",
  });
  utterance.onerror = utterance.onend;
  window.speechSynthesis.speak(utterance);
}

function setupSpeech() {
  if (!("speechSynthesis" in window)) {
    elements.speakQuote.textContent = "表情を見る";
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
  state.characters = new Map((state.data.content.characters ?? []).map((character) => [character.key, character]));

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
  elements.themeList.innerHTML = `<p class="prompt">読み込みに失敗しました。通信状況を確認して再読み込みしてください。</p>`;
  console.error(error);
});
