import { spawn } from "node:child_process";
import { resolve } from "node:path";

let nextRequestId = 0;

const extensionDir = resolve("demo-extension");

const browserProcess = spawn(
  process.env.FIREFOX_BIN ??
    "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
  ["--remote-debugging-port=9222"],
  { stdio: "inherit" },
);

// Wait for the web socket to be ready...
await Bun.sleep(5000);

const socket = new WebSocket("ws://localhost:9222/session");
await new Promise<void>((resolve, reject) => {
  socket.onopen = () => resolve();
  socket.onclose = () => reject(Error("Connection closed"));
  socket.onerror = (err) => reject(Error("Connection error", { cause: err }));
});

const session = await sendSocketRequest(socket, "session.new", {
  capabilities: {},
});
console.log({ session });
const extension = await sendSocketRequest(socket, "webExtension.install", {
  extensionData: {
    type: "path",
    path: extensionDir,
  },
});
console.log({ extension });

function sendSocketRequest<T>(
  socket: WebSocket,
  method: string,
  params: Record<string, any>,
): Promise<T> {
  const id = nextRequestId++;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };

    const onMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.id !== id) return;

      cleanup();
      if (data.type === "success") resolve(data.result);
      else reject(Error(data.message, { cause: data }));
    };
    const onError = (error: any) => {
      cleanup();
      reject(Error("Error sending request", { cause: error }));
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);

    const message = { id, method, params };
    console.log("SENDING", message);
    socket.send(JSON.stringify(message));
  });
}
