import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Directory from './pages/Directory';
import Documents from './pages/Documents';
import Scan from './pages/Scan';
import Search from './pages/Search';
import DocDetail from './pages/DocDetail';
import Settings from './pages/Settings';
import AiBadge from './components/AiBadge';
import './app.css';

const NAV = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/directory', label: 'Accounts & Contacts', icon: '📇' },
  { to: '/documents', label: 'My Documents', icon: '🗂️' },
  { to: '/scan', label: 'Scan a Paper', icon: '📸' },
  { to: '/search', label: 'Search', icon: '🔎' },
];

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            🔐
          </span>
          <span className="brand-name">GrandVault</span>
        </div>
        <AiBadge />
        <NavLink to="/settings" className="settings-link" title="Setup (family)">
          ⚙️ Setup
        </NavLink>
      </header>

      <nav className="mainnav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => 'navbtn' + (isActive ? ' active' : '')}
          >
            <span className="navbtn-icon" aria-hidden>
              {n.icon}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/:id" element={<DocDetail />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
