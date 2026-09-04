import { Body } from "./planetary-object";

interface QuizQuestion {
  question: string;
  answer: string;
  options: string[];
  explanation: string;
}

const TOTAL_QUESTIONS = 6;
const FEEDBACK_DELAY_MS = 1400;
const BEST_KEY = "solar-quiz-best";

const QUESTION_POOL: QuizQuestion[] = [
  { question: "Which planet has the shortest day?", answer: "Jupiter", options: ["Jupiter", "Saturn", "Mars", "Earth"], explanation: "Jupiter whips around once every 9.9 hours, faster than any other major planet." },
  { question: "Which planet has the longest day?", answer: "Venus", options: ["Venus", "Mars", "Jupiter", "Saturn"], explanation: "Venus spins backward, so its Sun rises in the west." },
  { question: "Which planet is the hottest?", answer: "Venus", options: ["Venus", "Mercury", "Mars", "Jupiter"], explanation: "Venus traps heat under thick carbon dioxide until its surface melts lead." },
  { question: "Which planet is the coldest?", answer: "Neptune", options: ["Neptune", "Uranus", "Saturn", "Jupiter"], explanation: "Neptune averages minus 200 degrees, the coldest mean temperature of any major planet." },
  { question: "Which planet is the largest?", answer: "Jupiter", options: ["Jupiter", "Saturn", "Neptune", "Earth"], explanation: "Jupiter holds more mass than all the other planets combined." },
  { question: "Which planet has the most moons?", answer: "Saturn", options: ["Saturn", "Jupiter", "Uranus", "Neptune"], explanation: "Saturn holds 146 confirmed moons, more than any other planet." },
  { question: "Which planet has the longest year?", answer: "Neptune", options: ["Neptune", "Uranus", "Saturn", "Jupiter"], explanation: "Neptune takes 60190 days to circle the Sun once." },
  { question: "Which planet has the shortest year?", answer: "Mercury", options: ["Mercury", "Venus", "Earth", "Mars"], explanation: "Mercury races around the Sun in just 88 days." },
  { question: "Which planet is closest to the Sun?", answer: "Mercury", options: ["Mercury", "Venus", "Earth", "Mars"], explanation: "Mercury orbits nearest the Sun at just 0.39 AU." },
  { question: "Which planet has the strongest gravity?", answer: "Jupiter", options: ["Jupiter", "Saturn", "Neptune", "Earth"], explanation: "Jupiter pulls with 24.79 metres per second squared, the strongest grip of any planet." },
  { question: "Which planet is the Red Planet?", answer: "Mars", options: ["Mars", "Mercury", "Venus", "Jupiter"], explanation: "Mars glows red from iron oxide dust coating its surface." },
  { question: "Which planet has the most prominent rings?", answer: "Saturn", options: ["Saturn", "Jupiter", "Uranus", "Neptune"], explanation: "Saturn wears broad water-ice rings spanning 280000 kilometres." },
  { question: "Which planet did Voyager 2 visit in 1989?", answer: "Neptune", options: ["Neptune", "Uranus", "Saturn", "Jupiter"], explanation: "Voyager 2 flew past Neptune in 1989 and recorded its supersonic winds." },
  { question: "Which planet did Cassini orbit starting in 2004?", answer: "Saturn", options: ["Saturn", "Jupiter", "Uranus", "Neptune"], explanation: "Cassini orbited Saturn from 2004 and revealed its rings as water ice and rock." },
  { question: "Which planet spins once every 24.6 hours?", answer: "Mars", options: ["Mars", "Earth", "Mercury", "Venus"], explanation: "Mars turns in about a day and hosts the Perseverance rover that landed in 2021." },
  { question: "Which planet takes 687 days to orbit the Sun?", answer: "Mars", options: ["Mars", "Earth", "Venus", "Mercury"], explanation: "Mars circles the Sun in 687 days beneath a thin carbon-dioxide sky." },
  { question: "Which planet hides beneath clouds mapped by Magellan?", answer: "Venus", options: ["Venus", "Mercury", "Mars", "Jupiter"], explanation: "Magellan mapped Venus in 1990 through clouds that drive a runaway greenhouse effect." },
  { question: "Which planet did Juno reach in 2016?", answer: "Jupiter", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], explanation: "Juno reached Jupiter in 2016 to probe its deep hydrogen-helium envelope." },
  { question: "Which planet did MESSENGER orbit from 2011?", answer: "Mercury", options: ["Mercury", "Venus", "Mars", "Earth"], explanation: "MESSENGER orbited Mercury from 2011 and mapped its iron-rich surface." },
  { question: "Which dwarf planet did New Horizons visit in 2015?", answer: "Pluto", options: ["Pluto", "Eris", "Makemake", "Haumea"], explanation: "New Horizons flew past Pluto in 2015 and found nitrogen glaciers." },
  { question: "Which dwarf planet spins once every 3.9 hours?", answer: "Haumea", options: ["Haumea", "Pluto", "Eris", "Makemake"], explanation: "Haumea spins every 3.9 hours, stretching itself into an ellipsoid." },
  { question: "Which world did Dawn orbit in 2015?", answer: "Ceres", options: ["Ceres", "Pluto", "Eris", "Haumea"], explanation: "Dawn orbited Ceres in 2015 and found water ice beneath its dark crust." },
  { question: "Which dwarf planet forced the definition of planethood?", answer: "Eris", options: ["Eris", "Pluto", "Makemake", "Ceres"], explanation: "Eris triggered the 2006 debate that reclassified Pluto as a dwarf planet." },
  { question: "Which planet takes 365 days to orbit the Sun?", answer: "Earth", options: ["Earth", "Venus", "Mars", "Mercury"], explanation: "Earth circles the Sun in 365 days with the only known oceans and life." },
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
  private explanationEl: HTMLElement;
  private metaEl: HTMLElement;
  private progressEl: HTMLElement;
  private scoreEl: HTMLElement;
  private resultEl: HTMLElement;
  private finalScoreEl: HTMLElement;
  private bestEl: HTMLElement;

  private questions: QuizQuestion[] = [];
  private index = 0;
  private score = 0;
  private active = false;
  private lock = false;

  constructor() {
    this.card = document.getElementById("quiz-card")!;
    this.explanationEl = document.getElementById("quiz-explanation")!;
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
    this.explanationEl.textContent = "";

    this.questionEl.style.display = "";
    this.optionsEl.style.display = "";
    this.feedbackEl.style.display = "";
    this.explanationEl.style.display = "";
    this.metaEl.style.display = "";
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
    this.explanationEl.style.display = "";
    this.metaEl.style.display = "";
    this.closeBtn.style.display = "";
    this.resultEl.style.display = "";

    this.feedbackEl.textContent = "";
    this.feedbackEl.classList.remove("correct", "wrong", "hint");
    this.explanationEl.textContent = "";
  };

  handlePlanetClick = (body: Body | null): void => {
    if (!this.active || this.lock) return;

    if (body === null) {
      this.feedbackEl.textContent =
        "Pick an option below, or click a planet in the 3D scene!";
      this.feedbackEl.classList.remove("correct", "wrong");
      this.feedbackEl.classList.add("hint");
      return;
    }

    const current = this.questions[this.index];
    if (current && !current.options.includes(body.name)) {
      this.feedbackEl.textContent =
        "Pick an option below, or click a planet in the 3D scene!";
      this.feedbackEl.classList.remove("correct", "wrong");
      this.feedbackEl.classList.add("hint");
      return;
    }

    this.answerWith(body.name);
  };

  /** Answer with a planet name — from a clickable chip or a 3D click. */
  private answerWith = (name: string): void => {
    if (!this.active || this.lock) return;

    const current = this.questions[this.index];
    if (!current) return;

    const selected = this.optionsEl.querySelectorAll(".quiz-option");
    selected.forEach((el) => {
      if (el.textContent === name) {
        el.classList.add(
          name === current.answer ? "correct-option" : "wrong-option"
        );
      }
    });

    if (name === current.answer) {
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
    this.explanationEl.textContent = current.explanation;
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

    const options = shuffle(current.options);

    this.optionsEl.innerHTML = "";
    for (const name of options) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quiz-option";
      chip.textContent = name;
      chip.addEventListener("click", () => this.answerWith(name));
      this.optionsEl.appendChild(chip);
    }

    this.feedbackEl.textContent = "";
    this.feedbackEl.classList.remove("correct", "wrong", "hint");
    this.explanationEl.textContent = "";
    this.progressEl.textContent = `Q ${this.index + 1} / ${TOTAL_QUESTIONS}`;
    this.scoreEl.textContent = `Score ${this.score}`;
  };
  private showResult = (): void => {
    this.questionEl.style.display = "none";
    this.optionsEl.style.display = "none";
    this.feedbackEl.style.display = "none";
    this.explanationEl.style.display = "none";
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
