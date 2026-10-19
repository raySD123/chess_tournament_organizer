const STORAGE_KEY = "swissboard-tournament-v1";

const elements = {
  playerForm: document.querySelector("#player-form"),
  playerName: document.querySelector("#player-name"),
  playerRating: document.querySelector("#player-rating"),
  playersList: document.querySelector("#players-list"),
  playerCount: document.querySelector("#player-count"),
  playersHint: document.querySelector("#players-hint"),
  clearPlayers: document.querySelector("#clear-players"),
  roundCount: document.querySelector("#round-count"),
  startButton: document.querySelector("#start-button"),
  setupMessage: document.querySelector("#setup-message"),
  tournamentSection: document.querySelector("#tournament-section"),
  tournamentTitle: document.querySelector("#tournament-title"),
  roundProgressLabel: document.querySelector("#round-progress-label"),
  progressBar: document.querySelector("#progress-bar"),
  pairingsSubtitle: document.querySelector("#pairings-subtitle"),
  roundStatus: document.querySelector("#round-status"),
  pairingsList: document.querySelector("#pairings-list"),
  roundMessage: document.querySelector("#round-message"),
  nextRoundButton: document.querySelector("#next-round-button"),
  standingsList: document.querySelector("#standings-list"),
  resetTournament: document.querySelector("#reset-tournament"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.players) && Number.isInteger(saved.rounds)) {
      return {
        players: saved.players,
        rounds: saved.rounds,
        tournament: saved.tournament && typeof saved.tournament === "object" ? saved.tournament : null,
      };
    }
  } catch (error) {
    console.error("Could not load the saved tournament.", error);
  }
  return { players: [], rounds: 5, tournament: null };
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save the tournament.", error);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function score(player) {
  return state.tournament?.scores[player.id] ?? 0;
}

function compareRatings(a, b) {
  if (a.rating === null && b.rating !== null) return 1;
  if (a.rating !== null && b.rating === null) return -1;
  return (b.rating ?? 0) - (a.rating ?? 0);
}

function standings() {
  return [...state.players].sort((a, b) =>
    score(b) - score(a) || compareRatings(a, b) || a.name.localeCompare(b.name)
  );
}

function renderPlayers() {
  elements.playerCount.textContent = state.players.length;
  elements.playersHint.textContent = state.players.length < 2
    ? "Add at least two players to get started."
    : `${state.players.length} players ready to compete.`;
  elements.playersList.innerHTML = state.players.map((player) => `
    <tr>
      <td><span class="player-name-cell"><span class="avatar">${escapeHtml(initials(player.name))}</span>${escapeHtml(player.name)}</span></td>
      <td>${player.rating === null ? "Unrated" : player.rating}</td>
      <td><button class="remove-player" type="button" data-remove-player="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">×</button></td>
    </tr>
  `).join("");
  elements.clearPlayers.disabled = state.players.length === 0;
}

function renderStandings() {
  elements.standingsList.innerHTML = standings().map((player, index) => `
    <div class="standing-row">
      <span class="standing-rank">${String(index + 1).padStart(2, "0")}</span>
      <span class="standing-player">
        <span class="avatar">${escapeHtml(initials(player.name))}</span>
        <span class="standing-details">
          <span class="standing-name">${escapeHtml(player.name)}</span>
          <span class="standing-rating">${player.rating === null ? "Unrated" : `${player.rating} rating`}</span>
        </span>
      </span>
      <span class="standing-score">${score(player)} <span class="standing-rating">pts</span></span>
    </div>
  `).join("");
}

function pairKey(firstId, secondId) {
  return [firstId, secondId].sort().join("|");
}

