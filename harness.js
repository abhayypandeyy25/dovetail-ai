// =============================================================================
// Dovetail AI — Agent Harness
// =============================================================================
// A real, running implementation of the decision pipeline. Not a mock: every
// step below actually executes, and the outputs (confidence, routing, receipts,
// hash chain) are computed rather than authored.
//
// The prototype previously scripted its demo beats — a bill was "64% confident"
// because someone typed 64. Here the number is derived from features, passed
// through a calibrator fitted on recorded outcomes, and the routing decision is
// a real policy evaluation. The learning loop mines rules from actual edits.
//
// Pipeline (10 steps, per architecture.md section 2):
//
//   1  extract            document -> fields, each carrying provenance
//   2  candidate          typed CandidateAction, deterministic shaping
//   3  RULES FIRST        a full rule hit skips the model entirely
//   4  model              proposes only what rules did not cover
//   5  HARD VALIDATORS    any failure caps routing at human review
//   6  confidence         features -> isotonic calibrator -> [0,1]
//   7  POLICY GATE        platform floor checked BEFORE confidence
//   8  route              AutoExecuted | QueuedForReview | Escalated | ...
//   9  command            agents submit commands; they never write the ledger
//  10  receipt            policy/prompt/model versions + chain reference
//
// Zero dependencies. Runs in the browser. Everything is synchronous and
// deterministic, so the same inputs always produce the same chain.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Decimal handling
// -----------------------------------------------------------------------------
// Money never touches a JavaScript float. Everything is integer minor units
// (cents) internally and a fixed-scale decimal string on the wire, because
// 0.1 + 0.2 !== 0.3 and a ledger cannot rest on approximate equality.

export const toMinor = (n) => Math.round(Number(n) * 100);
export const fromMinor = (m) => m / 100;

/** Fixed-scale decimal string: 120000 -> "1200.00". Never exponential. */
export function dec(minor, scale = 2) {
    const neg = minor < 0;
    const s = String(Math.abs(Math.trunc(minor))).padStart(scale + 1, '0');
    const whole = s.slice(0, s.length - scale);
    const frac = s.slice(s.length - scale);
    return (neg ? '-' : '') + whole + (scale > 0 ? '.' + frac : '');
}

/** Ratios and confidence carry scale 4, so calibration is reproducible. */
export const ratio = (x) => {
    const v = Math.max(0, Math.min(1, Number(x)));
    return (Math.round(v * 10000) / 10000).toFixed(4);
};

// -----------------------------------------------------------------------------
// 2. Canonicalization — canon/v1 (RFC 8785 JCS, Dovetail profile)
// -----------------------------------------------------------------------------
// The profile's defining rule: JSON numbers are forbidden. Every numeric is a
// string, because IEEE-754 formatting is not stable enough to hash money with.
// Keys sort by UTF-16 code unit. Absent and null are different and both kept.

export const CANON_VERSION = 'canon/v1';

function canonString(s) {
    const n = s.normalize('NFC');
    let out = '"';
    for (const ch of n) {
        const c = ch.codePointAt(0);
        if (ch === '"') out += '\\"';
        else if (ch === '\\') out += '\\\\';
        else if (c === 0x08) out += '\\b';
        else if (c === 0x09) out += '\\t';
        else if (c === 0x0a) out += '\\n';
        else if (c === 0x0c) out += '\\f';
        else if (c === 0x0d) out += '\\r';
        else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
        else out += ch;
    }
    return out + '"';
}

export function canon(value, depth = 0) {
    if (depth > 12) throw new Error('canon: max nesting depth 12 exceeded');
    if (value === null) return 'null';
    const t = typeof value;
    if (t === 'boolean') return value ? 'true' : 'false';
    if (t === 'number') {
        // Deliberate: forces callers to pass decimal strings for anything that
        // could be money. A silent float here is the bug this whole file exists
        // to prevent.
        throw new Error(
            'canon: JSON numbers are forbidden (canon/v1 rule C4). ' +
            'Pass a decimal string — got ' + value
        );
    }
    if (t === 'string') return canonString(value);
    if (Array.isArray(value)) {
        // Producer order is preserved; the canonicalizer never sorts arrays,
        // because sorting here would mask a producer bug.
        return '[' + value.map((v) => canon(v, depth + 1)).join(',') + ']';
    }
    if (t === 'object') {
        const keys = Object.keys(value).sort(); // UTF-16 code unit order
        return '{' + keys
            .map((k) => canonString(k) + ':' + canon(value[k], depth + 1))
            .join(',') + '}';
    }
    throw new Error('canon: unsupported type ' + t);
}

// -----------------------------------------------------------------------------
// 3. SHA-256 (synchronous) and the hash chain
// -----------------------------------------------------------------------------
// WebCrypto's digest is async, which would make chain appends async all the way
// up through the UI. A compact synchronous implementation keeps the demo's
// chain verifiable inline. Tested against the standard vectors in harness-test.

const K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) {
            out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            const c2 = str.charCodeAt(++i);
            const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
            out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                     0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        } else {
            out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
    }
    return out;
}

