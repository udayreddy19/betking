import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function ResponsibleGaming() {
  return (
    <div className="legal-page container">
      <h1>Responsible Gaming</h1>
      <section>
        <h2>Play responsibly</h2>
        <ul>
          <li>Set deposit, stake, and loss limits from your profile — they are enforced when set.</li>
          <li>Never chase losses.</li>
          <li>Gambling should be entertainment, not income.</li>
          <li>OddsYra is for adults 18+ only.</li>
        </ul>
      </section>
      <section>
        <h2>Limits &amp; breaks</h2>
        <p>
          Daily deposit, stake, and loss limits block further deposits or bets once reached.
          Cooling-off and self-exclusion immediately block deposits and betting until the period ends.
        </p>
        <p>
          <Link to="/profile?tab=rg">Manage limits in your profile</Link>
        </p>
      </section>
      <section>
        <h2>Get help (India)</h2>
        <p>
          If gambling is causing harm, contact a helpline. These are independent services — available in India:
        </p>
        <ul>
          <li>
            <strong>Vandrevala Foundation</strong> — mental health support:{' '}
            <a href="tel:9999666555">9999 666 555</a>
            {' · '}
            <a href="https://www.vandrevalafoundation.com/" target="_blank" rel="noreferrer">
              vandrevalafoundation.com
            </a>
          </li>
          <li>
            <strong>iCall (TISS)</strong> — psychosocial helpline:{' '}
            <a href="tel:9152987821">91529 87821</a>
            {' · '}
            <a href="https://icallhelpline.org/" target="_blank" rel="noreferrer">
              icallhelpline.org
            </a>
          </li>
          <li>
            <strong>NIMHANS</strong> — behavioural health resources:{' '}
            <a href="https://nimhans.ac.in/" target="_blank" rel="noreferrer">
              nimhans.ac.in
            </a>
          </li>
        </ul>
        <p>
          You can also email{' '}
          <a href="mailto:support@oddsyra.com">support@oddsyra.com</a>
          {' '}to request account limits or self-exclusion help.
        </p>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
