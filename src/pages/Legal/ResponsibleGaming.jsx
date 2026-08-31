import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function ResponsibleGaming() {
  return (
    <div className="legal-page container">
      <h1>Responsible Gaming</h1>
      <section>
        <h2>Play responsibly</h2>
        <ul>
          <li>Set time and spend limits before you play.</li>
          <li>Never chase losses.</li>
          <li>Gambling should be entertainment, not income.</li>
        </ul>
      </section>
      <section>
        <h2>Get help (India)</h2>
        <p>
          If you or someone you know needs support, contact a local helpline or mental health professional.
        </p>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
