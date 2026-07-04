import { useEffect, useState } from 'react';
import AdminApp from './admin/AdminApp';
import FollowupsApp from './admin/followups/FollowupsApp';
import DashboardPanel from './admin/DashboardPanel';
import WorkspaceSwitch from './admin/WorkspaceSwitch';

const WORKSPACE_KEY = 'tidewell.workspace';
const VALID = ['dashboard', 'recapture', 'followups'];

function loadWorkspace() {
  try {
    const w = localStorage.getItem(WORKSPACE_KEY);
    return VALID.includes(w) ? w : 'dashboard';
  } catch { return 'dashboard'; }
}

export default function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace);

  useEffect(() => {
    try { localStorage.setItem(WORKSPACE_KEY, workspace); } catch (_) {}
  }, [workspace]);

  const switcher = <WorkspaceSwitch value={workspace} onChange={setWorkspace} />;

  return (
    <div className="jc" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {workspace === 'dashboard'
        ? <DashboardPanel workspaceSwitch={switcher} onNavigate={setWorkspace} />
        : workspace === 'followups'
          ? <FollowupsApp workspaceSwitch={switcher} />
          : <AdminApp workspaceSwitch={switcher} />}
    </div>
  );
}
