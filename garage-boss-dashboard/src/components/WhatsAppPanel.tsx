// The React namespace is needed for the FormEvent annotations below;
// without this import `npm run lint` (tsc --noEmit) fails on this file.
import type { FormEvent } from 'react';
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, sendManualWhatsAppFn, createWhatsAppSessionFn, getWhatsAppSessionStatusFn, getWhatsAppQrFn, requestWhatsAppPairingCodeFn, wakeVmFn, restartWhatsAppSessionFn, getVmStatusFn, disconnectWhatsAppSessionFn, isSessionReady } from '../firebase';
import { MessageCircle, Send, AlertCircle, CheckCircle2, Link2, QrCode, Smartphone, RefreshCw } from 'lucide-react';

interface WhatsAppPanelProps {
  garageId: string;
}

interface SessionStatus {
  linked: boolean;
  /** Evaluated by the backend against its own ready-state list. */
  ready?: boolean;
  status?: string;
  lastKnownStatus?: string | null;
  phone?: string;
  sessionId?: string;
}
export default function WhatsAppPanel({ garageId }: WhatsAppPanelProps) {
  const [vmRunning, setVmRunning] = useState<boolean | null>(null);
  const [vmIdleMin, setVmIdleMin] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const checkVm = async () => {
      // Skip while the tab is hidden: a dashboard left open on a spare
      // monitor should not keep invoking a callable all night.
      if (document.visibilityState !== 'visible') return;
      try {
        const res: any = await getVmStatusFn();
        if (cancelled) return;
        setVmRunning(res.data.running);
        setVmIdleMin(res.data.idleMinutes);
      } catch {
        if (!cancelled) setVmRunning(null);
      }
    };
    checkVm();
    const interval = setInterval(checkVm, 60000);
    document.addEventListener('visibilitychange', checkVm);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', checkVm);
    };
  }, []);

  const [used, setUsed] = useState(0);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect this WhatsApp number? You will need to scan a new QR code or pairing code to link another number.')) return;
    setDisconnecting(true);
    try {
      await disconnectWhatsAppSessionFn({ garageId });
      await refreshSessionStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setDisconnecting(false);
    }
  };
  const [limit, setLimit] = useState(1000);

  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [session, setSession] = useState<SessionStatus>({ linked: false });
  const [checkingSession, setCheckingSession] = useState(true);
  const [linking, setLinking] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<'qr' | 'code'>('qr');
  const [pairPhone, setPairPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [waking, setWaking] = useState(false);
  const [wakeResult, setWakeResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restarting, setRestarting] = useState(false);

  // OpenWA reports a working session as 'ready', not 'connected'. Checking
  // only for 'connected' meant a healthy number always displayed as unlinked
  // — and kept the fast poll below running forever. Trust the backend's own
  // `ready` verdict when it sends one. Declared here, above the effects that
  // depend on it, because a dependency array is evaluated during render.
  const isConnected = session.linked &&
    (session.ready ?? isSessionReady(session.status));

  const refreshSessionStatus = async () => {
    try {
      const res: any = await getWhatsAppSessionStatusFn({ garageId });
      setSession(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingSession(false);
      setLastChecked(new Date());
    }
  };

  const handleWakeVm = async () => {
    setWaking(true);
    setWakeResult(null);
    try {
      await wakeVmFn();
      setWakeResult({ type: 'success', text: 'VM is awake and OpenWA service is ready.' });
      await refreshSessionStatus();
    } catch (err: any) {
      setWakeResult({ type: 'error', text: err.message || 'Failed to wake VM.' });
    } finally {
      setWaking(false);
    }
  };

  const handleRestartSession = async () => {
    setRestarting(true);
    setWakeResult(null);
    try {
      await restartWhatsAppSessionFn({ garageId });
      setWakeResult({ type: 'success', text: 'Session restarted successfully.' });
      await refreshSessionStatus();
    } catch (err: any) {
      setWakeResult({ type: 'error', text: err.message || 'Failed to restart session.' });
    } finally {
      setRestarting(false);
    }
  };

  useEffect(() => {
    if (!garageId) return;
    const unsubGarage = onSnapshot(doc(db, 'garages', garageId), (snap) => {
      const data = snap.data();
      if (data) {
        setUsed(data.whatsappMessagesUsed || 0);
        setLimit(data.whatsappMessagesLimit ?? 1000);
      }
    });
    refreshSessionStatus();
    return () => {
      unsubGarage();
    };
  }, [garageId]);

  // Poll the session status only while it is worth polling.
  //
  // This used to run every 4 seconds forever whenever the session was not
  // 'connected' — a condition that was permanently true because of the
  // status-name mismatch above. One dashboard left open overnight fired
  // ~21,000 function invocations a day, each one hitting Firestore and
  // (while the VM slept) waiting on a timeout. Now it backs off when idle,
  // polls fast only during an active linking attempt, and stops entirely
  // when the tab is hidden.
  useEffect(() => {
    if (!garageId) return;

    const linking = !!qrImage || !!pairingCode;
    const pollMs = linking ? 5000 : isConnected ? 60000 : 30000;

    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') refreshSessionStatus();
    };
    timer = window.setInterval(tick, pollMs);

    // Catch up immediately when the operator returns to the tab, rather than
    // showing them a status that is up to a minute stale.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSessionStatus();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [garageId, isConnected, qrImage, pairingCode]);

  const handleStartLinking = async () => {
    setLinking(true);
    setLinkError(null);
    setQrImage(null);
    setPairingCode(null);
    try {
      if (!session.sessionId) {
        await createWhatsAppSessionFn({ garageId });
      }
      if (linkMode === 'qr') {
        const res: any = await getWhatsAppQrFn({ garageId });
        setQrImage(res.data.qrCode);
      }
      await refreshSessionStatus();
    } catch (err: any) {
      setLinkError(err.message || 'Failed to start linking.');
    } finally {
      setLinking(false);
    }
  };

  const handleRefreshQr = async () => {
    setLinkError(null);
    try {
      const res: any = await getWhatsAppQrFn({ garageId });
      setQrImage(res.data.qrCode);
    } catch (err: any) {
      setLinkError(err.message || 'QR not ready yet, try again in a moment.');
    }
  };

  const handleRequestPairingCode = async () => {
    if (!pairPhone) return;
    setLinking(true);
    setLinkError(null);
    setPairingCode(null);
    try {
      if (!session.sessionId) {
        await createWhatsAppSessionFn({ garageId });
      }
      const res: any = await requestWhatsAppPairingCodeFn({ garageId, phoneNumber: pairPhone });
      setPairingCode(res.data.pairingCode);
    } catch (err: any) {
      setLinkError(err.message || 'Failed to request pairing code.');
    } finally {
      setLinking(false);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!phone || !message) return;
    setSending(true);
    setSendResult(null);
    try {
      await sendManualWhatsAppFn({ garageId, phoneNumber: phone, message });
      setSendResult({ type: 'success', text: 'Message sent successfully.' });
      setPhone('');
      setMessage('');
    } catch (err: any) {
      setSendResult({ type: 'error', text: err.message || 'Send failed.' });
    } finally {
      setSending(false);
    }
  };

  const percentUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const quotaLow = limit > 0 && used >= limit * 0.9;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">WhatsApp Messaging</h1>
        <p className="text-sm text-gray-500 font-medium">Send a message to a client. Nothing is sent automatically.</p>
      </div>

      {/* WhatsApp Connection Card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">WhatsApp Number</h3>
            <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${vmRunning ? 'bg-emerald-100 text-emerald-700' : vmRunning === false ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
              {vmRunning === null ? 'Checking VM...' : vmRunning ? `VM awake${vmIdleMin !== null ? ` - idle ${Math.round(vmIdleMin)}m` : ''}` : 'VM asleep'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {session?.linked && (
              <button onClick={handleDisconnect} disabled={disconnecting} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                {disconnecting ? 'Disconnecting...' : 'Disconnect Number'}
              </button>
            )}
            {lastChecked && (
              <span className="text-[10px] text-gray-400 font-medium">
                Checked {Math.max(0, Math.round((Date.now() - lastChecked.getTime()) / 1000))}s ago
              </span>
            )}
            {!checkingSession && (
              <button onClick={refreshSessionStatus} className="text-gray-400 hover:text-gray-600" title="Refresh status">
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleWakeVm}
            disabled={waking || restarting}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {waking ? 'Waking VM...' : 'Wake VM Now'}
          </button>
          <button
            onClick={handleRestartSession}
            disabled={waking || restarting}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {restarting ? 'Restarting...' : 'Restart Session'}
          </button>
        </div>

        {wakeResult && (
          <div className={`flex items-center gap-2 text-xs font-medium p-2.5 rounded-lg ${
            wakeResult.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}>
            {wakeResult.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {wakeResult.text}
          </div>
        )}

        {checkingSession ? (
          <p className="text-sm text-gray-400">Checking connection...</p>
        ) : isConnected ? (
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 bg-emerald-50 p-3 rounded-xl">
            <CheckCircle2 className="w-4 h-4" />
            Connected {session.phone ? `as ${session.phone}` : ''}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Link the WhatsApp number that will send messages to your clients. Scan a QR code, or if scanning
              does not work, use a phone number to get a login code instead.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => { setLinkMode('qr'); setPairingCode(null); setLinkError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border ${
                  linkMode === 'qr' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" /> Scan QR Code
              </button>
              <button
                onClick={() => { setLinkMode('code'); setQrImage(null); setLinkError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border ${
                  linkMode === 'code' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" /> Use Phone Number
              </button>
            </div>

            {linkMode === 'qr' && (
              <div className="space-y-3">
                {qrImage ? (
                  <div className="flex flex-col items-center gap-3 p-4 bg-gray-50 rounded-xl">
                    <img src={qrImage} alt="WhatsApp QR Code" className="w-48 h-48" />
                    <p className="text-xs text-gray-500 text-center">
                      Open WhatsApp on the phone &rarr; Settings &rarr; Linked Devices &rarr; Link a Device,
                      then scan this code. It refreshes every ~60 seconds.
                    </p>
                    <button
                      onClick={handleRefreshQr}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
                    >
                      Refresh QR Code
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleStartLinking}
                    disabled={linking}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                  >
                    {linking ? 'Generating QR Code...' : 'Show QR Code'}
                  </button>
                )}
              </div>
            )}

            {linkMode === 'code' && (
              <div className="space-y-3">
                {pairingCode ? (
                  <div className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500">Enter this code in WhatsApp &rarr; Linked Devices &rarr; Link with phone number:</p>
                    <p className="text-3xl font-black tracking-widest text-emerald-700">{pairingCode}</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase">Phone Number to Link</label>
                      <input
                        type="tel"
                        placeholder="+250 788 000 000"
                        className="w-full mt-1 p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        value={pairPhone}
                        onChange={(e) => setPairPhone(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={handleRequestPairingCode}
                      disabled={linking || !pairPhone}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                    >
                      {linking ? 'Requesting Code...' : 'Get Login Code'}
                    </button>
                  </>
                )}
              </div>
            )}

            {linkError && (
              <div className="flex items-center gap-2 text-xs font-medium p-2.5 rounded-lg bg-rose-50 text-rose-700">
                <AlertCircle className="w-4 h-4" /> {linkError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quota Card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-black uppercase tracking-wide text-gray-700">Message Quota</span>
          </div>
          <span className={`text-xs font-bold ${quotaLow ? 'text-rose-600' : 'text-gray-500'}`}>
            {used} / {limit} used
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${quotaLow ? 'bg-rose-500' : 'bg-emerald-500'}`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
        {quotaLow && (
          <p className="text-xs text-rose-600 font-medium mt-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Running low on messages. Contact your provider to top up.
          </p>
        )}
      </div>

      {/* Manual Send */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Send a Message</h3>
        </div>
        <form onSubmit={handleSend} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Client Phone Number</label>
            <input
              type="tel"
              required
              placeholder="+250 788 000 000"
              className="w-full mt-1 p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Message</label>
            <textarea
              required
              rows={3}
              className="w-full mt-1 p-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {sendResult && (
            <div className={`flex items-center gap-2 text-xs font-medium p-2.5 rounded-lg ${
              sendResult.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}>
              {sendResult.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {sendResult.text}
            </div>
          )}
          <button
            type="submit"
            disabled={sending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>

    </div>
  );
}



