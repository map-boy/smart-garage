/**
 * Executable authorization cases for firestore.rules.
 *
 * These are not decoration. The previous ruleset in this repo granted every
 * signed-in account read and write on every garage, and nobody noticed because
 * nothing checked. Each case below is a sentence about who may do what, in a
 * form that fails loudly when it stops being true.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs,
  increment,
} from 'firebase/firestore';

const GARAGE = 'garage-a';
const OTHER = 'garage-b';

const env = await initializeTestEnvironment({
  projectId: 'demo-smart-garage',
  firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

/** Seed documents the rules read but that no test is allowed to create. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/manager-a'), { role: 'manager', garageId: GARAGE });
  await setDoc(doc(db, 'users/tech-a'), { role: 'technician', garageId: GARAGE });
  await setDoc(doc(db, 'users/manager-b'), { role: 'manager', garageId: OTHER });
  await setDoc(doc(db, 'users/boss'), { role: 'BOSS', garageId: GARAGE });

  await setDoc(doc(db, `garages/${GARAGE}`), { name: 'Garage A', ownerId: 'manager-a' });
  await setDoc(doc(db, `garages/${OTHER}`), { name: 'Garage B', ownerId: 'manager-b' });

  await setDoc(doc(db, `garages/${GARAGE}/stock/part1`), {
    name: 'Oil filter', partNumber: 'OF-1', quantity: 10,
    reorderLevel: 2, unitCost: 5000, supplier: 'X',
  });

  await setDoc(doc(db, 'pairing/GOODCODE'), {
    garageId: GARAGE, role: 'reception', expiresAtMs: Date.now() + 6e5,
  });
  await setDoc(doc(db, 'pairing/STOCKCODE'), {
    garageId: GARAGE, role: 'stock', expiresAtMs: Date.now() + 6e5,
  });

  await setDoc(doc(db, `garages/${GARAGE}/devices/reception-phone`), {
    role: 'reception', staffName: 'Aline', garageId: GARAGE, pairingCode: 'GOODCODE',
  });
  await setDoc(doc(db, `garages/${GARAGE}/devices/stock-phone`), {
    role: 'stock', staffName: 'Eric', garageId: GARAGE, pairingCode: 'STOCKCODE',
  });

  await setDoc(doc(db, `garages/${GARAGE}/enquiries/e1`), {
    name: 'Visitor', phone: '+250', message: 'hi', status: 'new', source: 'website',
  });
  await setDoc(doc(db, 'site/content'), { brand: { name: 'C&V' } });
});

const manager = env.authenticatedContext('manager-a').firestore();
const tech = env.authenticatedContext('tech-a').firestore();
const otherManager = env.authenticatedContext('manager-b').firestore();
const reception = env.authenticatedContext('reception-phone').firestore();
const stockPhone = env.authenticatedContext('stock-phone').firestore();
const stranger = env.authenticatedContext('nobody').firestore();
// Pairing turns an identity into a garage member, so it gets its own context:
// reusing `stranger` afterwards would quietly grant it everything a device has.
const freshPhone = env.authenticatedContext('fresh-phone').firestore();
const anon = env.unauthenticatedContext().firestore();

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message]); }
}

// ---- the leak that motivated all of this ---------------------------------
await check('a signed-in stranger cannot read another garage', () =>
  assertFails(getDoc(doc(stranger, `garages/${GARAGE}`))));

await check('a signed-in stranger cannot write another garage', () =>
  assertFails(setDoc(doc(stranger, `garages/${GARAGE}/clients/c1`), { name: 'x' })));

await check("a manager cannot reach another garage's stock", () =>
  assertFails(getDoc(doc(otherManager, `garages/${GARAGE}/stock/part1`))));

// ---- privilege escalation -------------------------------------------------
await check('a user cannot promote themselves to BOSS', () =>
  assertFails(updateDoc(doc(tech, 'users/tech-a'), { role: 'BOSS' })));

await check('a user cannot move themselves to another garage', () =>
  assertFails(updateDoc(doc(tech, 'users/tech-a'), { garageId: OTHER })));

await check('a new profile cannot be created as BOSS', () =>
  assertFails(setDoc(doc(stranger, 'users/nobody'), { role: 'BOSS', garageId: GARAGE })));

await check('a user may still change their own display name', () =>
  assertSucceeds(updateDoc(doc(tech, 'users/tech-a'), { displayName: 'Tech' })));

// ---- devices and pairing --------------------------------------------------
await check('an unpaired phone cannot register itself without a code', () =>
  assertFails(setDoc(doc(freshPhone, `garages/${GARAGE}/devices/fresh-phone`), {
    role: 'reception', staffName: 'Intruder', garageId: GARAGE, pairingCode: 'GUESSED',
  })));

await check('a phone cannot pair itself into a garage the code is not for', () =>
  assertFails(setDoc(doc(freshPhone, `garages/${OTHER}/devices/fresh-phone`), {
    role: 'reception', staffName: 'Wrong garage', garageId: GARAGE, pairingCode: 'GOODCODE',
  })));

await check('a phone with a real code may pair itself', () =>
  assertSucceeds(setDoc(doc(freshPhone, `garages/${GARAGE}/devices/fresh-phone`), {
    role: 'reception', staffName: 'New phone', garageId: GARAGE, pairingCode: 'GOODCODE',
  })));

await check('a device cannot promote itself from reception to stock', () =>
  assertFails(updateDoc(doc(reception, `garages/${GARAGE}/devices/reception-phone`), {
    role: 'stock',
  })));

await check('a device may update its own heartbeat', () =>
  assertSucceeds(updateDoc(doc(reception, `garages/${GARAGE}/devices/reception-phone`), {
    lastSeenAt: new Date().toISOString(),
  })));

await check('pairing codes cannot be listed', () =>
  assertFails(getDocs(collection(stranger, 'pairing'))));

// The desktop app mints these; if a manager cannot, no phone can ever pair.
await check('a manager may mint a pairing code', () =>
  assertSucceeds(setDoc(doc(manager, 'pairing/NEWCODE1'), {
    garageId: GARAGE, role: 'stock', expiresAtMs: Date.now() + 6e5,
  })));

await check('a technician cannot mint a pairing code', () =>
  assertFails(setDoc(doc(tech, 'pairing/SNEAKY01'), {
    garageId: GARAGE, role: 'stock', expiresAtMs: Date.now() + 6e5,
  })));

await check("a manager cannot mint a code for another garage", () =>
  assertFails(setDoc(doc(manager, 'pairing/WRONGGRG'), {
    garageId: OTHER, role: 'stock', expiresAtMs: Date.now() + 6e5,
  })));

// Unpairs the throwaway phone created just above, never a fixture other
// cases still depend on - deleting shared state makes later tests fail for
// reasons that have nothing to do with what they are checking.
await check('a manager may unpair a phone', () =>
  assertSucceeds(deleteDoc(doc(manager, `garages/${GARAGE}/devices/fresh-phone`))));

// ---- stock ----------------------------------------------------------------
await check('the reception phone may take stock out', () =>
  assertSucceeds(updateDoc(doc(reception, `garages/${GARAGE}/stock/part1`), {
    quantity: increment(-1), updatedAt: new Date().toISOString(),
  })));

await check('the reception phone cannot rename a part', () =>
  assertFails(updateDoc(doc(reception, `garages/${GARAGE}/stock/part1`), {
    name: 'Renamed',
  })));

await check('the reception phone cannot change a part cost', () =>
  assertFails(updateDoc(doc(reception, `garages/${GARAGE}/stock/part1`), {
    unitCost: 1,
  })));

await check('the reception phone cannot delete a part', () =>
  assertFails(deleteDoc(doc(reception, `garages/${GARAGE}/stock/part1`))));

await check('the stock phone may add a part', () =>
  assertSucceeds(setDoc(doc(stockPhone, `garages/${GARAGE}/stock/part2`), {
    name: 'Brake pad', partNumber: 'BP-2', quantity: 4,
    reorderLevel: 1, unitCost: 12000, supplier: 'Y',
  })));

await check('the stock phone may correct a part cost', () =>
  assertSucceeds(updateDoc(doc(stockPhone, `garages/${GARAGE}/stock/part1`), {
    unitCost: 5500,
  })));

await check("a phone cannot touch another garage's stock", () =>
  assertFails(updateDoc(doc(reception, `garages/${OTHER}/stock/part1`), {
    quantity: increment(-1),
  })));

// ---- the ledger is append-only -------------------------------------------
await check('a device may append a stock movement', () =>
  assertSucceeds(addDoc(collection(reception, `garages/${GARAGE}/stockMovements`), {
    partId: 'part1', partName: 'Oil filter', partNumber: 'OF-1',
    delta: -1, balanceAfter: 9, reason: 'issued_to_vehicle',
    byName: 'Aline', byRole: 'reception', atLocal: new Date().toISOString(),
  })));

await check('nobody can rewrite a stock movement', async () => {
  let id;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const ref = await addDoc(collection(ctx.firestore(), `garages/${GARAGE}/stockMovements`), {
      partId: 'part1', delta: -5,
    });
    id = ref.id;
  });
  await assertFails(updateDoc(doc(manager, `garages/${GARAGE}/stockMovements/${id}`), { delta: 0 }));
  await assertFails(deleteDoc(doc(manager, `garages/${GARAGE}/stockMovements/${id}`)));
});

// ---- arrivals -------------------------------------------------------------
await check('the reception phone may check a vehicle in', () =>
  assertSucceeds(addDoc(collection(reception, `garages/${GARAGE}/arrivals`), {
    plate: 'RAA123A', requestedWork: 'Brakes squealing', status: 'waiting',
  })));

await check('the stock phone cannot check a vehicle in', () =>
  assertFails(addDoc(collection(stockPhone, `garages/${GARAGE}/arrivals`), {
    plate: 'RAA123A', requestedWork: 'x', status: 'waiting',
  })));

// ---- website enquiries ----------------------------------------------------
await check('a website visitor may post one enquiry', () =>
  assertSucceeds(addDoc(collection(stranger, `garages/${GARAGE}/enquiries`), {
    name: 'Jean', phone: '+250788000000', message: 'Do you do diagnostics?',
    status: 'new', source: 'website', createdAtLocal: new Date().toISOString(),
  })));

await check('an enquiry cannot be posted already marked answered', () =>
  assertFails(addDoc(collection(stranger, `garages/${GARAGE}/enquiries`), {
    name: 'Jean', phone: '+250', message: 'x', status: 'answered', source: 'website',
  })));

await check('a visitor cannot read the enquiry inbox', () =>
  assertFails(getDocs(collection(stranger, `garages/${GARAGE}/enquiries`))));

await check('staff can read the enquiry inbox', () =>
  assertSucceeds(getDocs(collection(tech, `garages/${GARAGE}/enquiries`))));

await check('an enquiry with no name is refused', () =>
  assertFails(addDoc(collection(stranger, `garages/${GARAGE}/enquiries`), {
    name: '', phone: '+250', message: 'x', status: 'new', source: 'website',
  })));

// ---- public site content --------------------------------------------------
await check('anyone may read the public site content', () =>
  assertSucceeds(getDoc(doc(anon, 'site/content'))));

await check('a technician cannot rewrite the public site', () =>
  assertFails(setDoc(doc(tech, 'site/content'), { brand: { name: 'hacked' } })));

await check('a manager may edit the public site', () =>
  assertSucceeds(setDoc(doc(manager, 'site/content'), { brand: { name: 'C&V Smart' } })));

// ---- archives -------------------------------------------------------------
await check('staff may write an archive record in either layout', async () => {
  await assertSucceeds(setDoc(doc(manager, `garages/${GARAGE}/archives/2026-08`), {
    periodId: '2026-08', total: 3,
  }));
  await assertSucceeds(setDoc(doc(manager, `garages/${GARAGE}/archives/2026-08/invoices/i1`), {
    total: 1000,
  }));
  await assertSucceeds(setDoc(doc(manager, `garages/${GARAGE}/archives/2026-08/records/c0`), {
    index: 0, kind: 'jobs', rows: [],
  }));
});

await check('a stranger cannot read an archive', () =>
  assertFails(getDoc(doc(stranger, `garages/${GARAGE}/archives/2026-08`))));

// ---- the audit log stays server-only -------------------------------------
await check('nobody can forge a WhatsApp audit line', () =>
  assertFails(setDoc(doc(manager, `garages/${GARAGE}/whatsappLogs/l1`), { to: 'x' })));

await check('a technician cannot read the WhatsApp audit log', () =>
  assertFails(getDocs(collection(tech, `garages/${GARAGE}/whatsappLogs`))));

// ---- general collections --------------------------------------------------
await check('staff may write clients', () =>
  assertSucceeds(setDoc(doc(tech, `garages/${GARAGE}/clients/c1`), { name: 'Client' })));

await check('a paired phone may read vehicles', () =>
  assertSucceeds(getDocs(collection(reception, `garages/${GARAGE}/vehicles`))));

await check('a paired phone cannot rewrite job cards', () =>
  assertFails(setDoc(doc(reception, `garages/${GARAGE}/jobs/j1`), { status: 'done' })));

await env.cleanup();

const failed = results.filter((r) => r[0] === 'FAIL');
for (const [state, name, err] of results) {
  console.log(`${state === 'PASS' ? '  ok' : 'FAIL'}  ${name}${err ? `\n        ${err}` : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} authorization cases pass`);
process.exit(failed.length ? 1 : 0);