function findPairings(players, previousPairings) {
  const ordered = [...players].sort((a, b) =>
    score(b) - score(a) || compareRatings(a, b) || a.name.localeCompare(b.name)
  );
  const byeCandidates = ordered.length % 2
    ? [...ordered].reverse().filter((player) => !state.tournament.byes.includes(player.id))
    : [null];
  if (byeCandidates.length === 0) return null;
  const failed = new Set();

  function search(unpaired) {
    if (unpaired.length === 0) return [];
    const key = unpaired.map((player) => player.id).sort().join(",");
    if (failed.has(key)) return null;

    const first = unpaired[0];
    const candidates = unpaired.slice(1).sort((a, b) => {
      const aRematch = previousPairings.has(pairKey(first.id, a.id)) ? 1 : 0;
      const bRematch = previousPairings.has(pairKey(first.id, b.id)) ? 1 : 0;
      return aRematch - bRematch
        || Math.abs(score(first) - score(a)) - Math.abs(score(first) - score(b))
        || compareRatings(a, b)
        || a.name.localeCompare(b.name);
    });

    for (const opponent of candidates) {
      if (previousPairings.has(pairKey(first.id, opponent.id))) continue;
      const rest = unpaired.filter((player) => player.id !== first.id && player.id !== opponent.id);
      const following = search(rest);
      if (following) return [{ white: first.id, black: opponent.id, result: "" }, ...following];
    }
    failed.add(key);
    return null;
  }

  for (const byePlayer of byeCandidates) {
    const remaining = byePlayer
      ? ordered.filter((player) => player.id !== byePlayer.id)
      : ordered;
    const pairings = search(remaining);
    if (pairings) return { pairings, bye: byePlayer?.id ?? null };
  }
  return null;
}

function previousPairings() {
  const pairs = new Set();
  for (const round of state.tournament.history) {
    for (const pairing of round.pairings) {
      pairs.add(pairKey(pairing.white, pairing.black));
    }
  }
  return pairs;
}

function renderPairings() {
  const tournament = state.tournament;
  if (!tournament) return;
  const round = tournament.history[tournament.history.length - 1];
  const completed = round.completed;
  const playerById = new Map(state.players.map((player) => [player.id, player]));
  elements.tournamentTitle.textContent = tournament.complete
    ? "Tournament complete"
    : `Round ${round.number}`;
  elements.roundProgressLabel.textContent = `Round ${Math.min(round.number, tournament.rounds)} of ${tournament.rounds}`;
  elements.progressBar.style.width = `${Math.min((round.number - (completed ? 0 : 1)) / tournament.rounds, 1) * 100}%`;
  elements.roundStatus.textContent = tournament.complete ? "FINISHED" : completed ? "ROUND COMPLETE" : "IN PROGRESS";
  elements.roundStatus.setAttribute("aria-label", elements.roundStatus.textContent);
  elements.pairingsSubtitle.textContent = tournament.endedEarly
    ? "No rematch-free pairings remain. The tournament ends here."
    : tournament.complete
      ? "Final results are in. Thanks for playing!"
    : completed ? "All results recorded. Ready for the next round." : "Enter each result to continue.";
  elements.roundMessage.textContent = "";
  elements.pairingsList.innerHTML = round.pairings.map((pairing, index) => {
    const white = playerById.get(pairing.white);
    const black = playerById.get(pairing.black);
    const resultControl = completed || tournament.complete
      ? `<span class="vs-label">${pairing.result === "white" ? "1 – 0" : pairing.result === "draw" ? "½ – ½" : "0 – 1"}</span>`
      : `<select class="result-select" data-pairing-index="${index}" aria-label="Result: ${escapeHtml(white.name)} versus ${escapeHtml(black.name)}">
          <option value="">Enter result…</option>
          <option value="white" ${pairing.result === "white" ? "selected" : ""}>${escapeHtml(white.name)} wins</option>
          <option value="draw" ${pairing.result === "draw" ? "selected" : ""}>Draw</option>
          <option value="black" ${pairing.result === "black" ? "selected" : ""}>${escapeHtml(black.name)} wins</option>
        </select>`;
    return `
      <div class="pairing-row">
        <span class="pairing-player"><span class="avatar">${escapeHtml(initials(white.name))}</span><span class="pairing-name">${escapeHtml(white.name)}</span></span>
        <span class="vs-label">vs</span>
        <span class="pairing-player"><span class="avatar">${escapeHtml(initials(black.name))}</span><span class="pairing-name">${escapeHtml(black.name)}</span></span>
        ${resultControl}
      </div>
    `;
  }).join("");
  if (round.bye) {
    const player = playerById.get(round.bye);
    elements.pairingsList.insertAdjacentHTML("beforeend", `
      <div class="bye-row">
        <span class="pairing-player"><span class="avatar">${escapeHtml(initials(player.name))}</span>${escapeHtml(player.name)}</span>
        <span class="bye-label">BYE · 1 POINT</span>
      </div>
    `);
  }
  elements.nextRoundButton.hidden = completed || tournament.complete;
  elements.nextRoundButton.disabled = !round.pairings.every((pairing) => pairing.result);
  elements.nextRoundButton.textContent = round.number >= tournament.rounds
    ? "Finish tournament"
    : "Complete round →";
  renderStandings();
}

