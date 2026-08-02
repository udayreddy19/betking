import { gameProviders } from '../../data/homePageData';
import './ProviderRibbon.css';

export default function ProviderRibbon() {
  return (
    <div className="provider-ribbon scroll-row-bleed" id="provider-ribbon">
      <div className="provider-ribbon-track">
        {gameProviders.map((provider) => (
          <span
            key={provider.id}
            className="provider-pill"
            style={{ background: provider.color, color: provider.textColor }}
          >
            {provider.name}
          </span>
        ))}
      </div>
    </div>
  );
}
