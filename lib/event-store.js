const { randomUUID, randomInt } = require("node:crypto");

const POKEMON = {
  Bulbasaur: {
    hp: 45,
    attack: 12,
    defense: 11,
    speed: 10,
    moves: [
      { name: "Vine Whip", power: 14 },
      { name: "Tackle", power: 10 },
    ],
  },
  Charmander: {
    hp: 39,
    attack: 14,
    defense: 9,
    speed: 12,
    moves: [
      { name: "Ember", power: 14 },
      { name: "Scratch", power: 10 },
    ],
  },
  Squirtle: {
    hp: 44,
    attack: 11,
    defense: 13,
    speed: 9,
    moves: [
      { name: "Water Gun", power: 14 },
      { name: "Tackle", power: 10 },
    ],
  },
  Pikachu: {
    hp: 35,
    attack: 15,
    defense: 8,
    speed: 15,
    moves: [
      { name: "Thunder Shock", power: 15 },
      { name: "Quick Attack", power: 11 },
    ],
  },
};

function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 5; index += 1) {
    code += alphabet[randomInt(0, alphabet.length)];
  }

  return code;
}

function normalizeName(name) {
  const normalized = String(name || "").trim().slice(0, 24);

  if (!normalized) {
    throw new Error("Player name is required.");
  }

  return normalized;
}

function getPokemon(name) {
  const pokemon = POKEMON[name];

  if (!pokemon) {
    throw new Error("Choose one of the available Pokémon.");
  }

  return pokemon;
}

function clonePokemonCatalog() {
  return Object.entries(POKEMON).map(([name, pokemon]) => ({
    name,
    hp: pokemon.hp,
    attack: pokemon.attack,
    defense: pokemon.defense,
    speed: pokemon.speed,
    moves: pokemon.moves.map((move) => ({ ...move })),
  }));
}

class EventStore {
  constructor() {
    this.events = new Map();
    this.streams = new Map();
  }

  getPokemonCatalog() {
    return clonePokemonCatalog();
  }

  createEvent(hostName) {
    const code = this.#uniqueCode();
    const player = this.#createPlayer(hostName);
    const event = {
      code,
      hostId: player.id,
      phase: "lobby",
      turn: 0,
      createdAt: new Date().toISOString(),
      winnerId: null,
      players: [player],
      log: [`${player.name} is hosting the event.`],
    };

    this.events.set(code, event);
    return { code, playerId: player.id, event: this.#snapshot(event) };
  }

  joinEvent(code, playerName) {
    const event = this.#requireEvent(code);

    if (event.phase !== "lobby") {
      throw new Error("This event is already in progress.");
    }

    if (event.players.length >= 4) {
      throw new Error("This event is full.");
    }

    const name = normalizeName(playerName);

    if (event.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("Choose a different player name.");
    }

    const player = this.#createPlayer(name);
    event.players.push(player);
    event.log.unshift(`${player.name} joined the event.`);
    this.#broadcast(code);

    return { code, playerId: player.id, event: this.#snapshot(event) };
  }

  getEvent(code) {
    return this.#snapshot(this.#requireEvent(code));
  }

  choosePokemon(code, playerId, pokemonName) {
    const event = this.#requireEvent(code);
    const player = this.#requirePlayer(event, playerId);
    const pokemon = getPokemon(pokemonName);

    if (event.phase !== "lobby") {
      throw new Error("Pokémon can only be selected in the lobby.");
    }

    player.pokemon = pokemonName;
    player.maxHp = pokemon.hp;
    player.currentHp = pokemon.hp;
    player.ready = false;
    event.log.unshift(`${player.name} picked ${pokemonName}.`);
    this.#broadcast(code);

    return this.#snapshot(event);
  }

  setReady(code, playerId, ready) {
    const event = this.#requireEvent(code);
    const player = this.#requirePlayer(event, playerId);

    if (event.phase !== "lobby") {
      throw new Error("Ready status can only change in the lobby.");
    }

    if (!player.pokemon) {
      throw new Error("Pick a Pokémon before getting ready.");
    }

    player.ready = Boolean(ready);
    event.log.unshift(`${player.name} is ${player.ready ? "ready" : "not ready"} to battle.`);
    this.#broadcast(code);

    return this.#snapshot(event);
  }

  startBattle(code, playerId) {
    const event = this.#requireEvent(code);

    if (event.hostId !== playerId) {
      throw new Error("Only the host can start the event.");
    }

    if (event.phase !== "lobby") {
      throw new Error("The event has already started.");
    }

    if (event.players.length < 2) {
      throw new Error("At least two players are needed to start.");
    }

    const waitingOn = event.players.find((player) => !player.ready || !player.pokemon);

    if (waitingOn) {
      throw new Error("Every player must pick a Pokémon and get ready.");
    }

    event.phase = "battle";
    event.turn = 1;
    event.log.unshift("The battle has started.");
    this.#broadcast(code);

    return this.#snapshot(event);
  }

  submitMove(code, playerId, moveName) {
    const event = this.#requireEvent(code);
    const player = this.#requirePlayer(event, playerId);

    if (event.phase !== "battle") {
      throw new Error("The battle has not started yet.");
    }

    if (player.currentHp <= 0) {
      throw new Error("Knocked out players cannot make a move.");
    }

    if (player.submittedMove) {
      throw new Error("You already locked in a move for this turn.");
    }

    const pokemon = getPokemon(player.pokemon);
    const move = pokemon.moves.find((entry) => entry.name === moveName);

    if (!move) {
      throw new Error("Choose one of your Pokémon's moves.");
    }

    player.submittedMove = move.name;
    event.log.unshift(`${player.name} locked in a move for turn ${event.turn}.`);

    if (this.#allLivingPlayersSubmitted(event)) {
      this.#resolveTurn(event);
    } else {
      this.#broadcast(code);
    }

    return this.#snapshot(event);
  }

  openStream(code, response) {
    this.#requireEvent(code);

    const listeners = this.streams.get(code) || new Set();
    listeners.add(response);
    this.streams.set(code, listeners);

    response.write(`data: ${JSON.stringify(this.getEvent(code))}\n\n`);
  }

  closeStream(code, response) {
    const listeners = this.streams.get(code);

    if (!listeners) {
      return;
    }

    listeners.delete(response);

    if (listeners.size === 0) {
      this.streams.delete(code);
    }
  }

  #createPlayer(name) {
    return {
      id: randomUUID(),
      name: normalizeName(name),
      pokemon: null,
      maxHp: null,
      currentHp: null,
      ready: false,
      submittedMove: null,
    };
  }

  #uniqueCode() {
    let code = createCode();

    while (this.events.has(code)) {
      code = createCode();
    }

    return code;
  }

