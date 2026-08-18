import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { DEMO_MODE } from '../utils/featureFlags';
import { promotions as demoPromotions } from '../data/mockData';

async function fetchCatalogFromApi() {
  const res = await apiFetch('/api/v1/promotions');
  if (!res.ok) return [];
  const data = await res.json();
  return data?.promotions ?? [];
}

export function usePromotionCatalog() {
  const [catalog, setCatalog] = useState(DEMO_MODE ? demoPromotions : []);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (DEMO_MODE) {
      setCatalog(demoPromotions);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    fetchCatalogFromApi()
      .then((items) => {
        if (!cancelled) {
          setCatalog(items);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCatalog([]);
          setError(err.message || 'Failed to load promotions');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    if (DEMO_MODE) return demoPromotions;
    const items = await fetchCatalogFromApi();
    setCatalog(items);
    return items;
  };

  return { catalog, loading, error, reload };
}

export async function fetchUserBonuses() {
  const res = await apiFetch('/api/v1/user/bonuses');
  if (!res.ok) return [];
  const data = await res.json();
  return data?.bonuses ?? [];
}
