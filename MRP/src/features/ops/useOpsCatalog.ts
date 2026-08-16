import {useCallback, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import MrpOps, {type OpsSnapshot} from '../../native/MrpOps.types';

const empty: OpsSnapshot = {
  catalog: {},
  inbox: [],
  unread: 0,
  latestAtMs: 0,
  grant: null,
  admin: false,
};

export function useOpsCatalog() {
  const [ops, setOps] = useState<OpsSnapshot>(empty);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!MrpOps?.fetchOps) return;
    setLoading(true);
    try {
      const snap = await MrpOps.fetchOps();
      setOps(snap || empty);
    } catch {
      setOps(empty);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return {ops, loading, refresh};
}

export function listPromos(
  raw: OpsSnapshot['catalog']['promotions'] | OpsSnapshot['catalog']['affiliates'],
): {id: string; title: string; subtitle: string; url: string}[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((p, i) => ({
      id: p.id || `p-${i}`,
      title: p.title,
      subtitle: p.subtitle,
      url: p.url,
    }));
  }
  return Object.entries(raw).map(([id, p]) => ({
    id,
    title: p.title,
    subtitle: p.subtitle,
    url: p.url,
  }));
}
