import { Layout, Menu, Avatar, Button } from 'antd';
import {
  BookOutlined,
  DashboardOutlined,
  DollarOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { PathlyLogo } from '@/components/common/PathlyLogo';
import { useDashboardNotify } from '@/components/dashboard';
import { useLogoutAction } from '@/features/auth/useLogoutAction';
import { DashboardThemeProvider } from '@/layouts/DashboardThemeProvider';

const { Header, Sider, Content } = Layout;

function InstructorLayoutInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const { message } = useDashboardNotify();
  const { handleLogout, isLoggingOut } = useLogoutAction((msg, isErr) => {
    if (isErr) void message.error(msg);
  });

  const menuItems = [
    { key: '/instructor/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/instructor/courses', icon: <BookOutlined />, label: 'Courses' },
    { key: '/instructor/finance', icon: <DollarOutlined />, label: 'Finance' },
    { key: '/instructor/profile', icon: <UserOutlined />, label: 'Instructor Profile' },
  ];

  const activeKey =
    menuItems.find((item) => location.pathname.startsWith(item.key))?.key ??
    '/instructor/dashboard';

  return (
    <Layout className="min-h-screen bg-canvas">
      <Header className="flex items-center justify-between px-xl bg-surface border-b border-hairline">
        <PathlyLogo to="/" />
        <div className="flex items-center gap-md">
          <Link to="/app/dashboard" className="text-[14px] font-medium text-ink-nav hover:text-primary">
            Student View
          </Link>
          <Link to="/app/profile" className="flex items-center">
            <Avatar
              src={user?.avatarUrl ?? undefined}
              icon={!user?.avatarUrl ? <UserOutlined /> : undefined}
              className="bg-primary-tint text-primary"
            />
          </Link>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            loading={isLoggingOut}
            onClick={handleLogout}
            aria-label="Log out"
          />
        </div>
      </Header>

      <Layout className="bg-canvas">
        <Sider
          width={240}
          breakpoint="md"
          collapsedWidth={0}
          className="bg-canvas pt-xl px-xs"
        >
          <div className="px-md pb-xs text-[12px] font-bold uppercase tracking-[0.06em] text-ink-muted">
            Instructor Studio
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            className="bg-transparent border-r-0"
          />
        </Sider>

        <Content className="p-xl">
          <div className="mx-auto max-w-[1200px]">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function InstructorLayout() {
  return (
    <DashboardThemeProvider>
      <InstructorLayoutInner />
    </DashboardThemeProvider>
  );
}
