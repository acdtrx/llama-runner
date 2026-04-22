import { BrowserRouter, Route, Routes } from 'react-router';

import { ProfileLayout } from './components/ProfileLayout';
import { SettingsModal } from './components/SettingsModal';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { HomeScreen } from './routes/HomeScreen';
import { ProfileDetailScreen } from './routes/ProfileDetailScreen';
import { ProfileNewScreen } from './routes/ProfileNewScreen';

export function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route element={<ProfileLayout />}>
              <Route path="/profiles/new" element={<ProfileNewScreen />} />
              <Route path="/profiles/:id" element={<ProfileDetailScreen />} />
              <Route path="/profiles/:id/sessions/:sessionId" element={<ProfileDetailScreen />} />
            </Route>
          </Routes>
        </div>
      </div>
      <SettingsModal />
      <Toasts />
    </BrowserRouter>
  );
}
