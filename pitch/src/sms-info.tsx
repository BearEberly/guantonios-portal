import { useEffect } from 'react';
import './sms-info.css';

const pages = {
  '/sms': { title: 'SMS reservation demo', label: 'Program & consent' },
  '/sms/privacy': { title: 'SMS privacy', label: 'Privacy' },
  '/sms/terms': { title: 'SMS terms', label: 'Terms' },
} as const;

const smsUrls = {
  program: 'https://res.beareberly.com/sms/',
  reservations: 'https://res.beareberly.com/reservations/',
  privacy: 'https://res.beareberly.com/sms/privacy/',
  terms: 'https://res.beareberly.com/sms/terms/',
  proof: 'https://res.beareberly.com/sms-consent-proof.png',
} as const;

type SmsPath = keyof typeof pages;

export function SmsInfoPage({ path }: { path: SmsPath }) {
  const page = pages[path];
  useEffect(() => {
    document.title = `${page.title} | Bear Eberly Photos`;
  }, [page.title]);

  return (
    <main className="sms-info-page">
      <header className="sms-info-header">
        <a href="/sms" className="sms-info-brand">Bear Eberly Photos</a>
        <a href="/reservations">Back to web demo</a>
      </header>
      <div className="sms-info-layout">
        <nav className="sms-info-nav" aria-label="SMS information">
          {Object.entries(pages).map(([href, item]) => (
            <a key={href} href={href} aria-current={href === path ? 'page' : undefined}>{item.label}</a>
          ))}
        </nav>
        <article className="sms-info-article">
          <h1>{page.title}</h1>
          <p className="sms-info-intro">A software pitch demo operated by Bear Eberly Photos.</p>
          <aside className="sms-info-status" aria-label="SMS setup status">
            <strong>Setup pending. Controlled testers only.</strong>
            <p>Program number: <span className="sms-info-number">+1 (209) 709-4194</span></p>
            <p>Carrier registration and delivery testing are not complete. Please wait for the operator to confirm that texting is enabled. The web demo works independently.</p>
          </aside>
          {path === '/sms' && <Program />}
          {path === '/sms/privacy' && <Privacy />}
          {path === '/sms/terms' && <Terms />}
          <footer className="sms-info-footer">
            <p>Bear Eberly Photos · Reservation software demonstration</p>
            <p>Last updated September 14, 2026</p>
          </footer>
        </article>
      </div>
    </main>
  );
}

