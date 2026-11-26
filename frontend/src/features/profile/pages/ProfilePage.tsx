import { DeleteOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Card, Space, Upload } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import {
  DashboardButton,
  DashboardErrorState,
  DashboardInput,
  DashboardSkeleton,
  StatusBadge,
  UploadProgressCard,
  useDashboardNotify,
} from '@/components/dashboard';
import { useGetMeQuery, useUpdateMeMutation } from '@/features/auth/authApi';
import { useLogoutAction } from '@/features/auth/useLogoutAction';
import {
  uploadDirectToCloudinary,
  useConfirmMediaUploadMutation,
  useCreateUploadIntentMutation,
  useDeleteMediaAssetMutation,
} from '@/features/media/mediaApi';
import { parseApiError } from '@/lib/apiError';
import { nameSchema } from '@/lib/validation';

export default function ProfilePage() {
  const { message } = useDashboardNotify();
  const token = useAppSelector((state) => state.auth.accessToken);
  const { data, isLoading, isError, error, refetch } = useGetMeQuery(undefined, {
    skip: !token,
  });
  const [updateMe, { isLoading: isUpdating }] = useUpdateMeMutation();
  const [createIntent] = useCreateUploadIntentMutation();
  const [confirmUpload] = useConfirmMediaUploadMutation();
  const [deleteAsset, { isLoading: isRemovingAvatar }] = useDeleteMediaAssetMutation();

  const {
    handleLogout,
    handleLogoutAll,
    isLoggingOut,
    isLoggingOutAll,
  } = useLogoutAction((msg, isErr) => {
    if (isErr) void message.error(msg);
    else void message.success(msg);
  });

  const user = data?.data?.user;

  const [draftName, setDraftName] = useState<string | null>(null);
  const nameValue = draftName ?? user?.name ?? '';
  const [nameError, setNameError] = useState<string | undefined>();
  const [uploadState, setUploadState] = useState<{
    fileName: string;
    percent: number;
    statusLabel: string;
    isError?: boolean;
    isComplete?: boolean;
  } | null>(null);

  if (isLoading) {
    return <DashboardSkeleton rows={5} />;
  }

  if (isError || !user) {
    const parsed = parseApiError(error, 'Unable to load your profile.');
    return <DashboardErrorState message={parsed.message} onRetry={() => refetch()} />;
  }

  const handleSaveName = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = nameSchema.safeParse(nameValue);
    if (!validation.success) {
      setNameError(validation.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    setNameError(undefined);

    try {
      await updateMe({ name: validation.data }).unwrap();
      void message.success('Profile updated.');
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.code === 'VALIDATION_ERROR' && parsed.details[0]?.message) {
        setNameError(parsed.details[0].message);
      } else {
        void message.error(parsed.message);
      }
    }
  };

  const handleAvatarUpload = async (file: RcFile) => {
    try {
      setUploadState({
        fileName: file.name,
        percent: 5,
        statusLabel: 'Preparing upload…',
      });
      const intentRes = await createIntent({
        purpose: 'avatar',
        targetId: user.id,
      }).unwrap();

      if (file.size > intentRes.data.maxBytes) {
        setUploadState(null);
        void message.error(
          `Image exceeds the maximum size of ${Math.round(intentRes.data.maxBytes / (1024 * 1024))} MB.`,
        );
        return false;
      }

      setUploadState({
        fileName: file.name,
        percent: 15,
        statusLabel: 'Uploading…',
      });

      await uploadDirectToCloudinary(intentRes.data.upload, file, (percent) => {
        setUploadState({
          fileName: file.name,
          percent,
          statusLabel: percent >= 100 ? 'Confirming…' : `Uploading ${percent}%`,
        });
      });

      await confirmUpload(intentRes.data.assetId).unwrap();
      await refetch();

      setUploadState({
        fileName: file.name,
        percent: 100,
        statusLabel: 'Updated',
        isComplete: true,
      });
      void message.success('Profile photo updated.');
    } catch (err) {
      const parsed = parseApiError(err, 'Failed to upload avatar.');
      setUploadState({
        fileName: file.name,
        percent: 0,
        statusLabel: 'Failed',
        isError: true,
      });
      void message.error(parsed.message);
    }
    return false;
  };

  const handleRemoveAvatar = async () => {
    if (!user.avatarAssetId) return;
    try {
      await deleteAsset(user.avatarAssetId).unwrap();
      await refetch();
      setUploadState(null);
      void message.success('Profile photo removed.');
    } catch (err) {
      void message.error(parseApiError(err).message);
    }
  };

  return (
    <div className="space-y-lg max-w-[820px]">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Account Settings
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">My Profile</h1>
      </div>

      {/* Avatar card */}
      <Card className="rounded-lg shadow-card border-hairline">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md">
          <div className="flex items-center gap-md">
            <Avatar
              size={72}
              src={user.avatarUrl ?? undefined}
              icon={!user.avatarUrl ? <UserOutlined /> : undefined}
              className="bg-primary-tint text-primary ring-2 ring-primary-light shrink-0"
            />
            <div>
              <h2 className="text-[18px] font-semibold text-ink m-0">{user.name}</h2>
              <p className="text-[14px] text-ink-secondary m-0">{user.email}</p>
              <div className="flex flex-wrap items-center gap-xs mt-xs">
                {user.roles.map((role) => (
                  <StatusBadge key={role} label={role} tone="teal" />
                ))}
                <StatusBadge
                  label={user.emailVerified ? 'Verified' : 'Unverified'}
                  tone={user.emailVerified ? 'success' : 'muted'}
                />
              </div>
            </div>
          </div>

          <Space wrap>
            <Upload
              accept="image/jpeg,image/png,image/webp"
              showUploadList={false}
              beforeUpload={handleAvatarUpload}
            >
              <DashboardButton variant="outline" icon={<UploadOutlined />}>
                Change Photo
              </DashboardButton>
            </Upload>
            {user.avatarAssetId && (
              <DashboardButton
                variant="secondary"
                icon={<DeleteOutlined />}
                loading={isRemovingAvatar}
                onClick={handleRemoveAvatar}
              >
                Remove
              </DashboardButton>
            )}
          </Space>
        </div>

        {uploadState && (
          <div className="mt-md">
            <UploadProgressCard
              fileName={uploadState.fileName}
              percent={uploadState.percent}
              statusLabel={uploadState.statusLabel}
              isError={uploadState.isError}
              isComplete={uploadState.isComplete}
            />
          </div>
        )}
      </Card>

      {/* Profile edit card — PATCH /users/me sends ONLY { name } */}
      <Card className="rounded-lg shadow-card border-hairline">
        <h2 className="text-[18px] font-semibold text-ink mb-md">Personal Information</h2>
        <form onSubmit={handleSaveName} className="space-y-md max-w-[460px]">
          <DashboardInput
            label="Full Name"
            value={nameValue}
            onChange={(e) => setDraftName(e.target.value)}
            error={nameError}
            helperText="2 to 100 characters."
          />

          <DashboardInput
            label="Email Address"
            value={user.email}
            disabled
            helperText="Email address cannot be changed."
          />

          <DashboardButton
            htmlType="submit"
            variant="primary"
            loading={isUpdating}
          >
            Save Changes
          </DashboardButton>
        </form>
      </Card>

      {/* Sessions & security card */}
      <Card className="rounded-lg shadow-card border-hairline">
        <h2 className="text-[18px] font-semibold text-ink mb-xs">Session Management</h2>
        <p className="text-[14px] text-ink-secondary mb-md">
          Sign out of this device or revoke all active sessions across every browser and device.
        </p>
        <Space wrap>
          <DashboardButton
            variant="secondary"
            loading={isLoggingOut}
            onClick={handleLogout}
          >
            Log Out
          </DashboardButton>
          <DashboardButton
            variant="outline"
            loading={isLoggingOutAll}
            onClick={handleLogoutAll}
          >
            Log Out From All Devices
          </DashboardButton>
        </Space>
      </Card>
    </div>
  );
}
