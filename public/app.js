const state = {
  playerId: null,
  eventCode: null,
  event: null,
  pokemonCatalog: [],
  stream: null,
};

const connectionPanel = document.querySelector("#connection-panel");
const eventPanel = document.querySelector("#event-panel");
const messageNode = document.querySelector("#message");
const pokemonList = document.querySelector("#pokemon-list");
const playersList = document.querySelector("#players-list");
const eventLog = document.querySelector("#event-log");
const eventCodeLabel = document.querySelector("#event-code-label");
const phasePill = document.querySelector("#phase-pill");
const statusText = document.querySelector("#status-text");
const readyButton = document.querySelector("#ready-button");
const startButton = document.querySelector("#start-button");
const battleActions = document.querySelector("#battle-actions");
const hostForm = document.querySelector("#host-form");
const joinForm = document.querySelector("#join-form");

function setMessage(text) {
  messageNode.textContent = text || "";
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function getCurrentPlayer() {
  return state.event?.players.find((player) => player.id === state.playerId) || null;
}

function subscribeToEvent(code) {
  if (state.stream) {
    state.stream.close();
  }

  state.stream = new EventSource(`/api/events/${code}/stream`);
  state.stream.onmessage = (message) => {
    state.event = JSON.parse(message.data);
    render();
  };
}

function renderPokemonChoices() {
  const currentPlayer = getCurrentPlayer();
  const isLobby = state.event?.phase === "lobby";

  pokemonList.innerHTML = "";

  for (const pokemon of state.pokemonCatalog) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `pokemon-card${currentPlayer?.pokemon === pokemon.name ? " selected" : ""}`;
    card.disabled = !isLobby;
    const title = document.createElement("h4");
    title.textContent = pokemon.name;
    const stats = document.createElement("p");
    stats.className = "meta";
    stats.textContent = `HP ${pokemon.hp} · ATK ${pokemon.attack} · DEF ${pokemon.defense} · SPD ${pokemon.speed}`;
    const moves = document.createElement("p");
    moves.className = "meta";
    moves.textContent = pokemon.moves.map((move) => move.name).join(" · ");
    card.append(title, stats, moves);
    card.addEventListener("click", async () => {
      try {
        setMessage("Picking your Pokémon...");
        await request(`/api/events/${state.eventCode}/select-pokemon`, {
          method: "POST",
          body: {
            playerId: state.playerId,
            pokemon: pokemon.name,
          },
        });
        setMessage(`${pokemon.name} is ready for battle.`);
      } catch (error) {
        setMessage(error.message);
      }
    });
    pokemonList.appendChild(card);
  }
}

function renderPlayers() {
  playersList.innerHTML = "";

  for (const player of state.event.players) {
    const card = document.createElement("article");
    const isCurrentPlayer = player.id === state.playerId;
    const hpSummary =
      player.currentHp == null
        ? "Choose a Pokémon"
        : `${Math.max(player.currentHp, 0)} / ${player.maxHp} HP`;

    card.className = "player-card";
    const title = document.createElement("h4");
    title.textContent = `${player.name}${isCurrentPlayer ? " (you)" : ""}`;
    const pokemon = document.createElement("p");
    pokemon.className = "meta";
    pokemon.textContent = player.pokemon || "No Pokémon selected";
    const hp = document.createElement("p");
    hp.className = "meta";
    hp.textContent = hpSummary;
    const readiness = document.createElement("p");
    readiness.className = "meta";
    readiness.textContent = `${player.ready ? "Ready" : "Waiting"}${player.submittedMove ? " · Move locked" : ""}`;
    card.append(title, pokemon, hp, readiness);
    playersList.appendChild(card);
  }
}

