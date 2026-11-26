import {
  BellOutlined,
  BookOutlined,
  DashboardOutlined,
  HistoryOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Layout, Menu } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { PathlyLogo } from '@/components/common/PathlyLogo';
import { useDashboardNotify } from '@/components/dashboard';
import { useLogoutAction } from '@/features/auth/useLogoutAction';
import { DashboardThemeProvider } from '@/layouts/DashboardThemeProvider';

const { Header, Sider, Content } = Layout;

function AppLayoutInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const { message } = useDashboardNotify();
  const { handleLogout, isLoggingOut } = useLogoutAction((msg, isErr) => {
    if (isErr) void message.error(msg);
  });

  const menuItems = [
    { key: '/app/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/app/my-courses', icon: <BookOutlined />, label: 'My Courses' },
    { key: '/app/orders', icon: <HistoryOutlined />, label: 'Order History' },
    { key: '/app/profile', icon: <UserOutlined />, label: 'Profile' },
  ];

  const activeKey =
    menuItems.find((item) => location.pathname.startsWith(item.key))?.key ?? '/app/dashboard';

  return (
    <Layout className="min-h-screen bg-canvas">
      <Header className="flex items-center justify-between px-xl bg-surface border-b border-hairline">
        <PathlyLogo to="/" />
        <div className="flex items-center gap-md">
          <Link to="/courses" className="text-[14px] font-medium text-ink-nav hover:text-primary">
            Explore Courses
          </Link>
          <Button type="text" icon={<BellOutlined />} aria-label="Notifications" />
          <Link to="/app/profile" className="flex items-center gap-xs">
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
            Student Account
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

export default function AppLayout() {
  return (
    <DashboardThemeProvider>
      <AppLayoutInner />
    </DashboardThemeProvider>
  );
}
