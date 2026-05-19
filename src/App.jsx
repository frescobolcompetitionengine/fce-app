import { Navigate, Route, Routes } from 'react-router-dom';
import NavigationTracker from '@/lib/NavigationTracker';
import PageNotFound from '@/lib/PageNotFound';
import { useAuth } from '@/lib/AuthContext';
import { createPageUrl } from '@/utils';
import SpeedMeter from '@/pages/SpeedMeter';
import Settings from '@/pages/Settings';
import MatchHistory from '@/pages/MatchHistory';
import SpectatorHub from '@/pages/SpectatorHub';
import TournamentRoom from '@/pages/TournamentRoom';
import TournamentView from '@/pages/TournamentView';
import Login from '@/pages/Login';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminSystem from '@/pages/AdminSystem';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to={createPageUrl('Login')} replace />;
  return children;
}

export default function App() {
  const { authChecked, isLoadingPublicSettings, isAuthenticated, isAdmin, isTournament, isSpectator, mustChangePassword } = useAuth();

  if (!authChecked || isLoadingPublicSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d1a] text-white">
        <div className="h-10 w-10 rounded-full border-4 border-[#0f9b8e] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <>
      <NavigationTracker />
      {isAuthenticated && mustChangePassword && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-900/90 border-b border-amber-700 text-amber-100 px-4 py-2 text-sm flex items-center justify-center gap-3">
          <span>Por segurança, troque sua senha inicial.</span>
          <NavigateToAdmin />
        </div>
      )}
      <Routes>
        <Route path="/" element={<Navigate to={isAuthenticated ? (isSpectator ? createPageUrl('SpectatorHub') : isAdmin ? createPageUrl('AdminDashboard') : isTournament ? createPageUrl('TournamentRoom') : createPageUrl('SpeedMeter')) : createPageUrl('Login')} replace />} />
        <Route path={createPageUrl('Login')} element={<Login />} />
        <Route path={createPageUrl('GameSetup')} element={<Navigate to={createPageUrl('SpeedMeter')} replace />} />
        <Route path={createPageUrl('SpeedMeter')} element={<PrivateRoute><SpeedMeter /></PrivateRoute>} />
        <Route path={createPageUrl('TournamentRoom')} element={<PrivateRoute><TournamentRoom /></PrivateRoute>} />
        <Route path={createPageUrl('TournamentView')} element={<PrivateRoute><TournamentView /></PrivateRoute>} />
        <Route path={createPageUrl('Settings')} element={<PrivateRoute><Settings /></PrivateRoute>} />
        <Route path={createPageUrl('MatchHistory')} element={<PrivateRoute><MatchHistory /></PrivateRoute>} />
        <Route path={createPageUrl('SpectatorHub')} element={<PrivateRoute><SpectatorHub /></PrivateRoute>} />
        <Route path={createPageUrl('AdminDashboard')} element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
        <Route path={createPageUrl('Analysis')} element={<Navigate to={createPageUrl('AdminDashboard')} replace />} />
        <Route path={createPageUrl('AdminSystem')} element={<PrivateRoute><AdminSystem /></PrivateRoute>} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
}

function NavigateToAdmin() {
  return (
    <a href={createPageUrl('AdminSystem')} className="px-3 py-1 rounded-full bg-amber-700 hover:bg-amber-600 font-semibold">
      Trocar agora
    </a>
  );
}
