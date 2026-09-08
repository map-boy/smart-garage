import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import PDFDocument from "pdfkit";

if (!admin.apps.length) {
  admin.initializeApp();
}
setGlobalOptions({maxInstances: 10});

const openwaApiKey = defineSecret("OPENWA_API_KEY");
const openwaUrl = defineSecret("OPENWA_URL");
const azureAppId = defineSecret("AZURE_APP_ID");
const azurePassword = defineSecret("AZURE_PASSWORD");
const azureTenant = defineSecret("AZURE_TENANT");
const azureSubscriptionId = defineSecret("AZURE_SUBSCRIPTION_ID");
const DEFAULT_WHATSAPP_LIMIT = 1000;

// ---- OpenWA send helpers ----
function toChatId(phone: string): string {
  return phone.replace(/[^\d]/g, "") + "@c.us";
}

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

async function sendWhatsAppTextOnce(
  apiKey: string,
  sessionId: string,
  toPhone: string,
  message: string
): Promise<Response> {
  return fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}/messages/send-text`, {
    method: "POST",
    headers: {"X-API-Key": apiKey, "Content-Type": "application/json"},
    body: JSON.stringify({chatId: toChatId(toPhone), text: message}),
  }, 20000);
}

// OpenWA sometimes returns a 500 on its response layer even though the
// message was already delivered (confirmed via device testing). A bare
// 500 is retried once after a short delay before we give up ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â this cuts
// down on false-negative errors shown to the user for messages that
// actually went through.
async function sendWhatsAppText(
  apiKey: string,
  sessionId: string,
  toPhone: string,
  message: string
): Promise<void> {
  let res = await sendWhatsAppTextOnce(apiKey, sessionId, toPhone, message);
  if (!res.ok && res.status >= 500) {
    logger.warn("OpenWA send returned 5xx, retrying once", {status: res.status});
    await new Promise((resolve) => setTimeout(resolve, 2000));
    res = await sendWhatsAppTextOnce(apiKey, sessionId, toPhone, message);
  }
  if (!res.ok) {
    throw new Error(`OpenWA send failed: ${await res.text()}`);
  }
}

// ---- Quota check + increment (per garage) ----
async function checkAndIncrementQuota(garageId: string): Promise<boolean> {
  const garageRef = admin.firestore().collection("garages").doc(garageId);
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(garageRef);
    const data = snap.data() || {};
    const used = data.whatsappMessagesUsed || 0;
    const limit = data.whatsappMessagesLimit ?? DEFAULT_WHATSAPP_LIMIT;
    if (used >= limit) {
      return false;
    }
    tx.update(garageRef, {whatsappMessagesUsed: used + 1});
    return true;
  });
}

// ---- Auto-send WhatsApp when invoice is marked Paid ----
export const sendInvoiceWhatsApp = onCall(
  {secrets: [openwaApiKey, openwaUrl, azureAppId, azurePassword, azureTenant, azureSubscriptionId], timeoutSeconds: 180},
  async (request) => {
    const {garageId, invoiceId} = request.data;
    if (!garageId || !invoiceId) {
      throw new HttpsError("invalid-argument", "garageId and invoiceId are required");
    }

    const invoiceSnap = await admin.firestore()
      .collection("garages").doc(garageId)
      .collection("invoices").doc(invoiceId).get();
    const invoice = invoiceSnap.data();
    if (!invoice) {
      throw new HttpsError("not-found", "Invoice not found");
    }

    const clientId = invoice.clientId;
    if (!clientId) {
      throw new HttpsError("failed-precondition", "Invoice has no linked client");
    }

    const clientSnap = await admin.firestore()
      .collection("garages").doc(garageId)
      .collection("clients").doc(clientId).get();
    const client = clientSnap.data();
    if (!client?.phone) {
      throw new HttpsError("failed-precondition", "Client has no phone number on file");
    }

    const garageSnap = await admin.firestore().collection("garages").doc(garageId).get();
    const garage = garageSnap.data();
    const garageName = garage?.garageName || "Your Garage";

    await ensureVmRunning();
    await waitForVmReady();

    const subtotal = (invoice.lineItems || []).reduce(
      (acc: number, item: any) => acc + item.qty * item.unitCost, 0
    ) + (invoice.laborCost || 0);
    const taxRate = 0;
    const total = subtotal;

    let vehiclePlate = "";
    let vehicleMakeModel = "";
    let vehicleYear: number | undefined = undefined;
    if (invoice.jobId) {
      const jobSnap = await admin.firestore()
        .collection("garages").doc(garageId)
        .collection("jobs").doc(invoice.jobId).get();
      const job = jobSnap.data();
      if (job?.vehicleId) {
        const vehicleSnap = await admin.firestore()
          .collection("garages").doc(garageId)
          .collection("vehicles").doc(job.vehicleId).get();
        const vehicle = vehicleSnap.data();
        if (vehicle) {
          vehiclePlate = vehicle.plate || "";
          vehicleMakeModel = `${vehicle.make || ""} ${vehicle.model || ""}`.trim();
          vehicleYear = vehicle.year;
        }
      }
    }

    try {
      const pdfBuffer = await generateInvoicePdf(
        garageName,
        client.name || "",
        client.email || "",
        invoice.id || invoiceId,
        vehiclePlate,
        vehicleMakeModel,
        vehicleYear,
        invoice.lineItems || [],
        invoice.laborCost || 0,
        taxRate,
        garage?.currency || "RWF"
      );
      const invoiceUrl = await uploadInvoicePdfAndGetUrl(pdfBuffer, garageId, invoiceId);
      const sessionId = await getGarageSessionId(garageId);
      await ensureSessionActive(sessionId);
      const invoiceNumber = invoice.id || invoiceId;
      const amountText = `${total.toLocaleString()} ${garage?.currency || "RWF"}`;
      const message =
          `Hi ${client.name || ""}, here is your invoice ${invoiceNumber} for ${amountText}.\n\n` +
          `Download your invoice PDF here:\n${invoiceUrl}`;
      await sendWhatsAppText(
        openwaApiKey.value(),
        sessionId,
        formatPhone(client.phone),
        message
      );
      logger.info("WhatsApp invoice sent on demand", {garageId, invoiceId, clientId});
      const allowed = await checkAndIncrementQuota(garageId);
      if (!allowed) {
        logger.warn("Send succeeded but quota already exhausted at increment time", {garageId});
      }
      return {success: true, invoiceUrl};
    } catch (error: any) {
      logger.error("Invoice WhatsApp send failed", error);
      throw new HttpsError("internal", error.message || "WhatsApp send failed");
    }
  }
);

// ---- Audit log retention (whatsappLogs is locked server-only in rules) ----
export const pruneWhatsAppLogs = onSchedule(
  {schedule: "0 3 * * *", timeZone: "Africa/Kigali", timeoutSeconds: 300},
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const oldLogsSnap = await admin.firestore()
      .collectionGroup("whatsappLogs")
      .where("createdAt", "<", cutoff)
      .limit(500)
      .get();

    if (oldLogsSnap.empty) {
      logger.info("No stale WhatsApp logs to prune");
      return;
    }

    const batch = admin.firestore().batch();
    oldLogsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    logger.info("Pruned stale WhatsApp logs", {count: oldLogsSnap.docs.length});
  }
);
// ---- Manual admin send (boss dashboard) ----
export const sendManualWhatsApp = onCall(
  {secrets: [openwaApiKey, openwaUrl, azureAppId, azurePassword, azureTenant, azureSubscriptionId], timeoutSeconds: 180},
  async (request) => {
    const {garageId, phoneNumber, message} = request.data;
    if (!garageId || !phoneNumber || !message) {
      throw new HttpsError("invalid-argument", "garageId, phoneNumber and message are required");
    }
    await ensureVmRunning();
    await waitForVmReady();
    try {
      const sessionId = await getGarageSessionId(garageId);
      await ensureSessionActive(sessionId);
      await sendWhatsAppText(openwaApiKey.value(), sessionId, formatPhone(phoneNumber), message);
      // Only charge the client quota after a confirmed successful send ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â
      // a failed send must never consume the 1000-message allowance.
      const allowed = await checkAndIncrementQuota(garageId);
      if (!allowed) {
        logger.warn("Send succeeded but quota already exhausted at increment time", {garageId});
      }
      return {success: true};
    } catch (error: any) {
      logger.error("Manual WhatsApp send failed", error);
      throw new HttpsError("internal", error.message || "WhatsApp send failed");
    }
  }
);

// ---- WhatsApp session management (boss dashboard) ----
export const createWhatsAppSession = onCall(
  {secrets: [openwaApiKey, openwaUrl, azureAppId, azurePassword, azureTenant, azureSubscriptionId], timeoutSeconds: 180},
  async (request) => {
    const {garageId} = request.data;
    if (!garageId) throw new HttpsError("invalid-argument", "garageId is required");
    try {
      await ensureVmRunning();
      await waitForVmReady();
      const garageRef = admin.firestore().collection("garages").doc(garageId);
      const existingSnap = await garageRef.get();
      const existingSessionId = existingSnap.data()?.whatsappSessionId;
      if (existingSessionId) {
        await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${existingSessionId}/start`, {
          method: "POST",
          headers: {"X-API-Key": openwaApiKey.value()},
        }, 15000).catch(() => null);
        return {sessionId: existingSessionId};
      }
      const sessionName = `garage-${garageId}`.slice(0, 50);
      const res = await fetchWithTimeout(`${openwaUrl.value()}/api/sessions`, {
        method: "POST",
        headers: {"X-API-Key": openwaApiKey.value(), "Content-Type": "application/json"},
        body: JSON.stringify({name: sessionName}),
      }, 20000);
      let data: any = await res.json();
      if (!res.ok) {
        const alreadyExists = res.status === 409 || /already exists/i.test(data?.message || "");
        if (alreadyExists) {
          const listRes = await fetchWithTimeout(`${openwaUrl.value()}/api/sessions`, {
            headers: {"X-API-Key": openwaApiKey.value()},
          }, 15000);
          const listData: any = await listRes.json();
          const sessions = Array.isArray(listData) ? listData : listData.sessions || [];
          const existing = sessions.find((s: any) => s.name === sessionName);
          if (!existing) throw new HttpsError("internal", "Session name conflict but could not find existing session");
          data = existing;
        } else {
          throw new HttpsError("internal", data.message || "Failed to create session");
        }
      }
      await garageRef.update({
        whatsappSessionId: data.id,
        whatsappSessionStatus: data.status,
      });
      await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${data.id}/start`, {
        method: "POST",
        headers: {"X-API-Key": openwaApiKey.value()},
      }, 15000).catch(() => null);
      return {sessionId: data.id};
    } catch (error: any) {
      logger.error("createWhatsAppSession failed", error);
      throw new HttpsError("internal", error.message || "Failed to create session - VM may still be waking up");
    }
  }
);

export const getWhatsAppSessionStatus = onCall(
  {secrets: [openwaApiKey, openwaUrl], timeoutSeconds: 15},
  async (request) => {
    const {garageId} = request.data;
    if (!garageId) throw new HttpsError("invalid-argument", "garageId is required");
    try {
      const garageSnap = await admin.firestore().collection("garages").doc(garageId).get();
      const sessionId = garageSnap.data()?.whatsappSessionId;
      if (!sessionId) return {linked: false};
      const res = await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}`, {
        headers: {"X-API-Key": openwaApiKey.value()},
      }, 6000);
      if (!res.ok) return {linked: true, status: "unreachable", sessionId};
      const data: any = await res.json();
      return {linked: true, status: data.status, phone: data.phone, sessionId};
    } catch (error: any) {
      logger.error("getWhatsAppSessionStatus failed", error);
      return {linked: false, status: "vm_asleep"};
    }
  }
);

