import AdminApp from './admin/AdminApp';
import Icon from './components/Icon';

export default function App() {
  return (
    <div className="jc" data-theme="light">
      <div className="topbar" style={{ position: 'static' }}>
        <div className="brand">
          <div className="brand-mark">
            <Icon name="droplet" size={18} fill="currentColor" stroke={0} />
          </div>
          <div>
            <div className="brand-name">Tidewell Job Card</div>
            <div className="brand-sub">Admin panel</div>
          </div>
        </div>
      </div>
      <AdminApp />
    </div>
  );
}
