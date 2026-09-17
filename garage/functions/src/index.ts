import {setGlobalOptions} from "firebase-functions";
import {onDocumentCreated} from "firebase-functions/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}
setGlobalOptions({maxInstances: 10});

// One trigger, no callables.
//
// The OpenWA/WhatsApp gateway and the Azure VM that hosted it were removed
// earlier. Invoice PDF generation went with this change: getInvoicePdfUrl had
// no caller in any app, and a signed-URL endpoint nobody calls is a liability
// rather than a feature. Bring it back from git history if invoicing needs it.
/** Plates are typed by hand at a desk and on a phone; compare them bare. */
function normalisePlate(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Returns the id of the first document matching any of the given field
 * equality checks, trying them in order. Firestore cannot OR across different
 * fields in one query, and a document written before a field existed can only
 * be found by the older one.
 */
async function firstMatch(
  coll: admin.firestore.CollectionReference,
  candidates: [string, string][]
): Promise<string | null> {
  for (const [field, value] of candidates) {
    if (!value) continue;
    const found = await coll.where(field, "==", value).limit(1).get();
    if (!found.empty) return found.docs[0].id;
  }
  return null;
}

// A visit from garage-desk carries free-text name/phone/plate, not the
// clientId/vehicleId a job card needs - the desk has never seen this
// garage's Firestore client/vehicle records. This resolves both, creating
// them if this phone or plate has not been seen before, then opens the job.
//
// `jobId` is written back onto the visit once done, so a retried delivery
// of this trigger (Cloud Functions v2 can redeliver on error) finds it and
// skips, instead of opening a second job for the same visit.
export const onVisitCreated = onDocumentCreated(
  "garages/{garageId}/visits/{visitId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const visit = snap.data() as Record<string, any>;
    if (visit.jobId) return;

    const {garageId, visitId} = event.params;
    const db = admin.firestore();
    const garageRef = db.collection("garages").doc(garageId);
    const nowIso = new Date().toISOString();
    const phone = String(visit.phone || "").trim();
    const plate = String(visit.vehiclePlate || "").trim();

    let clientId: string;
    const clientMatch = phone
      ? await garageRef.collection("clients").where("phone", "==", phone).limit(1).get()
      : null;
    if (clientMatch && !clientMatch.empty) {
      clientId = clientMatch.docs[0].id;
    } else {
      const clientRef = garageRef.collection("clients").doc();
      await clientRef.set({
        name: visit.name || "",
        email: "",
        phone,
        vehicleIds: [],
        createdAt: visit.createdAt || nowIso,
      });
      clientId = clientRef.id;
    }

    let vehicleId: string;
    // Match on the normalised key first. The desk and the reception phone
    // both let a plate be typed by hand, so "RAB 123 C" and "RAB123C" reach
    // Firestore as different strings for the same car; keying on the plate
    // exactly as typed quietly opened a second vehicle, and then a second
    // history, for a car already on file. The literal plate is still tried
    // as a fallback for vehicles created before plateKey existed.
    const plateKey = normalisePlate(plate);
    const vehicleMatch = plateKey
      ? await firstMatch(garageRef.collection("vehicles"), [
        ["plateKey", plateKey],
        ["plate", plate],
      ])
      : null;
    if (vehicleMatch) {
      vehicleId = vehicleMatch;
    } else {
      const vehicleRef = garageRef.collection("vehicles").doc();
      await vehicleRef.set({
        plate,
        plateKey,
        make: "",
        model: visit.vehicleModel || "",
        year: "",
        color: "",
        clientId,
        mileage: "",
        fuelType: "Petrol",
      });
      vehicleId = vehicleRef.id;
      await garageRef.collection("clients").doc(clientId).update({
        vehicleIds: admin.firestore.FieldValue.arrayUnion(vehicleId),
      });
    }

    const jobRef = garageRef.collection("jobs").doc();
    await jobRef.set({
      vehicleId,
      clientId,
      // Denormalised so the boss's notification and job list can say which car
      // without a second read per card.
      plate,
      technicianName: "",
      description: visit.issue || "",
      status: "Pending",
      partsUsed: [],
      laborCost: 0,
      startedAt: visit.createdAt || nowIso,
      source: "garage-desk",
      visitId,
    });

    await snap.ref.update({jobId: jobRef.id});

    // `firebase functions:log --only onVisitCreated` is the first place anyone
    // looks when a check-in does not show up on the boss's screen, so say what
    // was resolved rather than only that the run finished.
    logger.info("Visit turned into a job card", {
      garageId, visitId, clientId, vehicleId, jobId: jobRef.id,
    });
  }
);
