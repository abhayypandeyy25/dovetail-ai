// =============================================================================
// Dovetail AI — Harness persistence (IndexedDB)
// =============================================================================
// Until now the harness lost everything on refresh: the chain, the learned
// rules, the labels the calibrator trains on. That made the learning loop a
// demo rather than a mechanism — you cannot accumulate 500 labels in a store
// that empties every time the tab reloads.
//
// This is a small, zero-dependency wrapper over IndexedDB plus a serializer
// for the harness state. It also produces the export bundle the offline
// verifier consumes, which is the same shape a real tenant export would take.
//
// Deliberately NOT localStorage: it is synchronous (blocks the UI), capped
// around 5MB, and stores strings only. A chain of a few thousand receipts
// outgrows it quickly.
// =============================================================================

const DB_NAME = 'dovetail-harness';
const DB_VERSION = 1;
const STORE = 'state';

/** Collections held under the single object store, keyed by name. */
export const KEYS = {
    CHAIN: 'chain',
    RULES: 'rules',
    FEEDBACK: 'feedback',
    CALIBRATION: 'calibration',
    DECISIONS: 'decisions',
    POSTED_KEYS: 'postedKeys',
    META: 'meta'
};

function req(r) {
    return new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}

/**
 * Opens the database. Resolves to null when IndexedDB is unavailable — a
 * private window, blocked site data, or a file:// origin. The harness must
 * still run in that case, just without memory, so every caller treats a null
 * store as "in-memory only" rather than an error.
 */
export async function openStore() {
    if (typeof indexedDB === 'undefined') return null;
    let db;
    try {
        db = await new Promise((resolve, reject) => {
            const open = indexedDB.open(DB_NAME, DB_VERSION);
            open.onupgradeneeded = () => {
                const d = open.result;
                if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
            };
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
            open.onblocked = () => reject(new Error('indexeddb blocked by another tab'));
        });
    } catch {
        return null;
    }

    const tx = (mode) => db.transaction(STORE, mode).objectStore(STORE);

    return {
        available: true,
        async get(key, fallback = null) {
            try {
                const v = await req(tx('readonly').get(key));
                return v === undefined ? fallback : v;
            } catch { return fallback; }
        },
        async set(key, value) {
            try { await req(tx('readwrite').put(value, key)); return true; }
            catch { return false; }
        },
        async clear() {
            try { await req(tx('readwrite').clear()); return true; }
            catch { return false; }
        },
        close() { db.close(); }
    };
}

/** Null-object store, so callers never branch on availability. */
export const memoryStore = {
    available: false,
    async get(_k, fallback = null) { return fallback; },
    async set() { return false; },
    async clear() { return true; },
    close() {}
};

// -----------------------------------------------------------------------------
// Serialization
// -----------------------------------------------------------------------------
// Chain events are frozen and carry their canonical bytes. We keep those bytes
// rather than recomputing on load: if a future code change altered
// canonicalization, recomputing would silently "repair" a chain that should
// have failed verification. Storing the bytes means a canonicalization
// regression shows up as a verification failure, which is the correct
// behaviour.

export function serializeState(state) {
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        chain: {
            entityId: state.chain.entityId,
            events: state.chain.events,
            head: state.chain.head
        },
        rules: state.rules,
        feedback: state.feedback,
        calibration: state.calibration,
        postedKeys: [...state.postedKeys],
        // Decisions carry functions in `trace`; keep only what is replayable.
        decisions: state.decisions.map((d) => ({
            workItemId: d.workItemId,
            route: d.route,
            confidence: d.confidence,
            raw: d.raw,
            modelCalled: d.modelCalled,
            ruleId: d.ruleHit?.rule?.id ?? null,
            account: d.resolved?.account ?? null,
            receiptHash: d.receipt?.this_hash ?? null
        }))
    };
}

export async function saveState(store, state) {
    if (!store?.available) return false;
    const snap = serializeState(state);
    const ok = await Promise.all([
        store.set(KEYS.CHAIN, snap.chain),
        store.set(KEYS.RULES, snap.rules),
        store.set(KEYS.FEEDBACK, snap.feedback),
        store.set(KEYS.CALIBRATION, snap.calibration),
        store.set(KEYS.POSTED_KEYS, snap.postedKeys),
        store.set(KEYS.DECISIONS, snap.decisions),
        store.set(KEYS.META, { version: snap.version, savedAt: snap.savedAt })
    ]);
    return ok.every(Boolean);
}

export async function loadState(store) {
    if (!store?.available) return null;
    const [chain, rules, feedback, calibration, postedKeys, decisions, meta] =
        await Promise.all([
            store.get(KEYS.CHAIN), store.get(KEYS.RULES, []),
            store.get(KEYS.FEEDBACK, []), store.get(KEYS.CALIBRATION, null),
            store.get(KEYS.POSTED_KEYS, []), store.get(KEYS.DECISIONS, []),
            store.get(KEYS.META, null)
        ]);
    if (!chain && !rules.length && !feedback.length) return null;   // nothing saved yet
    return { chain, rules, feedback, calibration, postedKeys, decisions, meta };
}

// -----------------------------------------------------------------------------
// Export bundle — what an auditor (or the verifier) receives
// -----------------------------------------------------------------------------
// Same shape as a real tenant export: the event stream as JSONL, plus the
// metadata needed to verify it independently. Deliberately contains no harness
// code, so a verifier cannot accidentally depend on the implementation that
// produced it.

export function exportBundle(state, meta = {}) {
    return {
        format: 'dovetail-export/v1',
        exportedAt: new Date().toISOString(),
        entity: state.chain.entityId ?? 'CA',
        canonVersion: 'canon/v1',
        eventCount: state.chain.events.length,
        head: state.chain.head,
        // JSONL: one event per line, exactly as the WORM legal copy would hold it.
        eventsJsonl: state.chain.events
            .map((e) => JSON.stringify(e))
            .join('\n'),
        rules: state.rules.map((r) => ({
            id: r.id, status: r.status, description: r.description,
            supportCount: r.supportCount ?? null, confirmedBy: r.confirmedBy ?? null
        })),
        calibration: state.calibration
            ? { n: state.calibration.n, ece: state.calibration.ece }
            : null,
        ...meta
    };
}

export function downloadBundle(bundle, filename = 'dovetail-export.json') {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