export const getWhatsAppQr = onCall(
  {secrets: [openwaApiKey, openwaUrl, azureAppId, azurePassword, azureTenant, azureSubscriptionId], timeoutSeconds: 120},
  async (request) => {
    const {garageId} = request.data;
    if (!garageId) throw new HttpsError("invalid-argument", "garageId is required");
    try {
      await ensureVmRunning();
      await waitForVmReady();
      const sessionId = await getGarageSessionId(garageId);
      await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}/start`, {
        method: "POST",
        headers: {"X-API-Key": openwaApiKey.value()},
      }, 15000).catch(() => null);
      // OpenWA needs a moment after /start to generate the QR ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â poll
      // instead of failing on the first "not ready" response.
      const maxWaitMs = 30000;
      const intervalMs = 3000;
      const startTime = Date.now();
      let lastMessage = "QR not ready";
      while (Date.now() - startTime < maxWaitMs) {
        const res = await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}/qr`, {
          headers: {"X-API-Key": openwaApiKey.value()},
        }, 8000).catch(() => null);
        if (res && res.ok) {
          const data: any = await res.json();
          if (data.qrCode) return {qrCode: data.qrCode};
        } else if (res) {
          const data: any = await res.json().catch(() => ({}));
          lastMessage = data.message || lastMessage;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      throw new HttpsError("internal", lastMessage);
    } catch (error: any) {
      logger.error("getWhatsAppQr failed", error);
      throw new HttpsError("internal", error.message || "Could not get QR - VM may still be waking up");
    }
  }
);