function Program() {
  return <>
    <section aria-labelledby="sms-purpose">
      <h2 id="sms-purpose">What the program does</h2>
      <p>This optional SMS program demonstrates an AI assistant that understands a request, asks for missing details, checks sample availability, and creates or logs a synthetic reservation. Replies may include clarification questions and demo booking confirmations, status, or cancellations.</p>
      <p>Every booking is demo data. No real restaurant table is reserved. Bear Eberly Photos operates this software pitch; restaurant branding elsewhere in the demo does not represent restaurant endorsement or authorization to book a real table.</p>
    </section>
    <section aria-labelledby="sms-consent">
      <h2 id="sms-consent">How participation works</h2>
      <p>Once setup is complete, approved testers can opt in from the reservation website by entering their mobile number and checking the text-message consent box when they request a Notify follow-up or ask for reservation updates.</p>
      <p>Approved testers can also start a conversation by texting <strong>START</strong> to <strong>+1 (209) 709-4194</strong> from their own mobile phone after reading these disclosures and receiving the operator's confirmation that texting is enabled.</p>
      <p>By checking the consent box or texting START after reviewing these disclosures, you agree to receive automated SMS replies from the Bear Eberly Photos reservation demo about your request. This permission covers reservation availability, confirmations, status, and cancellations. It does not enroll you in marketing texts.</p>
      <p>Message frequency varies with your requests. Message and data rates may apply. SMS participation is optional and is not a condition of any purchase or of using the web demo.</p>
    </section>
    <section className="sms-optin-card" aria-labelledby="sms-review-proof">
      <h2 id="sms-review-proof">Opt-in proof for carrier review</h2>
      <p><strong>Opt-in methods:</strong> website checkbox and tester-initiated text keyword. No one is enrolled by default, the checkbox is not preselected, and live texting remains disabled until carrier approval.</p>
      <div className="sms-consent-box" aria-label="SMS consent call to action">
        <p className="sms-consent-label">Public website opt-in form for review:</p>
        <form className="sms-proof-form" aria-label="Website SMS opt-in proof form">
          <label className="sms-proof-field" htmlFor="smsProofMobile">
            Mobile number
            <input id="smsProofMobile" name="smsProofMobile" type="tel" placeholder="(209) 555-0198" autoComplete="tel" />
          </label>
          <label className="sms-proof-consent" htmlFor="smsProofConsent">
            <input id="smsProofConsent" name="smsProofConsent" type="checkbox" />
            <span>I agree to receive automated text replies from the Bear Eberly Photos reservation demo about this requested table, including availability, confirmation, status, and cancellation messages. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. See <a href="/sms/privacy/">{smsUrls.privacy}</a> and <a href="/sms/terms/">{smsUrls.terms}</a>.</span>
          </label>
          <button type="button">Proof only while carrier approval is pending</button>
        </form>
        <p className="sms-consent-label">Text this exact keyword to opt in after the operator confirms activation:</p>
        <p className="sms-keyword"><span>START</span> to <span>+1 (209) 709-4194</span></p>
        <p>Review the SMS privacy notice at <a href="/sms/privacy">{smsUrls.privacy}</a> and SMS terms at <a href="/sms/terms">{smsUrls.terms}</a> before using either opt-in method.</p>
      </div>
      <ol>
        <li>Website flow: tester opens <strong>{smsUrls.reservations}</strong>, enters a requested reservation or Notify request, enters their mobile number, checks the consent box, and submits the request.</li>
        <li>Keyword flow: tester opens <strong>{smsUrls.program}</strong>, reviews the disclosure, privacy notice, and terms, then sends <strong>START</strong> to <strong>+1 (209) 709-4194</strong> only if they choose to opt in.</li>
        <li>The first automated reply identifies Bear Eberly Photos, states that this is a synthetic reservation demo, includes message frequency and rate disclosures, and explains STOP and HELP.</li>
      </ol>
      <p>Hosted screenshot for review: <a href="/sms-consent-proof.png">{smsUrls.proof}</a>.</p>
    </section>
    <section aria-labelledby="sms-controls">
      <h2 id="sms-controls">Stop messages or get help</h2>
      <p>Reply <strong>STOP</strong> to opt out. You may receive a final opt-out confirmation, then automated conversation replies stop. Reply <strong>HELP</strong> for program information and help.</p>
      <p>SMS help is available only after messaging is enabled; replies may not be delivered while setup is pending. For setup questions now, contact the Bear Eberly Photos operator who invited you to the demo.</p>
    </section>
    <section aria-labelledby="sms-ai">
      <h2 id="sms-ai">An AI assistant, with demo limits</h2>
      <p>The assistant can misunderstand a message. Check the date, time, party size, and seating details before confirming an action. Its replies are for this software demonstration and are not a confirmation from the restaurant.</p>
      <p>Use sample guest details. Do not send payment information, passwords, sensitive personal information, or emergencies. Review the SMS privacy notice at <a href="/sms/privacy">{smsUrls.privacy}</a> for how messages are processed and the SMS terms at <a href="/sms/terms">{smsUrls.terms}</a> for participation details.</p>
    </section>
  </>;
}

