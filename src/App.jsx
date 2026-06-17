import { useEffect, useState } from 'react';
import AdminApp from './admin/AdminApp';
import FollowupsApp from './admin/followups/FollowupsApp';
import WorkspaceSwitch from './admin/WorkspaceSwitch';

const WORKSPACE_KEY = 'tidewell.workspace';

function loadWorkspace() {
  try {
    const w = localStorage.getItem(WORKSPACE_KEY);
    return w === 'followups' ? 'followups' : 'recapture';
  } catch { return 'recapture'; }
}

export default function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace);

  useEffect(() => {
    try { localStorage.setItem(WORKSPACE_KEY, workspace); } catch (_) {}
  }, [workspace]);

  const switcher = <WorkspaceSwitch value={workspace} onChange={setWorkspace} />;

  return (
    <div className="jc" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {workspace === 'followups'
        ? <FollowupsApp workspaceSwitch={switcher} />
        : <AdminApp workspaceSwitch={switcher} />}
    </div>
  );
}