export const requestWhatsAppPairingCode = onCall(
  {secrets: [openwaApiKey, openwaUrl, azureAppId, azurePassword, azureTenant, azureSubscriptionId], timeoutSeconds: 120},
  async (request) => {
    const {garageId, phoneNumber} = request.data;
    if (!garageId || !phoneNumber) {
      throw new HttpsError("invalid-argument", "garageId and phoneNumber are required");
    }
    try {
      await ensureVmRunning();
      await waitForVmReady();
      const sessionId = await getGarageSessionId(garageId);
      await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}/start`, {
        method: "POST",
        headers: {"X-API-Key": openwaApiKey.value()},
      }, 15000).catch(() => null);
      const res = await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}/pairing-code`, {
        method: "POST",
        headers: {"X-API-Key": openwaApiKey.value(), "Content-Type": "application/json"},
        body: JSON.stringify({phoneNumber: phoneNumber.replace(/[^\d]/g, "")}),
      }, 20000);
      const data: any = await res.json();
      if (!res.ok) throw new HttpsError("internal", data.message || "Failed to get pairing code");
      return {pairingCode: data.pairingCode || data.code};
    } catch (error: any) {
      logger.error("requestWhatsAppPairingCode failed", error);
      throw new HttpsError("internal", error.message || "Could not get pairing code - VM may still be waking up");
    }
  }
);

