import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Phone, Send } from 'lucide-react';
import type { SiteContent } from '../types';
import { canReceiveEnquiries, submitEnquiry, telHref } from '../enquiries';

/**
 * The one place a visitor can start a conversation.
 *
 * Deliberately short. Every extra required box costs completions, so only the
 * name, a way to reply, and the problem itself are mandatory - the vehicle and
 * the service help the workshop but are not worth losing an enquiry over.
 *
 * A failure never dead-ends. Someone who typed out their brake problem and hit
 * send has already decided to come in; if the write fails, the phone number is
 * right there rather than a shrug.
 */
export function RequestPanel({ c }: { c: SiteContent }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [service, setService] = useState('');
  const [message, setMessage] = useState('');

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = canReceiveEnquiries();
  const firstPhone = c.contact.phone.split('|')[0].trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitEnquiry({ name, phone, email, vehicle, service, message });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="panel panel-done">
        <CheckCircle2 size={54} />
        <h2>{c.requestPanel.successTitle}</h2>
        <p className="lead">{c.requestPanel.successBody}</p>
        <a className="btn" href={telHref(c.contact.phone)}>
          <Phone size={16} /> {firstPhone}
        </a>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={submit} id="ask">
      <p className="eyebrow">{c.requestPanel.eyebrow}</p>
      <h2>{c.requestPanel.title}</h2>
      <p className="lead">{c.requestPanel.body}</p>

      <div className="prow">
        <label>
          <span>Your name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label>
          <span>Phone</span>
          <input
            required type="tel" inputMode="tel" placeholder="+250 7.. ... ..."
            value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel"
          />
        </label>
      </div>

      <div className="prow">
        <label>
          <span>Vehicle <em>(optional)</em></span>
          <input
            value={vehicle} onChange={(e) => setVehicle(e.target.value)}
            placeholder="Toyota Vitz, 2014"
          />
        </label>
        <label>
          <span>Service <em>(optional)</em></span>
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Not sure yet</option>
            {c.services.items.map((s) => (
              <option key={s.title} value={s.title}>{s.title}</option>
            ))}
          </select>
        </label>
      </div>

      <label>
        <span>Email <em>(optional)</em></span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>

      <label>
        <span>What is it doing?</span>
        <textarea
          required rows={4} value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Grinding noise when I brake, worse going downhill. New pads six months ago."
        />
      </label>

      {!connected && (
        <p className="note">
          The request form is not connected yet &mdash; please call{' '}
          <a href={telHref(c.contact.phone)}>{firstPhone}</a>.
        </p>
      )}

      {error && (
        <p className="note bad">
          {error} <a href={telHref(c.contact.phone)}>Call {firstPhone} instead</a>.
        </p>
      )}

      <button className="btn block" disabled={busy || !connected}>
        {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        {busy ? 'Sending...' : 'Send my question'}
      </button>
      <p className="hint">We never share your details. Most questions are answered the same day.</p>
    </form>
  );
}
