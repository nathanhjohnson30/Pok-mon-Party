# Pokemon Party

A browser-based local-area Pokemon party game with a FireRed-inspired interface.

## Run Locally

Open `index.html` from a local web server. For example, from this repository root:

```powershell
npx --yes http-server .
```

Then open the URL printed by the server. A web server is recommended because browser `file://` pages can block local asset requests.

## Project Layout

- `index.html` - the game UI and client-side game logic.
- `offline/artwork/` - the 151 Pokemon sprites used by the game.
- `offline/ui/` - Professor Oak, Eevee, Pokeball, and Team Rocket UI sprites.
- `background jpg/` - habitat and battle background images.

Pokemon metadata and FireRed move data are loaded at runtime from the PokéAPI. Player saves remain in browser `localStorage`.

## Publishing

The repository root is the GitHub Pages publish directory. Keep asset paths relative to `index.html` so the game works at the project-page URL.
