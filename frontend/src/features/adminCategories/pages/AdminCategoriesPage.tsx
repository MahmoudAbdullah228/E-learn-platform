import { PlusOutlined } from '@ant-design/icons';
import { Alert, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardInput,
  DashboardModal,
  DashboardSkeleton,
  DataTable,
  SegmentedFilter,
  StatusBadge,
  useDashboardNotify,
} from '@/components/dashboard';
import {
  useCreateAdminCategoryMutation,
  useListAdminCategoriesQuery,
  useUpdateAdminCategoryMutation,
} from '@/features/adminCategories/adminCategoriesApi';
import type { CategoryDto } from '@/features/catalog/catalogApi';
import { parseApiError } from '@/lib/apiError';

type CategoryFilter = 'all' | 'active' | 'archived';

export default function AdminCategoriesPage() {
  const { message } = useDashboardNotify();
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const isActiveQuery =
    filter === 'active' ? true : filter === 'archived' ? false : undefined;

  const { data, isLoading, isError, error, refetch } =
    useListAdminCategoriesQuery({ isActive: isActiveQuery, page: 1, limit: 100 });

  const [createCategory, { isLoading: isCreating }] =
    useCreateAdminCategoryMutation();
  const [updateCategory, { isLoading: isUpdating }] =
    useUpdateAdminCategoryMutation();

  if (isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  if (isError) {
    return (
      <DashboardErrorState
        message={parseApiError(error).message}
        onRetry={() => refetch()}
      />
    );
  }

  const categories = data?.data?.categories ?? [];

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSlug('');
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (category: CategoryDto) => {
    setEditing(category);
    setName(category.name);
    setSlug(category.slug);
    setModalError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    if (trimmedName.length < 2 || trimmedSlug.length < 2) {
      setModalError('Name and lowercase slug are required (minimum 2 characters).');
      return;
    }

    try {
      if (editing) {
        await updateCategory({
          categoryId: editing.id,
          patch: { name: trimmedName, slug: trimmedSlug },
        }).unwrap();
        void message.success('Category updated.');
      } else {
        await createCategory({ name: trimmedName, slug: trimmedSlug }).unwrap();
        void message.success('Category created.');
      }
      setModalOpen(false);
    } catch (err) {
      setModalError(parseApiError(err).message);
    }
  };

  const handleToggleArchive = async (category: CategoryDto) => {
    try {
      await updateCategory({
        categoryId: category.id,
        patch: { isActive: !category.isActive },
      }).unwrap();
      void message.success(
        category.isActive ? 'Category archived.' : 'Category restored to active.',
      );
    } catch (err) {
      void message.error(parseApiError(err).message);
    }
  };

  const columns: ColumnsType<CategoryDto> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => <span className="font-semibold text-ink">{val}</span>,
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      render: (val: string) => <span className="font-mono text-[13px]">{val}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <StatusBadge
          label={isActive ? 'Active' : 'Archived'}
          tone={isActive ? 'success' : 'muted'}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_v, record) => (
        <Space size="middle">
          <DashboardButton variant="link-action" onClick={() => openEdit(record)}>
            Edit
          </DashboardButton>
          <DashboardButton
            variant="link-action"
            onClick={() => handleToggleArchive(record)}
          >
            {record.isActive ? 'Archive' : 'Activate'}
          </DashboardButton>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
            Taxonomy
          </span>
          <h1 className="text-[24px] font-bold text-ink mt-xxs">Categories</h1>
        </div>
        <DashboardButton
          variant="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
        >
          Create Category
        </DashboardButton>
      </div>

      <SegmentedFilter<CategoryFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { label: 'All', value: 'all' },
          { label: 'Active', value: 'active' },
          { label: 'Archived', value: 'archived' },
        ]}
      />

      {categories.length === 0 ? (
        <DashboardEmptyState
          title="No categories found"
          actionLabel="Create Category"
          onAction={openCreate}
        />
      ) : (
        <DataTable<CategoryDto>
          rowKey="id"
          columns={columns}
          dataSource={categories}
          pagination={false}
        />
      )}

      <DashboardModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={editing ? 'Edit Category' : 'Create Category'}
      >
        <form onSubmit={handleSave} className="space-y-md pt-sm">
          {modalError && <Alert type="error" showIcon title={modalError} />}
          <DashboardInput
            label="Category Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Web Development"
          />
          <DashboardInput
            label="Normalized Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. web-development"
            helperText="Lowercase letters/numbers separated by hyphens."
          />
          <div className="flex justify-end gap-xs pt-xs">
            <DashboardButton variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </DashboardButton>
            <DashboardButton
              htmlType="submit"
              variant="primary"
              loading={isCreating || isUpdating}
            >
              {editing ? 'Save Changes' : 'Create'}
            </DashboardButton>
          </div>
        </form>
      </DashboardModal>
    </div>
  );
}
