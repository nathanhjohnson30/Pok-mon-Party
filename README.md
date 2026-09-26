# Pok-mon-Party

Local area Pokémon game that runs in the browser.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host machine, create an event, and share the five-character event code with other players on the same LAN.

## How it works

- One player hosts an event from the web app.
- Up to three more players join with the event code.
- Every trainer picks a Pokémon, marks ready, and the host starts the battle.
- During battle each player locks in a move, then the server resolves the turn and broadcasts the updated state to everyone.

## Verify

```bash
npm test
```
