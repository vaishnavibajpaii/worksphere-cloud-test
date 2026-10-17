import {NavLink, Outlet, useNavigate, useLocation} from 'react-router-dom';
import {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {
  LayoutDashboard, ClipboardList, CheckSquare, FolderKanban, Users,
  CalendarCheck, CalendarDays, BarChart3, Megaphone, Bell, Settings2,
  LogOut, Menu, X, Search, ChevronDown, Command, ArrowUpRight, PanelLeftClose
} from 'lucide-react';
import {api, initials} from '../lib/api';
import {useAuth} from '../lib/auth';
import {Toaster} from './ui';

// Routes and permission checks intentionally remain the same as the baseline.
const iconMap = {
  dashboard: LayoutDashboard, reports: ClipboardList, tasks: CheckSquare,
  projects: FolderKanban, employees: Users, attendance: CalendarCheck,
  leave: CalendarDays, analytics: BarChart3, announcements: Megaphone,
  notifications: Bell, admin: Settings2
};
const groups = [
  {name: 'OVERVIEW', links: [['dashboard', 'Dashboard']]},
  {name: 'MY WORKSPACE', links: [['reports', 'Daily Work Updates'], ['tasks', 'My Tasks'], ['projects', 'Projects']]},
  {name: 'PEOPLE & COMPANY', links: [['employees', 'Employees'], ['attendance', 'Attendance'], ['leave', 'Leave Management'], ['announcements', 'Announcements']]},
  {name: 'INSIGHTS & SETTINGS', links: [['analytics', 'Reports & Analytics'], ['notifications', 'Notifications'], ['admin', 'Master Settings']]}
] as const;

const pageNames: Record<string, string> = {
  dashboard: 'Dashboard', reports: 'Daily work updates', tasks: 'My tasks',
  projects: 'Projects', employees: 'Employees', attendance: 'Attendance',
  leave: 'Leave management', analytics: 'Reports & analytics',
  announcements: 'Announcements', notifications: 'Notifications', admin: 'Master settings'
};

export function Layout() {
  const {user, logout, has} = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const {data: notifications = []} = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<any[]>('/notifications'),
    refetchInterval: 30000
  });
  const unread = notifications.filter(item => !item.readAt).length;
  const branding = useQuery({
    queryKey: ['branding'],
    queryFn: () => api<any>('/admin/settings'),
    staleTime: 120000
  });
  useEffect(() => {
    const settings = branding.data?.settings || {};
    document.documentElement.style.setProperty('--primary', settings.brandPrimary || '#B75F48');
    document.documentElement.style.setProperty('--sidebar', settings.brandSidebar || '#F4EDE5');
    document.documentElement.style.setProperty('--page', settings.brandBackground || '#F8F7F4');
    document.title = (branding.data?.organization?.name || 'WorkSphere') + ' — Workspace';
    if (settings.brandFavicon && /^(https?:\/\/|\/)/.test(settings.brandFavicon)) {
      let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
      icon.href = settings.brandFavicon;
    }
  }, [branding.data]);
  useEffect(() => {setDrawerOpen(false); setProfileOpen(false);}, [location.pathname]);
  useEffect(() => {
    if (!drawerOpen && !profileOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {setDrawerOpen(false); setProfileOpen(false);}
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [drawerOpen, profileOpen]);
  useEffect(() => {
    if (!drawerOpen) return;
    const oldValue = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {document.body.style.overflow = oldValue;};
  }, [drawerOpen]);

  const brandName = branding.data?.organization?.name || 'WorkSphere';
  const storedLogo = branding.data?.settings?.brandLogo;
  const brandLogo = typeof storedLogo === 'string' && /^(https?:\/\/|\/)/.test(storedLogo) ? storedLogo : '';
  const role = user?.primaryRole?.replaceAll('_', ' ').toLowerCase() || 'team member';
  const activePage = location.pathname.slice(1).split('/')[0];
  const pageName = pageNames[activePage] || 'Workspace';
  const visible = groups.map(group => ({
    ...group,
    links: group.links.filter(([key]) => key !== 'admin' || has('admin.manage'))
  }));
  const signOut = async () => {await logout(); navigate('/login');};
  const sidebarContent = (
    <>
      <div className="brand">
        <div className="brand-symbol">{brandLogo ? <img className="brand-image" src={brandLogo} alt=""/> : <Command size={20} strokeWidth={2}/>}</div>
        <div className="brand-copy"><strong>{brandName}</strong><small>YOUR TEAM WORKSPACE</small></div>
      </div>
      <div className="sidebar-divider"/>
      <nav className="navigation" aria-label="Main navigation">
        {visible.map(group => (
          <div className="nav-group" key={group.name}>
            <small>{group.name}</small>
            {group.links.map(([key, label]) => {
              const Icon = iconMap[key];
              return <NavLink key={key} to={'/' + key} end
                className={({isActive}) => 'nav-item ' + (isActive ? 'active' : '')}>
                <Icon size={18} strokeWidth={1.9}/><span>{label}</span>
                {key === 'notifications' && unread > 0 && <b className="nav-count">{unread}</b>}
              </NavLink>;
            })}
          </div>
        ))}
      </nav>
      <div className="side-bottom">
        <div className="help-box">
          <div className="help-star" aria-hidden="true">✳</div>
          <strong>Share today's progress</strong>
          <p>Keep your work and your team aligned.</p>
          <button type="button" onClick={() => navigate('/reports')}>
            Create work update <ArrowUpRight size={15}/>
          </button>
        </div>
        <button type="button" className="account-row" onClick={signOut} aria-label="Log out of WorkSphere">
          <div className="avatar">{initials(user?.name || 'U')}</div>
          <span><strong>{user?.name}</strong><small>{role}</small></span>
          <LogOut size={17}/>
        </button>
      </div>
    </>
  );

  return <div className="app-frame">
    <aside className="sidebar">{sidebarContent}</aside>
    {drawerOpen && <button type="button" className="mobile-overlay" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}/>}
    <aside id="mobile-navigation" className={'drawer ' + (drawerOpen ? 'drawer-open' : '')} aria-hidden={!drawerOpen} inert={!drawerOpen}>
      <button type="button" className="drawer-close icon-btn" aria-label="Close menu" onClick={() => setDrawerOpen(false)}><X size={20}/></button>
      {sidebarContent}
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div className="topbar-start">
          <button type="button" className="icon-btn menu-trigger" onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-controls="mobile-navigation" aria-expanded={drawerOpen}><Menu size={21}/></button>
          <div className="topbar-context"><span className="context-dot" aria-hidden="true"/><span>{pageName}</span></div>
        </div>
        <div className="topbar-tools">
          <form className="top-search" role="search" onSubmit={event => {
            event.preventDefault(); if (search.trim()) navigate('/tasks?search=' + encodeURIComponent(search.trim()));
          }}>
            <Search size={17}/><input aria-label="Search tasks" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tasks..."/>

          </form>
          <span className="today-label">{new Date().toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}</span>
          <NavLink to="/notifications" className="icon-btn bell" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
            <Bell size={20}/>{unread > 0 && <i/>}
          </NavLink>
          <div className="profile-menu-wrap">
            <button type="button" className="header-user" onClick={() => setProfileOpen(value => !value)} aria-expanded={profileOpen} aria-label="Account menu">
              <div className="avatar">{initials(user?.name || 'U')}</div>
              <span><strong>{user?.name?.split(' ')[0]}</strong><small>{role}</small></span>
              <ChevronDown size={15} className={profileOpen ? 'rotated-chevron' : ''}/>
            </button>
            {profileOpen && <div className="profile-popover" role="menu">
              <div className="profile-popover-heading"><strong>{user?.name}</strong><small>{role}</small></div>
              <NavLink to="/dashboard" role="menuitem"><LayoutDashboard size={16}/> Dashboard</NavLink>
              <button type="button" role="menuitem" onClick={signOut}><LogOut size={16}/> Log out</button>
            </div>}
          </div>
        </div>
      </header>
      <main className="main-content" id="main-content"><Outlet/></main>
    </div>
    <nav className="mobile-tabs" aria-label="Mobile quick navigation">
      {(['dashboard','tasks','reports','leave'] as const).map(key => {
        const Icon = iconMap[key];
        return <NavLink key={key} to={'/' + key} className={({isActive}) => isActive ? 'selected' : ''}>
          <Icon size={21}/><span>{key === 'reports' ? 'Updates' : key === 'dashboard' ? 'Home' : key === 'leave' ? 'Leave' : 'Tasks'}</span>
        </NavLink>;
      })}
      <button type="button" onClick={() => setDrawerOpen(true)} aria-label="More navigation options"><PanelLeftClose size={21}/><span>More</span></button>
    </nav>
    <Toaster/>
  </div>;
}
