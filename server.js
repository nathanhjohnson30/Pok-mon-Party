const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { EventStore } = require("./lib/event-store");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const store = new EventStore();

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, error) {
  json(response, statusCode, { error: error.message || String(error) });
}

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getContentType(filePath) {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  return "text/html; charset=utf-8";
}

async function serveStatic(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const absolutePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    json(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await fs.readFile(absolutePath);
    response.writeHead(200, {
      "Content-Type": getContentType(absolutePath),
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch (error) {
    sendError(response, 404, new Error("Page not found."));
  }
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/api/pokemon") {
    json(response, 200, { pokemon: store.getPokemonCatalog() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/events") {
    const body = await readBody(request);
    json(response, 201, store.createEvent(body.name));
    return;
  }

  const eventMatch = pathname.match(/^\/api\/events\/([A-Z0-9]+)(?:\/([a-z-]+))?$/);

  if (!eventMatch) {
    throw new Error("API route not found.");
  }

  const [, code, action] = eventMatch;

  if (request.method === "GET" && !action) {
    json(response, 200, store.getEvent(code));
    return;
  }

  if (request.method === "GET" && action === "stream") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    store.openStream(code, response);
    request.on("close", () => store.closeStream(code, response));
    return;
  }

  const body = await readBody(request);

  if (request.method === "POST" && action === "join") {
    json(response, 201, store.joinEvent(code, body.name));
    return;
  }

  if (request.method === "POST" && action === "select-pokemon") {
    json(response, 200, store.choosePokemon(code, body.playerId, body.pokemon));
    return;
  }

  if (request.method === "POST" && action === "ready") {
    json(response, 200, store.setReady(code, body.playerId, body.ready));
    return;
  }

  if (request.method === "POST" && action === "start") {
    json(response, 200, store.startBattle(code, body.playerId));
    return;
  }

  if (request.method === "POST" && action === "move") {
    json(response, 200, store.submitMove(code, body.playerId, body.move));
    return;
  }

  throw new Error("API route not found.");
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    const statusCode = error.message === "API route not found." ? 404 : 400;
    sendError(response, statusCode, error);
  }
});

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Pokémon Party is running at http://0.0.0.0:${PORT}`);
  });
}

module.exports = {
  server,
};
