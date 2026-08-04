import { FiZap, FiFlame, FiClock, FiPlusCircle, FiCheck } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import './BoostedOddsWidget.css';

const BOOSTED_PROMOS = [
  {
    id: 'boost-ipl-srl-1',
    matchId: 'srl_ipl_csk_mi',
    sport: 'cricket',
    league: 'IPL SRL Premier Super League',
    matchName: 'CSK SRL vs MI SRL',
    title: 'CSK SRL to Win & Top Batter Score > 45.5 Runs',
    originalOdds: 2.30,
    boostedOdds: 3.10,
    selection: 'CSK SRL Win + Top Batter >45.5',
    tag: 'IPL SRL SPECIAL',
    expiry: 'Ends in 45 mins',
  },
  {
    id: 'boost-football-1',
    matchId: 'foot_mci_ars',
    sport: 'soccer',
    league: 'English Premier League',
    matchName: 'Man City vs Arsenal',
    title: 'Both Teams to Score & Over 2.5 Goals',
    originalOdds: 1.85,
    boostedOdds: 2.55,
    selection: 'BTTS + Over 2.5 Goals',
    tag: 'SUPER BOOST',
    expiry: 'Ends in 2 hours',
  },
  {
    id: 'boost-cricket-2',
    matchId: 'cric_ind_aus',
    sport: 'cricket',
    league: 'International T20 Series',
    matchName: 'India vs Australia',
    title: 'India to Win & Total Sixes > 12.5 in Match',
    originalOdds: 2.60,
    boostedOdds: 3.50,
    selection: 'India Win + Sixes > 12.5',
    tag: 'MEGA BOOST',
    expiry: 'Starts Today 19:00',
  },
];

export default function BoostedOddsWidget() {
  const { addBet, isBetSelected } = useBetSlip();
  const { showToast } = useAuth();

  const handleAddBoost = (boost) => {
    const fakeMatch = {
      id: boost.matchId,
      team1: { name: boost.matchName.split(' vs ')[0] || 'Team 1' },
      team2: { name: boost.matchName.split(' vs ')[1] || 'Team 2' },
      league: boost.league,
      sport: boost.sport,
    };

    addBet(
      fakeMatch,
      `Boost:${boost.id}`,
      boost.boostedOdds,
      boost.title,
      { marketName: `⚡ ${boost.tag}` },
    );
  };

  return (
    <div className="boosted-widget" id="boosted-odds-widget">
      <div className="boosted-header">
        <div className="boosted-title">
          <FiZap className="boosted-icon-zap" />
          <h2>BetKing Daily Odds Boosts</h2>
          <span className="boosted-badge">LIVE</span>
        </div>
        <p className="boosted-subtitle">Enhanced odds on today's biggest matches — exclusive payout multipliers.</p>
      </div>

      <div className="boosted-grid">
        {BOOSTED_PROMOS.map((boost) => {
          const isAdded = isBetSelected(boost.matchId, `Boost:${boost.id}`);
          return (
            <div key={boost.id} className="boosted-card">
              <div className="boosted-card-top">
                <span className="boosted-tag">
                  <FiFlame /> {boost.tag}
                </span>
                <span className="boosted-expiry">
                  <FiClock /> {boost.expiry}
                </span>
              </div>

              <div className="boosted-card-match">{boost.league}</div>
              <h3 className="boosted-card-fixture">{boost.matchName}</h3>
              <p className="boosted-card-desc">{boost.title}</p>

              <div className="boosted-card-bottom">
                <div className="boosted-odds-box">
                  <span className="boosted-old-odds">{boost.originalOdds.toFixed(2)}</span>
                  <span className="boosted-new-odds">
                    {boost.boostedOdds.toFixed(2)}
                  </span>
                </div>

                <button
                  type="button"
                  className={`boosted-add-btn ${isAdded ? 'added' : ''}`}
                  onClick={() => handleAddBoost(boost)}
                >
                  {isAdded ? (
                    <>
                      <FiCheck /> In Betslip
                    </>
                  ) : (
                    <>
                      <FiPlusCircle /> Add Bet
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
