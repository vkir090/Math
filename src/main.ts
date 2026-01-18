import './style.css';
import tasksJson from './data/tasks.json';
import {
  ModeKey,
  NormalizationResult,
  containsImplication,
  eliminateImplications,
  negateWithDeMorgan,
  normalizeSymbols,
  normalizeWithCursor,
  parseFormula,
  truthTableEquality,
} from './logic';

type TaskTemplate = string | { base: string; hint?: string };
type Task = { base: string; hint?: string };

type Progress = { correct: number; wrong: number };

type TasksData = {
  variables: string[];
  modes: Record<ModeKey, TaskTemplate[]>;
};

const tasksData = tasksJson as TasksData;

const modeCopy: Record<ModeKey, { title: string; description: string; cta: string }> = {
  eliminate: {
    title: '⇒/⇔ eliminieren',
    description: 'Formuliere die Aufgabe um, sodass keine ⇒ oder ⇔ mehr vorkommen.',
    cta: 'Transformiere die Formel in eine ausschließliche ∧/∨/¬-Darstellung.',
  },
  negation: {
    title: 'Negation bilden (De Morgan)',
    description: 'Baue eine negierte Variante mit De-Morgan-Regeln und negation-only auf Atomen.',
    cta: 'Negiere die gesamte Formel und schiebe ¬ nach innen.',
  },
  equivalence: {
    title: 'Äquivalenz prüfen (Wahrheitstabelle)',
    description: 'Gib eine Formel an, die äquivalent zur Aufgabe ist. Wir prüfen per Wahrheitstabelle.',
    cta: 'Nutze Umformungen wie Implikations- oder De-Morgan-Regeln.',
  },
};

const defaultProgress = (): Record<ModeKey, Progress> => ({
  eliminate: { correct: 0, wrong: 0 },
  negation: { correct: 0, wrong: 0 },
  equivalence: { correct: 0, wrong: 0 },
});

const progressKey = 'logic-trainer-progress';

const loadProgress = (): Record<ModeKey, Progress> => {
  try {
    const stored = localStorage.getItem(progressKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Record<ModeKey, Progress>>;
      return {
        eliminate: parsed.eliminate ?? { correct: 0, wrong: 0 },
        negation: parsed.negation ?? { correct: 0, wrong: 0 },
        equivalence: parsed.equivalence ?? { correct: 0, wrong: 0 },
      };
    }
  } catch (error) {
    console.error('Konnte Fortschritt nicht laden', error);
  }
  return defaultProgress();
};

const saveProgress = (progress: Record<ModeKey, Progress>) => {
  try {
    localStorage.setItem(progressKey, JSON.stringify(progress));
  } catch (error) {
    console.error('Konnte Fortschritt nicht speichern', error);
  }
};

