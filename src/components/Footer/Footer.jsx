import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer" id="main-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-section">
            <h4>Sports</h4>
            <a href="#cricket">Cricket</a>
            <a href="#soccer">Soccer</a>
            <a href="#tennis">Tennis</a>
            <a href="#basketball">Basketball</a>
            <a href="#kabaddi">Kabaddi</a>
            <a href="#esports">eSports</a>
          </div>
          <div className="footer-section">
            <h4>Casino</h4>
            <a href="#slots">Slots</a>
            <a href="#live-casino">Live Casino</a>
            <a href="#table-games">Table Games</a>
            <a href="#crash">Crash Games</a>
            <a href="#instant">Instant Games</a>
          </div>
          <div className="footer-section">
            <h4>Support</h4>
            <a href="#help">Help Center</a>
            <a href="#contact">Contact Us</a>
            <a href="#faq">FAQ</a>
            <a href="#live-chat">Live Chat</a>
          </div>
          <div className="footer-section">
            <h4>About</h4>
            <a href="#about">About Us</a>
            <a href="#terms">Terms & Conditions</a>
            <a href="#privacy">Privacy Policy</a>
            <a href="#responsible">Responsible Gaming</a>
            <a href="#affiliates">Affiliates</a>
          </div>
        </div>

        <hr className="footer-divider" />

        <div className="footer-bottom">
          <p>© 2026 BetKing. All rights reserved. Licensed & Regulated.</p>
          <div className="footer-payments">
            <div className="footer-payment-icon" style={{ background: '#ff9900', color: '#000', fontWeight: 'bold' }}>Amazon</div>
            <div className="footer-payment-icon" style={{ background: '#22c55e', color: '#fff', fontWeight: 'bold' }}>UPI</div>
            <div className="footer-payment-icon" style={{ background: '#4285f4', color: '#fff', fontWeight: 'bold' }}>GPay</div>
            <div className="footer-payment-icon" style={{ background: '#5f259f', color: '#fff', fontWeight: 'bold' }}>PhonePe</div>
            <div className="footer-payment-icon" style={{ background: '#00baf2', color: '#fff', fontWeight: 'bold' }}>Paytm</div>
            <div className="footer-payment-icon">₿</div>
            <div className="footer-payment-icon">VISA</div>
          </div>
        </div>

        <div className="footer-responsible">
          <div className="footer-age-badge">18+</div>
          <p>
            BetKing promotes responsible gambling. Gambling can be addictive. Play responsibly.
            Must be 18+ to play. If you or someone you know has a gambling problem, please seek help.
            This is a demo application for educational purposes only. No real money is involved.
          </p>
        </div>
      </div>
    </footer>
  );
}