function renderBattleActions() {
  const currentPlayer = getCurrentPlayer();

  battleActions.innerHTML = "";

  if (!currentPlayer || state.event.phase !== "battle" || !currentPlayer.pokemon || currentPlayer.currentHp <= 0) {
    return;
  }

  const pokemon = state.pokemonCatalog.find((entry) => entry.name === currentPlayer.pokemon);

  for (const move of pokemon.moves) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.disabled = currentPlayer.submittedMove;
    button.textContent = `${move.name} (${move.power})`;
    button.addEventListener("click", async () => {
      try {
        setMessage(`Locked in ${move.name}. Waiting for the other trainers...`);
        await request(`/api/events/${state.eventCode}/move`, {
          method: "POST",
          body: {
            playerId: state.playerId,
            move: move.name,
          },
        });
      } catch (error) {
        setMessage(error.message);
      }
    });
    battleActions.appendChild(button);
  }
}

function renderLog() {
  eventLog.innerHTML = "";

  for (const entry of state.event.log) {
    const item = document.createElement("li");
    item.textContent = entry;
    eventLog.appendChild(item);
  }
}

function render() {
  if (!state.event) {
    connectionPanel.classList.remove("hidden");
    eventPanel.classList.add("hidden");
    return;
  }

  const currentPlayer = getCurrentPlayer();
  const isHost = state.event.hostId === state.playerId;
  const allReady = state.event.players.length > 1 && state.event.players.every((player) => player.ready);

  connectionPanel.classList.add("hidden");
  eventPanel.classList.remove("hidden");

  eventCodeLabel.textContent = state.event.code;
  phasePill.textContent = state.event.phase;
  statusText.textContent =
    state.event.phase === "lobby"
      ? `${state.event.players.length}/4 trainers joined`
      : state.event.phase === "battle"
        ? `Turn ${state.event.turn}`
        : state.event.winnerId === state.playerId
          ? "You won the battle!"
          : "Battle finished";

  readyButton.disabled = !currentPlayer?.pokemon || state.event.phase !== "lobby";
  readyButton.textContent = currentPlayer?.ready ? "I'm not ready" : "I'm ready";

  startButton.classList.toggle("hidden", !isHost || state.event.phase !== "lobby");
  startButton.disabled = !allReady;

  renderPokemonChoices();
  renderPlayers();
  renderBattleActions();
  renderLog();
}

hostForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    setMessage("Creating your local event...");
    const payload = await request("/api/events", {
      method: "POST",
      body: {
        name: new FormData(hostForm).get("name"),
      },
    });

    state.playerId = payload.playerId;
    state.eventCode = payload.code;
    state.event = payload.event;
    subscribeToEvent(payload.code);
    render();
    setMessage("Event created. Share the event code with players on your network.");
  } catch (error) {
    setMessage(error.message);
  }
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    setMessage("Joining event...");
    const form = new FormData(joinForm);
    const payload = await request(`/api/events/${String(form.get("code")).trim().toUpperCase()}/join`, {
      method: "POST",
      body: {
        name: form.get("name"),
      },
    });

    state.playerId = payload.playerId;
    state.eventCode = payload.code;
    state.event = payload.event;
    subscribeToEvent(payload.code);
    render();
    setMessage("Joined the event.");
  } catch (error) {
    setMessage(error.message);
  }
});

readyButton.addEventListener("click", async () => {
  const currentPlayer = getCurrentPlayer();

  if (!currentPlayer) {
    return;
  }

  try {
    await request(`/api/events/${state.eventCode}/ready`, {
      method: "POST",
      body: {
        playerId: state.playerId,
        ready: !currentPlayer.ready,
      },
    });
    setMessage(currentPlayer.ready ? "You are no longer ready." : "You are ready to battle.");
  } catch (error) {
    setMessage(error.message);
  }
});

startButton.addEventListener("click", async () => {
  try {
    await request(`/api/events/${state.eventCode}/start`, {
      method: "POST",
      body: {
        playerId: state.playerId,
      },
    });
    setMessage("Battle started.");
  } catch (error) {
    setMessage(error.message);
  }
});

async function init() {
  try {
    const payload = await request("/api/pokemon");
    state.pokemonCatalog = payload.pokemon;
    render();
  } catch (error) {
    setMessage(error.message);
  }
}

init();