const shuffle = <T,>(list: T[]): T[] => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const fillTemplate = (template: string): string => {
  const placeholders = template.match(/#\d/g) ?? [];
  const pool = shuffle(tasksData.variables);
  let result = template;
  placeholders.forEach((placeholder, index) => {
    const variable = pool[index % pool.length] ?? tasksData.variables[0];
    result = result.replace(placeholder, variable);
  });
  return normalizeSymbols(result);
};

const pickTask = (mode: ModeKey): Task => {
  const list = tasksData.modes[mode];
  const template = list[Math.floor(Math.random() * list.length)];
  if (typeof template === 'string') {
    return { base: fillTemplate(template) };
  }
  return { base: fillTemplate(template.base), hint: template.hint };
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Root Element fehlt.');
}

app.innerHTML = `
  <div class="page">
    <header class="hero">
      <div class="hero__text">
        <p class="pill">Uni Prep</p>
        <h1>Logic Trainer</h1>
        <p class="lede">Schnelle Übungen zur Aussagenlogik – mobilfreundlich und PWA-ready.</p>
        <div class="topic-switch" role="tablist" aria-label="Topic Auswahl">
          <button class="topic-button active" data-topic="aussagen">Aussagenlogik</button>
          <button class="topic-button" data-topic="praedikaten">Prädikatenlogik <span class="pill pill--ghost">coming soon</span></button>
        </div>
      </div>
      <div class="hero__status">
        <div class="status-card">
          <p class="eyebrow">Fortschritt gesamt</p>
          <div id="progressSummary" class="progress-summary"></div>
          <p class="tiny">Speichert lokal (localStorage)</p>
        </div>
      </div>
    </header>
    <main class="grid">
      <section class="card">
        <div class="tab-row" role="tablist" aria-label="Übungsmodi">
          <button class="tab active" data-mode="eliminate">⇒/⇔ eliminieren</button>
          <button class="tab" data-mode="negation">Negation bilden</button>
          <button class="tab" data-mode="equivalence">Äquivalenz prüfen</button>
        </div>
        <div class="task-header">
          <div>
            <p id="modeLabel" class="eyebrow"></p>
            <h2 id="taskTitle"></h2>
            <p id="taskDescription" class="task-description"></p>
          </div>
          <div class="small-progress" id="modeProgress"></div>
        </div>
        <div class="task-body">
          <div class="task-card">
            <p class="label">Aufgabe</p>
            <p id="taskText" class="formula"></p>
          </div>
          <div class="hint-box">
            <p class="label">Hinweis</p>
            <p id="taskHint" class="hint"></p>
          </div>
        </div>
        <div class="editor" id="editor">
          <div class="editor__label">
            <div>
              <p class="label">Formel-Editor</p>
              <p class="tiny">ASCII-Kürzel werden automatisch normalisiert (!, &, |, ->, <->)</p>
            </div>
            <button class="ghost-button" id="clearButton" type="button">Leeren</button>
          </div>
          <textarea id="formulaInput" rows="3" placeholder="Formel eingeben…"></textarea>
          <div class="symbol-row" aria-label="Formel-Symbole">
            <div class="symbol-group">
              <button data-symbol="¬" type="button">¬</button>
              <button data-symbol="∧" type="button">∧</button>
              <button data-symbol="∨" type="button">∨</button>
              <button data-symbol="⇒" type="button">⇒</button>
              <button data-symbol="⇔" type="button">⇔</button>
              <button data-symbol="(" type="button">(</button>
              <button data-symbol=")" type="button">)</button>
            </div>
            <div class="symbol-group">
              <button data-symbol="A" type="button">A</button>
              <button data-symbol="B" type="button">B</button>
              <button data-symbol="C" type="button">C</button>
            </div>
          </div>
        </div>
        <div class="actions">
          <button id="checkButton" class="primary" type="button">Prüfen</button>
          <button id="nextButton" class="ghost-button" type="button">Neue Aufgabe</button>
        </div>
        <div id="feedback" class="feedback" role="status"></div>
        <div id="truthTable" class="truth-table"></div>
      </section>
      <section class="card secondary" id="comingSoon">
        <p class="eyebrow">Prädikatenlogik</p>
        <h3>Coming soon</h3>
        <p class="muted">Templates und automatisierte Auswertung sind in Arbeit. Du kannst trotzdem schon Aufgaben sammeln und die UI ausprobieren.</p>
      </section>
    </main>
  </div>
`;

const input = document.querySelector<HTMLTextAreaElement>('#formulaInput');
const feedback = document.querySelector<HTMLDivElement>('#feedback');
const truthTableContainer = document.querySelector<HTMLDivElement>('#truthTable');
const modeProgress = document.querySelector<HTMLDivElement>('#modeProgress');
const progressSummary = document.querySelector<HTMLDivElement>('#progressSummary');
const taskText = document.querySelector<HTMLParagraphElement>('#taskText');
const taskHint = document.querySelector<HTMLParagraphElement>('#taskHint');
const taskTitle = document.querySelector<HTMLHeadingElement>('#taskTitle');
const taskDescription = document.querySelector<HTMLParagraphElement>('#taskDescription');
const modeLabel = document.querySelector<HTMLParagraphElement>('#modeLabel');
const editor = document.querySelector<HTMLDivElement>('#editor');

if (
  !input ||
  !feedback ||
  !truthTableContainer ||
  !modeProgress ||
  !progressSummary ||
  !taskText ||
  !taskHint ||
  !taskTitle ||
  !taskDescription ||
  !modeLabel ||
  !editor
) {
  throw new Error('UI konnte nicht initialisiert werden.');
}

const state: {
  topic: 'aussagen' | 'praedikaten';
  mode: ModeKey;
  task: Task;
  progress: Record<ModeKey, Progress>;
} = {
  topic: 'aussagen',
  mode: 'eliminate',
  task: pickTask('eliminate'),
  progress: loadProgress(),
};

const updateProgressViews = () => {
  const entries = (Object.keys(state.progress) as ModeKey[]).map((key) => {
    const stats = state.progress[key];
    const total = stats.correct + stats.wrong;
    const ratio = total === 0 ? 0 : Math.round((stats.correct / total) * 100);
    return `<div class="progress-item">
      <div>
        <p class="label">${modeCopy[key].title}</p>
        <p class="muted">${stats.correct} richtig · ${stats.wrong} falsch</p>
      </div>
      <span class="pill pill--ghost">${ratio}%</span>
    </div>`;
  });
  progressSummary.innerHTML = entries.join('');
  const stats = state.progress[state.mode];
  modeProgress.innerHTML = `<strong>${stats.correct}✓</strong> · <span class="muted">${stats.wrong}✗</span>`;
};

const renderTask = () => {
  const meta = modeCopy[state.mode];
  modeLabel.textContent = meta.title;
  taskTitle.textContent = meta.description;
  taskDescription.textContent = meta.cta;
  taskText.textContent = state.task.base;
  taskHint.textContent = state.task.hint ?? 'Nutze die Buttons oder ASCII-Kürzel für Symbole.';
  feedback.textContent = '';
  feedback.className = 'feedback';
  truthTableContainer.innerHTML = '';
  input.value = '';
  updateProgressViews();
};

const resetTask = () => {
  state.task = pickTask(state.mode);
  renderTask();
};

const markTabActive = (mode: ModeKey) => {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle('active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
};

const markTopicActive = (topic: 'aussagen' | 'praedikaten') => {
  document.querySelectorAll<HTMLButtonElement>('.topic-button').forEach((button) => {
    const isActive = button.dataset.topic === topic;
    button.classList.toggle('active', isActive);
  });
  const disabled = topic === 'praedikaten';
  editor.classList.toggle('disabled', disabled);
  (document.querySelector('#checkButton') as HTMLButtonElement | null)?.toggleAttribute('disabled', disabled);
  (document.querySelector('#nextButton') as HTMLButtonElement | null)?.toggleAttribute('disabled', disabled);
  (document.querySelector('#clearButton') as HTMLButtonElement | null)?.toggleAttribute('disabled', disabled);
  if (disabled) {
    feedback.textContent = 'Prädikatenlogik ist noch im Aufbau.';
    truthTableContainer.innerHTML = '';
  } else {
    feedback.textContent = '';
  }
};

const updateInputWithNormalization = (result: NormalizationResult) => {
  input.value = result.value;
  input.setSelectionRange(result.cursor, result.cursor);
};

input.addEventListener('input', () => {
  const caret = input.selectionStart ?? input.value.length;
  const normalized = normalizeWithCursor(input.value, caret);
  updateInputWithNormalization(normalized);
});

document.querySelectorAll<HTMLButtonElement>('.symbol-row button').forEach((button) => {
  button.addEventListener('click', () => {
    const symbol = button.dataset.symbol ?? '';
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = input.value.slice(0, start) + symbol + input.value.slice(end);
    const normalized = normalizeWithCursor(next, start + symbol.length);
    updateInputWithNormalization(normalized);
    input.focus();
  });
});

document.querySelector<HTMLButtonElement>('#clearButton')?.addEventListener('click', () => {
  input.value = '';
  feedback.textContent = '';
  feedback.className = 'feedback';
  truthTableContainer.innerHTML = '';
});

document.querySelector<HTMLButtonElement>('#nextButton')?.addEventListener('click', () => resetTask());

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as ModeKey;
    if (mode && mode !== state.mode) {
      state.mode = mode;
      markTabActive(mode);
      resetTask();
    }
  });
});