export const wakeVm = onCall(
  {secrets: [openwaApiKey, openwaUrl, azureAppId, azurePassword, azureTenant, azureSubscriptionId], timeoutSeconds: 180},
  async () => {
    await ensureVmRunning();
    await waitForVmReady();
    return {success: true};
  }
);

export const disconnectWhatsAppSession = onCall(
  {secrets: [openwaApiKey, openwaUrl], timeoutSeconds: 60},
  async (request) => {
    const {garageId} = request.data;
    if (!garageId) throw new HttpsError("invalid-argument", "garageId is required");
    try {
      const garageSnap = await admin.firestore().collection("garages").doc(garageId).get();
      const sessionId = garageSnap.data()?.whatsappSessionId;
      if (!sessionId) return {success: true};
      await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}/logout`, {
        method: "POST",
        headers: {"X-API-Key": openwaApiKey.value()},
      }, 10000).catch(() => null);
      await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}/stop`, {
        method: "POST",
        headers: {"X-API-Key": openwaApiKey.value()},
      }, 10000).catch(() => null);
      // Keep sessionId so reconnecting reuses this session instead of
      // colliding with a still-existing OpenWA session of the same name.
      await admin.firestore().collection("garages").doc(garageId).update({
        whatsappSessionStatus: "disconnected",
      });
      return {success: true};
    } catch (error: any) {
      logger.error("disconnectWhatsAppSession failed", error);
      throw new HttpsError("internal", error.message || "Failed to disconnect session");
    }
  }
);
export const getVmStatus = onCall(
  {secrets: [azureAppId, azurePassword, azureTenant, azureSubscriptionId]},
  async () => {
    const snap = await admin.firestore().collection("system").doc("vmState").get();
    const data = snap.data();
    if (!data?.running) return {running: false, lastActivity: null, idleMinutes: null};
    const lastActivity = data.lastActivity?.toDate?.() || null;
    return {
      running: true,
      lastActivity: lastActivity ? lastActivity.toISOString() : null,
      idleMinutes: lastActivity ? (Date.now() - lastActivity.getTime()) / 60000 : null,
    };
  }
);
export const restartWhatsAppSession = onCall(
  {secrets: [openwaApiKey, openwaUrl], timeoutSeconds: 120},
  async (request) => {
    const {garageId} = request.data;
    if (!garageId) throw new HttpsError("invalid-argument", "garageId is required");
    const sessionId = await getGarageSessionId(garageId);
    await ensureSessionActive(sessionId);
    return {success: true};
  }
);
// ---- Scheduled holiday / bulk messages ----
// Runs once daily at 08:00 Africa/Kigali time. Using an explicit timeZone
// (not UTC) means "today" always matches the garage's real local date,
// so a message scheduled for a specific day never fires a day early/late.
function formatPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}


