const test = require("node:test");
const assert = require("node:assert/strict");
const { EventStore } = require("../lib/event-store");

test("host and guest can create an event, get ready, and finish a battle", () => {
  const store = new EventStore();
  const hosted = store.createEvent("Red");
  const joined = store.joinEvent(hosted.code, "Blue");

  store.choosePokemon(hosted.code, hosted.playerId, "Charmander");
  store.choosePokemon(hosted.code, joined.playerId, "Bulbasaur");
  store.setReady(hosted.code, hosted.playerId, true);
  store.setReady(hosted.code, joined.playerId, true);

  let event = store.startBattle(hosted.code, hosted.playerId);
  assert.equal(event.phase, "battle");
  assert.equal(event.turn, 1);

  while (event.phase === "battle") {
    event = store.submitMove(hosted.code, hosted.playerId, "Ember");

    if (event.phase !== "battle") {
      break;
    }

    event = store.submitMove(hosted.code, joined.playerId, "Vine Whip");
  }

  assert.equal(event.phase, "finished");
  assert.ok(event.winnerId);
  assert.match(event.log[0], /wins the event battle/);
});

test("players must pick a Pokémon before getting ready", () => {
  const store = new EventStore();
  const hosted = store.createEvent("Leaf");

  assert.throws(
    () => store.setReady(hosted.code, hosted.playerId, true),
    /Pick a Pokémon before getting ready/,
  );
});

test("only the host can start the battle", () => {
  const store = new EventStore();
  const hosted = store.createEvent("Red");
  const joined = store.joinEvent(hosted.code, "Blue");

  store.choosePokemon(hosted.code, hosted.playerId, "Charmander");
  store.choosePokemon(hosted.code, joined.playerId, "Squirtle");
  store.setReady(hosted.code, hosted.playerId, true);
  store.setReady(hosted.code, joined.playerId, true);

  assert.throws(
    () => store.startBattle(hosted.code, joined.playerId),
    /Only the host can start the event/,
  );
});

test("the host cannot start until every player is ready", () => {
  const store = new EventStore();
  const hosted = store.createEvent("Red");
  const joined = store.joinEvent(hosted.code, "Blue");

  store.choosePokemon(hosted.code, hosted.playerId, "Charmander");
  store.choosePokemon(hosted.code, joined.playerId, "Squirtle");
  store.setReady(hosted.code, hosted.playerId, true);

  assert.throws(
    () => store.startBattle(hosted.code, hosted.playerId),
    /Every player must pick a Pokémon and get ready/,
  );
});

test("players cannot change a locked move and the final turn count stays on the last resolved round", () => {
  const store = new EventStore();
  const hosted = store.createEvent("Red");
  const joined = store.joinEvent(hosted.code, "Blue");

  store.choosePokemon(hosted.code, hosted.playerId, "Charmander");
  store.choosePokemon(hosted.code, joined.playerId, "Bulbasaur");
  store.setReady(hosted.code, hosted.playerId, true);
  store.setReady(hosted.code, joined.playerId, true);
  store.startBattle(hosted.code, hosted.playerId);

  const event = store.events.get(hosted.code);
  event.players[0].currentHp = 10;
  event.players[1].currentHp = 10;

  store.submitMove(hosted.code, hosted.playerId, "Ember");
  assert.throws(
    () => store.submitMove(hosted.code, hosted.playerId, "Scratch"),
    /already locked in a move/,
  );

  const finished = store.submitMove(hosted.code, joined.playerId, "Vine Whip");
  assert.equal(finished.phase, "finished");
  assert.equal(finished.turn, 1);
});
