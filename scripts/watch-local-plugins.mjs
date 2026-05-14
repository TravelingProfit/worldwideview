// scripts/watch-local-plugins.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { syncAll } from "./sync-local-plugins.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOCAL_PLUGINS_DIR = path.join(ROOT, "local-plugins");

if (!fs.existsSync(LOCAL_PLUGINS_DIR)) {
    fs.mkdirSync(LOCAL_PLUGINS_DIR, { recursive: true });
}

let debounceTimeout = null;
let isSyncing = false;
let pendingSync = false;

function handleFileChange(eventType, filename) {
    if (filename && (
        filename.includes("dist") || 
        filename.includes("node_modules") || 
        filename.endsWith(".map") ||
        filename.includes(".git")
    )) return; // ignore build artifacts and git internals
    
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
    }
    
    debounceTimeout = setTimeout(async () => {
        if (isSyncing) {
            pendingSync = true;
            return;
        }
        await runSync(filename);
    }, 500);
}

async function runSync(filename) {
    isSyncing = true;
    console.log(`\n[watch] Change detected in local plugins (file: ${filename}). Syncing...`);
    try {
        await syncAll();
    } catch (err) {
        console.error(`[watch] Sync failed:`, err);
    } finally {
        isSyncing = false;
        if (pendingSync) {
            pendingSync = false;
            await runSync("pending changes");
        }
    }
}

// Initial sync
console.log(`[watch] Starting initial sync...`);
isSyncing = true;
syncAll().then(() => {
    isSyncing = false;
    if (pendingSync) {
        pendingSync = false;
        runSync("pending changes").catch(console.error);
    }
    console.log(`[watch] Watching ${LOCAL_PLUGINS_DIR} for changes...`);
    fs.watch(LOCAL_PLUGINS_DIR, { recursive: true }, handleFileChange);
}).catch(err => {
    isSyncing = false;
    console.error(`[watch] Initial sync failed:`, err);
});
