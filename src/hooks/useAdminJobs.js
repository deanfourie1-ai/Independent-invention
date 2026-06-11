import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllJobs, subscribeJobsChanged } from '../services/storage';

export default function useAdminJobs() {
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState([]);

  const refresh = useCallback(async () => {
    const rows = await getAllJobs();
    setJobs(rows);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      await refresh();
      if (!mounted) return;
      setReady(true);
    }

    boot();

    const unsubscribe = subscribeJobsChanged(() => refresh());

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refresh]);

  return useMemo(() => ({ ready, jobs }), [ready, jobs]);
}