document.querySelectorAll<HTMLButtonElement>('.topic-button').forEach((button) => {
  button.addEventListener('click', () => {
    const topic = (button.dataset.topic as 'aussagen' | 'praedikaten') ?? 'aussagen';
    state.topic = topic;
    markTopicActive(topic);
  });
});

const renderTruthTable = (rows: ReturnType<typeof truthTableEquality>['table'], labels: { left: string; right: string }) => {
  if (state.mode !== 'equivalence') {
    truthTableContainer.innerHTML = '';
    return;
  }
  const variables = rows[0] ? Object.keys(rows[0].assignment) : [];
  const headers = variables.map((v) => `<th>${v}</th>`).join('');
  const body = rows
    .map((row) => {
      const assignmentCells = variables.map((v) => `<td>${row.assignment[v] ? '1' : '0'}</td>`).join('');
      return `<tr>
        ${assignmentCells}
        <td>${row.left ? '1' : '0'}</td>
        <td>${row.right ? '1' : '0'}</td>
        <td class="${row.matches ? 'ok' : 'bad'}">${row.matches ? '✓' : '✗'}</td>
      </tr>`;
    })
    .join('');
  truthTableContainer.innerHTML = `
    <div class="table-wrapper">
      <div class="table-caption">Wahrheitstabelle</div>
      <table>
        <thead>
          <tr>${headers}<th>${labels.left}</th><th>${labels.right}</th><th></th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
};

const updateProgress = (correct: boolean) => {
  const stats = state.progress[state.mode];
  if (correct) {
    stats.correct += 1;
  } else {
    stats.wrong += 1;
  }
  saveProgress(state.progress);
  updateProgressViews();
};

const evaluateInput = () => {
  if (state.topic === 'praedikaten') {
    feedback.textContent = 'Prädikatenlogik: Aufgaben folgen bald.';
    return;
  }
  const normalizedInput = normalizeSymbols(input.value.trim());
  input.value = normalizedInput;
  if (!normalizedInput) {
    feedback.textContent = 'Bitte gib eine Formel ein.';
    return;
  }
  try {
    const userAst = parseFormula(normalizedInput);
    const baseAst = parseFormula(state.task.base);

    if (state.mode === 'equivalence') {
      const { equal, table } = truthTableEquality(baseAst, userAst);
      renderTruthTable(table, { left: 'Aufgabe', right: 'Deine Formel' });
      feedback.textContent = equal
        ? 'Stark! Formeln sind äquivalent (Wahrheitstabelle passt).'
        : 'Nicht äquivalent. Schau dir die Wahrheitstabelle an.';
      feedback.className = `feedback ${equal ? 'success' : 'error'}`;
      updateProgress(equal);
      return;
    }

    if (state.mode === 'eliminate') {
      const expected = eliminateImplications(baseAst);
      const { equal } = truthTableEquality(expected, userAst);
      const hasImp = containsImplication(userAst);
      const ok = equal && !hasImp;
      feedback.textContent = ok
        ? 'Korrekt: ⇒ und ⇔ entfernt und äquivalent zur Vorgabe.'
        : hasImp
          ? 'Noch vorhanden: Bitte ⇒/⇔ eliminieren.'
          : 'Nicht äquivalent. Prüfe deine Umformung.';
      feedback.className = `feedback ${ok ? 'success' : 'error'}`;
      updateProgress(ok);
      return;
    }

    if (state.mode === 'negation') {
      const expected = negateWithDeMorgan(baseAst);
      const { equal } = truthTableEquality(expected, userAst);
      feedback.textContent = equal ? 'Korrekt negiert mit De Morgan!' : 'Nicht korrekt negiert. Versuch es erneut.';
      feedback.className = `feedback ${equal ? 'success' : 'error'}`;
      updateProgress(equal);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Formel konnte nicht gelesen werden.';
    feedback.textContent = `Fehler: ${message}`;
    feedback.className = 'feedback error';
  }
};

document.querySelector<HTMLButtonElement>('#checkButton')?.addEventListener('click', evaluateInput);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    evaluateInput();
  }
});

markTabActive(state.mode);
markTopicActive(state.topic);
renderTask();

if ('serviceWorker' in navigator) {
  const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const manifestUrl = `${import.meta.env.BASE_URL}manifest.webmanifest`;
  if (manifestLink) {
    manifestLink.href = manifestUrl;
  }
  const appleTouch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (appleTouch) {
    appleTouch.href = `${import.meta.env.BASE_URL}icons/icon-192.png`;
  }
  window.addEventListener('load', () => {
    const swPath = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swPath)
      .catch((error) => console.error('Service Worker Registrierung fehlgeschlagen', error));
  });
}
