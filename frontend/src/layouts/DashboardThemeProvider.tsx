import type { ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import { pathlyAntdTheme } from '@/app/antdTheme';

interface DashboardThemeProviderProps {
  children: ReactNode;
}

export function DashboardThemeProvider({ children }: DashboardThemeProviderProps) {
  return (
    <ConfigProvider theme={pathlyAntdTheme}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