async function getGarageSessionId(garageId: string): Promise<string> {
  const snap = await admin.firestore().collection("garages").doc(garageId).get();
  const sessionId = snap.data()?.whatsappSessionId;
  if (!sessionId) {
    throw new Error("No WhatsApp session linked for this garage. Link one in the admin panel first.");
  }
  return sessionId;
}
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
// ---- Azure VM auto start/stop (save cost ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â VM only runs during business hours) ----
const AZURE_RESOURCE_GROUP = "garage-whatsapp-rg";
const AZURE_VM_NAME = "openwa-vm-azure";

async function getAzureToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${azureTenant.value()}/oauth2/token`,
    {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: azureAppId.value(),
        client_secret: azurePassword.value(),
        resource: "https://management.azure.com/",
      }),
    }
  );
  const data: any = await res.json();
  if (!res.ok) throw new Error(`Azure auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function azureVmAction(action: "start" | "deallocate"): Promise<void> {
  const token = await getAzureToken();
  const url = `https://management.azure.com/subscriptions/${azureSubscriptionId.value()}/resourceGroups/${AZURE_RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachines/${AZURE_VM_NAME}/${action}?api-version=2023-09-01`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {"Authorization": `Bearer ${token}`},
  }, 20000);
  if (!res.ok && res.status !== 202) {
    throw new Error(`Azure ${action} failed: ${await res.text()}`);
  }
  logger.info(`Azure VM ${action} triggered`, {vm: AZURE_VM_NAME});
}

// Stops (deallocates) the VM at 8:00 PM Kigali time (after business hours) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â this is
// what actually stops billing, since a deallocated VM is not charged for compute.
export const stopGarageVm = onSchedule(
  {schedule: "0 20 * * *", timeZone: "Africa/Kigali", secrets: [azureAppId, azurePassword, azureTenant, azureSubscriptionId]},
  async () => {
    await azureVmAction("deallocate");
  }
);


async function ensureVmRunning(): Promise<void> {
  const db = admin.firestore();
  const stateRef = db.collection("system").doc("vmState");
  await azureVmAction("start");
  await stateRef.set({lastActivity: admin.firestore.FieldValue.serverTimestamp(), running: true}, {merge: true});
}

async function waitForVmReady(): Promise<void> {
  const maxWaitMs = 120000;
  const intervalMs = 3000;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetchWithTimeout(`${openwaUrl.value()}`, {method: "GET"}, 4000);
      if (res.ok || res.status === 404) {
        logger.info("OpenWA service is ready");
        return;
      }
    } catch (err) {
      // VM/service not up yet, keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for VM/WhatsApp service to become ready");
}

async function ensureSessionActive(sessionId: string): Promise<void> {
  const apiKey = openwaApiKey.value();
  await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}/start`, {
    method: "POST",
    headers: {"X-API-Key": apiKey},
  }, 15000).catch(() => null);
  const maxWaitMs = 60000;
  const intervalMs = 2000;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetchWithTimeout(`${openwaUrl.value()}/api/sessions/${sessionId}`, {
      headers: {"X-API-Key": apiKey},
    }, 8000).catch(() => null);
    if (res && res.ok) {
      const data: any = await res.json();
      if (data.status === "ready" || data.status === "connected" || data.status === "active") {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for WhatsApp session ${sessionId} to become active`);
}

// Idle-checker: runs every 10 min. Stops the VM if no activity for 15+ min ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â saves cost
// since the VM only needs to run right after an invoice is paid or a manual send.
export const stopIdleVm = onSchedule(
  {schedule: "*/10 * * * *", secrets: [azureAppId, azurePassword, azureTenant, azureSubscriptionId]},
  async () => {
    const db = admin.firestore();
    const stateRef = db.collection("system").doc("vmState");
    const snap = await stateRef.get();
    const data = snap.data();
    if (!data?.running) return;
    const lastActivity = data.lastActivity?.toDate?.() || new Date(0);
    const idleMinutes = (Date.now() - lastActivity.getTime()) / 60000;
    if (idleMinutes >= 15) {
      await azureVmAction("deallocate");
      await stateRef.set({running: false}, {merge: true});
      logger.info("VM stopped due to inactivity");
    }
  }
);

export const getInvoicePdfUrl = onCall(
  {timeoutSeconds: 60},
  async (request) => {
    const {garageId, invoiceId, garageName, clientName, clientEmail, vehiclePlate, vehicleMakeModel, vehicleYear, lineItems, laborCost, taxRate, currency} = request.data;
    if (!garageId || !invoiceId) {
      throw new HttpsError("invalid-argument", "garageId and invoiceId are required");
    }
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