  #requireEvent(code) {
    const event = this.events.get(String(code || "").trim().toUpperCase());

    if (!event) {
      throw new Error("Event not found.");
    }

    return event;
  }

  #requirePlayer(event, playerId) {
    const player = event.players.find((entry) => entry.id === playerId);

    if (!player) {
      throw new Error("Player not found for this event.");
    }

    return player;
  }

  #allLivingPlayersSubmitted(event) {
    return event.players
      .filter((player) => player.currentHp > 0)
      .every((player) => Boolean(player.submittedMove));
  }

  #resolveTurn(event) {
    const livingPlayers = event.players.filter((player) => player.currentHp > 0);

    if (livingPlayers.length <= 1) {
      this.#finishBattle(event);
      return;
    }

    const orderedPlayers = [...livingPlayers].sort((left, right) => {
      const leftSpeed = getPokemon(left.pokemon).speed;
      const rightSpeed = getPokemon(right.pokemon).speed;

      return rightSpeed - leftSpeed;
    });

    const turnMessages = [];

    for (const attacker of orderedPlayers) {
      if (attacker.currentHp <= 0) {
        continue;
      }

      const targets = this.#getTargets(event, attacker.id);

      if (targets.length === 0) {
        break;
      }

      const target = targets[0];
      const attackStats = getPokemon(attacker.pokemon);
      const targetStats = getPokemon(target.pokemon);
      const selectedMove = attackStats.moves.find((move) => move.name === attacker.submittedMove);

      if (!selectedMove) {
        continue;
      }

      const damage = Math.max(
        6,
        selectedMove.power + attackStats.attack - Math.floor(targetStats.defense / 2),
      );

      target.currentHp = Math.max(0, target.currentHp - damage);
      turnMessages.push(
        `${attacker.name}'s ${attacker.pokemon} used ${selectedMove.name} on ${target.name}'s ${target.pokemon} for ${damage} damage.`,
      );

      if (target.currentHp === 0) {
        turnMessages.push(`${target.name}'s ${target.pokemon} fainted.`);
      }
    }

    for (const player of event.players) {
      player.submittedMove = null;
    }

    event.log = [...turnMessages.reverse(), ...event.log];

    if (event.players.filter((player) => player.currentHp > 0).length <= 1) {
      this.#finishBattle(event);
      return;
    }

    event.turn += 1;
    this.#broadcast(event.code);
  }

  #getTargets(event, attackerId) {
    const attackerIndex = event.players.findIndex((player) => player.id === attackerId);

    if (attackerIndex === -1) {
      return [];
    }

    const targets = [];

    for (let offset = 1; offset < event.players.length; offset += 1) {
      const target = event.players[(attackerIndex + offset) % event.players.length];

      if (target.currentHp > 0) {
        targets.push(target);
      }
    }

    return targets;
  }

  #finishBattle(event) {
    event.phase = "finished";
    const winner = event.players.find((player) => player.currentHp > 0) || null;
    event.winnerId = winner ? winner.id : null;

    for (const player of event.players) {
      player.submittedMove = null;
    }

    event.log.unshift(
      winner ? `${winner.name} wins the event battle!` : "The event battle ended in a draw.",
    );
    this.#broadcast(event.code);
  }

  #snapshot(event) {
    return {
      code: event.code,
      hostId: event.hostId,
      phase: event.phase,
      turn: event.turn,
      createdAt: event.createdAt,
      winnerId: event.winnerId,
      players: event.players.map((player) => ({
        id: player.id,
        name: player.name,
        pokemon: player.pokemon,
        maxHp: player.maxHp,
        currentHp: player.currentHp,
        ready: player.ready,
        submittedMove: Boolean(player.submittedMove),
      })),
      log: [...event.log].slice(0, 12),
    };
  }

  #broadcast(code) {
    const listeners = this.streams.get(code);

    if (!listeners || listeners.size === 0) {
      return;
    }

    const message = `data: ${JSON.stringify(this.getEvent(code))}\n\n`;

    for (const response of listeners) {
      response.write(message);
    }
  }
}

module.exports = {
  EventStore,
  POKEMON,
};
