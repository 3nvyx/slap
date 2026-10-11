import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { triggerUsbSlap } from "./ws/device.ts";

/** Opt-in local USB bridge. Never guesses which serial device to open. */
export function startArduinoBridge(): () => void {
  const port = process.env.ARDUINO_PORT;
  const target = process.env.ARDUINO_DEVICE_ID;
  if (!port) return () => {};
  if (!target) throw new Error("ARDUINO_DEVICE_ID is required with ARDUINO_PORT");
  let stopped = false;
  let retry: NodeJS.Timeout | undefined;
  let child: ReturnType<typeof spawn> | undefined;
  function connect() {
    child = spawn(process.env.ARDUINO_PYTHON || "python3", [
      "-u", fileURLToPath(new URL("./scripts/arduino_serial.py", import.meta.url)), port!,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const lines = createInterface({ input: child.stdout! });
    lines.on("line", line => {
      if (line !== "SLAP") { console.log("[arduino]", line); return; }
      void triggerUsbSlap(target!).then(accepted => {
        console.log(`[arduino] SLAP -> ${target}: ${accepted ? "delivered" : "ESP32 offline"}`);
      }).catch(e => console.error("[arduino] slap failed:", e.message));
    });
    child.stderr!.on("data", data => console.warn("[arduino]", data.toString().trim()));
    child.on("error", e => console.warn("[arduino] serial helper:", e.message));
    child.on("close", () => {
      lines.close();
      if (!stopped) retry = setTimeout(connect, 3000);
    });
  }
  connect();
  return () => { stopped = true; clearTimeout(retry); child?.kill(); };
}