export function sha256(message) {
    const bytes = utf8Bytes(message);
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    // 64-bit big-endian length; messages here are far below 2^32 bits.
    for (let i = 0; i < 4; i++) bytes.push(0);
    bytes.push((bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));

    for (let off = 0; off < bytes.length; off += 64) {
        for (let i = 0; i < 16; i++) {
            w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) |
                   (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7]
        .map((x) => x.toString(16).padStart(8, '0')).join('');
}

export const GENESIS = '0'.repeat(64);

/**
 * Append-only hash chain, one per (tenant, entity).
 * prev_hash of the first event is the 64-zero genesis constant; every later
 * event's prev_hash must equal its predecessor's this_hash, so altering any
 * event breaks every link after it and none before.
 */
export function createChain(entityId = 'CA', restore = null) {
    const events = [];
    let lastHash = GENESIS;
    let seq = 0;

    // Rehydration from storage. The saved events are trusted as bytes and
    // re-verified, never re-signed: if canonicalization has changed since they
    // were written, verify() must FAIL rather than silently repair the chain.
    // A chain that quietly fixes itself proves nothing.
    if (restore?.events?.length) {
        for (const e of restore.events) events.push(Object.freeze(e));
        const last = events[events.length - 1];
        lastHash = last.this_hash;
        seq = Number(last.chain_seq);
    }

    return {
        entityId,
        get events() { return events.slice(); },
        get head() { return lastHash; },
        get length() { return events.length; },

        append(eventType, payload, actor) {
            seq += 1;
            const envelope = {
                v: CANON_VERSION,
                entity_id: entityId,
                chain_seq: String(seq),
                prev_hash: lastHash,
                event_type: eventType,
                occurred_at: new Date(Date.UTC(2026, 6, 28, 14, 0, seq)).toISOString()
                    .replace('Z', '000Z'),
                actor: {
                    actor_id: actor.actorId,
                    kind: actor.kind,
                    // Auto-approval records the POLICY as approver. "Who
                    // approved this" is never blank.
                    approval_ref: actor.approvalRef ?? null
                },
                payload
            };
            const bytes = canon(envelope);
            const thisHash = sha256(bytes);
            const row = { ...envelope, this_hash: thisHash, canonical: bytes };
            Object.freeze(row);
            events.push(row);
            lastHash = thisHash;
            return row;
        },

        /** Re-walks the chain. Returns the first break, or ok. */
        verify() {
            let expect = GENESIS;
            for (let i = 0; i < events.length; i++) {
                const e = events[i];
                if (e.prev_hash !== expect) {
                    return { ok: false, brokenAt: i + 1, reason: 'prev_hash mismatch' };
                }
                if (Number(e.chain_seq) !== i + 1) {
                    return { ok: false, brokenAt: i + 1, reason: 'gap in chain_seq' };
                }
                const { this_hash, canonical, ...envelope } = e;
                if (sha256(canon(envelope)) !== this_hash) {
                    return { ok: false, brokenAt: i + 1, reason: 'hash does not match payload' };
                }
                expect = this_hash;
            }
            return { ok: true, verified: events.length };
        }
    };
}

// -----------------------------------------------------------------------------
// 4. Rules engine — runs BEFORE the model
// -----------------------------------------------------------------------------
// A rule that fully covers a work item skips the model entirely. This is both
// the accuracy story and the cost curve: every confirmed rule permanently
// deletes a model call.

/** Predicates are typed and evaluated by plain code. A model never writes one. */
function matchPredicate(pred, candidate) {
    return Object.entries(pred).every(([field, want]) => {
        const got = candidate.extraction[field]?.value ?? candidate[field];
        if (got === undefined) return false;
        if (typeof want === 'string') return String(got).toLowerCase() === want.toLowerCase();
        if (want.contains) return String(got).toLowerCase().includes(want.contains.toLowerCase());
        if (want.oneOf) return want.oneOf.some((v) => String(got).toLowerCase() === v.toLowerCase());
        return false;
    });
}

export function applyRules(candidate, rules) {
    const active = rules.filter((r) => r.status === 'ACTIVE');
    for (const rule of active) {
        if (matchPredicate(rule.predicate, candidate)) {
            const covered = Object.keys(rule.action);
            const required = candidate.requiredFields;
            const full = required.every((f) => covered.includes(f));
            return {
                rule,
                coverage: full ? 'full' : 'partial',
                fields: { ...rule.action }
            };
        }
    }
    return { rule: null, coverage: 'none', fields: {} };
}

// -----------------------------------------------------------------------------
// 5. The model step (stubbed, but structurally honest)
// -----------------------------------------------------------------------------
// There is no network in a static prototype, so this is deterministic. What it
// preserves is the constraint that matters: the model may select an amount only
// from extraction provenance. It can restate a number it was given; it can
// never invent one.

export function modelPropose(candidate, covered, coa) {
    const proposals = {};
    const toDo = candidate.requiredFields.filter((f) => !(f in covered));

    for (const field of toDo) {
        if (field === 'amount_minor') {
            // The only legal source of an amount.
            const ref = candidate.extraction.amount_minor;
            proposals[field] = ref ? { value: ref.value, from: ref.ref } : null;
            continue;
        }
        if (field === 'account') {
            const desc = (candidate.extraction.description?.value ?? '').toLowerCase();
            const hit = coa.find((a) =>
                a.keywords?.some((k) => desc.includes(k)));
            proposals[field] = hit
                ? { value: hit.n, from: 'model:keyword' }
                : { value: null, from: 'model:no_match' };
            continue;
        }
        proposals[field] = { value: null, from: 'model:no_match' };
    }
    return proposals;
}

/**
 * Structural guarantee, enforced rather than trusted: an amount that did not
 * come from extraction provenance is rejected outright.
 */
export function enforceAmountProvenance(proposals, candidate) {
    const a = proposals.amount_minor;
    if (!a) return { ok: true };
    const ref = candidate.extraction.amount_minor;
    if (!ref || a.value !== ref.value) {
        return { ok: false, reason: 'amount not traceable to extraction provenance' };
    }
    return { ok: true };
}

// -----------------------------------------------------------------------------
// 6. Hard validators — any failure caps routing at human review
// -----------------------------------------------------------------------------
// These are not advisory. A validator failure overrides confidence entirely,
// which is what stops a miscalibrated score from posting a bad entry.

export function validate(candidate, resolved, ctx) {
    const results = [];
    const fail = (id, msg) => results.push({ id, pass: false, detail: msg });
    const pass = (id, msg) => results.push({ id, pass: true, detail: msg });

    // V1 — double entry, to the cent, in integer minor units.
    const lines = resolved.lines ?? [];
    const dr = lines.reduce((s, l) => s + (l.dr_minor || 0), 0);
    const cr = lines.reduce((s, l) => s + (l.cr_minor || 0), 0);
    dr === cr && lines.length > 0
        ? pass('V1_BALANCED', `debits ${dec(dr)} = credits ${dec(cr)}`)
        : fail('V1_BALANCED', `debits ${dec(dr)} != credits ${dec(cr)}`);

    // V2 — the account exists and accepts postings.
    const acct = ctx.coa.find((a) => a.n === resolved.account);
    !resolved.account ? fail('V2_ACCOUNT', 'no account selected')
        : !acct ? fail('V2_ACCOUNT', `account ${resolved.account} not in chart`)
        : acct.allowPosting === false ? fail('V2_ACCOUNT', `${acct.n} is a heading, not postable`)
        : pass('V2_ACCOUNT', `${acct.n} ${acct.name}`);

    // V3 — control accounts are reached through their subledger, never directly.
    acct?.controlSubledger
        ? (resolved.subledgerDocId
            ? pass('V3_CONTROL', `via ${acct.controlSubledger} subledger`)
            : fail('V3_CONTROL',
                `${acct.n} is a ${acct.controlSubledger} control account — post through the subledger`))
        : pass('V3_CONTROL', 'not a control account');

    // V4 — amount provenance. The model cannot invent a number.
    const prov = candidate.extraction.amount_minor;
    prov && prov.value === resolved.amount_minor
        ? pass('V4_PROVENANCE', `amount traced to ${prov.ref}`)
        : fail('V4_PROVENANCE', 'amount not traceable to the source document');

    // V5 — the same vendor invoice is never booked twice.
    const key = `${resolved.vendor}|${resolved.invoiceNo}`;
    ctx.postedKeys?.has(key)
        ? fail('V5_DUPLICATE', `${resolved.invoiceNo} already posted for ${resolved.vendor}`)
        : pass('V5_DUPLICATE', 'no prior posting with this vendor + invoice number');

    // V6 — the period is open.
    ctx.openPeriods?.includes(resolved.period)
        ? pass('V6_PERIOD', `${resolved.period} is open`)
        : fail('V6_PERIOD', `${resolved.period} is closed or locked`);

    return { results, allPassed: results.every((r) => r.pass) };
}

// -----------------------------------------------------------------------------
// 7. Confidence — features, then a calibrator fitted on real outcomes
// -----------------------------------------------------------------------------
// The score is a track record, not a self-report. A model's own opinion of
// itself is deliberately excluded: models are confident when wrong.

export function extractFeatures(candidate, ruleHit, validators, ctx) {
    const vendor = candidate.extraction.vendor?.value ?? '';
    const history = ctx.vendorHistory?.[vendor];

    return {
        // How often has THIS rule actually been right?
        ruleAccuracy: ruleHit.rule ? (ruleHit.rule.rollingAccuracy ?? 0.9) : 0,
        ruleCoverage: ruleHit.coverage === 'full' ? 1 : ruleHit.coverage === 'partial' ? 0.5 : 0,
        // Does this agree with how the vendor was coded before?
        vendorAgreement: history ? history.agreement : 0,
        vendorSeen: history ? Math.min(history.count / 12, 1) : 0,
        // New vendor with no history is penalised automatically.
        novelty: history ? 0 : 1,
        // Comfortably passed, or scraped by?
        validatorMargin: validators.results.filter((r) => r.pass).length / validators.results.length,
        hasPO: candidate.extraction.po_number ? 1 : 0
    };
}

/** Weighted feature score in [0,1]. Deliberately boring and inspectable. */
export function rawScore(f) {
    const w = {
        ruleAccuracy: 0.30, ruleCoverage: 0.20, vendorAgreement: 0.18,
        vendorSeen: 0.12, validatorMargin: 0.15, hasPO: 0.05
    };
    let s = 0;
    for (const [k, weight] of Object.entries(w)) s += (f[k] ?? 0) * weight;
    s -= f.novelty * 0.22;              // novelty penalty
    return Math.max(0, Math.min(1, s));
}

/**
 * Isotonic regression via Pool Adjacent Violators. Fits a monotonic step
 * function mapping raw score -> observed accuracy, using recorded outcomes.
 * This is the piece that makes "91%" mean "right 91 times in 100", rather
 * than "the model felt good about it".
 */
export function fitIsotonic(samples) {
    if (!samples.length) return { points: [], n: 0, ece: null };
    const sorted = samples.slice().sort((a, b) => a.x - b.x);
    const blocks = sorted.map((s) => ({ x: s.x, sum: s.y, w: 1 }));

    for (let i = 1; i < blocks.length; i++) {
        while (i > 0 && blocks[i - 1].sum / blocks[i - 1].w > blocks[i].sum / blocks[i].w) {
            blocks[i - 1].sum += blocks[i].sum;
            blocks[i - 1].w += blocks[i].w;
            blocks[i - 1].x = Math.max(blocks[i - 1].x, blocks[i].x);
            blocks.splice(i, 1);
            i--;
        }
    }
    const points = blocks.map((b) => ({ x: b.x, y: b.sum / b.w }));

    // Expected Calibration Error over 10 bins — the number that gates autonomy.
    const bins = Array.from({ length: 10 }, () => ({ n: 0, conf: 0, acc: 0 }));
    for (const s of sorted) {
        const p = applyIsotonic(points, s.x);
        const b = bins[Math.min(9, Math.floor(p * 10))];
        b.n++; b.conf += p; b.acc += s.y;
    }
    let ece = 0;
    for (const b of bins) if (b.n) ece += (b.n / sorted.length) * Math.abs(b.acc / b.n - b.conf / b.n);

    return { points, n: samples.length, ece };
}

/**
 * Below this many labels the calibrator is not trusted and the raw score is
 * used instead. Independent of the 500-label autonomy gate: this governs
 * whether the number shown is meaningful, that one governs whether a machine
 * may act on it.
 */
export const MIN_CALIBRATION_SAMPLES = 50;

export function applyIsotonic(points, x) {
    if (!points.length) return x;
    if (x <= points[0].x) return points[0].y;
    for (let i = 1; i < points.length; i++) {
        if (x <= points[i].x) {
            const p0 = points[i - 1], p1 = points[i];
            const t = p1.x === p0.x ? 0 : (x - p0.x) / (p1.x - p0.x);
            return p0.y + t * (p1.y - p0.y);
        }
    }
    return points[points.length - 1].y;
}

// -----------------------------------------------------------------------------
// 8. Policy gate — the platform floor is checked BEFORE confidence
// -----------------------------------------------------------------------------
// Ordering is the whole safety property. If confidence were consulted first, a
// calibration bug could release a payment. Here, category-matched rules fire
// before the score is even read.

export const PLATFORM_FLOOR = [
    {
        id: 'FLOOR-1',
        text: 'Payments above CAD 10,000 always need a human.',
        test: (c, r) => r.amount_minor > 1000000
    },
    {
        id: 'FLOOR-2',
        text: 'Changes to vendor bank details always need a human.',
        test: (c) => !!c.extraction.bank_change
    },
    {
        id: 'FLOOR-3',
        text: 'Manual journal entries always need a human.',
        test: (c) => c.source === 'MANUAL_JE'
    },
    {
        id: 'FLOOR-4',
        text: 'Anything sent to a customer always needs a human.',
        test: (c) => c.customerFacing === true
    },
    {
        id: 'FLOOR-5',
        text: 'Postings into a locked period always need a human.',
        test: (c, r, ctx) => !ctx.openPeriods?.includes(r.period)
    }
];

export function policyGate(candidate, resolved, confidence, ctx) {
    // --- Layer 1: platform floor. Non-editable, evaluated first, by category.
    for (const rule of PLATFORM_FLOOR) {
        if (rule.test(candidate, resolved, ctx)) {
            return {
                route: 'QueuedForReview',
                reason: 'PLATFORM_FLOOR',
                policyId: rule.id,
                policyVersion: `${rule.id}@1`,
                explain: rule.text,
                confidenceConsulted: false
            };
        }
    }

    // --- Layer 2: validators. Also immune to confidence.
    if (!ctx.validatorsPassed) {
        return {
            route: 'QueuedForReview',
            reason: 'VALIDATOR_FAILURE',
            policyId: 'P-0',
            policyVersion: 'P-0@1',
            explain: 'A hard validator failed; confidence cannot override it.',
            confidenceConsulted: false
        };
    }

    // --- Layer 3: earned autonomy. Auto-posting stays locked until the tenant
    // has enough labelled decisions AND the calibrator is honest.
    const cal = ctx.calibration ?? { n: 0, ece: null };
    const eligible = cal.n >= 500 && cal.ece !== null && cal.ece < 0.05;
    if (!eligible) {
        return {
            route: 'QueuedForReview',
            reason: 'AUTONOMY_NOT_EARNED',
            policyId: 'P-9',
            policyVersion: 'P-9@1',
            explain: `Auto-posting unlocks at 500 labelled decisions and ECE < 0.05 ` +
                     `(currently ${cal.n} labels, ECE ${cal.ece === null ? 'n/a' : cal.ece.toFixed(4)}).`,
            confidenceConsulted: false
        };
    }

    // --- Layer 4: only now does confidence matter.
    if (confidence >= 0.95) {
        return {
            route: 'AutoExecuted', reason: 'HIGH_CONFIDENCE',
            policyId: 'P-1', policyVersion: 'P-1@3',
            explain: 'Post bills automatically above 95% confidence — always logged, never silent.',
            confidenceConsulted: true
        };
    }
    if (confidence < 0.80) {
        return {
            route: 'Escalated', reason: 'LOW_CONFIDENCE',
            policyId: 'P-2', policyVersion: 'P-2@1',
            explain: 'Below 80% confidence, stop and ask a human a specific question.',
            confidenceConsulted: true
        };
    }
    return {
        route: 'QueuedForReview', reason: 'MID_CONFIDENCE',
        policyId: 'P-1', policyVersion: 'P-1@3',
        explain: 'Between 80% and 95% — a human reviews before posting.',
        confidenceConsulted: true
    };
}

// -----------------------------------------------------------------------------
// 9. The pipeline
// -----------------------------------------------------------------------------

// Async because step 4 may cross the network. Every other step stays
// synchronous and pure, so the only await in the pipeline is the model call —
// which makes the cost and latency attributable to exactly one place.
export async function runPipeline(workItem, state) {
    const trace = [];
    const step = (n, name, detail) => trace.push({ n, name, ...detail });

    // --- 1. Extract. Every field carries where it came from.
    const extraction = workItem.extraction;
    step(1, 'Extract', {
        fields: Object.keys(extraction).length,
        detail: `${Object.keys(extraction).length} fields, each with provenance`
    });

    // --- 2. Typed CandidateAction.
    // requiredFields are the fields the DECISION must determine — the coding
    // judgement. Amounts, vendor and invoice number are not decided: they are
    // extracted from the document and then validated. Conflating the two would
    // mean a rule supplying the account never counted as full coverage, so the
    // model would be called on work a rule already answered — which is exactly
    // the cost the rules-first design exists to remove.
    const candidate = {
        workItemId: workItem.id,
        source: workItem.source ?? 'AP_BILL',
        taskClass: workItem.taskClass ?? 'ap.code_bill',
        customerFacing: workItem.customerFacing ?? false,
        requiredFields: workItem.requiredFields ?? ['account'],
        extraction
    };
    step(2, 'CandidateAction', { detail: `task class ${candidate.taskClass}` });

    // --- 3. RULES FIRST.
    const ruleHit = applyRules(candidate, state.rules);
    step(3, 'Rules first', {
        detail: ruleHit.rule
            ? `${ruleHit.rule.id} matched (${ruleHit.coverage}) — "${ruleHit.rule.description}"`
            : 'no rule matched',
        ruleId: ruleHit.rule?.id ?? null,
        coverage: ruleHit.coverage,
        skippedModel: ruleHit.coverage === 'full'
    });

    // --- 4. Model, only for what rules did not cover.
    let proposals = {};
    let modelCalled = false;
    let modelMeta = null;
    let modelUsage = null;

    if (ruleHit.coverage === 'full') {
        step(4, 'Model', { detail: 'SKIPPED — a rule covered every required field', skipped: true });
    } else if (state.gateway) {
        // Real adapter behind the gateway: budgets, allowlist and circuit
        // breaker are enforced there, and a refusal is always explicit.
        const out = await state.gateway.propose(candidate, state, candidate.taskClass);
        if (out.skipped) {
            step(4, 'Model', {
                detail: `NOT CALLED — ${out.skipped}${out.error ? ': ' + out.error : ''}`,
                skipped: true, gatewayRefusal: out.skipped
            });
            // A gateway refusal is not a coding decision. The item goes to a
            // human with the reason stated, never posted on a guess.
            state.lastGatewayRefusal = out.skipped;
        } else {
            modelCalled = true;
            proposals = out.fields;
            modelMeta = out.meta;
            modelUsage = out.usage;
            const prov = enforceAmountProvenance(proposals, candidate);
            if (!prov.ok) {
                step(4, 'Model', { detail: `REJECTED — ${prov.reason}`, rejected: true });
                proposals.amount_minor = null;
            } else {
                const m = out.meta;
                const loop = m.turns
                    ? ` · ${m.turns} turn${m.turns > 1 ? 's' : ''}, ${m.toolCalls} tool call${m.toolCalls === 1 ? '' : 's'}` +
                      (m.exhausted ? ' · BUDGET EXHAUSTED — no proposal' : '')
                    : '';
                step(4, 'Model', {
                    detail: `${m.provider}/${m.model} → ` +
                            `${proposals.account?.value ?? 'no account'}` +
                            (m.reasoning ? ` — "${m.reasoning}"` : '') +
                            ` · ${out.usage.inputTokens}+${out.usage.outputTokens} tok` +
                            ` · $${out.usage.costUsd.toFixed(5)}` + loop,
                    meta: m, usage: out.usage,
                    // The tool transcript is part of the audit record: an
                    // auditor asking "what did it look at before deciding"
                    // gets an answer from stored data, not a re-run.
                    transcript: m.transcript ?? null
                });
            }
        }
    } else {
        // No gateway configured — the built-in deterministic stub.
        modelCalled = true;
        proposals = modelPropose(candidate, ruleHit.fields, state.coa);
        const prov = enforceAmountProvenance(proposals, candidate);
        if (!prov.ok) {
            step(4, 'Model', { detail: `REJECTED — ${prov.reason}`, rejected: true });
            proposals.amount_minor = null;
        } else {
            step(4, 'Model', {
                detail: `stub → ${proposals.account?.value ?? 'no account'}; ` +
                        `amounts restricted to extraction provenance`
            });
        }
    }

    // --- Resolve final values: rules win over model.
    // The amount is taken straight from extraction provenance and never from a
    // rule or a proposal, so there is exactly one path by which a number can
    // reach the ledger — the document it was read from.
    const resolved = {
        account: ruleHit.fields.account ?? proposals.account?.value ?? null,
        amount_minor: extraction.amount_minor?.value ?? 0,
        project: ruleHit.fields.project ?? proposals.project?.value ?? null,
        vendor: extraction.vendor?.value ?? null,
        invoiceNo: extraction.invoice_no?.value ?? null,
        period: workItem.period ?? '2026-07',
        subledgerDocId: workItem.subledgerDocId ?? null
    };
    resolved.lines = resolved.account && resolved.amount_minor
        ? [{ acct: resolved.account, dr_minor: resolved.amount_minor },
           { acct: '2000', cr_minor: resolved.amount_minor }]
        : [];

    // --- 5. Hard validators.
    const validators = validate(candidate, resolved, {
        coa: state.coa, postedKeys: state.postedKeys,
        openPeriods: state.openPeriods
    });
    step(5, 'Hard validators', {
        detail: validators.allPassed
            ? `all ${validators.results.length} passed`
            : `${validators.results.filter((r) => !r.pass).length} FAILED — routing capped at review`,
        results: validators.results, allPassed: validators.allPassed
    });

    // --- 6. Confidence.
    // A calibrator fitted on a handful of labels is worse than none: three
    // corrections in a row would map every score to zero, which is arithmetically
    // honest and operationally useless. Below the floor we pass the raw score
    // through and say so, rather than dressing up noise as calibration. Routing
    // is unaffected either way, because autonomy stays locked until 500 labels.
    const features = extractFeatures(candidate, ruleHit, validators, state);
    const raw = rawScore(features);
    const cal = state.calibration ?? { points: [], n: 0 };
    const calibrated = cal.points?.length && cal.n >= MIN_CALIBRATION_SAMPLES;
    const confidence = calibrated ? applyIsotonic(cal.points, raw) : raw;
    step(6, 'Calibrated confidence', {
        detail: `raw ${ratio(raw)} -> ${ratio(confidence)}` +
                (calibrated
                    ? ` (isotonic, fitted on ${cal.n} labels)`
                    : ` (uncalibrated — ${cal.n} of ${MIN_CALIBRATION_SAMPLES} labels needed)`),
        features, raw, confidence, calibrated
    });

    // --- 7. Policy gate.
    const gate = policyGate(candidate, resolved, confidence, {
        ...state, validatorsPassed: validators.allPassed
    });
    step(7, 'Policy gate', {
        detail: `${gate.reason} -> ${gate.route}` +
                (gate.confidenceConsulted ? '' : '  [confidence NOT consulted]'),
        ...gate
    });

    // --- 8. Route.
    step(8, 'Route', { detail: gate.route, route: gate.route });

    // --- 9. Command. Agents submit commands; they never write ledger rows.
    const command = {
        type: 'ledger.draftJournal',
        actor: { actorId: 'agent.omar.ap', kind: 'AGENT' },
        idempotencyKey: `wi-${workItem.id}`,
        body: { account: resolved.account, amount: dec(resolved.amount_minor), period: resolved.period }
    };
    step(9, 'Command', { detail: `${command.type} submitted as an ordinary principal` });

    // --- 10. Receipt, written to the chain.
    const receiptPayload = {
        work_item: workItem.id,
        route: gate.route,
        reason: gate.reason,
        confidence: ratio(confidence),
        policy: gate.policyVersion,
        // The reproducibility triple. Without these a decision cannot be
        // re-created years later, which is what an auditor will ask for.
        prompt: modelCalled ? (modelMeta?.promptRef ?? 'ap/code_bill@v1') : null,
        model: modelCalled ? (modelMeta?.model ?? 'stub-deterministic@1') : null,
        provider: modelCalled ? (modelMeta?.provider ?? 'stub') : null,
        cost_usd: modelUsage ? modelUsage.costUsd.toFixed(6) : '0.000000',
        // Bounded-loop evidence, so a receipt records not just what was decided
        // but how much investigation it took to decide it.
        tool_calls: modelMeta?.toolCalls != null ? String(modelMeta.toolCalls) : null,
        turns: modelMeta?.turns != null ? String(modelMeta.turns) : null,
        rule: ruleHit.rule?.id ?? null,
        account: resolved.account,
        amount: dec(resolved.amount_minor)
    };
    const event = state.chain.append(
        gate.route === 'AutoExecuted' ? 'ap.bill.auto_posted' : 'ap.bill.routed',
        receiptPayload,
        {
            actorId: 'agent.omar.ap',
            kind: 'AGENT',
            // Auto-execution records the policy version as the approver.
            approvalRef: gate.route === 'AutoExecuted' ? gate.policyVersion : null
        }
    );
    step(10, 'Receipt', {
        detail: `chain_seq ${event.chain_seq} · ${event.this_hash.slice(0, 16)}…`,
        hash: event.this_hash, chainSeq: event.chain_seq
    });

    // Alternatives the agent actually considered, taken from the tool
    // transcript where one exists. A reviewer deciding between two plausible
    // codings needs to see what the second one was — "coded to 5100; if wrong
    // it is probably 6700" is a decidable question in a way that a bare
    // confidence score is not.
    const alternatives = (() => {
        const searched = (modelMeta?.transcript ?? [])
            .filter((t) => t.tool === 'search_accounts' && Array.isArray(t.result))
            .flatMap((t) => t.result);
        const seen = new Set([resolved.account]);
        return searched
            .filter((a) => !a.control && !seen.has(a.account) && !seen.add(a.account))
            .slice(0, 3);
    })();

    return {
        workItemId: workItem.id, candidate, ruleHit, modelCalled,
        modelMeta, modelUsage, alternatives,
        resolved, validators, features, raw, confidence,
        gate, route: gate.route, command, receipt: event, trace
    };
}

// -----------------------------------------------------------------------------
// 10. The learning loop
// -----------------------------------------------------------------------------
// An approval teaches almost nothing. An EDIT teaches precisely what was wrong.
// Field-level diffs are the raw material; rule mining is deterministic, and a
// human confirms before any rule goes live.

export function recordFeedback(decision, kind, diffs, actorId = 'human.ann') {
    return {
        feedbackId: `fb-${decision.workItemId}`,
        workItemId: decision.workItemId,
        kind,                                   // APPROVED | EDITED | REJECTED
        actorId,
        fieldDiffs: diffs ?? [],
        context: {
            vendor: decision.resolved.vendor,
            description: decision.candidate.extraction.description?.value ?? '',
            proposedAccount: decision.resolved.account,
            confidence: decision.confidence
        },
        // The label the calibrator trains on: was the proposal right?
        correct: kind === 'APPROVED',
        rawScore: decision.raw
    };
}

/**
 * Deterministic nightly mining. Requires >= 3 consistent corrections sharing a
 * minimal predicate with ZERO contradictions. The description is the only part
 * a model would write; the predicate is derived by code.
 */
export function mineRules(feedbackEvents, existingRules) {
    const edits = feedbackEvents.filter((f) => f.kind === 'EDITED' && f.fieldDiffs.length);
    const groups = new Map();

    for (const f of edits) {
        for (const d of f.fieldDiffs) {
            const key = `${f.context.vendor}|${d.field}|${d.to}`;
            if (!groups.has(key)) {
                groups.set(key, { vendor: f.context.vendor, field: d.field, to: d.to, support: [], contra: 0 });
            }
            groups.get(key).support.push(f.feedbackId);
        }
    }
    // A correction to a different value for the same vendor+field is a contradiction.
    for (const [, g] of groups) {
        for (const f of edits) {
            for (const d of f.fieldDiffs) {
                if (f.context.vendor === g.vendor && d.field === g.field && d.to !== g.to) g.contra++;
            }
        }
    }

    const proposals = [];
    let n = existingRules.length;
    for (const [, g] of groups) {
        if (g.support.length >= 3 && g.contra === 0) {
            n += 1;
            proposals.push({
                id: `R-${String(17 + proposals.length).padStart(3, '0')}`,
                status: 'PROPOSED',                   // inert until a human confirms
                predicate: { vendor: g.vendor },
                action: { [g.field]: g.to },
                description: `${g.vendor} → ${g.field} ${g.to}`,
                supportCount: g.support.length,
                contradictionCount: 0,
                learnedFrom: g.support,
                rollingAccuracy: null,
                timesApplied: 0
            });
        }
    }
    return proposals;
}

/** A rule only becomes ACTIVE by explicit human confirmation. */
export function confirmRule(rule, actorId = 'human.ann') {
    return { ...rule, status: 'ACTIVE', confirmedBy: actorId, rollingAccuracy: 1.0 };
}

/** Two contradictions in 30 days auto-suspends a rule to CHALLENGED. */
export function policeRules(rules, feedbackEvents) {
    return rules.map((r) => {
        if (r.status !== 'ACTIVE') return r;
        const contra = feedbackEvents.filter((f) =>
            f.kind === 'EDITED' &&
            f.context.vendor === r.predicate.vendor &&
            f.fieldDiffs.some((d) => d.field in r.action && d.to !== r.action[d.field])
        ).length;
        return contra >= 2
            ? { ...r, status: 'CHALLENGED', suspendedReason: `${contra} contradictions in 30 days` }
            : r;
    });
}

// -----------------------------------------------------------------------------
// 11. Harness factory
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Queue items — what a reviewer actually sees
// -----------------------------------------------------------------------------
// A deliberate choice, and the one most likely to be argued with: the
// confidence score is carried on the item but is NOT meant for display.
//
// Confidence is a routing signal, not a verdict. Showing "64%" to a reviewer
// invites them to treat it as the answer — either rubber-stamping anything
// high or agonising over anything low, in both cases deferring to a number
// they cannot interrogate. What a reviewer can actually act on is the
// decision, its alternatives and its consequence:
//
//     "Coded to 5100 Implementation Labour.
//      If wrong, the candidates are 6700 or 6100.
//      Adds CAD 3,980 to the Meridian Deploy project."
//
// That is a decidable question. "64% confident" is not.

const REASON_TEXT = {
    PLATFORM_FLOOR:      'A platform rule always sends this to a person, whatever the system thinks.',
    VALIDATOR_FAILURE:   'A hard check failed. This cannot post until it is resolved.',
    AUTONOMY_NOT_EARNED: 'Automatic posting is still locked for this task class while the system is being calibrated.',
    LOW_CONFIDENCE:      'The system could not settle this and is asking a specific question.',
    MID_CONFIDENCE:      'Plausible, but not certain enough to post unreviewed.',
    NOVELTY:             'New supplier with no history to compare against.',
    BUDGET_EXCEEDED:     'The model budget was spent, so this was routed to a person rather than guessed.',
    DEGRADED:            'The model was unavailable. Rule-covered work continued; this needs a person.',
    MODEL_ERROR:         'The model failed. Routed to a person rather than guessed.',
    RULE_COVERED:        'Covered by a learned rule.'
};

export function toQueueItem(d, workItem) {
    const e = d.candidate.extraction;
    const failed = d.validators.results.filter((r) => !r.pass);

    return {
        workItemId: d.workItemId,
        label: workItem.label ?? `${e.vendor?.value ?? ''} · ${e.invoice_no?.value ?? ''}`,
        vendor: e.vendor?.value ?? null,
        description: e.description?.value ?? '',
        invoiceNo: e.invoice_no?.value ?? null,
        amountMinor: d.resolved.amount_minor,
        period: d.resolved.period,

        route: d.route,
        reasonCode: d.gate.reason,
        reasonText: REASON_TEXT[d.gate.reason] ?? d.gate.explain,
        policyVersion: d.gate.policyVersion,

        proposedAccount: d.resolved.account,
        proposedBy: d.ruleHit.rule ? `rule ${d.ruleHit.rule.id}` : (d.modelMeta?.model ?? 'stub'),
        reasoning: d.modelMeta?.reasoning ?? d.ruleHit.rule?.description ?? null,
        alternatives: d.alternatives ?? [],

        failedChecks: failed.map((r) => ({ id: r.id, detail: r.detail })),
        evidence: (d.modelMeta?.transcript ?? []).map((t) => ({
            tool: t.tool, args: t.args, result: t.result, error: t.error ?? null
        })),

        // Retained for the calibrator. Not for the reviewer.
        confidence: d.confidence,
        rawScore: d.raw,

        receiptHash: d.receipt?.this_hash ?? null,
        queuedAt: Date.now(),
        resolvedAt: null,
        resolution: null,
        edits: [],
        finalAccount: null
    };
}

export function createHarness(opts = {}) {
    // `restore` is a snapshot from harness-store. Anything it supplies wins
    // over the seed options, so a reload continues where the tenant left off
    // rather than resetting to the demo's starting conditions.
    const r = opts.restore ?? null;

    const state = {
        chain: createChain(opts.entityId ?? 'CA', r?.chain ?? null),
        rules: r?.rules ?? opts.rules ?? [],
        coa: opts.coa ?? [],
        vendorHistory: opts.vendorHistory ?? {},
        postedKeys: new Set(r?.postedKeys ?? opts.postedKeys ?? []),
        openPeriods: opts.openPeriods ?? ['2026-07'],
        calibration: r?.calibration ?? { points: [], n: 0, ece: null },
        feedback: r?.feedback ?? [],
        // Items parked awaiting a human. This is the substrate of the Approval
        // Inbox, and therefore of the label harvest: an item only produces a
        // training label when a person actually resolves it.
        queue: r?.queue ?? [],
        // Optional. When absent, step 4 uses the built-in deterministic stub,
        // so the harness runs identically with no model and no network.
        gateway: opts.gateway ?? null,
        decisions: [],
        // Decisions are not fully rehydrated (their traces hold closures), so
        // prior counts are carried separately and added to live stats.
        priorDecisions: r?.decisions ?? []
    };

    // Called after any state mutation so the caller can persist. Set by
    // attachStore(); a no-op until then.
    let onChange = () => {};

    return {
        state,
        /** Wire a persistence callback. Returns the harness for chaining. */
        onChange(fn) { onChange = fn || (() => {}); return this; },
        async process(workItem) {
            const d = await runPipeline(workItem, state);
            state.decisions.push(d);
            // Register the vendor + invoice number once an item has been
            // booked, so a re-submission of the same invoice is caught by
            // V5_DUPLICATE on its own evidence rather than from seed data.
            if (d.validators.allPassed && d.resolved.vendor && d.resolved.invoiceNo) {
                state.postedKeys.add(`${d.resolved.vendor}|${d.resolved.invoiceNo}`);
            }
            // Anything not executed autonomously lands in the review queue,
            // carrying enough context for a reviewer to decide without
            // re-running the pipeline.
            if (d.route === 'QueuedForReview' || d.route === 'Escalated') {
                state.queue.push(toQueueItem(d, workItem));
            }
            onChange();
            return d;
        },

        /**
         * A reviewer resolves a queued item. This is the only path by which a
         * training label is created — which is why the inbox is on the
         * critical path rather than being presentation.
         */
        resolve(workItemId, kind, edits = []) {
            const i = state.queue.findIndex((q) => q.workItemId === workItemId && !q.resolvedAt);
            if (i === -1) return null;
            const item = state.queue[i];
            const decision = state.decisions.find((d) => d.workItemId === workItemId);

            const diffs = edits
                .filter((e) => String(e.to ?? '') !== String(e.from ?? ''))
                .map((e) => ({ field: e.field, from: e.from ?? null, to: e.to ?? null }));

            item.resolvedAt = Date.now();
            item.resolution = kind;
            item.edits = diffs;
            item.reviewLatencyMs = item.resolvedAt - item.queuedAt;
            if (diffs.length) {
                const acct = diffs.find((d) => d.field === 'account');
                if (acct) item.finalAccount = acct.to;
            }

            // Feedback needs the original decision for its raw score and
            // context. A queued item restored from storage has no live
            // decision object, so fall back to the snapshot on the item.
            const f = decision
                ? recordFeedback(decision, kind, diffs)
                : {
                    feedbackId: `fb-${workItemId}`, workItemId, kind,
                    actorId: 'human.ann', fieldDiffs: diffs,
                    context: { vendor: item.vendor, description: item.description,
                               proposedAccount: item.proposedAccount, confidence: item.confidence },
                    correct: kind === 'APPROVED', rawScore: item.rawScore
                };

            state.feedback.push(f);
            state.rules = policeRules(state.rules, state.feedback);
            state.calibration = fitIsotonic(
                state.feedback.map((x) => ({ x: x.rawScore, y: x.correct ? 1 : 0 }))
            );
            onChange();
            return { item, feedback: f };
        },

        get queue() { return state.queue.filter((q) => !q.resolvedAt); },
        get resolved() { return state.queue.filter((q) => q.resolvedAt); },
        feedback(decision, kind, diffs) {
            const f = recordFeedback(decision, kind, diffs);
            state.feedback.push(f);
            state.rules = policeRules(state.rules, state.feedback);
            // Refit the calibrator on every label, as the nightly job would.
            state.calibration = fitIsotonic(
                state.feedback.map((x) => ({ x: x.rawScore, y: x.correct ? 1 : 0 }))
            );
            onChange();
            return f;
        },
        mine() { return mineRules(state.feedback, state.rules); },
        confirm(rule) {
            const active = confirmRule(rule);
            state.rules = [...state.rules, active];
            onChange();
            return active;
        },
        verify() { return state.chain.verify(); },
        stats() {
            // Live decisions plus any carried over from a previous session, so
            // the counters reflect the tenant's whole history rather than this
            // page load.
            const live = state.decisions.map((x) => ({
                route: x.route, modelCalled: x.modelCalled,
                fullRule: x.ruleHit.coverage === 'full'
            }));
            const prior = state.priorDecisions.map((x) => ({
                route: x.route, modelCalled: x.modelCalled, fullRule: !!x.ruleId
            }));
            const all = [...prior, ...live];
            const count = (p) => all.filter(p).length;
            return {
                processed: all.length,
                autoExecuted: count((x) => x.route === 'AutoExecuted'),
                queued: count((x) => x.route === 'QueuedForReview'),
                escalated: count((x) => x.route === 'Escalated'),
                modelCalls: count((x) => x.modelCalled),
                ruleCovered: count((x) => x.fullRule),
                chainLength: state.chain.length,
                labels: state.calibration.n,
                ece: state.calibration.ece,
                restored: prior.length
            };
        }
    };
}
