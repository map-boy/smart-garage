import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/https";
import {onDocumentCreated} from "firebase-functions/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import PDFDocument from "pdfkit";

if (!admin.apps.length) {
  admin.initializeApp();
}
setGlobalOptions({maxInstances: 10});

// The OpenWA/WhatsApp gateway and the Azure VM that hosted it are gone.
// Everything that only existed to drive them was removed; what is left is
// invoice PDF generation, which never depended on either.

// ---- Caller authorization ----
// Every callable here touches a garage's Storage path, so the caller has to
// prove they belong to that garage. `users/{uid}` is the same document the
// Firestore rules read for `isManagerOf()`, so a caller that passes here is
// exactly a caller the rules would also accept.
async function assertGarageMember(
  auth: {uid: string} | undefined,
  garageId: string
): Promise<void> {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const snap = await admin.firestore().collection("users").doc(auth.uid).get();
  if (!snap.exists || snap.data()?.garageId !== garageId) {
    throw new HttpsError(
      "permission-denied",
      "You do not have access to this garage."
    );
  }
}

// ---- Invoice PDF ----
async function generateInvoicePdf(
  garageName: string,
  clientName: string,
  clientEmail: string,
  invoiceNumber: string,
  vehiclePlate: string,
  vehicleMakeModel: string,
  vehicleYear: number | undefined,
  lineItems: any[],
  laborCost: number,
  taxRate: number,
  currency: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({margin: 50});
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const subtotal = (lineItems || []).reduce(
      (acc, item) => acc + (item.qty || 0) * (item.unitCost || 0), 0
    ) + (laborCost || 0);
    const total = subtotal;

    doc.fontSize(20).text(garageName, {align: "center"});
    doc.moveDown();
    doc.fontSize(14).text(`Invoice #${invoiceNumber}`, {align: "center"});
    doc.fontSize(10).fillColor("green").text("PAID", {align: "center"});
    doc.fillColor("black");
    doc.moveDown();

    doc.fontSize(12).text(`Bill to: ${clientName}`);
    if (clientEmail) {
      doc.fontSize(10).fillColor("gray").text(clientEmail);
      doc.fillColor("black");
    }
    doc.moveDown();

    if (vehiclePlate || vehicleMakeModel) {
      doc.fontSize(11).text("Vehicle:", {underline: true});
      doc.fontSize(10).text(`Registration: ${vehiclePlate || "N/A"}`);
      doc.fontSize(10).text(`Make/Model: ${vehicleMakeModel || "N/A"}`);
      if (vehicleYear) {
        doc.fontSize(10).text(`Year: ${vehicleYear}`);
      }
      doc.moveDown();
    }

    doc.fontSize(11).text("Items:", {underline: true});
    doc.moveDown(0.5);
    for (const item of lineItems || []) {
      const lineTotal = (item.qty || 0) * (item.unitCost || 0);
      doc.fontSize(10).text(
        `${item.description || "Item"}  x${item.qty}  -  ${lineTotal.toLocaleString()} ${currency}`
      );
    }
    if (laborCost) {
      doc.fontSize(10).text(`Labor Charges  -  ${laborCost.toLocaleString()} ${currency}`);
    }

    doc.moveDown();
    doc.fontSize(10).text(`Parts & Materials: ${(subtotal - (laborCost || 0)).toLocaleString()} ${currency}`, {align: "right"});
    if (laborCost) doc.fontSize(10).text(`Labour: ${laborCost.toLocaleString()} ${currency}`, {align: "right"});
    doc.fontSize(13).text(`Total Spent: ${total.toLocaleString()} ${currency}`, {align: "right"});

    doc.end();
  });
}
async function uploadInvoicePdfAndGetUrl(
  pdfBuffer: Buffer,
  garageId: string,
  invoiceId: string
): Promise<string> {
  const bucket = admin.storage().bucket();
  const filePath = `invoices/${garageId}/${invoiceId}.pdf`;
  const file = bucket.file(filePath);

  await file.save(pdfBuffer, {
    contentType: "application/pdf",
    metadata: {cacheControl: "private, max-age=0"},
  });

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
  });

  return url;
}

export const getInvoicePdfUrl = onCall(
  {timeoutSeconds: 60},
  async (request) => {
    const {
      garageId, invoiceId, garageName, clientName, clientEmail, vehiclePlate,
      vehicleMakeModel, vehicleYear, lineItems, laborCost, taxRate, currency,
    } = request.data;
    if (!garageId || !invoiceId) {
      throw new HttpsError("invalid-argument", "garageId and invoiceId are required");
    }
    await assertGarageMember(request.auth, garageId);
    try {
      const pdfBuffer = await generateInvoicePdf(
        garageName || "",
        clientName || "",
        clientEmail || "",
        invoiceId,
        vehiclePlate || "",
        vehicleMakeModel || "",
        vehicleYear,
        lineItems || [],
        laborCost || 0,
        taxRate || 0,
        currency || "RWF"
      );
      const url = await uploadInvoicePdfAndGetUrl(pdfBuffer, garageId, invoiceId);
      return {url};
    } catch (error: any) {
      logger.error("getInvoicePdfUrl failed", error);
      throw new HttpsError("internal", error.message || "Failed to generate invoice PDF");
    }
  }
);

// ---- Auto job cards from reception visits ----
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
    const vehicleMatch = plate
      ? await garageRef.collection("vehicles").where("plate", "==", plate).limit(1).get()
      : null;
    if (vehicleMatch && !vehicleMatch.empty) {
      vehicleId = vehicleMatch.docs[0].id;
    } else {
      const vehicleRef = garageRef.collection("vehicles").doc();
      await vehicleRef.set({
        plate,
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
  }
);
