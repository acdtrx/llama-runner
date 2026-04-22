import { Outlet } from 'react-router';

import { ProfileSidebar } from './ProfileSidebar';

export function ProfileLayout(): React.ReactElement {
  return (
    <div className="flex h-full">
      <ProfileSidebar />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