function Privacy() {
  return <>
    <section aria-labelledby="privacy-scope">
      <h2 id="privacy-scope">Scope and operator</h2>
      <p>This notice covers the optional reservation demo SMS program operated by Bear Eberly Photos. It explains the processing used when messaging is enabled. The program creates synthetic bookings, not live restaurant reservations.</p>
      <p>Message frequency varies with your requests. Message and data rates may apply.</p>
    </section>
    <section aria-labelledby="privacy-data">
      <h2 id="privacy-data">Information used</h2>
      <p>Texting involves your sending number, the program number, message content, timestamps, message identifiers, and delivery information. A conversation may include a requested date, time, party size, seating preference, name, or other details you choose to send.</p>
      <p>The application database uses a pseudonymous identifier derived from your number. It retains message identifiers, a hash of the incoming message, command classifications, consent and opt-out records, extracted reservation details, demo booking links, cached replies, and delivery status. It does not retain the raw incoming text or full phone number in that database. This does not make messages anonymous: extracted details and replies can contain personal information, and Twilio handles phone numbers and message content to deliver SMS.</p>
    </section>
    <section aria-labelledby="privacy-processing">
      <h2 id="privacy-processing">How the program processes messages</h2>
      <p>Information is used to interpret your request, maintain the conversation, handle requested demo reservation actions, honor opt-outs, prevent duplicate processing, and investigate delivery or software problems.</p>
      <ul>
        <li><strong>Twilio</strong> receives and delivers SMS and provides message and delivery records.</li>
        <li><strong>Cloudflare</strong> hosts the application and processes messaging requests.</li>
        <li><strong>OpenAI</strong> processes message content and saved reservation criteria to interpret requests. The application checks availability and composes the replies.</li>
        <li><strong>Supabase</strong> stores private demo reservation and conversation state.</li>
      </ul>
      <p>The operator and these service providers process information to run and support the demo. Do not include sensitive information in a test message.</p>
    </section>
    <section aria-labelledby="privacy-marketing">
      <h2 id="privacy-marketing">No marketing use of mobile consent</h2>
      <p>We do not sell personal information. Mobile numbers, SMS opt-in data, and SMS consent records are not sold, rented, or shared with third parties or affiliates for marketing or promotional purposes. Service providers may process this information only as needed to operate, secure, support, and troubleshoot the messaging program.</p>
      <p>No mobile information will be shared with third parties or affiliates for their own marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties except service providers that help deliver and operate the messaging program.</p>
    </section>
    <section aria-labelledby="privacy-retention">
      <h2 id="privacy-retention">Records and your choices</h2>
      <p>Records are used for the demonstration and troubleshooting; there is no automatic timed deletion schedule. An operator demo reset clears reservation criteria, proposed actions, booking links, and cached replies. Pseudonymous consent and opt-out records and message identifiers are retained to honor your choices and prevent old requests from running again. Provider records follow the provider's retention settings. Opting out stops automated conversation replies; it does not automatically delete earlier records.</p>
      <p>Reply <strong>STOP</strong> to opt out. For questions or an access or deletion request, contact the Bear Eberly Photos operator who invited you to the demo. Once messaging is enabled, reply <strong>HELP</strong> for program help. SMS delivery is not yet available while setup is pending.</p>
    </section>
  </>;
}

function Terms() {
  return <>
    <section aria-labelledby="terms-program">
      <h2 id="terms-program">Program and participation</h2>
      <p>Bear Eberly Photos operates this optional SMS software demonstration at +1 (209) 709-4194. It is currently limited to invited, controlled testers after the operator confirms activation. Use a mobile number you own or are authorized to use.</p>
      <p>Checking the website consent box or initiating a conversation by texting START after reviewing the <a href="/sms">program and consent disclosures</a> requests automated replies concerning that demo conversation. Messages can include questions about a requested reservation and responses to requested demo booking actions. Message frequency varies with your requests. Message and data rates may apply.</p>
      <p>SMS consent is optional and is not a condition of purchase or web demo use. No marketing subscription is included.</p>
    </section>
    <section aria-labelledby="terms-demo">
      <h2 id="terms-demo">Demo bookings only</h2>
      <p>The program checks sample inventory and creates synthetic records. It does not reserve a real restaurant table, connect to a Resy account, take payment, or promise restaurant service. Restaurant names and visuals used in the pitch do not establish restaurant endorsement.</p>
      <p>An AI assistant interprets messages and can make mistakes. Review the details before confirming a demo action. Use sample guest details and do not submit sensitive information. This is not an emergency service.</p>
    </section>
    <section aria-labelledby="terms-stop">
      <h2 id="terms-stop">Opt-out and help</h2>
      <p>Reply <strong>STOP</strong> to stop automated conversation messages. A final opt-out confirmation may be sent. Reply <strong>HELP</strong> for program information and help once messaging is enabled.</p>
      <p>During setup, contact the Bear Eberly Photos operator who invited you to the demo. Messages, including HELP replies, can be delayed or unavailable because of setup status, carrier filtering, network availability, or service interruptions.</p>
    </section>
    <section aria-labelledby="terms-privacy">
      <h2 id="terms-privacy">Privacy and updates</h2>
      <p>The SMS privacy notice at <a href="/sms/privacy">{smsUrls.privacy}</a> describes message processing, service providers, and mobile consent. Material changes to the program will be reflected on these pages. A different messaging purpose requires its own consent.</p>
    </section>
  </>;
}