function render() {
  elements.roundCount.value = state.rounds;
  renderPlayers();
  elements.tournamentSection.hidden = !state.tournament;
  if (state.tournament) renderPairings();
  elements.startButton.textContent = state.tournament ? "Restart tournament →" : "Start tournament →";
  elements.playerForm.querySelectorAll("input, button").forEach((input) => {
    input.disabled = Boolean(state.tournament);
  });
  elements.clearPlayers.disabled = Boolean(state.tournament) || state.players.length === 0;
}

function startRound(number) {
  const result = findPairings(state.players, previousPairings());
  if (!result) {
    elements.roundMessage.textContent = "No valid pairing without a rematch could be found.";
    return false;
  }
  const round = { number, pairings: result.pairings, bye: result.bye, completed: false };
  if (result.bye) {
    state.tournament.byes.push(result.bye);
    state.tournament.scores[result.bye] = score({ id: result.bye }) + 1;
  }
  state.tournament.history.push(round);
  return true;
}

elements.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.playerName.value.trim();
  const ratingInput = elements.playerRating.value.trim();
  const rating = ratingInput === "" ? null : Number(ratingInput);
  if (!name || (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 4000))) {
    elements.playersHint.textContent = "Enter a rating from 0 to 4000, or leave it blank for unrated.";
    return;
  }
  if (state.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    elements.playersHint.textContent = "A player with that name is already on the list.";
    return;
  }
  state.players.push({ id: crypto.randomUUID(), name, rating });
  elements.playerName.value = "";
  elements.playerRating.value = "";
  elements.playersHint.textContent = `${state.players.length} players ready to compete.`;
  saveState();
  render();
  elements.playerName.focus();
});

elements.playersList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-player]");
  if (!button || state.tournament) return;
  state.players = state.players.filter((player) => player.id !== button.dataset.removePlayer);
  saveState();
  render();
});

elements.clearPlayers.addEventListener("click", () => {
  state.players = [];
  saveState();
  render();
});

elements.roundCount.addEventListener("change", () => {
  const rounds = Number(elements.roundCount.value);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
    elements.setupMessage.textContent = "Choose between 1 and 20 rounds.";
    elements.roundCount.value = state.rounds;
    return;
  }
  state.rounds = rounds;
  elements.setupMessage.textContent = "";
  saveState();
});

elements.startButton.addEventListener("click", () => {
  const rounds = Number(elements.roundCount.value);
  elements.setupMessage.textContent = "";
  if (state.players.length < 2) {
    elements.setupMessage.textContent = "Add at least two players before starting.";
    return;
  }
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
    elements.setupMessage.textContent = "Choose between 1 and 20 rounds.";
    return;
  }
  state.rounds = rounds;
  state.tournament = {
    rounds,
    complete: false,
    scores: Object.fromEntries(state.players.map((player) => [player.id, 0])),
    history: [],
    byes: [],
  };
  if (!startRound(1)) {
    state.tournament = null;
    return;
  }
  saveState();
  render();
  elements.tournamentSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.pairingsList.addEventListener("change", (event) => {
  const select = event.target.closest("[data-pairing-index]");
  if (!select || !state.tournament) return;
  const round = state.tournament.history[state.tournament.history.length - 1];
  round.pairings[Number(select.dataset.pairingIndex)].result = select.value;
  elements.nextRoundButton.disabled = !round.pairings.every((pairing) => pairing.result);
  elements.roundMessage.textContent = "";
  saveState();
});

elements.nextRoundButton.addEventListener("click", () => {
  const tournament = state.tournament;
  const round = tournament.history[tournament.history.length - 1];
  if (!round.pairings.every((pairing) => pairing.result)) {
    elements.roundMessage.textContent = "Enter a result for every game first.";
    return;
  }
  for (const pairing of round.pairings) {
    state.tournament.scores[pairing.white] += pairing.result === "white" ? 1 : pairing.result === "draw" ? 0.5 : 0;
    state.tournament.scores[pairing.black] += pairing.result === "black" ? 1 : pairing.result === "draw" ? 0.5 : 0;
  }
  round.completed = true;
  if (round.number >= tournament.rounds) {
    tournament.complete = true;
  } else if (!startRound(round.number + 1)) {
  tournament.complete = true;
  tournament.endedEarly = true;
  }
  saveState();
  renderPairings();
});

elements.resetTournament.addEventListener("click", () => {
  state.tournament = null;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

render();
