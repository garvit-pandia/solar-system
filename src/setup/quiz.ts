import planetData from "../planets.json";
import { Body } from "./planetary-object";

interface QuizQuestion {
  question: string;
  answer: string;
}

const TOTAL_QUESTIONS = 6;
const FEEDBACK_DELAY_MS = 1400;
const BEST_KEY = "solar-quiz-best";

const QUESTION_POOL: QuizQuestion[] = [
  { question: "Which planet has the shortest day?", answer: "Jupiter" },
  { question: "Which planet has the longest day?", answer: "Venus" },
  { question: "Which planet is the hottest?", answer: "Venus" },
  { question: "Which planet is the coldest?", answer: "Neptune" },
  { question: "Which planet is the largest?", answer: "Jupiter" },
  { question: "Which planet has the most moons?", answer: "Saturn" },
  { question: "Which planet has the longest year?", answer: "Neptune" },
  { question: "Which planet has the shortest year?", answer: "Mercury" },
  { question: "Which planet is closest to the Sun?", answer: "Mercury" },
  { question: "Which planet has the strongest gravity?", answer: "Jupiter" },
  { question: "Which planet is the Red Planet?", answer: "Mars" },
  { question: "Which planet has the most prominent rings?", answer: "Saturn" },
];

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export class Quiz {
  private card: HTMLElement;
  private startBtn: HTMLElement;
  private closeBtn: HTMLElement;
  private againBtn: HTMLElement;
  private doneBtn: HTMLElement;
  private questionEl: HTMLElement;
  private optionsEl: HTMLElement;
  private feedbackEl: HTMLElement;
  private metaEl: HTMLElement;
  private progressEl: HTMLElement;
  private scoreEl: HTMLElement;
  private resultEl: HTMLElement;
  private finalScoreEl: HTMLElement;
  private bestEl: HTMLElement;

  private planetNames: string[];
  private questions: QuizQuestion[] = [];
  private index = 0;
  private score = 0;
  private active = false;
  private lock = false;

  constructor() {
    const bodies: Body[] = planetData;
    this.planetNames = bodies
      .filter((body) => body.type === "planet")
      .map((body) => body.name);

    this.card = document.getElementById("quiz-card")!;
    this.startBtn = document.getElementById("btn-quiz")!;
    this.closeBtn = document.getElementById("btn-quiz-close")!;
    this.againBtn = document.getElementById("btn-quiz-again")!;
    this.doneBtn = document.getElementById("btn-quiz-done")!;
    this.questionEl = document.getElementById("quiz-question")!;
    this.optionsEl = document.getElementById("quiz-options")!;
    this.feedbackEl = document.getElementById("quiz-feedback")!;
    this.metaEl = document.querySelector(".quiz-meta")!;
    this.progressEl = document.getElementById("quiz-progress")!;
    this.scoreEl = document.getElementById("quiz-score")!;
    this.resultEl = document.getElementById("quiz-result")!;
    this.finalScoreEl = document.getElementById("quiz-final-score")!;
    this.bestEl = document.getElementById("quiz-best")!;
  }

  init = (): void => {
    this.startBtn.addEventListener("click", this.start);
    this.closeBtn.addEventListener("click", this.close);
    this.againBtn.addEventListener("click", this.start);
    this.doneBtn.addEventListener("click", this.close);
  };

  isActive = (): boolean => {
    return this.active;
  };

  start = (): void => {
    this.active = true;
    this.lock = false;
    this.score = 0;
    this.index = 0;
    this.questions = shuffle(QUESTION_POOL).slice(0, TOTAL_QUESTIONS);

    this.feedbackEl.textContent = "";
    this.feedbackEl.classList.remove("correct", "wrong", "hint");

    this.questionEl.style.display = "";
    this.optionsEl.style.display = "";
    this.feedbackEl.style.display = "";
    this.metaEl.style.display = "";
    this.closeBtn.style.display = "";
    this.resultEl.style.display = "none";

    this.card.classList.add("visible");
    this.renderQuestion();
  };

  close = (): void => {
    this.active = false;
    this.lock = false;
    this.card.classList.remove("visible");

    this.questionEl.style.display = "";
    this.optionsEl.style.display = "";
    this.feedbackEl.style.display = "";
    this.metaEl.style.display = "";
    this.closeBtn.style.display = "";
    this.resultEl.style.display = "";

    this.feedbackEl.textContent = "";
    this.feedbackEl.classList.remove("correct", "wrong", "hint");
  };

  handlePlanetClick = (body: Body | null): void => {
    if (!this.active || this.lock) return;

    const current = this.questions[this.index];
    if (!current) return;

    if (body === null) {
      this.feedbackEl.textContent = "Click a planet in the 3D scene!";
      this.feedbackEl.classList.remove("correct", "wrong");
      this.feedbackEl.classList.add("hint");
      return;
    }

    if (body.name === current.answer) {
      this.score += 1;
      this.feedbackEl.textContent = "Correct!";
      this.feedbackEl.classList.remove("wrong", "hint");
      this.feedbackEl.classList.add("correct");
      this.scoreEl.textContent = `Score ${this.score}`;
    } else {
      this.feedbackEl.textContent = `Not quite — it was ${current.answer}`;
      this.feedbackEl.classList.remove("correct", "hint");
      this.feedbackEl.classList.add("wrong");
    }

    this.lock = true;
    window.setTimeout(() => {
      this.lock = false;
      if (!this.active) return;
      this.index += 1;
      if (this.index < this.questions.length) {
        this.renderQuestion();
      } else {
        this.showResult();
      }
    }, FEEDBACK_DELAY_MS);
  };

  private renderQuestion = (): void => {
    const current = this.questions[this.index];
    if (!current) return;

    this.questionEl.textContent = `Q: ${current.question}`;

    const decoys = shuffle(
      this.planetNames.filter((name) => name !== current.answer)
    ).slice(0, 2);
    const options = shuffle([current.answer, ...decoys]);

    this.optionsEl.innerHTML = "";
    for (const name of options) {
      const chip = document.createElement("div");
      chip.className = "quiz-option";
      chip.textContent = name;
      this.optionsEl.appendChild(chip);
    }

    this.progressEl.textContent = `Q ${this.index + 1} / ${TOTAL_QUESTIONS}`;
    this.scoreEl.textContent = `Score ${this.score}`;
  };

  private showResult = (): void => {
    this.questionEl.style.display = "none";
    this.optionsEl.style.display = "none";
    this.feedbackEl.style.display = "none";
    this.metaEl.style.display = "none";
    this.closeBtn.style.display = "none";
    this.resultEl.style.display = "block";

    this.finalScoreEl.textContent = `You scored ${this.score} / ${TOTAL_QUESTIONS}`;

    const stored = localStorage.getItem(BEST_KEY);
    const prevBest = stored === null ? -1 : parseInt(stored, 10);
    const best = Number.isNaN(prevBest) ? -1 : prevBest;

    if (this.score > best) {
      localStorage.setItem(BEST_KEY, String(this.score));
      this.bestEl.textContent = `New best! Best: ${this.score} / ${TOTAL_QUESTIONS}`;
    } else {
      this.bestEl.textContent = `Best: ${best} / ${TOTAL_QUESTIONS}`;
    }
  };
}
