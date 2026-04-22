import { useNavigate } from 'react-router';

import { ProfileConfigForm } from '../components/ProfileConfigForm';
import { useProfilesStore } from '../stores/profiles';
import type { NewProfile } from '../types';

const BLANK: NewProfile = {
  name: '',
  description: '',
  modelSource: 'file',
  modelFile: '',
  argsLine: '',
};

export function ProfileNewScreen(): React.ReactElement {
  const navigate = useNavigate();
  const create = useProfilesStore((s) => s.create);

  return (
    <div>
      <header className="border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <h1 className="text-lg font-medium">New profile</h1>
      </header>
      <ProfileConfigForm
        initial={BLANK}
        submitLabel="Create profile"
        onSubmit={async (body) => {
          const created = await create(body);
          navigate(`/profiles/${created.id}`);
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
