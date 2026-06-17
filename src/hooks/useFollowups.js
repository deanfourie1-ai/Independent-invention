import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCustomers, getInteractions, subscribeFollowupsChanged } from '../services/followups';

export default function useFollowups() {
  const [ready, setReady] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [interactions, setInteractions] = useState([]);

  const refresh = useCallback(async () => {
    const [cs, ix] = await Promise.all([getCustomers(), getInteractions()]);
    setCustomers(cs);
    setInteractions(ix);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      if (mounted) setReady(true);
    })();
    const unsubscribe = subscribeFollowupsChanged(() => refresh());
    return () => { mounted = false; unsubscribe(); };
  }, [refresh]);

  return useMemo(() => ({ ready, customers, interactions, refresh }), [ready, customers, interactions, refresh]);
}
