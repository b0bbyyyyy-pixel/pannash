import { IconChat, IconMail, IconPhone } from './icons';

function telHref(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `tel:+1${d}` : `tel:+${d}`;
}

function smsHref(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `sms:+1${d}` : `sms:+${d}`;
}

export { telHref, smsHref };

export default function ContactActions({
  phone,
  email,
  onContact,
}: {
  phone?: string;
  email?: string;
  onContact: (channel: 'call' | 'text' | 'email') => void;
}) {
  const call = phone ? telHref(phone) : '';
  const text = phone ? smsHref(phone) : '';
  const mail = email ? `mailto:${email}` : '';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm font-semibold">Contact</p>
      {call && (
        <a
          href={call}
          onClick={() => onContact('call')}
          className="inline-flex h-11 min-w-[108px] items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-sm font-medium shadow-[0_1px_2px_rgba(17,17,19,0.04)] hover:bg-[#fafafa]"
        >
          <IconPhone className="h-4 w-4" />
          Call
        </a>
      )}
      {text && (
        <a
          href={text}
          onClick={() => onContact('text')}
          className="inline-flex h-11 min-w-[108px] items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-sm font-medium shadow-[0_1px_2px_rgba(17,17,19,0.04)] hover:bg-[#fafafa]"
        >
          <IconChat className="h-4 w-4" />
          Text
        </a>
      )}
      {mail && (
        <a
          href={mail}
          onClick={() => onContact('email')}
          className="inline-flex h-11 min-w-[108px] items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-sm font-medium shadow-[0_1px_2px_rgba(17,17,19,0.04)] hover:bg-[#fafafa]"
        >
          <IconMail className="h-4 w-4" />
          Email
        </a>
      )}
    </div>
  );
}
